import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  // .claude/ holds other sessions' git worktrees (whole copies of the repo, builds included).
  { ignores: ["dist", "node_modules", "coverage", ".claude"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-unused-vars": "off",
      // TypeScript itself catches real undefined-variable errors; the core rule false-positives
      // on type-only namespace usage like `React.CSSProperties` under the automatic JSX runtime.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Build scripts (npm run icons) run in Node, not the browser.
  {
    files: ["scripts/**/*.mjs"],
    // Node, plus the browser for code a script runs inside a page (perf-pan.mjs's evaluate calls).
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
