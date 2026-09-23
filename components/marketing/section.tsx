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

export type ProseProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Typography for long-form legal pages. No @tailwindcss/typography plugin is
 * installed, so the element styles are applied through arbitrary variants.
 * Spacing targets direct children only, so a box placed in the text (the data
 * deletion status) keeps its own layout.
 */
function Prose({ className, ...props }: ProseProps) {
  return (
    <div
      className={cn(
        "text-pretty text-[16px] leading-[1.75] text-ink/80 sm:text-[17px]",
        "[&>h2]:mt-14 [&>h2]:scroll-mt-24 [&>h2]:border-t [&>h2]:pt-10 [&>h2]:font-display [&>h2]:text-[26px] [&>h2]:font-black [&>h2]:leading-[1.05] [&>h2]:tracking-[-0.03em] [&>h2]:text-ink sm:[&>h2]:text-[30px]",
        "[&>h2:first-child]:mt-0 [&>h2:first-child]:border-t-0 [&>h2:first-child]:pt-0",
        "[&>h3]:mt-9 [&>h3]:text-[18px] [&>h3]:font-bold [&>h3]:leading-snug [&>h3]:text-ink",
        "[&>p]:mt-4 [&>h2+p]:mt-5",
        "[&>ul]:mt-4 [&>ul]:list-disc [&>ul]:space-y-2.5 [&>ul]:pl-5",
        "[&>ol]:mt-4 [&>ol]:list-decimal [&>ol]:space-y-2.5 [&>ol]:pl-5",
        "[&_li]:pl-1.5 [&_li::marker]:font-semibold [&_li::marker]:text-ink/40",
        "[&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:decoration-ink/30 [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:decoration-magenta",
        "[&_strong]:font-semibold [&_strong]:text-ink",
        "[&_code]:rounded-md [&_code]:bg-fog [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

type Heading = { id: string; number: string | null; label: string };

/** The plain text of a heading, including values like `{brand.name}` inside it. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function anchorFor(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Gives each top-level <h2> an id and lists it for the contents. The headings
 * themselves are rendered exactly as written; only the id is added.
 */
function withAnchors(children: React.ReactNode): { content: React.ReactNode; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();
  const content = React.Children.map(children, (child) => {
    if (!React.isValidElement<React.HTMLAttributes<HTMLHeadingElement>>(child) || child.type !== "h2") return child;
    const text = textOf(child.props.children).replace(/\s+/g, " ").trim();
    const numbered = /^(\d+)\.\s+(.+)$/.exec(text);
    const label = numbered ? numbered[2] : text;
    let id = child.props.id ?? (anchorFor(label) || `section-${headings.length + 1}`);
    while (used.has(id)) id = `${id}-${headings.length + 1}`;
    used.add(id);
    headings.push({ id, number: numbered ? numbered[1] : null, label });
    return child.props.id ? child : React.cloneElement(child, { id });
  });
  return { content, headings };
}

export interface LegalPageProps {
  title: string;
  description?: string;
  /** Human-readable "Last updated" date. */
  updated: string;
  children: React.ReactNode;
}

/**
 * Shell for privacy / terms / data-deletion: a lavender header block, then a
 * readable column of text with the section list beside it on wide screens.
 */
function LegalPage({ title, description, updated, children }: LegalPageProps) {
  const { content, headings } = withAnchors(children);
  const contents = headings.length > 1;
  return (
    <>
      <Band as="header" tone="lavender" grid>
        <Container className="pb-14 pt-28 sm:pb-16 sm:pt-36">
          <Eyebrow className="text-ink/75">Last updated {updated}</Eyebrow>
          <h1 className="mt-5 max-w-[16ch] text-balance font-display text-[44px] leading-[0.9] tracking-[-0.035em] sm:text-[60px] lg:text-[72px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-6 max-w-[40rem] text-pretty text-[17px] leading-[1.55] text-ink/75 sm:text-[18px]">{description}</p>
          ) : null}
        </Container>
      </Band>

      <Container className={cn("pb-24 pt-12 sm:pb-28 sm:pt-16", contents && "lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16")}>
        {contents ? (
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="brand-label text-muted-foreground">On this page</p>
              <ol className="mt-4 border-l">
                {headings.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      className="-ml-px flex gap-2.5 rounded-r-lg border-l border-transparent py-1.5 pl-4 pr-2 text-[13px] leading-5 text-muted-foreground outline-none transition-colors hover:border-ink hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {h.number ? <span className="w-4 shrink-0 font-mono text-[12px] tabular-nums text-ink/35">{h.number}</span> : null}
                      <span>{h.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        ) : null}
        <Prose className="max-w-[40rem]">{content}</Prose>
      </Container>
    </>
  );
}

export { Container, Band, Eyebrow, SectionTitle, SectionText, Prose, LegalPage };
