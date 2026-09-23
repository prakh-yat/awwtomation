/**
 * Light versions of the button variants, for buttons on the ink plan block.
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
