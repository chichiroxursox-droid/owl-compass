import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The plain HTML/JS version lives in public/classic; serve its index at /classic.
  async rewrites() {
    return [{ source: "/classic", destination: "/classic/index.html" }];
  },
};

export default nextConfig;
