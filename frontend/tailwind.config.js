/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Colorblind-safe diverging palette (NOT red/green) — accessible by design.
        ink: "#0b0f1a",
        panel: "#121829",
        edge: "#1f2940",
        support: "#3b82f6", // blue = supporting evidence
        refute: "#f59e0b", // amber = contradicting evidence
        accent: "#8b5cf6",
        muted: "#64748b",
      },
    },
  },
  plugins: [],
};
