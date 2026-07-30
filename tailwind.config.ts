import type { Config } from "tailwindcss";

/* Same Major Third scale (1.250) and palette as the sibling site,
 * modelparams.dev, so the two read as one family. The status colours are the
 * only addition — this site has a traffic-light dimension that one does not.
 */

const config: Config = {
  content: ["./src/views/**/*.ejs", "./src/client/**/*.ts"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Ovo", "Georgia", "Cambria", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "scale-sm": ["1.25rem", { lineHeight: "1.3" }],
        "scale-md": ["1.563rem", { lineHeight: "1.25" }],
        "scale-lg": ["1.953rem", { lineHeight: "1.2" }],
        "scale-xl": ["2.441rem", { lineHeight: "1.15" }],
        "scale-2xl": ["3.052rem", { lineHeight: "1.1" }],
        "scale-3xl": ["3.815rem", { lineHeight: "1.05" }],
      },
      colors: {
        accent: {
          DEFAULT: "#2530F0",
          hover: "#1a22c4",
        },
        warm: {
          hover: "#e6e1d9",
          tag: "#f0ece5",
        },
      },
    },
  },
  plugins: [],
};

export default config;
