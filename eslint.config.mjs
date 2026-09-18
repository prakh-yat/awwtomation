import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

// House style: no em dashes anywhere in the product, in copy or in comments.
// A colon, a comma or a second sentence always says the same thing, and the
// dash reads as machine-written. Enforced here so it cannot creep back in.
const NO_EM_DASH = "Do not use em dashes. Use a colon, a comma, or two sentences.";
const noEmDash = [
  "error",
  { selector: "Literal[value=/\\u2014/]", message: NO_EM_DASH },
  { selector: "TemplateElement[value.raw=/\\u2014/]", message: NO_EM_DASH },
  { selector: "JSXText[value=/\\u2014/]", message: NO_EM_DASH },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-syntax": noEmDash,
    },
  },
  { ignores: [".next/**", "node_modules/**", "app/generated/**"] },
];

export default eslintConfig;
