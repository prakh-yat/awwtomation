import * as React from "react";

/**
 * Flat marks for the welcome panel, one per part of the flow, each drawn to
 * sit on its part's colour block (sky, yellow, then lavender). Inline SVG so
 * they stay crisp; the few moving parts hold still for reduced motion.
 */
export type ArtName = "you" | "start" | "finish";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 180" aria-hidden="true" className="h-auto w-full max-w-[300px] overflow-visible">
      {children}
    </svg>
  );
}

/** Stagger index for the `rise` entrance, which SVG elements take as well. */
function at(i: number): React.CSSProperties {
  return { "--i": i } as React.CSSProperties;
}

const typingDot = "fill-white motion-safe:animate-pulse";

export function WelcomeArt({ name }: { name: ArtName }) {
  if (name === "you") {
    // A name badge: the person, and a line or two about them.
    return (
      <Frame>
        <rect x="36" y="34" width="168" height="112" rx="24" className="fill-ink" />
        <circle cx="88" cy="78" r="19" className="fill-white" />
        <path d="M60 128a28 28 0 0 1 56 0z" className="fill-white" />
        <rect x="130" y="66" width="52" height="10" rx="5" className="fill-white" />
        <g className="rise" style={at(3)}>
          <rect x="130" y="86" width="36" height="10" rx="5" className="fill-yellow" />
        </g>
        <g className="rise" style={at(5)}>
          <rect x="130" y="106" width="44" height="10" rx="5" className="fill-magenta" />
        </g>
        <circle cx="212" cy="30" r="9" className="rise fill-magenta" style={at(7)} />
        <g className="rise" style={at(9)}>
          <rect x="22" y="146" width="16" height="16" rx="4" transform="rotate(-16 30 154)" className="fill-yellow" />
        </g>
        <path d="M206 138l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" className="fill-white" />
      </Frame>
    );
  }

  if (name === "finish") {
    return (
      <Frame>
        <circle cx="120" cy="94" r="60" className="fill-ink" />
        <path d="M92 95l19 19 38-40" className="stroke-white" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* The entrance animates `transform`, so the tilted pieces keep their rotation on an inner shape. */}
        <g className="rise" style={at(2)}>
          <rect x="30" y="34" width="20" height="20" rx="5" transform="rotate(-18 40 44)" className="fill-yellow" />
        </g>
        <circle cx="206" cy="40" r="9" className="rise fill-magenta" style={at(4)} />
        <g className="rise" style={at(6)}>
          <rect x="196" y="140" width="13" height="13" rx="3" transform="rotate(20 202.5 146.5)" className="fill-white" />
        </g>
        <circle cx="34" cy="150" r="6" className="rise fill-yellow" style={at(8)} />
      </Frame>
    );
  }

  // A comment being typed, and the reply with its button.
  return (
    <Frame>
      <path
        d="M44 20h112a28 28 0 0 1 28 28v44a28 28 0 0 1-28 28H78l-30 26v-26h-4a28 28 0 0 1-28-28V48a28 28 0 0 1 28-28z"
        className="fill-ink"
      />
      {/* Delays inline: the `animation` shorthand behind `motion-safe:animate-pulse` would reset a class. */}
      <circle cx="68" cy="70" r="9" className={typingDot} />
      <circle cx="100" cy="70" r="9" className={typingDot} style={{ animationDelay: "200ms" }} />
      <circle cx="132" cy="70" r="9" className={typingDot} style={{ animationDelay: "400ms" }} />
      <g className="rise" style={at(6)}>
        <path
          d="M150 104h52a22 22 0 0 1 22 22v16a22 22 0 0 1-22 22h-4v14l-18-14h-30a22 22 0 0 1-22-22v-16a22 22 0 0 1 22-22z"
          className="fill-white"
        />
        <rect x="146" y="121" width="60" height="8" rx="4" className="fill-ink" />
        <rect x="146" y="137" width="40" height="10" rx="5" className="fill-magenta" />
      </g>
      <path d="M212 14l5 15 15 5-15 5-5 15-5-15-15-5 15-5z" className="fill-magenta" />
    </Frame>
  );
}
