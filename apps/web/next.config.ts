import { webEnv } from "./src/lib/load-env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nestHttpOrigin = webEnv().API_INTERNAL_URL.replace(/\/api\/?$/, "");

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone to ship only traced files; local `next start` and Vercel keep the default.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${nestHttpOrigin}/api/:path*`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
