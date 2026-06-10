/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:          "#0b0f1a",
        panel:        "#111827",
        "panel-lo":   "#0e1420",
        edge:         "#1e2d45",
        "edge-hi":    "#2d4060",
        support:      "#3b82f6",
        "support-lo": "#1a3a6a",
        refute:       "#f59e0b",
        "refute-lo":  "#3d2700",
        accent:       "#8b5cf6",
        "accent-lo":  "#2d1f4a",
        muted:        "#64748b",
        "muted-hi":   "#94a3b8",
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
