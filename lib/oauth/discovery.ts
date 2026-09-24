/**
 * The two discovery documents an MCP client reads before it signs in. Each is
 * served at its well-known path and, because clients differ in how they build
 * that path from the MCP URL, also with the resource path appended
 * (`/.well-known/oauth-protected-resource/mcp`).
 */
import { authorizationServerMetadata, protectedResourceMetadata } from "@/lib/services/oauth";

import { oauthJson, preflight } from "./http";

const METHODS = "GET, OPTIONS";
const CACHE = "public, max-age=300";

export function authorizationServerResponse() {
  return oauthJson(authorizationServerMetadata(), { methods: METHODS, cache: CACHE });
}

export function protectedResourceResponse() {
  return oauthJson(protectedResourceMetadata(), { methods: METHODS, cache: CACHE });
}

export function discoveryPreflight() {
  return preflight(METHODS);
}
