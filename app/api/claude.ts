// Shared by /api/interpret and /api/explain: one model setup, the catalog text Claude reads, and a checked JSON call.
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export const client = new Anthropic();

// Sonnet 5.5 with light adaptive thinking: about 2-3 s a search (2.7 s on a cold cache), and far fewer off-topic
// picks than Haiku 5.5 in our side-by-side test. If Sonnet declines (say, its cyber filter on a "cybersecurity"
// goal), the API reruns the request on Sonnet 5 instead of failing.
export const MODEL = {
  model: "claude-sonnet-5-5",
  thinking: { type: "adaptive" as const },
  output_config: { effort: "low" as const },
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

type Params = Omit<MessageCreateParamsNonStreaming, "model" | "output_config">;

// Asks Claude for JSON that matches `schema`, checking only the reply's final text block: messages.parse() also
// parses any half-written text a model leaves before handing off to the fallback model, and throws. One retry on
// an unreadable reply; the log gets the reply's shape, never its text. Null if both tries fail.
export async function askJson<T>(label: string, schema: z.ZodType<T>, params: Params): Promise<T | null> {
  const format = { type: "json_schema" as const, schema: zodOutputFormat(schema).schema };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await client.beta.messages.create({ ...MODEL, ...params, output_config: { ...MODEL.output_config, format } });
    let json: unknown;
    try { json = JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).at(-1) ?? ""); } catch {}
    const out = schema.safeParse(json);
    if (out.success) return out.data;
    console.error(`${label}: unreadable reply, try ${attempt}:`, res.stop_reason, res.content.map((b) => b.type).join(","), out.error.issues.slice(0, 3).map((i) => `${i.path.map(String).join(".")} ${i.code}`).join("; "));
  }
  return null;
}

// A course's official description without the registration fine print (restrictions, attributes, repeat rules),
// which always comes last. NOTE lines stay: a few carry real course facts.
export const describe = (d: string) => d.split(/\s*(?:[A-Z][a-z]+(?: [A-Za-z]+)* Restrictions:|Course Attributes:|Repeatability:)/)[0].trim();

export type Course = { code: string; title: string; area: string | null; description: string; twin?: string };
