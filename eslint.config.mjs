import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // HLD §4 Zero-Touch Money Invariant: risk/ must never touch money or parent messaging.
  // Mirrors the isolation tests in src/modules/risk/__tests__/risk-service.test.ts.
  {
    files: ["src/modules/risk/**/*.ts"],
    ignores: ["src/modules/risk/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/modules/payments",
                "@/modules/payments/*",
                "@/modules/reminders",
                "@/modules/reminders/*",
                "@/modules/refunds",
                "@/modules/refunds/*",
                "@/modules/parent",
                "@/modules/parent/*",
                "@/modules/reports",
                "@/modules/reports/*",
                "@/modules/ledger",
                "@/modules/ledger/*",
                "!@/modules/ledger/ledger-math",
                "!@/modules/ledger/date-utils",
                "!@/modules/ledger/types",
                "../*",
              ],
              message:
                "risk/ may only import pure ledger helpers (ledger-math, date-utils, types). It must not touch payments, reminders, refunds, parent or reports (HLD §4).",
            },
          ],
        },
      ],
    },
  },

  // Reverse direction: money and parent-facing code must never import risk.
  {
    files: [
      "src/modules/payments/**/*.ts",
      "src/modules/reminders/**/*.ts",
      "src/modules/refunds/**/*.ts",
      "src/modules/parent/**/*.ts",
      "src/modules/ledger/**/*.ts",
      "src/modules/reports/**/*.ts",
      "src/app/api/parent/**/*.ts",
      "src/app/api/webhooks/**/*.ts",
      "src/app/(parent)/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/risk", "@/modules/risk/*", "**/risk", "**/risk/*"],
              message:
                "Money and parent-facing code must not depend on risk scoring (HLD §4).",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;