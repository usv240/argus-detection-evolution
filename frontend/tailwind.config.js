/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // All tokens reference CSS variables so toggling html.light swaps the palette
        ink:          "rgb(var(--c-ink) / <alpha-value>)",
        panel:        "rgb(var(--c-panel) / <alpha-value>)",
        "panel-lo":   "rgb(var(--c-panel-lo) / <alpha-value>)",
        edge:         "rgb(var(--c-edge) / <alpha-value>)",
        "edge-hi":    "rgb(var(--c-edge-hi) / <alpha-value>)",
        support:      "rgb(var(--c-support) / <alpha-value>)",
        "support-lo": "rgb(var(--c-support-lo) / <alpha-value>)",
        refute:       "rgb(var(--c-refute) / <alpha-value>)",
        "refute-lo":  "rgb(var(--c-refute-lo) / <alpha-value>)",
        accent:       "rgb(var(--c-accent) / <alpha-value>)",
        "accent-lo":  "rgb(var(--c-accent-lo) / <alpha-value>)",
        muted:        "rgb(var(--c-muted) / <alpha-value>)",
        "muted-hi":   "rgb(var(--c-muted-hi) / <alpha-value>)",
        // white = #fff in dark, #0f172a in light - text-white stays readable everywhere
        white:        "rgb(var(--c-white) / <alpha-value>)",
      },
      boxShadow: {
        glow:     "0 0 28px rgba(139,92,246,0.20)",
        "glow-sm":"0 0 14px rgba(139,92,246,0.13)",
        "glow-b": "0 0 28px rgba(59,130,246,0.18)",
        card:     "0 1px 3px rgba(0,0,0,0.4),0 4px 16px rgba(0,0,0,0.24)",
      },
      animation: {
        scan:      "scan 2.6s ease-in-out infinite",
        "fade-up": "fade-up 0.3s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
      },
      keyframes: {
        scan: {
          "0%":   { transform: "translateX(-120%)", opacity: "0" },
          "15%":  { opacity: "1" },
          "85%":  { opacity: "1" },
          "100%": { transform: "translateX(420%)", opacity: "0" },
        },
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
