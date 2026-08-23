import { defineConfig } from "orval";

// A third, app-specific surface: the browser extension consumes a React-free
// client built against an absolute origin. It is only emitted when
// `scripts/generate-external.mjs` sets the base URL from nextrs.client.json,
// so ordinary `nextrs client generate` runs stay at two targets.
const externalBaseUrl = process.env.NEXTRS_EXTERNAL_CLIENT_BASE_URL;

// Both in-app surfaces come from the same hidden OpenAPI document. The root
// package entry stays framework-agnostic; React and TanStack Query live behind
// the explicit `/react-query` entry point.
export default defineConfig({
  fetch: {
    input: "../openapi.json",
    output: {
      mode: "tags-split",
      target: "./src/generated/fetch/index.ts",
      schemas: "./src/generated/fetch/model",
      client: "fetch",
      httpClient: "fetch",
      baseUrl: "/",
      clean: true,
      prettier: false,
    },
  },
  reactQuery: {
    input: "../openapi.json",
    output: {
      mode: "tags-split",
      target: "./src/generated/react-query/index.ts",
      schemas: "./src/generated/react-query/model",
      client: "react-query",
      httpClient: "fetch",
      baseUrl: "/",
      clean: true,
      prettier: false,
    },
  },
  ...(externalBaseUrl !== undefined
    ? {
        external: {
          input: "../openapi.json",
          output: {
            mode: "single" as const,
            target: "./external-src/client.ts",
            client: "fetch" as const,
            httpClient: "fetch" as const,
            baseUrl: externalBaseUrl,
            clean: true,
            prettier: false,
          },
        },
      }
    : {}),
});
