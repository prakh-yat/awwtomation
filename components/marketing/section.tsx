import * as React from "react";

import { cn } from "@/lib/utils";

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Center the heading block (default: left-aligned). */
  align?: "left" | "center";
  /** Inverts the section to black-on-white → white-on-black. */
  inverted?: boolean;
  /** Width of the inner container. */
  width?: "default" | "narrow" | "wide";
}

const widths = {
  default: "max-w-6xl",
  narrow: "max-w-3xl",
  wide: "max-w-7xl",
} as const;

/** Vertical rhythm + heading block shared by every marketing section. */
function Section({
  eyebrow,
  title,
  description,
  align = "left",
  inverted = false,
  width = "default",
  className,
  children,
  ...props
}: SectionProps) {
  const hasHeading = Boolean(eyebrow || title || description);
  return (
    <section
      className={cn("py-20 sm:py-24", inverted && "bg-primary text-primary-foreground", className)}
      {...props}
    >
      <div className={cn("mx-auto w-full px-6", widths[width])}>
        {hasHeading ? (
          <div className={cn("mb-12 max-w-2xl", align === "center" && "mx-auto text-center")}>
            {eyebrow ? (
              <p
                className={cn(
                  "mb-3 text-[11px] font-medium uppercase tracking-[0.18em]",
                  inverted ? "text-primary-foreground/60" : "text-muted-foreground",
                )}
              >
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
            ) : null}
            {description ? (
              <p
                className={cn(
                  "mt-4 text-balance text-base leading-7",
                  inverted ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export type ProseProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Typography for long-form legal pages. No @tailwindcss/typography plugin is
 * installed, so the element styles are applied through arbitrary variants.
 */
function Prose({ className, ...props }: ProseProps) {
  return (
    <div
      className={cn(
        "text-[15px] leading-7 text-foreground/90",
        "[&_h2]:mt-12 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
        "[&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_p]:mt-4",
        "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6",
        "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6",
        "[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_code]:rounded [&_code]:border [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
        className,
      )}
      {...props}
    />
  );
}

export interface LegalPageProps {
  title: string;
  description?: string;
  /** Human-readable "Last updated" date. */
  updated: string;
  children: React.ReactNode;
}

/** Shell for privacy / terms / data-deletion: narrow prose column with a dated header. */
function LegalPage({ title, description, updated, children }: LegalPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <header className="border-b pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 text-base text-muted-foreground">{description}</p> : null}
        <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Last updated {updated}</p>
      </header>
      <Prose className="pt-2">{children}</Prose>
    </div>
  );
}

export { Section, Prose, LegalPage };
