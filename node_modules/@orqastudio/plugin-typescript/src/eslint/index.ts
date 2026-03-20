import tseslint from "typescript-eslint";
import type { ConfigArray } from "typescript-eslint";

/**
 * Base TypeScript ESLint config for OrqaStudio projects.
 *
 * Includes:
 * - typescript-eslint recommended rules
 * - Strict no-any enforcement
 * - Ban on @ts-ignore / @ts-expect-error without description
 * - Unused vars configured to allow underscore-prefixed params
 *
 * Usage:
 * ```js
 * import { base } from "@orqastudio/plugin-typescript/eslint";
 * export default [...base];
 * ```
 */
export const base: ConfigArray = tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // Ban bare console usage — all logging must go through the centralized logger.
      // Only the logger implementation itself may use console directly.
      "no-console": ["error", { allow: [] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.js", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Web workers and logger implementations can't use the SDK logger
    files: ["**/*.worker.ts", "**/logger.ts", "**/dev-console.ts"],
    rules: {
      "no-console": "off",
    },
  },
);

/**
 * Recommended config — currently identical to base.
 * Reserved for future additions beyond strict TypeScript.
 */
export const recommended: ConfigArray = base;
