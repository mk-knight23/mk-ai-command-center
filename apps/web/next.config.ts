import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";

loadDotenv({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@mkcc/shared", "@mkcc/core", "@mkcc/db", "@mkcc/ai-gateway"],
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
