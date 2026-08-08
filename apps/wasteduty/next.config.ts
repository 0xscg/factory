import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chassis packages ship TypeScript source; Next transpiles them in-app.
  transpilePackages: ["@factory/core", "@factory/config", "@factory/ui"],
  // Chassis source uses ESM-style ".js" specifiers that resolve to .ts
  // files; teach webpack (and turbopack below) that mapping.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
};

export default nextConfig;
