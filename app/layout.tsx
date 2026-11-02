import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owl Compass — GenEd by the skills you want",
  description: "A Temple student project: find GenEd courses and major electives by the skills they build.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/owl.css" />
        <link rel="preload" href="/fonts/barlow-condensed-700.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
