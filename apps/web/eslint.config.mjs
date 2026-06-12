import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "react/display-name": "off",
      // Next 16 bundles eslint-plugin-react-hooks v6 (React-Compiler-era) which
      // promotes these to errors. Our existing usages are intentional, benign
      // patterns (reset-optimistic-overlay-on-SWR-refresh effects; a monotonic
      // key counter in a once-only lazy useState initializer) — keep them as
      // warnings to match this repo's lenient lint posture. Revisit if we adopt
      // the React Compiler.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default config;
