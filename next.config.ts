import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy. Kept in one place so the allow-list is auditable:
 * - Dodo checkout is embedded/loaded from *.dodopayments.com.
 * - The Graph hosts are the only third-party origins the browser talks to
 *   directly; Google sign-in is a plain navigation to accounts.google.com and
 *   the token exchange happens server-side.
 * - `unsafe-eval` exists solely for Next's development tooling (source maps,
 *   fast refresh) and is dropped from production builds.
 * - Images stay open (`https:`) because avatars and post thumbnails come from
 *   a long tail of Meta/Google CDN hostnames.
 * - `frame-ancestors 'none'` (plus X-Frame-Options) — the app is never embedded.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://*.dodopayments.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.dodopayments.com https://graph.facebook.com https://graph.instagram.com${
    isProduction ? "" : " ws://localhost:* ws://127.0.0.1:*"
  }`,
  "frame-src https://*.dodopayments.com https://checkout.dodopayments.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS only where TLS is guaranteed; a preload-length max-age on localhost would brick http:// dev.
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  // Self-contained server for Docker (.next/standalone + public + .next/static). Harmless on Vercel.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.fbsbx.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "graph.facebook.com" },
    ],
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Usage and pipelines moved out of Settings; keep old bookmarks working.
  async redirects() {
    return [
      { source: "/settings/usage", destination: "/usage", permanent: true },
      { source: "/settings/pipeline", destination: "/contacts/pipelines", permanent: true },
      { source: "/automations/new", destination: "/automations/templates", permanent: false },
    ];
  },
};

export default nextConfig;
