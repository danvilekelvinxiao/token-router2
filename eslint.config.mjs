import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "public/generated-images/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/**/*.{js,jsx}", "lib/**/*.{js,jsx}", "pages/**/*.{js,jsx}", "scripts/**/*.{js,jsx}", "styles/**/*.{js,jsx}", "*.js", "*.mjs", "*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        queueMicrotask: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
]);
