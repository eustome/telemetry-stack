import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#050514",
        panel: "#0f1729",
        accent: "#c084fc",
        ember: "#fb7185",
        glow: "#22d3ee"
      }
    }
  },
  plugins: [forms]
};

export default config;

