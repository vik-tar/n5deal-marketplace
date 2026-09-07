import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The one architectural rule this project holds by hand, enforced.
 *
 * `src/components/ui` is the design system: `Button`, `Card`, `Field`,
 * `Badge`, `Tabs` and two small notes. Nothing in it knows what an asset, a
 * mandate or an access request is, and nothing in it carries a word of
 * user-facing copy — every string arrives as an already-translated prop. That
 * is what let today's switch of the second locale from Russian to Spanish
 * rewrite 567 message keys and a dozen `domain/` components without touching
 * any of those seven files, and it is what makes one `[aria-invalid]` rule in
 * `globals.css` light up the invalid field in every form in the app.
 *
 * Until now the rule held only because everyone remembered it. Measured before
 * writing this: `ui/` imported nothing but `@/lib/cn`, `react` and
 * `@/i18n/navigation`, so the boundary was intact — but one import away from
 * being quietly wrong, with nothing to say so.
 *
 * **`@/components/domain/*` is the most important entry.** The other patterns
 * stop copy and product vocabulary leaking downwards; this one keeps the
 * dependency arrow pointing one way. `domain/` builds on `ui/` at 41 call
 * sites; the reverse would make the two folders one folder with a slash in it.
 *
 * `@/i18n/navigation` is deliberately **not** forbidden. `Tabs` renders a
 * locale-aware `Link`, and a link is navigation, not copy — it carries no
 * language of its own. `next-intl` itself is forbidden, because reaching for
 * `useTranslations` inside `ui/` is exactly how copy gets in.
 */
const uiLayerBoundary = {
  files: ["src/components/ui/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/components/domain", "@/components/domain/*"],
            message:
              "ui/ is the design system and must not depend on domain components — the arrow points the other way.",
          },
          {
            group: ["next-intl", "next-intl/*"],
            message:
              "ui/ carries no copy: pass already-translated strings in as props, the way Badge and UnsavedMarker do.",
          },
          {
            group: ["@/server", "@/server/*"],
            message:
              "ui/ must not reach the database or a Server Action. Take a callback or a value as a prop instead.",
          },
          {
            group: ["@/generated", "@/generated/*"],
            message:
              "ui/ must not know the database schema. StatusPill (domain/) is where a Prisma enum meets a Badge tone.",
          },
          {
            group: [
              "@/lib/authz",
              "@/lib/authz/*",
              "@/lib/validation",
              "@/lib/validation/*",
              "@/lib/filters",
              "@/lib/filters/*",
              "@/lib/matching",
              "@/lib/matching/*",
              "@/lib/nav",
            ],
            message:
              "ui/ must not know this product's rules. Authorization, validation, filters, matching and nav belong to domain/.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  uiLayerBoundary,
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
