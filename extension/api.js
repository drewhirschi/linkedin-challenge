// The generated nextrs client, pointed at the user's configured server.
//
// `client.js` is generated from the Rust routes by `cargo nextrs client generate` (see
// server/client/nextrs.client.json). Never edit it — regenerate instead.
//
// It is generated with an empty baseUrl, so its URL builders return root-relative paths like
// `/api/sync`. Inside an MV3 service worker a relative fetch resolves against
// `chrome-extension://<id>/`, which is not our server.
//
// So we install one narrow rewrite: a string URL beginning with `/api/` is resolved against
// `SERVER_URL`. Absolute URLs pass through untouched, which is what keeps the LinkedIn Voyager
// calls in linkedin.js unaffected.
import { SERVER_URL } from "./config.js";

export {
  linkIdentity,
  pushSync,
  signInDeviceWithSession,
} from "./generated/nextrs-client/client.js";

let installed = false;

export function installApiBaseUrl() {
  if (installed) return;
  installed = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const base = SERVER_URL.replace(/\/$/, "");
  globalThis.fetch = async (input, init) => {
    const isApi = typeof input === "string" && input.startsWith("/api/");
    const response = await nativeFetch(isApi ? base + input : input, init);
    if (!isApi) return response;

    // The generated client assumes every response body is JSON. Framework-level failures can be
    // plain text (for example "Failed to ..."), which used to hide the real problem behind
    // "Unexpected token ... is not valid JSON". Normalize only our API responses at this seam.
    const body = await response.text();
    if (!body) return new Response(null, response);
    try {
      JSON.parse(body);
      return new Response(body, response);
    } catch {
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify({ error: body }), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  };
}

/** Bearer auth for the endpoints that take a sync token, as a `RequestInit` for the client. */
export function bearer(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}
