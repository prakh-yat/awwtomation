/**
 * Stage colours. Stored on `PipelineStage.color` as one of these keys; the
 * classes are spelled out in full so Tailwind keeps them in the build.
 * Client-safe: no Prisma or server imports.
 */
export const STAGE_COLORS = ["gray", "blue", "violet", "pink", "red", "orange", "amber", "green", "teal"] as const;

export type StageColor = (typeof STAGE_COLORS)[number];

export const STAGE_COLOR_LABELS: Record<StageColor, string> = {
  gray: "Gray",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  green: "Green",
  teal: "Teal",
};

type StageColorClasses = {
  /** Small solid dot next to a stage name. */
  dot: string;
  /** Tinted pill: background, text and ring. */
  pill: string;
  /** Top border of a board column. */
  border: string;
};

const CLASSES: Record<StageColor, StageColorClasses> = {
  gray: { dot: "bg-zinc-400", pill: "bg-zinc-100 text-zinc-700 ring-zinc-200", border: "border-t-zinc-400" },
  blue: { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 ring-blue-200", border: "border-t-blue-500" },
  violet: { dot: "bg-violet-500", pill: "bg-violet-50 text-violet-700 ring-violet-200", border: "border-t-violet-500" },
  pink: { dot: "bg-pink-500", pill: "bg-pink-50 text-pink-700 ring-pink-200", border: "border-t-pink-500" },
  red: { dot: "bg-red-500", pill: "bg-red-50 text-red-700 ring-red-200", border: "border-t-red-500" },
  orange: { dot: "bg-orange-500", pill: "bg-orange-50 text-orange-700 ring-orange-200", border: "border-t-orange-500" },
  amber: { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 ring-amber-200", border: "border-t-amber-500" },
  green: { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", border: "border-t-emerald-500" },
  teal: { dot: "bg-teal-500", pill: "bg-teal-50 text-teal-700 ring-teal-200", border: "border-t-teal-500" },
};

export function isStageColor(value: unknown): value is StageColor {
  return typeof value === "string" && (STAGE_COLORS as readonly string[]).includes(value);
}

export function stageColorClasses(color: string | null | undefined): StageColorClasses {
  return CLASSES[isStageColor(color) ? color : "gray"];
}

/** The stages a new pipeline starts with. */
export const DEFAULT_STAGES: ReadonlyArray<{ name: string; color: StageColor }> = [
  { name: "New", color: "gray" },
  { name: "Engaged", color: "blue" },
  { name: "Lead", color: "violet" },
  { name: "Customer", color: "green" },
  { name: "Lost", color: "red" },
];

export const DEFAULT_PIPELINE_NAME = "Sales pipeline";

/** The next colour for a stage added at `index`, cycling through the palette. */
export function colorForIndex(index: number): StageColor {
  return STAGE_COLORS[((index % STAGE_COLORS.length) + STAGE_COLORS.length) % STAGE_COLORS.length];
}
