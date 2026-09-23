import * as React from "react";

import { PlatformIcon } from "@/components/ui/platform-icon";

/**
 * Four flat marks for the welcome panel, one per phase of the flow, each drawn
 * to sit on its phase's colour block (yellow, ink, purple, lavender). Inline
 * SVG so they stay crisp; the few moving parts hold still for reduced motion.
 */
export type ArtName = "start" | "strategy" | "connect" | "finish";

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
  if (name === "connect") {
    // Instagram and Messenger tiles, joined by a line that flows from one to the other.
    return (
      <Frame>
        <rect x="12" y="46" width="84" height="84" rx="26" className="fill-magenta" />
        <PlatformIcon platform="INSTAGRAM" size={40} x={34} y={68} className="text-white" />
        <rect x="144" y="46" width="84" height="84" rx="26" className="fill-blue" />
        <PlatformIcon platform="FACEBOOK" size={40} x={166} y={68} className="text-white" />
        <path
          d="M104 88h32"
          className="stroke-white/70 motion-safe:animate-[flow-dash_0.6s_linear_infinite]"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="6 5"
          fill="none"
        />
        <path d="M206 8l3.5 9.5 9.5 3.5-9.5 3.5-3.5 9.5-3.5-9.5-9.5-3.5 9.5-3.5z" className="fill-yellow" />
      </Frame>
    );
  }

  if (name === "strategy") {
    // Bars that climb, the last one in yellow.
    return (
      <Frame>
        <rect x="20" y="120" width="36" height="44" rx="10" className="rise fill-white/30" style={at(0)} />
        <rect x="76" y="92" width="36" height="72" rx="10" className="rise fill-white/50" style={at(2)} />
        <rect x="132" y="62" width="36" height="102" rx="10" className="rise fill-white/75" style={at(4)} />
        <rect x="188" y="28" width="36" height="136" rx="10" className="rise fill-yellow" style={at(6)} />
        <path d="M158 17l3.5 9.5 9.5 3.5-9.5 3.5-3.5 9.5-3.5-9.5-9.5-3.5 9.5-3.5z" className="rise fill-ink" style={at(9)} />
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
