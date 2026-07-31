import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";

// Deliberately tuned to catch BUGS, not to enforce style. The five eslint
// packages were already in package.json with lint scripts wired up, but no
// config file ever existed, so `npm run lint` just errored out.
//
// Style rules are off on purpose: this is a working codebase, and a lint run
// that reports hundreds of formatting opinions gets ignored, which costs more
// than it saves. Anything set to "error" below represents an actual defect.
export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      // Edge Functions are Deno, not browser JS - different globals and
      // import style, so this browser-targeted config would misreport them.
      "supabase/functions/**",
      // Claude Code tool state, including throwaway git worktrees that
      // contain a full second copy of src/.
      ".claude/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      // --- real bugs ---
      ...reactHooks.configs.recommended.rules,
      // These two must be on or the unused-vars rules below produce garbage:
      // without them ESLint does not count `<Foo />` as a use of `Foo`, and
      // reports every imported component in the codebase as unused.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react/jsx-key": "error", // missing keys cause wrong re-render behavior
      "react/no-children-prop": "error",
      "no-unused-vars": "off", // superseded by unused-imports below
      "unused-imports/no-unused-imports": "error", // dead imports
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }], // deliberate empty catches exist

      // --- not applicable to this codebase ---
      // No PropTypes or TypeScript here by design; the shim returns plain
      // objects from Edge Functions, so prop validation would be noise.
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off", // React 17+ JSX transform
      "react-refresh/only-export-components": "off", // hooks/consts share files
    },
  },
];
