import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import globals from "globals";

export default ts.config(
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...ts.configs.stylisticTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "no-undef": "off",
      // SvelteKit type-safe routes via resolve() are not used in this project.
      "svelte/no-navigation-without-resolve": "off",
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: ts.parser,
        projectService: true,
        extraFileExtensions: [".svelte"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Svelte components have many inline event handlers and reactive functions
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    files: ["src/lib/components/ui/**/*.svelte"],
    rules: {
      // shadcn-svelte primitives use a navigation pattern the rule misreads.
      "svelte/no-navigation-without-resolve": "off",
      // Generated patterns from shadcn-svelte; would resurface on every component re-add.
      "@typescript-eslint/no-useless-default-assignment": "off",
      // $bindable() defaults type as any inside shadcn primitives; rewriting
      // them on every component re-add is not worth the lint signal.
      "@typescript-eslint/no-unsafe-assignment": "off",
      // shadcn primitives use `||` for fallback values; not worth rewriting.
      "@typescript-eslint/prefer-nullish-coalescing": "off",
    },
  },
  {
    files: ["*.config.{js,ts}", "*.config.*.{js,ts}"],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    extends: [ts.configs.disableTypeChecked],
  },
  {
    ignores: [
      ".svelte-kit/",
      "build/",
      "node_modules/",
      ".vercel/",
      "src/paraglide/",
      // shadcn-svelte's chart component is generated/vendored (re-added with -o);
      // its LayerChart-composed code trips many type-aware rules and would resurface
      // on every re-add. Treat like other generated code rather than rewrite it.
      "src/lib/components/ui/chart/",
      "tmp/",
      "scripts/",
      // Standalone workers (cron, etc.) have their own runtime context
      // (CF Workers globals like ScheduledEvent) and don't share the main
      // app's tsconfig project. Deployed via `wrangler deploy` separately.
      "workers/",
    ],
  },
);
