"use client";

import { TONE_HEX } from "@/components/ui/tone";
import { brand } from "@/lib/brand";

/*
 * Last-resort boundary: replaces the root layout when the layout itself
 * throws, so nothing from `app/globals.css` or the design system is
 * guaranteed to be loaded. Styles are inline for that reason, drawn to match
 * the other error screens: the lavender block, its grid, ink pills. Like the
 * other boundaries it renders the digest only, never `error.message`.
 */
const INK = TONE_HEX.ink;
const DISPLAY_FONT = "'Archivo Variable', 'Arial Black', 'Helvetica Neue', system-ui, sans-serif";
const BODY_FONT = "'Figtree Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const pill = {
  display: "inline-flex",
  alignItems: "center",
  height: 44,
  padding: "0 22px",
  borderRadius: 999,
  fontSize: 15,
  fontWeight: 600,
  fontFamily: BODY_FONT,
  textDecoration: "none",
  cursor: "pointer",
} as const;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const subject = error.digest ? `Error reference ${error.digest}` : "Something went wrong";

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          padding: "64px 24px",
          boxSizing: "border-box",
          background: TONE_HEX.lavender,
          backgroundImage:
            "linear-gradient(to right, rgb(15 15 15 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 15 15 / 0.08) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          color: INK,
          fontFamily: BODY_FONT,
        }}
      >
        <main style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: DISPLAY_FONT,
              fontWeight: 900,
              fontSize: "clamp(2.75rem, 8vw, 5.5rem)",
              lineHeight: 0.92,
              letterSpacing: "-0.035em",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ margin: "20px 0 0", fontSize: 15, lineHeight: 1.6, maxWidth: 440 }}>
            Try again. If it keeps happening,{" "}
            <a
              href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(subject)}`}
              style={{ color: INK, fontWeight: 600, textUnderlineOffset: 4 }}
            >
              email us
            </a>
            {error.digest ? " and we’ll look it up." : "."}
          </p>
          <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={() => reset()} style={{ ...pill, border: 0, background: INK, color: "white" }}>
              Try again
            </button>
            <a href="/dashboard" style={{ ...pill, border: "1px solid rgb(15 15 15 / 0.2)", background: "white", color: INK }}>
              Go to dashboard
            </a>
          </div>
          {error.digest ? (
            <p style={{ margin: "40px 0 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, opacity: 0.7 }}>
              Reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
