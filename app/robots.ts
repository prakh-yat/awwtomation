import type { MetadataRoute } from "next";

import { appUrl } from "@/lib/env";

/**
 * Marketing pages are indexable; everything behind sign-in, every API and
 * the tracked-link redirects are not. Disallowing is a courtesy to crawlers,
 * not a security control: those routes are protected by auth regardless.
 */
const PRIVATE_PATHS = [
  "/dashboard",
  "/automations",
  "/inbox",
  "/contacts",
  "/broadcasts",
  "/channels",
  "/links",
  "/logs",
  "/settings",
  "/checkout",
  "/onboarding",
  "/api",
  "/invite",
  "/l/",
  "/oauth",
  "/mcp",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    host: appUrl(),
  };
}
