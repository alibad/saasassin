import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next externalizes firebase-admin by default, but Admin 14's auth package
  // contains an ESM-only JOSE dependency. Bundling it avoids a CommonJS require
  // at runtime in Vercel's serverless functions.
  transpilePackages: ["firebase-admin"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "developers.google.com",
        pathname: "/static/identity/images/g-logo.png",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.saasassin.net" }],
        destination: "https://saasassin.net/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
