import { defineConfig } from "orval";

const externalBaseUrl = process.env.NEXTRS_EXTERNAL_CLIENT_BASE_URL;

export default defineConfig({
  api: {
    input: "./openapi.json",
    output: {
      mode: "tags-split",
      target: "./src/generated",
      schemas: "./src/generated/model",
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
          input: "./openapi.json",
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
