// Screenshot a path at desktop + mobile after running an example goal. Usage: node tools/shots.mjs [/ | /classic] [prefix]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");

const path = process.argv[2] || "/";
const prefix = process.argv[3] || "react";
const base = process.env.BASE || "http://localhost:3210";
const browser = await chromium.launch();
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: `.impeccable/review/${prefix}-${name}-empty.png` });
  const t = Date.now();
  await page.locator(".empty a").first().click();
  await page.waitForSelector(".row", { timeout: 60000 });
  console.log(name, "results in", Date.now() - t, "ms");
  await page.waitForTimeout(4000); // let explanations land
  await page.locator(".tab").first().click();
  await page.locator(".tab").nth(3).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `.impeccable/review/${prefix}-${name}.png`, fullPage: name === "mobile" ? false : true });
  await page.close();
}
await browser.close();
