/**
 * Light versions of the button variants, for buttons on a dark plan block
 * (ink, purple, indigo).
 * Pass one as `className` next to the variant it names; tailwind-merge lets
 * these win over the variant's own colours.
 */
export const ON_DARK = {
  /** With `variant="secondary"`: the block's main action, as a white pill. */
  primary: "bg-white text-ink hover:bg-white/85 focus-visible:ring-offset-ink",
  /** With `variant="outline"`. */
  outline: "border-white/25 bg-transparent text-white hover:border-white/50 hover:bg-white/10 focus-visible:ring-offset-ink",
  /** With `variant="ghost"`. */
  ghost: "text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-offset-ink",
} as const;

/** The same three for a light plan block (sky): ink on the colour. */
export const ON_LIGHT = {
  primary: "bg-ink text-white hover:bg-ink/85",
  outline: "border-ink/25 bg-transparent text-ink hover:border-ink/50 hover:bg-ink/5",
  ghost: "text-ink/70 hover:bg-ink/5 hover:text-ink",
} as const;
