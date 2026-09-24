import * as React from "react";

import { cn } from "@/lib/utils";

/** Page-width wrapper shared by the nav, every marketing section and the footer. */
function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)} {...props} />;
}

export type BandTone = "paper" | "fog" | "yellow" | "lavender" | "sky" | "purple" | "indigo" | "green" | "ink";

/** The site's flat colours and the text each one takes. */
const BAND_TONES: Record<BandTone, { surface: string; dark: boolean }> = {
  paper: { surface: "bg-background text-ink", dark: false },
  fog: { surface: "bg-fog text-ink", dark: false },
  yellow: { surface: "bg-yellow text-ink", dark: false },
  lavender: { surface: "bg-lavender text-ink", dark: false },
  sky: { surface: "bg-sky text-ink", dark: false },
  purple: { surface: "bg-purple text-white", dark: true },
  indigo: { surface: "bg-indigo text-white", dark: true },
  green: { surface: "bg-green text-white", dark: true },
  ink: { surface: "bg-ink text-white", dark: true },
};

export interface BandProps extends React.HTMLAttributes<HTMLElement> {
  as?: "section" | "header" | "div";
  tone?: BandTone;
  /** The site's faint square grid: three squares across a phone, eight across a desktop. */
  grid?: boolean;
}

/** A full-bleed block of one flat colour, never a gradient. */
function Band({ as: Tag = "section", tone = "paper", grid = false, className, ...props }: BandProps) {
  const t = BAND_TONES[tone];
  return (
    <Tag
      className={cn(
        t.surface,
        grid && "bg-grid [--grid-size:33.3333vw] lg:[--grid-size:12.5vw]",
        grid && t.dark && "bg-grid-light",
        className,
      )}
      {...props}
    />
  );
}

/** Small mono uppercase label above a heading. Takes the colour of the block it sits on. */
function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("brand-label text-[12px]", className)} {...props} />;
}

/** Section heading in the display cut, set tight. Sentence case. */
function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-display text-balance text-[38px] leading-[0.92] tracking-[-0.035em] sm:text-[48px] lg:text-[56px]",
        className,
      )}
      {...props}
    />
  );
}

/** The paragraph that sits under or beside a section heading. */
function SectionText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-pretty text-[16px] leading-[1.6] text-muted-foreground sm:text-[17px]", className)} {...props} />;
}

export { Container, Band, Eyebrow, SectionTitle, SectionText };
