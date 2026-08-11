import { defineConfig } from "vitest/config";

// A dedicated config, separate from vite.config.mts — that file sets
// `root: "public-ui"` for the frontend dev server, and Vitest (sharing the
// same "root" concept as Vite) inherited it whenever it read that file
// directly, meaning `npm test` silently found zero test files: every one of
// this project's *.test.ts files lives under src/, outside public-ui/, so
// "No test files found" was the actual, exit-code-1 result of every past
// `npm test` run — confirmed by stashing all other changes and re-running
// it against a clean checkout. A dedicated vitest.config.* file takes
// priority over vite.config.* for Vitest specifically (per Vitest's own
// config-resolution docs) without changing anything about how the frontend
// dev server itself runs.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
  },
});
