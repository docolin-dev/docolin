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
    ignores: [".svelte-kit/", "build/", "node_modules/", ".vercel/", "src/paraglide/", "tmp/"],
  },
);
