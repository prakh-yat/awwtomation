import * as React from "react";

import { cn } from "@/lib/utils";

/** Page-width wrapper shared by the nav, every marketing section and the footer. */
function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-6", className)} {...props} />;
}

/** Section heading: sentence case, no eyebrow above it. */
function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-balance text-[28px] font-semibold leading-[1.15] tracking-[-0.022em] text-foreground sm:text-[34px]",
        className,
      )}
      {...props}
    />
  );
}

/** The paragraph that sits under or beside a section heading. */
function SectionText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[16px] leading-[1.65] text-muted-foreground", className)} {...props} />;
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
    <Container className="max-w-3xl pb-24 pt-16 sm:pt-20">
      <header className="border-b pb-8">
        <h1 className="text-balance text-[32px] font-semibold leading-tight tracking-[-0.022em] sm:text-[40px]">{title}</h1>
        {description ? <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{description}</p> : null}
        <p className="mt-5 text-[13px] text-muted-foreground">Last updated {updated}</p>
      </header>
      <Prose className="pt-2">{children}</Prose>
    </Container>
  );
}

export { Container, SectionTitle, SectionText, Prose, LegalPage };
