"use client";

import { GENERIC_SERVER_ERROR } from "@/lib/errors/customer-messages";

/**
 * Last-resort boundary: replaces the root layout when the layout itself
 * throws, so nothing from `app/globals.css` or the design system is
 * guaranteed to be loaded. Styles are inline for that reason. Like the other
 * boundaries it renders the digest only, never `error.message`.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          background: "#FFFFFF",
          color: "#18181B",
          fontFamily: "'Geist Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #E4E4E7",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            !
          </div>
          <h1 style={{ margin: "24px 0 0", fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>Something went wrong</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: "#71717A" }}>
            {GENERIC_SERVER_ERROR} If it keeps happening, let us know and quote the reference below.
          </p>
          {error.digest ? (
            <p style={{ margin: "12px 0 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, color: "#71717A" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <div style={{ marginTop: 32, display: "flex", gap: 8, justifyContent: "center" }}>
            <a
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 36,
                padding: "0 14px",
                border: "1px solid #E4E4E7",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: "#18181B",
                textDecoration: "none",
              }}
            >
              Go to dashboard
            </a>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 36,
                padding: "0 14px",
                border: "1px solid #18181B",
                borderRadius: 8,
                background: "#18181B",
                color: "#FFFFFF",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
