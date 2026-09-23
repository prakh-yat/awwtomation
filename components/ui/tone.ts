/**
 * The brand accents as named tones, so a section, a flow step or a status can
 * say "purple" once and get a matching solid block, soft tint and text colour.
 *
 * Classes are spelled out in full so Tailwind keeps them in the build.
 */
export type Tone = "yellow" | "magenta" | "purple" | "indigo" | "blue" | "green" | "orange" | "lavender" | "sky" | "sage" | "ink" | "fog";

export type ToneClasses = {
  /** The solid block with its readable foreground. */
  solid: string;
  /** A soft tint with ink-step text: chips, badges, highlighted rows. */
  soft: string;
  /** Text in the tone, dark enough for small type on white. */
  text: string;
  /** A small solid dot. */
  dot: string;
  /** A tinted ring for selected or focused tone surfaces. */
  ring: string;
  /** Border in the tone. */
  border: string;
  /** Stroke/fill for SVG. */
  fill: string;
};

export const TONES: Record<Tone, ToneClasses> = {
  yellow: {
    solid: "bg-yellow text-ink",
    soft: "bg-yellow-soft text-ink",
    text: "text-yellow-ink",
    dot: "bg-yellow",
    ring: "ring-yellow",
    border: "border-yellow",
    fill: "fill-yellow stroke-yellow",
  },
  magenta: {
    solid: "bg-magenta text-white",
    soft: "bg-magenta-soft text-magenta-ink",
    text: "text-magenta-ink",
    dot: "bg-magenta",
    ring: "ring-magenta",
    border: "border-magenta",
    fill: "fill-magenta stroke-magenta",
  },
  purple: {
    solid: "bg-purple text-white",
    soft: "bg-purple-soft text-purple-ink",
    text: "text-purple-ink",
    dot: "bg-purple",
    ring: "ring-purple",
    border: "border-purple",
    fill: "fill-purple stroke-purple",
  },
  indigo: {
    solid: "bg-indigo text-white",
    soft: "bg-indigo-soft text-indigo-ink",
    text: "text-indigo-ink",
    dot: "bg-indigo",
    ring: "ring-indigo",
    border: "border-indigo",
    fill: "fill-indigo stroke-indigo",
  },
  blue: {
    solid: "bg-blue text-white",
    soft: "bg-blue-soft text-blue-ink",
    text: "text-blue-ink",
    dot: "bg-blue",
    ring: "ring-blue",
    border: "border-blue",
    fill: "fill-blue stroke-blue",
  },
  green: {
    solid: "bg-green text-white",
    soft: "bg-green-soft text-green-ink",
    text: "text-green-ink",
    dot: "bg-green",
    ring: "ring-green",
    border: "border-green",
    fill: "fill-green stroke-green",
  },
  orange: {
    solid: "bg-orange text-ink",
    soft: "bg-orange-soft text-orange-ink",
    text: "text-orange-ink",
    dot: "bg-orange",
    ring: "ring-orange",
    border: "border-orange",
    fill: "fill-orange stroke-orange",
  },
  lavender: {
    solid: "bg-lavender text-ink",
    soft: "bg-lavender-soft text-lavender-ink",
    text: "text-lavender-ink",
    dot: "bg-lavender",
    ring: "ring-lavender",
    border: "border-lavender",
    fill: "fill-lavender stroke-lavender",
  },
  sky: {
    solid: "bg-sky text-ink",
    soft: "bg-sky-soft text-sky-ink",
    text: "text-sky-ink",
    dot: "bg-sky",
    ring: "ring-sky",
    border: "border-sky",
    fill: "fill-sky stroke-sky",
  },
  sage: {
    solid: "bg-sage text-ink",
    soft: "bg-sage-soft text-sage-ink",
    text: "text-sage-ink",
    dot: "bg-sage",
    ring: "ring-sage",
    border: "border-sage",
    fill: "fill-sage stroke-sage",
  },
  ink: {
    solid: "bg-ink text-white",
    soft: "bg-fog text-ink",
    text: "text-ink",
    dot: "bg-ink",
    ring: "ring-ink",
    border: "border-ink",
    fill: "fill-ink stroke-ink",
  },
  fog: {
    solid: "bg-fog text-ink",
    soft: "bg-fog text-ink",
    text: "text-mute",
    dot: "bg-mute",
    ring: "ring-border",
    border: "border-border",
    fill: "fill-fog stroke-mute",
  },
};

export function tone(name: Tone): ToneClasses {
  return TONES[name];
}

/** Hex values for places that need a real colour rather than a class: charts, SVG, React Flow. */
export const TONE_HEX: Record<Tone, string> = {
  yellow: "#fff200",
  magenta: "#fb0df7",
  purple: "#7b34ce",
  indigo: "#3c42c4",
  blue: "#2b60f8",
  green: "#007257",
  orange: "#ff4c00",
  lavender: "#d8bee3",
  sky: "#96dae3",
  sage: "#edf2ee",
  ink: "#0f0f0f",
  fog: "#f5f5f5",
};
