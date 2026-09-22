import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.mjs";
import { a as proxiedFetch } from "./proxy-DLvX8yxv.mjs";
//#region src/types.ts
/** Whether a request ran through an explicit per-account proxy. */
function isProxyRouted(routing) {
	return Boolean(routing?.proxyUrl);
}
/**
* Host-independent authentication error. The adapter maps `kind` to the DSH
* error protocol without coupling the session or CLI layers to dsh-llm.
*/
var AgyAuthError = class extends Error {
	kind;
	constructor(kind, message, options) {
		super(message, options);
		this.name = "AgyAuthError";
		this.kind = kind;
	}
};
/**
* Enabled accounts exist, but every candidate is temporarily blocked. Kept
* independent of dsh-llm so CLI and web entry points do not gain a host import.
*/
var AgyPoolBlockedError = class extends Error {
	kind;
	blockedUntil;
	constructor(kind, blockedUntil) {
		super(kind === "quota-exhausted" ? "All agy accounts have exhausted quota for the requested model family." : "All agy accounts are temporarily blocked for the requested model family.");
		this.name = "AgyPoolBlockedError";
		this.kind = kind;
		this.blockedUntil = blockedUntil;
	}
};
//#endregion
//#region src/oauth/constants.ts
/**
* Antigravity (agy) OAuth and API constants.
*
* The client id/secret below are the public Google consumer-OAuth credentials
* shipped inside the Antigravity desktop product and its `agy` CLI; they are
* embedded in many public tools (see NOTICE.md). They are not secrets owned by
* this project.
*/
var constants_exports = /* @__PURE__ */ __exportAll({
	AGY_CLIENT_ID: () => AGY_CLIENT_ID,
	AGY_CLIENT_SECRET: () => AGY_CLIENT_SECRET,
	AGY_DEFAULT_REDIRECT_URI: () => AGY_DEFAULT_REDIRECT_URI,
	AGY_ENDPOINT_AUTOPUSH: () => AGY_ENDPOINT_AUTOPUSH,
	AGY_ENDPOINT_DAILY: () => AGY_ENDPOINT_DAILY,
	AGY_ENDPOINT_DAILY_SANDBOX: () => AGY_ENDPOINT_DAILY_SANDBOX,
	AGY_ENDPOINT_FALLBACKS: () => AGY_ENDPOINT_FALLBACKS,
	AGY_ENDPOINT_PROD: () => AGY_ENDPOINT_PROD,
	AGY_ENDPOINT_SKIP_STATUSES: () => AGY_ENDPOINT_SKIP_STATUSES,
	AGY_SCOPES: () => AGY_SCOPES,
	AGY_VERSION_FALLBACK: () => AGY_VERSION_FALLBACK,
	OAUTH_AUTHORIZE_URL: () => OAUTH_AUTHORIZE_URL,
	OAUTH_TOKEN_URL: () => OAUTH_TOKEN_URL,
	OAUTH_USERINFO_URL: () => OAUTH_USERINFO_URL,
	fetchAgyFirstOk: () => fetchAgyFirstOk,
	getAgyBootstrapClientMetadata: () => getAgyBootstrapClientMetadata,
	getAgyBootstrapUserAgent: () => getAgyBootstrapUserAgent,
	resolveAgyClientCredentials: () => resolveAgyClientCredentials
});
const AGY_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const AGY_CLIENT_SECRET = "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";
/**
* Effective OAuth client credentials: AGY_CLIENT_ID / AGY_CLIENT_SECRET env
* overrides win when set (BYO OAuth app escape hatch, mirrors pi-antigravity);
* otherwise the embedded public Antigravity credentials are used.
*/
function resolveAgyClientCredentials(overrideClientId) {
	if (overrideClientId) {
		if (overrideClientId === "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com") return {
			clientId: AGY_CLIENT_ID,
			clientSecret: AGY_CLIENT_SECRET
		};
		return {
			clientId: overrideClientId,
			clientSecret: process.env.AGY_CLIENT_SECRET || "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"
		};
	}
	return {
		clientId: process.env.AGY_CLIENT_ID || "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
		clientSecret: process.env.AGY_CLIENT_SECRET || "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"
	};
}
/** Required scopes. `openid` must NOT be added: it routes Google into the hanging
* `firstparty/nativeapp` consent for this client (verified by OmniRoute). */
const AGY_SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
	"https://www.googleapis.com/auth/cclog",
	"https://www.googleapis.com/auth/experimentsandconfigs"
];
const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo";
/** Default loopback callback used by the standalone CLI listener (fixed port, like opencode). */
const AGY_DEFAULT_REDIRECT_URI = "http://localhost:51121/oauth-callback";
/**
* Antigravity API endpoints. The daily runtime host (no .sandbox suffix) is the
* live endpoint for consumer OAuth accounts — cloudcode-pa.googleapis.com
* answers RESOURCE_EXHAUSTED for them (verified by live probe), while the
* daily host answers 200. Order matters: first reachable non-429/403/503 wins.
*/
const AGY_ENDPOINT_DAILY = "https://daily-cloudcode-pa.googleapis.com";
const AGY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";
const AGY_ENDPOINT_DAILY_SANDBOX = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const AGY_ENDPOINT_AUTOPUSH = "https://autopush-cloudcode-pa.sandbox.googleapis.com";
/** Runtime/bootstrap endpoint fallback order (daily first, mirroring OmniRoute). */
const AGY_ENDPOINT_FALLBACKS = [
	AGY_ENDPOINT_DAILY,
	AGY_ENDPOINT_PROD,
	AGY_ENDPOINT_DAILY_SANDBOX,
	AGY_ENDPOINT_AUTOPUSH
];
/**
* Statuses that mean "this endpoint is not usable for this attempt"; skip to the
* next one in the chain. 429/403 = rate/quota/entitlement wall, 503 = capacity
* rejection (e.g. "No capacity available for model ..."). A 503 skipped here
* still reaches the caller when every endpoint fails, where the classifier marks
* it transient and the adapter surfaces it as a retryable SERVER error.
*/
const AGY_ENDPOINT_SKIP_STATUSES = /* @__PURE__ */ new Set([
	429,
	403,
	503
]);
/**
* Try each runtime endpoint in order, skipping unusable ones (429/403/503/network).
* Returns the first other response (2xx or a real error like 400/401); when
* every endpoint is unusable, returns the last skipped response so the caller's
* classifier can still produce a meaningful error (a returned 503 becomes a
* retryable SERVER failure rather than being swallowed here).
*
* When every endpoint fails at the network level, the LAST error is rethrown so
* its cause survives (a generic "all endpoints failed" hid DNS/TLS/timeout).
*/
async function fetchAgyFirstOk(urlPath, init, fetchImpl = proxiedFetch, options = {}) {
	let lastSkipped = null;
	let lastNetworkError;
	for (const baseEndpoint of AGY_ENDPOINT_FALLBACKS) try {
		const response = await fetchImpl(`${baseEndpoint}${urlPath}`, init);
		if (!AGY_ENDPOINT_SKIP_STATUSES.has(response.status)) return response;
		lastSkipped = response;
	} catch (error) {
		lastNetworkError = error;
		if (isProxyRouted(options)) {
			const { isProxyUnreachableError } = await import("./proxy-DLvX8yxv.mjs").then((n) => n.s);
			if (isProxyUnreachableError(error)) throw error;
		}
	}
	if (lastSkipped) return lastSkipped;
	if (lastNetworkError !== void 0) throw lastNetworkError;
	throw new Error("all agy endpoints failed");
}
/** Default Antigravity client version used in User-Agent strings; overridden by the
* runtime version fetcher (see runtime/fingerprint.ts). */
const AGY_VERSION_FALLBACK = "1.18.3";
/** Electron-style UA used for bootstrap calls (loadCodeAssist/onboardUser). */
function getAgyBootstrapUserAgent(version = AGY_VERSION_FALLBACK) {
	return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${version} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`;
}
/** Client-Metadata payload for bootstrap calls — ideType only (backend enum
* validation rejects freely-added platform/pluginType; AGENTS.md invariant). */
function getAgyBootstrapClientMetadata() {
	return "{\"ideType\":\"ANTIGRAVITY\"}";
}
//#endregion
export { AGY_VERSION_FALLBACK as a, OAUTH_USERINFO_URL as c, getAgyBootstrapClientMetadata as d, getAgyBootstrapUserAgent as f, isProxyRouted as g, AgyPoolBlockedError as h, AGY_SCOPES as i, constants_exports as l, AgyAuthError as m, AGY_DEFAULT_REDIRECT_URI as n, OAUTH_AUTHORIZE_URL as o, resolveAgyClientCredentials as p, AGY_ENDPOINT_FALLBACKS as r, OAUTH_TOKEN_URL as s, AGY_CLIENT_ID as t, fetchAgyFirstOk as u };

//# sourceMappingURL=constants-BFKYjOmh.mjs.map