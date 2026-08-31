import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // .vercel/output holds the megabytes of bundled server/client output a
    // build produces. It was not ignored, so `eslint .` walked all of it and
    // effectively never finished — which is a large part of why linting got
    // stubbed out instead of fixed.
    ignores: [
      "dist",
      "dist-static",
      ".output",
      ".vinxi",
      ".vercel",
      "android",
      "node_modules",
      // Generated — regenerated wholesale, never hand-edited to satisfy lint.
      "src/routeTree.gen.ts",
      "src/integrations/supabase/types.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",

      // `catch {}` to deliberately ignore a failure is a real pattern here
      // (removing a realtime channel, best-effort sessionStorage) — all five
      // occurrences are intentional.
      "no-empty": ["error", { allowEmptyCatch: true }],

      // 450 pre-existing occurrences. Worth seeing, not worth blocking a
      // build over, and silencing it outright would hide new ones.
      "@typescript-eslint/no-explicit-any": "warn",

    },
  },
  eslintConfigPrettier,
);
