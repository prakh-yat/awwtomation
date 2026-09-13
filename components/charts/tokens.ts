/**
 * Chart colours. The brand is monochrome, so charts use *emphasis* rather than
 * a categorical palette: the series that matters in the accent, anything it's
 * compared against in a quiet gray. Both were run through the data-viz
 * validator against the white surface:
 *
 *   accent  #4F4C99  lightness band ✓  chroma ✓  contrast ≥ 3:1 ✓
 *   context #8A8A95  vs accent: CVD ΔE 20.3 ✓  normal-vision ΔE 20.7 ✓  contrast ≥ 3:1 ✓
 *   ordinal #A9A6D6 → #35336F  monotone ✓  step gaps ✓  light end 2.3:1 ✓  single hue ✓
 *
 * The accent is a deeper step of the brand lavender (#C1C1D7), which is far
 * too light to draw a line with.
 */
export const VIZ = {
  accent: "#4F4C99",
  /** Area wash under the accent line (~10%). */
  accentWash: "rgba(79, 76, 153, 0.10)",
  context: "#8A8A95",
  grid: "#EBEBF0",
  axis: "#71717A",
  surface: "#FFFFFF",
} as const;

/** Ordered steps for funnels and ranked stages: light → dark, one hue. */
export const ORDINAL_RAMP = ["#A9A6D6", "#8683C4", "#6461AD", "#4B4893", "#35336F"] as const;

/**
 * Sequential ramp for the heatmap. Step 0 is "none" and may recede into the
 * surface; the rest reuse the validated ordinal steps.
 */
export const HEAT_RAMP = ["#F3F2F8", "#D9D7EE", "#A9A6D6", "#8683C4", "#6461AD", "#4B4893", "#35336F"] as const;

/** Picks an ordinal colour for step `index` of `count`, spreading evenly across the ramp. */
export function ordinalColor(index: number, count: number): string {
  if (count <= 1) return ORDINAL_RAMP[ORDINAL_RAMP.length - 1];
  const t = index / (count - 1);
  return ORDINAL_RAMP[Math.round(t * (ORDINAL_RAMP.length - 1))];
}
