import type { NextConfig } from "next";

// Internal, login-gated app: every page reads the session cookie and live call
// data, so we use the classic dynamic rendering model (no Cache Components).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: [
    "127.0.0.1",
    "patch-dense-passed-landscape.trycloudflare.com",
  ],
  serverExternalPackages: ["twilio"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Microphone is required by the browser dialer on our own origin only.
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
