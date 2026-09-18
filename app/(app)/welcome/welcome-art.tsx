import * as React from "react";

/**
 * Four abstract marks for the left panel, one per phase of the flow.
 *
 * Monochrome on purpose: the product's branding is black and white, so a
 * coloured illustration set would be the only thing in the app breaking that.
 * Drawn inline rather than loaded as files so they inherit the theme's colours.
 */
export type ArtName = "start" | "strategy" | "connect" | "finish";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 160 120" role="presentation" className="h-[120px] w-[160px] text-foreground">
      {children}
    </svg>
  );
}

export function WelcomeArt({ name }: { name: ArtName }) {
  if (name === "strategy") {
    return (
      <Frame>
        <rect x="8" y="70" width="26" height="42" rx="4" className="fill-foreground/10" />
        <rect x="42" y="50" width="26" height="62" rx="4" className="fill-foreground/25" />
        <rect x="76" y="28" width="26" height="84" rx="4" className="fill-foreground/50" />
        <rect x="110" y="8" width="26" height="104" rx="4" className="fill-foreground" />
        <circle cx="123" cy="30" r="5" className="fill-background" />
      </Frame>
    );
  }

  if (name === "connect") {
    return (
      <Frame>
        <rect x="10" y="30" width="54" height="54" rx="14" className="fill-none stroke-foreground" strokeWidth="3" />
        <rect x="96" y="30" width="54" height="54" rx="14" className="fill-foreground" />
        <path d="M64 57h32" className="stroke-foreground" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" />
        <circle cx="123" cy="57" r="9" className="fill-background" />
      </Frame>
    );
  }

  if (name === "finish") {
    return (
      <Frame>
        <circle cx="80" cy="60" r="44" className="fill-foreground" />
        <path
          d="M60 61l14 14 27-29"
          className="stroke-background"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="18" cy="24" r="5" className="fill-foreground/35" />
        <circle cx="142" cy="96" r="7" className="fill-foreground/20" />
        <circle cx="136" cy="20" r="3" className="fill-foreground/50" />
      </Frame>
    );
  }

  return (
    <Frame>
      <circle cx="56" cy="60" r="34" className="fill-foreground" />
      <path d="M56 42l11 22-11 6-11-6z" className="fill-background" />
      <rect x="100" y="20" width="18" height="18" rx="5" className="fill-foreground/25" />
      <rect x="100" y="48" width="42" height="42" rx="12" className="fill-foreground/10" />
      <path d="M126 22l5 10 10 5-10 5-5 10-5-10-10-5 10-5z" className="fill-foreground/60" />
    </Frame>
  );
}
