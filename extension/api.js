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
  globalThis.fetch = (input, init) =>
    nativeFetch(
      typeof input === "string" && input.startsWith("/api/") ? base + input : input,
      init,
    );
}

/** Bearer auth for the endpoints that take a sync token, as a `RequestInit` for the client. */
export function bearer(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}
