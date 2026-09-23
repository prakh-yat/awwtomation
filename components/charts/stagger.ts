import type { CSSProperties } from "react";

/**
 * Style for one item of a `rise` list. Staggers it by its position, capped so
 * a long list is fully in before anyone starts reading it.
 */
export function stagger(index: number): CSSProperties {
  return { "--i": Math.min(index, 12) } as CSSProperties;
}
