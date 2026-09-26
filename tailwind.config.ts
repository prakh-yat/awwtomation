import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import animate from "tailwindcss-animate";

/**
 * A brand accent: the solid block (`bg-purple`), its soft tint
 * (`bg-purple-soft`) and the ink step for small text on white
 * (`text-purple-ink`). Tailwind's own numbered shades stay underneath, because
 * pipeline stage colours are spelled with them (`bg-orange-500`).
 */
function accent(name: string, shades: Record<string, string> = {}) {
  return {
    ...shades,
    DEFAULT: `hsl(var(--brand-${name}) / <alpha-value>)`,
    soft: `hsl(var(--brand-${name}-soft) / <alpha-value>)`,
    ink: `hsl(var(--brand-${name}-ink) / <alpha-value>)`,
  };
}

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1280px" } },
    extend: {
      fontFamily: {
        sans: ["Figtree Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Archivo Variable", "Figtree Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },

        // Brand. Flat accents from the marketing site, used as whole blocks,
        // soft tints and chart series; never as gradients.
        ink: "hsl(var(--brand-ink) / <alpha-value>)",
        paper: "hsl(var(--brand-paper) / <alpha-value>)",
        fog: "hsl(var(--brand-fog) / <alpha-value>)",
        mute: "hsl(var(--brand-mute) / <alpha-value>)",
        yellow: accent("yellow", colors.yellow),
        magenta: accent("magenta"),
        purple: accent("purple", colors.purple),
        indigo: accent("indigo", colors.indigo),
        blue: accent("blue", colors.blue),
        green: accent("green", colors.green),
        orange: accent("orange", colors.orange),
        lavender: accent("lavender"),
        sky: accent("sky", colors.sky),
        sage: accent("sage"),

        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 15 15 / 0.03)",
        elevated: "0 18px 44px -20px rgb(15 15 15 / 0.28), 0 2px 8px -4px rgb(15 15 15 / 0.08)",
        pop: "0 24px 48px -24px rgb(15 15 15 / 0.35), 0 4px 12px -6px rgb(15 15 15 / 0.12)",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 1, 0.36, 1)",
        brand: "cubic-bezier(0.66, 0, 0.33, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-right": { from: { opacity: "0", transform: "translateX(24px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "slide-in-left": { from: { opacity: "0", transform: "translateX(-24px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        pop: { from: { opacity: "0", transform: "scale(0.94)" }, to: { opacity: "1", transform: "scale(1)" } },
        "ping-soft": { "0%": { transform: "scale(1)", opacity: "0.55" }, "80%, 100%": { transform: "scale(2.2)", opacity: "0" } },
        "ring-pulse": { "0%": { boxShadow: "0 0 0 0 hsl(var(--ring) / 0.45)" }, "70%, 100%": { boxShadow: "0 0 0 14px hsl(var(--ring) / 0)" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "bar-grow": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
      },
      animation: {
        "fade-in": "fade-in 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-in-right": "slide-in-right 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-in-left": "slide-in-left 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        pop: "pop 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        "ping-soft": "ping-soft 1.8s cubic-bezier(0, 0, 0.2, 1) infinite",
        "ring-pulse": "ring-pulse 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        shimmer: "shimmer 1.6s linear infinite",
        "bar-grow": "bar-grow 0.8s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [animate],
};

export default config;
