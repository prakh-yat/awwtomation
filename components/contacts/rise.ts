import type * as React from "react";

/**
 * Stagger for the `rise` entrance: each item a beat after the one above it,
 * capped so a long list does not keep arriving.
 */
export function riseStyle(index: number): React.CSSProperties {
  return { "--i": Math.min(index, 12) } as React.CSSProperties;
}
