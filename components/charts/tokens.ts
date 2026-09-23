import { TONE_HEX } from "@/components/ui/tone";

/**
 * Chart colours, taken from the brand accents. The series that matters is
 * brand purple; anything it is compared against is a quiet neutral grey. Every
 * value was run through the data-viz validator against the white card surface:
 *
 *   accent   #7b34ce  6.5:1 on white ✓
 *   context  #8a8a8a  3.4:1 ✓  vs accent: CVD ΔE 23.0 ✓  normal-vision ΔE 25.4 ✓
 *   series   every adjacent pair: CVD ΔE ≥ 11.6 ✓  normal-vision ΔE ≥ 26.8 ✓  all ≥ 3:1 ✓
 *   ramp     #c893de → #431377: monotone ✓  steps ≥ 0.06 L ✓  light end 2.4:1 ✓  one hue (17°) ✓
 */
export const VIZ = {
  accent: TONE_HEX.purple,
  /** The accent at 10%, for the wash under a line. */
  accentWash: "rgba(123, 52, 206, 0.10)",
  context: "#8a8a8a",
  grid: "#ebebeb",
  axis: "#6b6b6b",
  surface: "#ffffff",
} as const;

/**
 * The brand green one step lighter. #007257 sits at OKLCH chroma 0.098, just
 * under the 0.10 floor where a hue starts to read as grey next to the others.
 */
const SERIES_GREEN = "#00765a";

/**
 * Separate series, in a fixed order: assign them in sequence and never reorder
 * by rank, so a series keeps its colour when a filter removes another. Purple
 * next to blue is too close even for full colour vision, and purple next to
 * indigo collapses under protanopia, so the order keeps both pairs apart.
 * Where any two marks can touch (scatter, small multiples) only the first two
 * are safe together. Charts of platforms use the platform colours instead.
 */
export const SERIES = [TONE_HEX.purple, SERIES_GREEN, TONE_HEX.blue, TONE_HEX.orange, TONE_HEX.magenta, TONE_HEX.indigo] as const;

/** Colour for series `index`; anything past the palette folds into grey, as "Other". */
export function seriesColor(index: number): string {
  return SERIES[index] ?? VIZ.context;
}

/**
 * Ordered steps (funnel stages, ranked buckets): lavender to deep purple, with
 * brand purple in the middle. The lavender is a step deeper than the brand's
 * own, which is too pale to draw a mark with on white.
 */
export const ORDINAL_RAMP = ["#c893de", "#a86bdb", TONE_HEX.purple, "#6226a6", "#431377"] as const;

/**
 * Sequential ramp for the heatmap. Step 0 is "none" in the neutral fog, so an
 * empty slot recedes and any activity at all reads as colour.
 */
export const HEAT_RAMP = [TONE_HEX.fog, ...ORDINAL_RAMP] as const;

/** Picks an ordinal colour for step `index` of `count`, spreading evenly across the ramp. */
export function ordinalColor(index: number, count: number): string {
  if (count <= 1) return ORDINAL_RAMP[ORDINAL_RAMP.length - 1];
  const t = index / (count - 1);
  return ORDINAL_RAMP[Math.round(t * (ORDINAL_RAMP.length - 1))];
}
