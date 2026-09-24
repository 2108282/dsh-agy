import { _ as setResolvedAgyVersion, a as AGY_PLATFORM_ENUM, b as isProxyRouted, d as antigravityUserAgent, g as resolveAgyClientCredentials, l as OAUTH_TOKEN_URL, p as currentAgyVersion, t as AGY_CLIENT_ID, v as AgyAuthError, y as AgyPoolBlockedError } from "./constants-Db4tmyfb.mjs";
import { a as probeFetch, l as redactCredentials, o as proxiedFetch, r as isProxyUnreachableError, t as accountFetch } from "./proxy-DfaL73mL.mjs";
import { i as generateAntigravityRequestId, r as deriveAntigravitySessionId } from "./identity-Ci8EGc1F.mjs";
import { i as parseRefreshParts, n as calculateTokenExpiry, r as formatRefreshParts, t as accessTokenExpired } from "./auth-DPPVFwio.mjs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Document, isMap, isScalar, parseDocument } from "yaml";
import lockfile from "proper-lockfile";
//#region src/runtime/classify.ts
/**
* Upstream failure classification: HTTP status + headers + body → FailureKind.
* Conservative by design: only auth-failure may revoke an account; everything
* else cools, rotates, or retries.
*/
/**
* Phrases the upstream uses to ask for account verification rather than
* rejecting a credential. Matched case-insensitively on the raw body.
*
* Kept as a phrase list (not a bare `includes('verify')`) so an ordinary
* permission error is not mistaken for a recoverable challenge — the cost of a
* false positive is a healthy account parked behind a timed block.
*/
const VERIFICATION_PHRASES = [
	"validation_required",
	"verify your account",
	"verification required",
	"verification_required"
];
/** Whether a 403 body asks the account owner to verify rather than meaning dead credentials. */
function isVerificationRequired(bodyText) {
	if (!bodyText) return false;
	const text = bodyText.toLowerCase();
	return VERIFICATION_PHRASES.some((phrase) => text.includes(phrase));
}
/**
* Pull the appeal/verification link out of a Google RPC error body.
*
* Prefers the structured location — `error.details[].metadata.validation_url`,
* then `appeal_url` — and only falls back to the first bare `https://` match,
* because a loose match can pick up an unrelated link. Google escapes `&` as
* `\u0026` inside the JSON string form, so the fallback unescapes it.
*/
function extractVerificationUrl(bodyText) {
	if (!bodyText) return void 0;
	try {
		const details = JSON.parse(bodyText).error?.details;
		if (Array.isArray(details)) for (const detail of details) {
			const meta = detail?.metadata;
			if (!meta) continue;
			for (const field of ["validation_url", "appeal_url"]) {
				const value = meta[field];
				if (typeof value === "string" && value.length > 0) return value;
			}
		}
	} catch {}
	const unescaped = bodyText.replace(/\\u0026/gi, "&");
	const match = /https:\/\/[^\s"'\\]+/.exec(unescaped);
	return match ? match[0] : void 0;
}
const QUOTA_EXHAUSTED_KEYWORDS = [
	"quota_exhausted",
	"quota exhausted",
	"quota reached",
	"enable overages",
	"individual quota"
];
/** Classify a 429 body into the four upstream categories. */
function classifyRateLimit(bodyText, retryAfterMs) {
	const text = (bodyText ?? "").toLowerCase();
	if (QUOTA_EXHAUSTED_KEYWORDS.some((keyword) => text.includes(keyword))) return "quota_exhausted";
	if (retryAfterMs !== void 0 && retryAfterMs < 3e3) return "soft_rate_limit";
	if (retryAfterMs !== void 0) return "rate_limited";
	return text.includes("quota") || text.includes("resource_exhausted") ? "quota_exhausted" : "unknown";
}
const RATE_LIMIT_RESET_FIELDS = [
	"resetTime",
	"reset_time",
	"resetAt",
	"quotaResetTime"
];
function extractResetTime(bodyText) {
	if (!bodyText) return void 0;
	try {
		const data = JSON.parse(bodyText);
		for (const field of RATE_LIMIT_RESET_FIELDS) {
			const value = data[field];
			if (typeof value === "string" && value) return value;
			if (typeof value === "number" && Number.isFinite(value)) return value > 0xe8d4a51000 ? new Date(value).toISOString() : new Date(Date.now() + value * 1e3).toISOString();
		}
		const quotaInfo = data.quotaInfo;
		if (quotaInfo && typeof quotaInfo.resetTime === "string") return quotaInfo.resetTime;
	} catch {}
}
function parseRetryAfter(header) {
	if (!header) return void 0;
	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1e3;
	const date = Date.parse(header);
	if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
}
/** Classify a completed HTTP response (non-2xx). */
function classifyHttpError(status, headers, bodyText) {
	const retryAfterMs = parseRetryAfter(headers.get("retry-after"));
	const resetTime = extractResetTime(bodyText);
	if (status === 429) return {
		kind: "rate-limit",
		rateLimitCategory: classifyRateLimit(bodyText, retryAfterMs),
		status,
		retryAfterMs,
		resetTime,
		message: bodyText ? bodyText.slice(0, 200) : void 0
	};
	if (status === 401) return {
		kind: "auth-failure",
		status,
		message: bodyText ? bodyText.slice(0, 200) : void 0
	};
	if (status === 403) {
		if (isVerificationRequired(bodyText)) return {
			kind: "verification-required",
			status,
			verificationUrl: extractVerificationUrl(bodyText),
			message: bodyText ? bodyText.slice(0, 200) : void 0
		};
		const category = classifyRateLimit(bodyText, void 0);
		if (category === "quota_exhausted") return {
			kind: "rate-limit",
			rateLimitCategory: category,
			status,
			message: bodyText ? bodyText.slice(0, 200) : void 0
		};
		return {
			kind: "auth-failure",
			status,
			message: bodyText ? bodyText.slice(0, 200) : void 0
		};
	}
	if (status === 404) return {
		kind: "transient",
		status,
		message: bodyText ? bodyText.slice(0, 200) : void 0
	};
	if (status >= 500) return {
		kind: "transient",
		status,
		retryAfterMs,
		message: bodyText ? bodyText.slice(0, 200) : void 0
	};
	if (status === 400) {
		const text = (bodyText ?? "").toLowerCase();
		if (text.includes("context") && (text.includes("overflow") || text.includes("too long") || text.includes("exceeded")) || text.includes("model") && (text.includes("not found") || text.includes("unavailable") || text.includes("not supported"))) return {
			kind: "transient",
			status,
			message: bodyText ? bodyText.slice(0, 200) : void 0
		};
		return {
			kind: "request-error",
			status,
			message: bodyText ? bodyText.slice(0, 200) : void 0
		};
	}
	return {
		kind: "transient",
		status,
		message: bodyText ? bodyText.slice(0, 200) : void 0
	};
}
/**
* Phrases the upstream returns when a conversation's SERVER-SIDE accumulated
* input for one `sessionId` passes the 1M ceiling.
*
* This is not a request-construction error: the payload is fine, but the
* upstream session that `sessionId` names has accumulated too much across turns.
* The recovery is to derive a different `sessionId` (a "generation" bump) and
* resend — hence this predicate is checked before {@link classifyHttpError} so
* such a 400 is not collapsed into a terminal `request-error`.
*
* Matched on the measured upstream text; kept phrase-specific (rather than a
* bare `includes('tokens')`) so a genuine model-capability 400 is not mistaken
* for a bumpable session wall.
*/
const SESSION_ACCUMULATION_PHRASES = [
	"exceeds the maximum number of tokens",
	"input token count exceeds",
	"token count exceeds the maximum"
];
/**
* Whether a failed response is the recoverable per-`sessionId` accumulation
* wall rather than a malformed request.
*
* @param status - HTTP status of the failed response.
* @param bodyText - response body, when readable.
* @returns true when a session-generation bump plus one resend can recover.
*/
function isSessionAccumulationOverflow(status, bodyText) {
	if (status !== 400 || !bodyText) return false;
	const text = bodyText.toLowerCase();
	return SESSION_ACCUMULATION_PHRASES.some((phrase) => text.includes(phrase));
}
/** Codes that carry a socket/syscall `code` worth surfacing in a failure message. */
const TRANSPORT_CAUSE_CODES = /* @__PURE__ */ new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"ENETUNREACH",
	"EHOSTUNREACH",
	"EPIPE",
	"ENOTFOUND",
	"EAI_AGAIN",
	"CERT_HAS_EXPIRED",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_SOCKET",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"UND_ERR_ABORTED"
]);
/**
* Placeholder messages undici/Node emit while the real reason sits deeper in
* the cause chain; they must not shadow a usable code further down.
*/
const GENERIC_CAUSE_MESSAGES = /* @__PURE__ */ new Set([
	"fetch failed",
	"terminated",
	"other side closed",
	"aborted"
]);
/**
* Walk the error cause chain collecting the actionable `code` and message.
* Node/undici reports `TypeError: fetch failed` and stores the real reason in
* `error.cause` (verified against live failures): without this, DNS, TLS,
* timeout, reset, and proxy failures are indistinguishable in DSH session
* events and the GUI.
*/
function describeCause(error) {
	const seen = /* @__PURE__ */ new Set();
	let current = error?.cause ?? error;
	let fallbackMessage;
	for (let depth = 0; current && depth < 6 && !seen.has(current); depth++) {
		seen.add(current);
		if (typeof current === "object") {
			const code = current.code;
			const message = current.message;
			const usableMessage = typeof message === "string" && message.length > 0 ? message : void 0;
			if (typeof code === "string" && TRANSPORT_CAUSE_CODES.has(code)) return {
				code,
				message: usableMessage
			};
			if (usableMessage && !GENERIC_CAUSE_MESSAGES.has(usableMessage) && !fallbackMessage) fallbackMessage = usableMessage;
			const errors = current.errors;
			if (Array.isArray(errors)) for (const nested of errors) {
				const described = describeCause({ cause: nested });
				if (described.code) return described;
				if (described.message && !fallbackMessage) fallbackMessage = described.message;
			}
		}
		current = current?.cause;
	}
	return fallbackMessage ? { message: fallbackMessage } : {};
}
/**
* Human-readable transport failure: `fetch failed (UND_ERR_SOCKET: other side
* closed)`. The sanitized cause code/message is what makes a transient socket
* error distinguishable from a DNS, TLS, or proxy failure in session records.
*/
function describeFetchError(error) {
	const base = error instanceof Error ? error.message : String(error);
	const { code, message } = describeCause(error);
	if (!code && !message) return redactCredentials(base);
	const detail = code && message ? message.includes(code) ? message : `${code}: ${message}` : code ?? message;
	if (detail === base) return redactCredentials(base);
	return redactCredentials(`${base} (${detail})`);
}
/**
* Classify a fetch-level failure (DNS, refused, timeout, abort).
* @param routing - how the failed request was routed; fail-closed applies only
*   when it carried an explicit per-account proxy (see {@link AccountRouting}).
*/
function classifyFetchError(error, routing) {
	const message = describeFetchError(error);
	if (error instanceof DOMException && error.name === "AbortError") return {
		kind: "network-error",
		message
	};
	if (error?.errorCode === "proxy_unreachable" || error?.code === "PROXY_UNREACHABLE") return {
		kind: "proxy-unreachable",
		message
	};
	if (isProxyRouted(routing) && isProxyUnreachableError(error)) return {
		kind: "proxy-unreachable",
		message
	};
	return {
		kind: "network-error",
		message
	};
}
//#endregion
//#region src/store/keyring.ts
/**
* Master-key management and AES-256-GCM secret codec for the account store.
*
* The master key lives in the DSH credentials document (`~/.dsh/.credentials.yaml`,
* 0600) under `AGY_MASTER_KEY` so both the in-harness plugin (via
* `ctx.credentials`) and the standalone `dsh-agy` CLI (direct file read) can
* encrypt and decrypt the same account store.
*/
const MASTER_KEY_REF = "AGY_MASTER_KEY";
const ENC_PREFIX$1 = "enc:v1:";
/** AES-256-GCM codec; ciphertext format `enc:v1:<iv-b64>:<tag-b64>:<data-b64>`. */
function createAesGcmCodec(key) {
	if (key.length !== 32) throw new Error(`createAesGcmCodec: master key must be 32 bytes, got ${key.length}`);
	return {
		encrypt(plaintext) {
			const iv = randomBytes(12);
			const cipher = createCipheriv("aes-256-gcm", key, iv);
			const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
			const tag = cipher.getAuthTag();
			return `${ENC_PREFIX$1}${iv.toString("base64url")}:${tag.toString("base64url")}:${data.toString("base64url")}`;
		},
		decrypt(payload) {
			if (!payload.startsWith(ENC_PREFIX$1)) throw new Error("decrypt: payload is not in encrypted format");
			const [, , ivB64 = "", tagB64 = "", dataB64 = ""] = payload.split(":");
			const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
			decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
			return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
		}
	};
}
/** Derive a 32-byte key from an arbitrary master-key string (SHA-256). */
function deriveKey(masterKey) {
	return createHash("sha256").update(masterKey, "utf8").digest();
}
/** Default DSH home (`~/.dsh`), honoring `$DSH_HOME`. */
function resolveDshHome() {
	return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), ".dsh");
}
function homedir() {
	return process.env.HOME ?? process.env.USERPROFILE ?? ".";
}
/** A credentials reference name must be a POSIX-style identifier. */
const REF_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The document's non-reference sections. */
const SECTION_KEYS = ["version", "records"];
/** Every top-level key DSH's credentials provider admits; anything else is rejected. */
const DOCUMENT_TOP_LEVEL = /* @__PURE__ */ new Set([...SECTION_KEYS, "refs"]);
/**
* Describe one YAML parse failure without quoting the source, which holds
* secrets. The parser's own message embeds the offending line.
*/
function describeYamlError(error) {
	const at = error.linePos?.[0];
	return `${error.code ?? "parse-error"}${at ? ` at line ${at.line}, column ${at.col}` : ""}`;
}
/**
* Parse the credentials document and locate its `refs` section.
*
* The document is owned by DSH's credentials provider, which serializes it with
* the `yaml` package. Values are folded across physical lines (a long
* single-quoted scalar folds at whitespace) and `records` payloads nest
* arbitrary keys, so this MUST be a real parse rather than a line scan: a
* line-based reader cannot represent folding, and it lets a `records` payload
* shadow a real top-level reference.
*
* Deliberately permissive: it validates only the shape it consumes, so the read
* path keeps working on a document written by an older build. What may be
* rewritten is enforced separately, in the writer.
*/
function parseCredentialsDocument(text, file, context) {
	const document = parseDocument(text, {
		prettyErrors: true,
		uniqueKeys: true
	});
	if (document.errors.length > 0) throw new Error(`${context}: cannot parse ${file}: ` + document.errors.map(describeYamlError).join("; "));
	const root = document.contents;
	if (!isMap(root)) throw new Error(`${context}: ${file} must be a mapping`);
	const refs = root.get("refs");
	if (refs !== void 0 && refs !== null && !isMap(refs)) throw new Error(`${context}: "refs" in ${file} must be a mapping`);
	return {
		document,
		root,
		refs: isMap(refs) ? refs : void 0,
		flat: !root.has("version")
	};
}
/**
* Read the references from the DSH credentials document.
*
* Only `refs` holds references, and a `records` payload must never be able to
* shadow one. Two compatibility cases matter:
*
* - A pre-release "flat" document keeps its references at the top level; the
*   provider still reads that layout, so we do too.
* - Version 0.2.7 of this plugin appended the master key as a *top-level* key.
*   The provider rejects such a document, but the key still decrypts an
*   existing account store, so it is read as a fallback. Dropping it would
*   silently mint a new master key and strand those accounts.
*
* Non-string and empty values are skipped, mirroring the provider.
*/
function readCredentialsDocument(file) {
	const entries = /* @__PURE__ */ new Map();
	if (!existsSync(file)) return entries;
	const text = readFileSync(file, "utf8");
	if (text.trim().length === 0) return entries;
	const { root, refs, flat } = parseCredentialsDocument(text, file, "readCredentialsDocument");
	const section = flat ? root : refs;
	if (section) for (const item of section.items) {
		if (!isScalar(item.key) || !isScalar(item.value)) continue;
		const key = item.key.value;
		const value = item.value.value;
		if (typeof key !== "string" || !REF_NAME.test(key)) continue;
		if (flat && SECTION_KEYS.includes(key)) continue;
		if (typeof value !== "string" || value.length === 0) continue;
		entries.set(key, value);
	}
	if (!flat && !entries.has("AGY_MASTER_KEY")) {
		const legacy = root.get(MASTER_KEY_REF);
		if (typeof legacy === "string" && legacy.length > 0) entries.set(MASTER_KEY_REF, legacy);
	}
	return entries;
}
/**
* POSIX owner-only enforcement. Windows mode bits never report 0600 (and
* chmod is a no-op there), so the check is skipped on win32; the encrypted
* account file and credentials document remain the only defense-in-depth
* layer on that platform.
*/
function assertOwnerOnly(file) {
	if (process.platform === "win32") return;
	const mode = statSync(file).mode & 511;
	if (mode !== 384) throw new Error(`dsh-agy: ${file} is readable beyond its owner (mode ${mode.toString(8)}); run "chmod 600" before starting again`);
}
/**
* Load the master key from the DSH credentials document. Returns undefined when
* the document or the reference is absent.
*/
function loadMasterKey(dshHome) {
	const file = join(dshHome, ".credentials.yaml");
	if (!existsSync(file)) return void 0;
	assertOwnerOnly(file);
	return readCredentialsDocument(file).get(MASTER_KEY_REF);
}
/** Top-level keys DSH's credentials provider admits; anything else is rejected. */
/**
* Render the version-1 layout for a pre-release "flat" document — a non-empty
* top-level mapping of reference names to non-empty string scalars, with no
* `version` key and no document directives. The original lines are nested
* verbatim under `refs:`, so comments, blank lines, and each value's spelling
* survive byte for byte. Returns undefined for anything the recognizer
* declines, which the caller must then refuse to rewrite.
*
* Nesting whole lines is safe for block scalars: an explicit indent indicator
* (`|2`) is absolute and the implied one is detected relative to the key, so
* shifting every line by the same two spaces preserves the parsed value.
*/
function renderFlatLayoutMigration(text) {
	for (const line of text.split("\n")) if (/^(%|---|\.\.\.)/.test(line)) return void 0;
	const document = parseDocument(text, {
		prettyErrors: true,
		uniqueKeys: true
	});
	if (document.errors.length > 0) return void 0;
	const flat = document.contents;
	if (!isMap(flat) || flat.items.length === 0) return void 0;
	for (const pair of flat.items) {
		if (!isScalar(pair.key) || typeof pair.key.value !== "string") return void 0;
		if (DOCUMENT_TOP_LEVEL.has(pair.key.value) || !REF_NAME.test(pair.key.value)) return void 0;
		if (!isScalar(pair.value) || typeof pair.value.value !== "string") return void 0;
		if (pair.value.value.length === 0) return void 0;
	}
	return `version: 1\nrefs:\n${text.split("\n").map((line) => line.length === 0 ? line : `  ${line}`).join("\n")}${text.endsWith("\n") ? "" : "\n"}`;
}
/**
* Render the credentials document with {@link MASTER_KEY_REF} added under `refs`.
*
* The key MUST be nested under `refs`: DSH's credentials provider rejects any
* other top-level key, and a document it rejects makes *every* credential in
* the file unreadable, not just ours. Editing the parsed document keeps the
* comments and formatting of every untouched entry; a document this build
* cannot prove it understands is never rewritten.
*/
function renderWithMasterKey(existingText, masterKey, file) {
	const fresh = () => new Document({
		version: 1,
		refs: { [MASTER_KEY_REF]: masterKey }
	}).toString();
	if (existingText.trim().length === 0) return fresh();
	const { document, root, refs, flat } = parseCredentialsDocument(existingText, file, "persistMasterKey");
	if (flat) {
		const migrated = renderFlatLayoutMigration(existingText);
		if (migrated === void 0) throw new Error(`persistMasterKey: ${file} is not a credentials document this build can prove it understands; refusing to rewrite it`);
		const next = parseDocument(migrated);
		next.setIn(["refs", MASTER_KEY_REF], masterKey);
		return next.toString();
	}
	for (const key of root.items) {
		if (!isScalar(key.key) || typeof key.key.value !== "string") continue;
		if (!DOCUMENT_TOP_LEVEL.has(key.key.value)) throw new Error(`persistMasterKey: ${file} has unknown top-level key "${key.key.value}"; refusing to rewrite it`);
	}
	const version = root.get("version");
	if (version !== 1) throw new Error(`persistMasterKey: ${file} declares version ${JSON.stringify(version)}; refusing to rewrite it`);
	if (refs) document.setIn(["refs", MASTER_KEY_REF], masterKey);
	else document.set("refs", { [MASTER_KEY_REF]: masterKey });
	return document.toString();
}
/**
* Generate and persist a fresh master key (0600) in the DSH credentials document.
*
* The key is added under `refs` by editing the parsed document, then written
* with an atomic tmp+rename, so every other credential — and the comments and
* formatting DSH services rely on — survives. Never rewrite the whole file from
* a rebuilt view: that would silently drop entries this build does not model.
*/
function persistMasterKey(dshHome, masterKey) {
	const file = join(dshHome, ".credentials.yaml");
	mkdirSync(dirname(file), { recursive: true });
	const existingText = existsSync(file) ? readFileSync(file, "utf8") : "";
	if (existingText.length > 0 && readCredentialsDocument(file).has("AGY_MASTER_KEY")) throw new Error(`persistMasterKey: ${MASTER_KEY_REF} already exists in ${file}`);
	const next = renderWithMasterKey(existingText, masterKey, file);
	const tmp = `${file}.tmp-masterkey`;
	writeFileSync(tmp, next, { mode: 384 });
	renameSync(tmp, file);
}
/**
* Resolve (load or create) the master key for a dsh home, then build the codec.
* Creating a key writes the credentials document; read-only setups should call
* {@link loadMasterKey} first and surface a friendly error instead.
*/
function resolveMasterKeyCodec(dshHome) {
	let masterKey = loadMasterKey(dshHome);
	let created = false;
	if (!masterKey) {
		masterKey = randomBytes(32).toString("hex");
		persistMasterKey(dshHome, masterKey);
		created = true;
	}
	return {
		codec: createAesGcmCodec(deriveKey(masterKey)),
		created
	};
}
//#endregion
//#region src/runtime/rotation.ts
const BACKOFF_TIERS_MS = [
	5e3,
	1e4,
	2e4,
	3e4,
	6e4
];
/** Below this remaining fraction the account is treated as soft-quota-exhausted. */
const SOFT_QUOTA_THRESHOLD = .15;
function backoffFor(consecutiveFailures, maxJitterMs = 1e3) {
	const index = Math.min(Math.max(consecutiveFailures, 0), BACKOFF_TIERS_MS.length - 1);
	return (BACKOFF_TIERS_MS[index] ?? BACKOFF_TIERS_MS[BACKOFF_TIERS_MS.length - 1]) + Math.floor(Math.random() * maxJitterMs);
}
/** Whether the account is currently in a cooldown window. */
function isCoolingDown(account, now = Date.now()) {
	return (account.coolingDownUntil ?? 0) > now;
}
/** Whether the requested model family on this account is rate-limited. */
function isFamilyRateLimited(account, family, now = Date.now()) {
	if (!family) return false;
	const resetAt = account.rateLimitResetTimes?.[family];
	return typeof resetAt === "number" && resetAt > now;
}
/**
* Proxy for a pool-level probe that belongs to no single account (the version
* feeds): the account that would serve the next request, else the first usable
* one.
*
* These feeds are not account-scoped, but the host's IP is what a user who
* configured per-account proxies asked to hide, and a probe on the env/direct
* route leaks it at boot. `undefined` means "no account route" — no accounts, or
* no usable one — and the caller then uses the env/direct route, which is also
* where an unproxied account's traffic goes anyway.
*
* Deliberately not model-aware: the probe runs once at boot, before any model is
* requested.
*/
function pickProbeProxyUrl(accounts, activeIndex, now = Date.now()) {
	const usable = (account) => account !== void 0 && account.enabled !== false && !isCoolingDown(account, now);
	const active = accounts[activeIndex];
	if (usable(active)) return active.proxy;
	return accounts.find((account) => usable(account))?.proxy;
}
/** Record a rate-limit reset for one model key, retaining the latest reset time. */
function recordRateLimit(account, modelKey, resetAtMs) {
	const current = account.rateLimitResetTimes?.[modelKey] ?? 0;
	account.rateLimitResetTimes = {
		...account.rateLimitResetTimes ?? {},
		[modelKey]: Math.max(current, resetAtMs)
	};
}
/** Clear expired rate limits and cooldowns in place. */
function clearExpiredState(account, now = Date.now()) {
	if (account.rateLimitResetTimes) {
		const fresh = Object.fromEntries(Object.entries(account.rateLimitResetTimes).filter(([, reset]) => reset > now));
		account.rateLimitResetTimes = Object.keys(fresh).length > 0 ? fresh : void 0;
	}
	if (account.coolingDownUntil && account.coolingDownUntil <= now) {
		account.coolingDownUntil = void 0;
		account.cooldownReason = void 0;
		account.cooldownSetAt = void 0;
	}
}
/** 24h cooldown for a fully exhausted daily quota (single-account: stop hitting the wall). */
const FULL_QUOTA_COOLDOWN_MS = 864e5;
/** Cap for a server-reported reset time on per-minute limits (guards against bogus far-future values). */
const MAX_RATE_LIMIT_COOLDOWN_MS = 18e5;
/**
* How long a verification challenge parks an account before the pool tries it
* again. Deliberately short and timed rather than permanent: the credential is
* intact, the wall is upstream's, and it can clear on its own — so the account
* returns to service without the user doing anything, while still not being
* hammered in the meantime.
*/
const VERIFICATION_COOLDOWN_MS = 9e5;
/** Absolute server-reported reset in ms when it lies in the future, else undefined. */
function parseFutureResetMs$1(resetTime, now = Date.now()) {
	if (!resetTime) return void 0;
	const reset = Date.parse(resetTime);
	if (Number.isNaN(reset) || reset <= now) return void 0;
	return reset;
}
/**
* Decide what to do after one failed attempt.
* @param kind - classified failure kind.
* @param category - 429 sub-category when kind is rate-limit.
* @param account - the account that failed (mutated with cooldown/rate-limit state).
* @param consecutiveFailures - consecutive failures on this account.
* @param retryAfterMs - server-provided retry delay when present.
* @param resetTime - server-provided absolute reset time; cooldowns use it (capped) instead of fixed windows.
*/
function decideRotation(kind, account, consecutiveFailures, retryAfterMs, category = "unknown", resetTime) {
	const now = Date.now();
	const backoffMs = backoffFor(consecutiveFailures);
	switch (kind) {
		case "rate-limit": {
			if (category === "soft_rate_limit") return {
				action: "retry",
				backoffMs: Math.min(retryAfterMs ?? backoffMs, 3e3)
			};
			if (category === "quota_exhausted") {
				const resetMs = parseFutureResetMs$1(resetTime, now);
				const cooldownMs = resetMs !== void 0 ? Math.min(resetMs - now, FULL_QUOTA_COOLDOWN_MS) : FULL_QUOTA_COOLDOWN_MS;
				account.coolingDownUntil = now + Math.max(cooldownMs, 6e4);
				account.cooldownReason = "quota-exhausted";
				account.cooldownSetAt = now;
				return {
					action: "cool",
					backoffMs: Math.max(cooldownMs, 6e4)
				};
			}
			const resetMs = parseFutureResetMs$1(resetTime, now);
			const cooldownMs = resetMs !== void 0 ? Math.min(resetMs - now, MAX_RATE_LIMIT_COOLDOWN_MS) : retryAfterMs ?? 3e5;
			return {
				action: "rotate",
				backoffMs: Math.max(cooldownMs, 1e3)
			};
		}
		case "auth-failure":
			account.verificationRequired = true;
			account.verificationRequiredAt = now;
			account.verificationRequiredReason = "auth-failure";
			account.enabled = false;
			return { action: "revoke" };
		case "verification-required":
			account.coolingDownUntil = now + VERIFICATION_COOLDOWN_MS;
			account.cooldownReason = "validation-required";
			account.cooldownSetAt = now;
			account.verificationRequired = true;
			account.verificationRequiredAt = now;
			account.verificationRequiredReason = "validation-required";
			return {
				action: "cool",
				backoffMs: VERIFICATION_COOLDOWN_MS
			};
		case "network-error":
			account.coolingDownUntil = now + backoffMs;
			account.cooldownReason = "network-error";
			account.cooldownSetAt = now;
			return {
				action: "rotate",
				backoffMs
			};
		case "project-error":
			account.coolingDownUntil = now + backoffMs;
			account.cooldownReason = "project-error";
			account.cooldownSetAt = now;
			return {
				action: "cool",
				backoffMs
			};
		case "request-error": return { action: "noop" };
		case "transient": return {
			action: "retry",
			backoffMs
		};
		case "proxy-unreachable": return {
			action: "rotate",
			backoffMs: Math.min(backoffMs, 1e3)
		};
	}
}
/**
* Pick the next account index for rotation (round-robin across enabled,
* non-cooling accounts; falls back to the active one when all are cooling).
*/
function pickNextAccountIndex(accounts, currentIndex, now = Date.now(), modelOrFamily) {
	if (accounts.length <= 1) return currentIndex;
	const enabled = accounts.map((a, i) => ({
		account: a,
		index: i
	})).filter(({ account, index }) => {
		if (index === currentIndex || account.enabled === false) return false;
		if (isCoolingDown(account, now)) return false;
		if (modelOrFamily && isFamilyRateLimited(account, modelOrFamily, now)) return false;
		return true;
	});
	if (enabled.length === 0) return currentIndex;
	return (enabled.find((e) => e.index > currentIndex) ?? enabled[0]).index;
}
/** Build the soft-quota cache TTL: short when low, long when healthy. */
function computeSoftQuotaCacheTtlMs(remainingFraction, now = Date.now()) {
	if (typeof remainingFraction !== "number") return 6e5;
	if (remainingFraction < .15) return 6e4;
	if (remainingFraction < .5) return 3e5;
	return 9e5;
}
//#endregion
//#region src/runtime/version.ts
/**
* Fresh Antigravity client version resolution: fetch from the product's own
* release feeds (6h TTL, single in-flight dedupe), falling back to the pinned
* pool. Keeps fingerprint User-Agent version strings current — a stale version
* is the most detectable fingerprint anomaly.
*/
const VERSION_CACHE_TTL_MS = 216e5;
const VERSION_FETCH_TIMEOUT_MS = 5e3;
/** Source 2: agy CLI GitHub releases (object with tag_name). */
const CLI_RELEASE_URL = "https://api.github.com/repos/google-antigravity/antigravity-cli/releases/latest";
function compareSemver(a, b) {
	const pa = a.split(".").map((n) => Number(n) || 0);
	const pb = b.split(".").map((n) => Number(n) || 0);
	for (let i = 0; i < 3; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}
function pickNewestVersion(...versions) {
	const valid = versions.filter((v) => typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v));
	if (valid.length === 0) return null;
	return valid.reduce((best, v) => !best || compareSemver(v, best) > 0 ? v : best, null);
}
/**
* Highest version published so far in this process.
*
* Kept locally so publication is monotonic: the two feeds resolve independently
* and either may finish first, so without this the slower (possibly older) source
* could lower what a User-Agent already advertises. A version never goes
* backwards here — only the cold-start floor can be below a published value.
*/
let publishedVersion;
/**
* Publish a newly observed version into the shared slot every User-Agent builder
* reads ({@link setResolvedAgyVersion}), never lowering an already-published one.
*/
function publishVersion(version) {
	if (version === null || version === void 0) return;
	const best = pickNewestVersion(version, publishedVersion);
	if (best === null || best === publishedVersion) return;
	publishedVersion = best;
	setResolvedAgyVersion(best);
}
function parseCliRelease(payload) {
	if (!payload || typeof payload !== "object") return null;
	const release = payload;
	return pickNewestVersion(release.tag_name ?? release.name);
}
async function fetchJsonWithTimeout(fetchImpl, url) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), VERSION_FETCH_TIMEOUT_MS);
	try {
		const response = await fetchImpl(url, {
			headers: {
				Accept: "application/json",
				"User-Agent": antigravityUserAgent()
			},
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`Version source ${url} returned ${response.status}`);
		return response.json();
	} finally {
		clearTimeout(timeoutId);
	}
}
/**
* Resolve the newest OBSERVED version from one feed, or `undefined` when the
* feed yielded nothing.
*
* Returning `undefined` rather than the pinned fallback is what keeps the
* fallback out of {@link resolveAntigravityVersion}'s cross-source `max`. When
* this returned the fallback, a source that simply failed to parse contributed
* the fallback as though it were evidence, and once the fallback was raised to
* track the live feed it started outranking genuine — but older — feed data.
* The fallback is a last resort and is applied once, at the public boundary.
*/
async function resolveObservedVersion(state, sourceUrl, parse, fetchImpl) {
	const now = Date.now();
	if (state.cache && now - state.cache.fetchedAt < VERSION_CACHE_TTL_MS) {
		publishVersion(state.cache.version);
		return state.cache.version;
	}
	if (state.inFlight) return state.inFlight;
	state.inFlight = (async () => {
		let resolved = null;
		try {
			resolved = parse(await fetchJsonWithTimeout(fetchImpl, sourceUrl));
		} catch {
			resolved = null;
		}
		const observed = pickNewestVersion(resolved, state.cache?.version);
		if (resolved) {
			state.cache = {
				version: observed ?? resolved,
				fetchedAt: Date.now()
			};
			publishVersion(resolved);
		}
		return observed ?? void 0;
	})();
	try {
		return await state.inFlight;
	} finally {
		state.inFlight = null;
	}
}
/**
* The newest version actually OBSERVED on the claimed product's feed, or
* `undefined` when it yielded nothing.
*
* Reads the **CLI feed only**. This used to take the numeric max across the IDE
* and CLI feeds, which is a category error: the three Antigravity lines are
* separate version namespaces (IDE 2.x, hub 2.15.x, CLI 1.2.x), so "newest"
* across them compares unrelated numbers and picks whichever line happens to
* count higher. Since this client claims to be the CLI
* (`docs/official-identity.json`), the CLI feed is the only one that can
* describe the version we are entitled to advertise; the IDE resolver stays
* exported for the freshness gate's cross-check, never for the wire.
*
* Distinct from {@link resolveAntigravityVersion}, which substitutes the pinned
* fallback at the boundary. A caller that must tell "observed" from "assumed"
* cannot use that one — and the freshness gate is exactly such a caller, since
* the fallback is the value under test.
*/
async function resolveObservedAgyVersion(fetchImpl = proxiedFetch) {
	return await resolveObservedVersion(cliState, CLI_RELEASE_URL, parseCliRelease, fetchImpl) ?? void 0;
}
/** Best available version: the claimed product line, cached 6h. */
async function resolveAntigravityVersion(fetchImpl = proxiedFetch) {
	return await resolveObservedAgyVersion(fetchImpl) ?? "1.2.9";
}
/**
* Bounded resolve for fingerprint generation: never block the failure path on
* cold version feeds. Resolves undefined on timeout/error so callers fall
* back to the pinned version pool; the abandoned fetch keeps running and
* populates the 6h cache for later calls.
*
* `fetchImpl` routes the probe: the feeds belong to no account, so the caller
* decides which egress they use (the CLI passes the login proxy, the plugin
* passes the pool's representative account).
*/
async function resolveAntigravityVersionBounded(timeoutMs = 750, fetchImpl = proxiedFetch) {
	let timer;
	try {
		return await Promise.race([resolveAntigravityVersion(fetchImpl).catch(() => void 0), new Promise((resolve) => {
			timer = setTimeout(() => resolve(void 0), timeoutMs);
		})]);
	} finally {
		clearTimeout(timer);
	}
}
/** Synchronously peek at a fresh cached version (no network). */
function peekCachedAntigravityVersion() {
	const now = Date.now();
	for (const state of [cliState, ideState]) if (state.cache && now - state.cache.fetchedAt < VERSION_CACHE_TTL_MS) {
		publishVersion(state.cache.version);
		return state.cache.version;
	}
}
const ideState = { inFlight: null };
const cliState = { inFlight: null };
//#endregion
//#region src/oauth/refresh.ts
var AgyTokenRefreshError = class extends Error {
	code;
	description;
	status;
	statusText;
	constructor(options) {
		super(options.message);
		this.name = "AgyTokenRefreshError";
		this.code = options.code;
		this.description = options.description;
		this.status = options.status;
		this.statusText = options.statusText;
	}
};
/** Parse Google token-endpoint error payloads, tolerating varied shapes. */
function parseOAuthErrorPayload(text) {
	if (!text) return {};
	try {
		const payload = JSON.parse(text);
		if (!payload || typeof payload !== "object") return { description: text };
		let code;
		if (typeof payload.error === "string") code = payload.error;
		else if (payload.error && typeof payload.error === "object") {
			code = payload.error.status ?? payload.error.code;
			if (!payload.error_description && payload.error.message) return {
				code,
				description: payload.error.message
			};
		}
		const description = payload.error_description;
		if (description) return {
			code,
			description
		};
		if (payload.error && typeof payload.error === "object" && payload.error.message) return {
			code,
			description: payload.error.message
		};
		return { code };
	} catch {
		return { description: text };
	}
}
/**
* Refresh the access token for an account. `revoked` means Google rejected the
* refresh token (`invalid_grant`) — the account must be re-authenticated.
* For legacy accounts without a stored clientId, embedded credentials are tried
* first with an env-override fallback before treating invalid_grant as fatal.
*/
async function refreshAccessToken(auth, options) {
	const parts = parseRefreshParts(auth.refresh);
	if (!parts.refreshToken) return {
		type: "failed",
		error: new AgyTokenRefreshError({
			message: "Missing refresh token",
			status: 400,
			statusText: "Bad Request"
		})
	};
	const candidateIds = options?.clientId ? [options.clientId] : Array.from(new Set([AGY_CLIENT_ID, process.env.AGY_CLIENT_ID].filter((id) => Boolean(id && id.length > 0))));
	let revokedCount = 0;
	let transientFailure;
	for (const currentClientId of candidateIds) try {
		const startTime = Date.now();
		const { clientId, clientSecret } = resolveAgyClientCredentials(currentClientId);
		const response = await proxiedFetch(OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: parts.refreshToken,
				client_id: clientId,
				client_secret: clientSecret
			})
		}, options?.proxyUrl ? { proxyUrl: options.proxyUrl } : void 0);
		if (!response.ok) {
			const errorText = await response.text().catch(() => void 0);
			const { code, description } = parseOAuthErrorPayload(errorText);
			const details = [code, description ?? errorText].filter(Boolean).join(": ");
			const baseMessage = `Agy token refresh failed (${response.status} ${response.statusText})`;
			const message = details ? `${baseMessage} - ${details}` : baseMessage;
			if (code === "invalid_grant") {
				revokedCount++;
				continue;
			}
			transientFailure = {
				type: "failed",
				error: new AgyTokenRefreshError({
					message,
					code,
					description: description ?? errorText,
					status: response.status,
					statusText: response.statusText
				})
			};
			continue;
		}
		const payload = await response.json();
		const refreshedParts = {
			refreshToken: payload.refresh_token ?? parts.refreshToken,
			projectId: parts.projectId,
			managedProjectId: parts.managedProjectId
		};
		return {
			type: "success",
			auth: {
				access: payload.access_token,
				expires: calculateTokenExpiry(startTime, payload.expires_in),
				refresh: formatRefreshParts(refreshedParts)
			},
			clientId
		};
	} catch (error) {
		const raw = error instanceof Error ? error : new Error(String(error));
		const code = error?.code;
		const errorCode = error?.errorCode;
		const wrapped = new AgyTokenRefreshError({
			message: raw.message,
			status: 0,
			statusText: "Network Error",
			code: code ?? errorCode,
			description: raw.message
		});
		wrapped.cause = error;
		if (code) wrapped.code = code;
		if (errorCode) wrapped.errorCode = errorCode;
		transientFailure = {
			type: "failed",
			error: wrapped
		};
	}
	if (transientFailure) return transientFailure;
	if (revokedCount === candidateIds.length) return { type: "revoked" };
	return {
		type: "failed",
		error: new AgyTokenRefreshError({
			message: "Token refresh failed on all candidate client IDs",
			status: 400,
			statusText: "Bad Request"
		})
	};
}
const DAY_MS = 864e5;
/** Floor for remaining-time in drain-urgency scores (mirrors AuthStorage; a stale reset must not explode the score). */
const DRAIN_FLOOR_MS = 6e4;
/** Map a model id to its backend quota counter family (OMP getAntigravityCounterKeyForModel). */
function modelFamilyOf(modelId) {
	if (!modelId) return void 0;
	const id = modelId.toLowerCase();
	if (id.startsWith("claude-")) return "anthropic";
	if (id.startsWith("gemini-") || id.startsWith("gemma-")) return "google";
	if (id.startsWith("gpt-") || id.startsWith("openai/")) return "openai";
}
/** Quota-cache key for a request: the model's family, or the unknown bucket. */
function familyKeyOf(modelId) {
	return modelFamilyOf(modelId) ?? "unknown";
}
function earliestResetTime(a, b) {
	if (!a) return b;
	if (!b) return a;
	const ta = Date.parse(a);
	const tb = Date.parse(b);
	if (Number.isNaN(ta)) return b;
	if (Number.isNaN(tb)) return a;
	return ta <= tb ? a : b;
}
/**
* Aggregate a fetchAvailableModels response into per-family quota records:
* the family's remaining fraction is its most-pressured model's, and the
* reset time is the earliest across the family (the bottleneck resets first).
*/
function ingestFamilyQuotas(discovered) {
	const families = /* @__PURE__ */ new Map();
	for (const [modelId, entry] of Object.entries(discovered.models ?? {})) {
		const remaining = entry.quotaInfo?.remainingFraction;
		if (typeof remaining !== "number" || !Number.isFinite(remaining)) continue;
		const key = familyKeyOf(modelId);
		const current = families.get(key);
		const resetTime = earliestResetTime(current?.resetTime, entry.quotaInfo?.resetTime);
		families.set(key, {
			remainingFraction: current ? Math.min(current.remainingFraction ?? 1, remaining) : remaining,
			...resetTime ? { resetTime } : {},
			modelCount: (current?.modelCount ?? 0) + 1
		});
	}
	return Object.fromEntries(families);
}
/** The quota record for one family, or the most-pressured family when the model is unknown. */
function familyQuotaFor(account, family) {
	const cache = account.cachedQuota ?? {};
	if (family) return cache[family];
	let worst;
	for (const entry of Object.values(cache)) {
		if (typeof entry.remainingFraction !== "number") continue;
		if (!worst || entry.remainingFraction < (worst.remainingFraction ?? 1)) worst = entry;
	}
	return worst;
}
/** Whether the account's quota cache needs a refresh (missing, or past its health-based TTL). */
function isQuotaStale(account, now = Date.now()) {
	if (!account.cachedQuota || !account.cachedQuotaUpdatedAt) return true;
	const ttl = computeSoftQuotaCacheTtlMs(familyQuotaFor(account)?.remainingFraction);
	return now - account.cachedQuotaUpdatedAt > ttl;
}
/** How long a measured 5h/weekly window snapshot stays fresh. */
const LIMITS_CACHE_TTL_MS = 6e5;
/**
* Whether the display-only windows need a refresh.
*
* A SEPARATE rule from `isQuotaStale` on purpose: that one keys off
* `cachedQuota`/`cachedQuotaUpdatedAt`, which the scheduling path fills and a
* SOLO account never does (the pool gate skips it). Reusing it here would report
* "stale" on every single call for a solo account and re-probe the endpoint
* continuously — the exact case this feature exists to serve.
*
* A fixed TTL is also the honest choice: the windows come from their own
* endpoint, so there is no `remainingFraction` on hand to scale the interval by
* without reading the very data being validated.
*
* @param account - the account to test.
* @param now - current time (Unix ms).
*/
function isLimitsStale(account, now = Date.now()) {
	const updatedAt = account.cachedLimits?.updatedAt;
	if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return true;
	return now - updatedAt > LIMITS_CACHE_TTL_MS;
}
/** Whether the requested family on this account is soft-quota-exhausted (below the pre-check threshold). */
function isFamilyDrained(account, family, now = Date.now()) {
	const quota = familyQuotaFor(account, family);
	if (!quota || typeof quota.remainingFraction !== "number") return false;
	if (quota.resetTime) {
		const reset = Date.parse(quota.resetTime);
		if (!Number.isNaN(reset) && reset <= now) return false;
	}
	return quota.remainingFraction < SOFT_QUOTA_THRESHOLD;
}
/**
* Required drain rate: headroomFraction / remainingHours — how fast the
* family's remaining quota must be consumed to avoid expiring unused at its
* reset (mirrors AuthStorage.#computeWindowRequiredDrain with a daily window).
*/
function requiredDrainFor(quota, now = Date.now()) {
	const remaining = quota?.remainingFraction;
	if (typeof remaining !== "number" || !Number.isFinite(remaining)) return 0;
	const headroom = Math.min(Math.max(remaining, 0), 1);
	if (headroom <= 0) return 0;
	let remainingMs = DAY_MS;
	const resetTime = quota?.resetTime;
	if (resetTime) {
		const resetAt = Date.parse(resetTime);
		if (!Number.isNaN(resetAt)) remainingMs = Math.min(remainingMs, Math.max(resetAt - now, 0));
	}
	return headroom / (Math.max(remainingMs, DRAIN_FLOOR_MS) / 36e5);
}
function parseFutureResetMs(resetTime, now) {
	if (!resetTime) return void 0;
	const reset = Date.parse(resetTime);
	if (Number.isNaN(reset) || reset <= now) return void 0;
	return reset;
}
/**
* Rank pool candidates for one request, mirroring AuthStorage's antigravity
* ordering: unblocked first (earliest unblock time among blocked), hot windows
* last, measured usage before unmeasured, required-drain descending, then
* used-fraction ascending. Ties preserve the rotation order seeded from
* `startIndex` so an unmeasured pool keeps the active-account bias.
*/
function rankPoolCandidates(entries, modelId, now = Date.now(), startIndex = 0) {
	const family = modelFamilyOf(modelId);
	const activePos = entries.findIndex((e) => e.index === startIndex);
	const clampedStart = activePos >= 0 ? activePos : 0;
	const candidates = (entries.length === 0 ? [] : [...entries.slice(clampedStart), ...entries.slice(0, clampedStart)]).map(({ account, index }, orderPos) => {
		const quota = familyQuotaFor(account, family);
		const remaining = quota?.remainingFraction;
		const used = typeof remaining === "number" ? Math.min(Math.max(1 - remaining, 0), 1) : void 0;
		let blockedUntil = null;
		if (account.coolingDownUntil && account.coolingDownUntil > now) blockedUntil = account.coolingDownUntil;
		const familyLimit = account.rateLimitResetTimes?.[familyKeyOf(modelId)];
		if (familyLimit !== void 0 && familyLimit > now) blockedUntil = blockedUntil === null ? familyLimit : Math.max(blockedUntil, familyLimit);
		if (blockedUntil === null && quota && typeof remaining === "number" && remaining <= 0) {
			const resetMs = parseFutureResetMs(quota.resetTime, now);
			if (resetMs !== void 0) blockedUntil = resetMs;
		}
		return {
			account,
			index,
			orderPos,
			blockedUntil,
			usedFraction: used,
			requiredDrain: requiredDrainFor(quota, now),
			hot: used !== void 0 && used >= .85,
			measured: used !== void 0
		};
	});
	candidates.sort((left, right) => {
		const leftBlocked = left.blockedUntil !== null;
		const rightBlocked = right.blockedUntil !== null;
		if (leftBlocked !== rightBlocked) return leftBlocked ? 1 : -1;
		if (leftBlocked && rightBlocked) return (left.blockedUntil ?? 0) - (right.blockedUntil ?? 0);
		if (left.hot !== right.hot) return left.hot ? 1 : -1;
		if (left.measured !== right.measured) return left.measured ? -1 : 1;
		const drain = right.requiredDrain - left.requiredDrain;
		if (drain !== 0) return drain;
		const usedDiff = (left.usedFraction ?? .5) - (right.usedFraction ?? .5);
		if (usedDiff !== 0) return usedDiff;
		return left.orderPos - right.orderPos;
	});
	return candidates.map(({ account, index, blockedUntil, usedFraction, requiredDrain, hot, measured }) => ({
		account,
		index,
		blockedUntil,
		usedFraction,
		requiredDrain,
		hot,
		measured
	}));
}
//#endregion
//#region src/runtime/fingerprint.ts
/**
* Device fingerprint generation for rate-limit mitigation (two layers):
*
* 1. Per-request randomized headers — platform/arch/SDK-client pools.
* 2. Per-account persistent fingerprint — deviceId/sessionToken/UA snapshot
*    with bounded history (≤5 versions, restorable), regenerated when an
*    account's capacity looks exhausted.
*
* All tunable pools live in fingerprint-data.json so they can be updated
* without a code release (the reference implementation stopped at an old
* version string once archived — that staleness is the detectable signal).
*/
const DEFAULT_FINGERPRINT_DATA = {
	comment: "Hot-updatable fingerprint data. Version pools and client strings must track the real Antigravity product; update this file (or ship an override) when a release ships. Kept out of code so stale versions never get compiled in. The pool is only a last-resort fallback: production passes the resolved version explicitly (see runtime/version.ts), so a stale entry here can no longer reach the wire on its own. versionPool is the CLI line (the product this client claims, docs/official-identity.json) — NOT the IDE line, whose 2.x numbers name a different product.",
	versionPool: ["1.2.9", "1.2.5"],
	platforms: ["darwin/arm64"],
	sdkClients: [
		"google-cloud-sdk vscode_cloudshelleditor/0.1",
		"google-cloud-sdk vscode/1.86.0",
		"google-cloud-sdk vscode/1.87.0",
		"google-cloud-sdk vscode/1.96.0"
	],
	ideTypes: ["ANTIGRAVITY"]
};
const USER_OVERRIDE_FILE = "agy-fingerprint-data.json";
/**
* Effective fingerprint data: a user override at `$DSH_HOME/agy-fingerprint-data.json`
* wins when present and parseable (hot-updatable without a code release — the
* bundled copy is compiled in), otherwise the bundled defaults.
*/
let cachedData = null;
function getFingerprintData() {
	if (cachedData) return cachedData;
	try {
		const dshHome = process.env.DSH_HOME ? process.env.DSH_HOME : join(process.env.HOME ?? ".", ".dsh");
		const overrideFile = join(dshHome, USER_OVERRIDE_FILE);
		if (existsSync(overrideFile)) {
			const parsed = JSON.parse(readFileSync(overrideFile, "utf8"));
			if (parsed && Array.isArray(parsed.versionPool) && parsed.versionPool.length > 0) {
				cachedData = parsed;
				return cachedData;
			}
		}
	} catch {}
	cachedData = DEFAULT_FINGERPRINT_DATA;
	return cachedData;
}
function randomFrom(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
/** Generate a randomized device fingerprint representing one apparent device. */
function generateFingerprint(data = getFingerprintData(), version = randomFrom(data.versionPool)) {
	const platform = randomFrom(data.platforms);
	return {
		deviceId: randomUUID(),
		sessionToken: randomBytes(16).toString("hex"),
		userAgent: `antigravity/${version} ${platform}`,
		apiClient: randomFrom(data.sdkClients),
		clientMetadata: {
			ideType: randomFrom(data.ideTypes),
			ideVersion: version,
			platform: AGY_PLATFORM_ENUM
		},
		createdAt: Date.now()
	};
}
/**
* Deterministic fallback headers for the `stable` fingerprint mode: the first
* entry of each pool, every call — one fixed client identity instead of
* per-request randomization (OMP-style fixed-client posture).
*/
function getStableHeaders(data = getFingerprintData(), version = data.versionPool[0] ?? "") {
	const platform = data.platforms[0] ?? "darwin/arm64";
	const resolved = version || currentAgyVersion();
	return {
		"User-Agent": `antigravity/${resolved} ${platform}`,
		"X-Goog-Api-Client": data.sdkClients[0] ?? "",
		clientMetadata: {
			ideType: data.ideTypes[0] ?? "ANTIGRAVITY",
			ideVersion: resolved,
			platform: AGY_PLATFORM_ENUM
		}
	};
}
/**
* Rewrite the version inside a fingerprint UA; reports whether it changed.
*
* Carries the metadata message's `ideVersion` along: they state the same fact,
* and letting them drift is how one account comes to look like two clients.
*/
function updateFingerprintVersion(fingerprint, version) {
	const pattern = /^(antigravity\/)([\d.]+)/;
	const match = fingerprint.userAgent.match(pattern);
	const uaChanged = match !== null && match[2] !== version;
	if (uaChanged) fingerprint.userAgent = fingerprint.userAgent.replace(pattern, `$1${version}`);
	const metaChanged = fingerprint.clientMetadata.ideVersion !== version;
	if (metaChanged) fingerprint.clientMetadata.ideVersion = version;
	return uaChanged || metaChanged;
}
/** Append a fingerprint to the account history (bounded), then use it as current. */
function recordFingerprintVersion(history, fingerprint, reason) {
	return [...history ?? [], {
		fingerprint,
		timestamp: Date.now(),
		reason
	}].slice(-5);
}
//#endregion
//#region src/runtime/risk.ts
const TRUE_VALUES = /* @__PURE__ */ new Set([
	"1",
	"true",
	"yes",
	"on"
]);
function envFlag(name) {
	const value = process.env[name];
	return value !== void 0 && TRUE_VALUES.has(value.trim().toLowerCase());
}
/** Global kill switch: DSH_AGY_DISABLE=1 keeps the plugin from registering anything. */
function isAgyDisabled() {
	return envFlag("DSH_AGY_DISABLE");
}
/**
* Fingerprint strategy: `dynamic` (default, identity regenerated after repeated
* rate-limits) or `stable` (one identity per account, never regenerated —
* mirrors OMP's fixed-client posture). Only the regeneration step differs; both
* modes present a single fixed identity when no fingerprint exists yet.
*/
function fingerprintMode() {
	return process.env.DSH_AGY_FINGERPRINT_MODE === "stable" ? "stable" : "dynamic";
}
/**
* Resolve the impersonation headers for one request from the account's
* persistent fingerprint (stable identity).
*
* The fallback below is only reachable when an account has no stored identity —
* normal operation creates one on first use (see `getSession`). It is therefore
* deliberately DETERMINISTIC rather than randomized: a per-request platform or
* version would make one account appear to be several different machines, which
* is the anomaly this identity exists to avoid. It reads
* {@link getFingerprintData} so a `$DSH_HOME/agy-fingerprint-data.json` override
* still applies on this path.
*/
function impersonationHeadersFor(account) {
	const fingerprint = account.fingerprint;
	if (fingerprint) return {
		"User-Agent": fingerprint.userAgent,
		"X-Goog-Api-Client": fingerprint.apiClient,
		clientMetadata: fingerprint.clientMetadata
	};
	return getStableHeaders(getFingerprintData(), currentAgyVersion());
}
var AgySessionManager = class AgySessionManager {
	store;
	onRotate;
	onHealthReport;
	recordUsageOption;
	tokenCache = /* @__PURE__ */ new Map();
	/** In-flight refresh promises keyed by account: concurrent requests share one refresh. */
	refreshInFlight = /* @__PURE__ */ new Map();
	/** In-flight quota fetches keyed by account: concurrent selections share one fetchAvailableModels call. */
	quotaRefreshInFlight = /* @__PURE__ */ new Map();
	failureCounts = /* @__PURE__ */ new Map();
	/** Accounts whose request-time project discovery already failed (no retry per request). */
	projectRetryFailed = /* @__PURE__ */ new Set();
	/** Bound for one quota poll so selection never stalls on a hung endpoint. */
	static QUOTA_FETCH_TIMEOUT_MS = 3e3;
	/** Refresh the token this far ahead of expiry so a request never blocks on the token endpoint. */
	static REFRESH_SKEW_MS = 12e4;
	/**
	* Per-conversation account affinity: the account one conversation is pinned
	* to, so its turns stay together (upstream prefix cache + `sessionId`
	* continuity) instead of re-ranking per request.
	*
	* Keyed by the conversation — `GenerateOptions.sessionId`, which the DSH agent
	* loop stamps — rather than by a single "last used" slot. That slot was a
	* stand-in for a conversation id the code assumed DSH did not expose, and with
	* two concurrent conversations the second overwrote the first's pin, so both
	* drifted across the pool independently of which account they started on.
	* Entries expire after {@link SESSION_AFFINITY_WINDOW_MS}.
	*/
	affinity = /* @__PURE__ */ new Map();
	/** Bound on tracked conversations; least-recently-pinned entries are evicted. */
	static MAX_AFFINITY_ENTRIES = 64;
	/** Bucket for callers with no session identity (standalone CLI, one-shots). */
	static ANONYMOUS_CONVERSATION = "\0anonymous";
	/**
	* In-flight upstream requests per account, so selection can spread concurrent
	* fan-out across the pool instead of stacking every stream on one account.
	*
	* Deliberately a PREFERENCE, not a hard gate: when every eligible account is at
	* the cap, selection proceeds with the best-ranked one rather than waiting.
	* Blocking would need a reliable release on every path (including an abandoned
	* stream) and a bounded wait to avoid deadlock, and a leaked counter would then
	* stall real requests — a worse failure than the burst it prevents. The
	* documented limitation is therefore: this spreads load across a multi-account
	* pool, and cannot throttle a single-account one.
	*/
	inFlight = /* @__PURE__ */ new Map();
	/** In-flight count for one account, discarding a leaked entry past its TTL. */
	inFlightCount(accountKey, now) {
		const entry = this.inFlight.get(accountKey);
		if (entry === void 0) return 0;
		if (now - entry.at > 6e5) {
			this.inFlight.delete(accountKey);
			return 0;
		}
		return entry.count;
	}
	/** Record that one upstream request for this account has started. */
	noteRequestStarted(account) {
		const key = this.accountKey(account);
		const now = Date.now();
		this.inFlight.set(key, {
			count: this.inFlightCount(key, now) + 1,
			at: now
		});
	}
	/** Record that one upstream request for this account has settled, on any path. */
	noteRequestSettled(account) {
		const key = this.accountKey(account);
		const now = Date.now();
		const count = this.inFlightCount(key, now);
		if (count <= 1) this.inFlight.delete(key);
		else this.inFlight.set(key, {
			count: count - 1,
			at: now
		});
	}
	/** The map key for a conversation; anonymous callers share one bucket. */
	conversationKeyFor(conversationKey) {
		const trimmed = conversationKey?.trim();
		return trimmed && trimmed.length > 0 ? trimmed : AgySessionManager.ANONYMOUS_CONVERSATION;
	}
	/** Drop expired pins and keep the map bounded. */
	pruneAffinity(now) {
		for (const [conversation, pin] of this.affinity) if (now - pin.at >= 6e5) this.affinity.delete(conversation);
		while (this.affinity.size > AgySessionManager.MAX_AFFINITY_ENTRIES) {
			const oldest = this.affinity.keys().next();
			if (oldest.done) break;
			this.affinity.delete(oldest.value);
		}
	}
	/** The account key this conversation is pinned to, when the pin is still fresh. */
	affinityFor(conversationKey, now) {
		const pin = this.affinity.get(this.conversationKeyFor(conversationKey));
		if (!pin || now - pin.at >= 6e5) return null;
		return pin.key;
	}
	/** Pin one conversation to one account. Re-inserts so eviction stays LRU. */
	setAffinity(conversationKey, accountKey, now) {
		const conversation = this.conversationKeyFor(conversationKey);
		this.affinity.delete(conversation);
		this.affinity.set(conversation, {
			key: accountKey,
			at: now
		});
		this.pruneAffinity(now);
	}
	/**
	* Drop every pin pointing at one account.
	*
	* A rotation or a skip means the account just proved unusable for the
	* conversation that was pinned to it; other conversations pinned elsewhere keep
	* their pins, which the single-slot version could not express.
	*/
	clearAffinityForAccount(accountKey) {
		for (const [conversation, pin] of this.affinity) if (pin.key === accountKey) this.affinity.delete(conversation);
	}
	constructor(options) {
		this.store = options.store;
		this.onRotate = options.onRotate;
		this.onHealthReport = options.onHealthReport;
		this.recordUsageOption = options.recordUsage;
	}
	/** Emit one non-chat usage record; a ledger failure never breaks the call. */
	emitUsage(record) {
		try {
			this.recordUsageOption?.(record);
		} catch {}
	}
	accountKey(account) {
		return account.id ?? account.email ?? `idx-${account.refresh}`;
	}
	/**
	* Refresh the account's access token (single-flight per account). A transient
	* refresh failure keeps the cached token in place (retain-last-good): the old
	* token stays valid until its own expiry and a later request retries the
	* refresh. Only `invalid_grant` drops the cache.
	*/
	refreshToken(key, account, cached) {
		const inFlight = this.refreshInFlight.get(key);
		if (inFlight) return inFlight;
		const refreshing = (async () => {
			const result = await refreshAccessToken({
				access: cached?.access ?? "",
				expires: cached?.expires ?? 0,
				refresh: account.refresh
			}, {
				clientId: account.clientId,
				proxyUrl: account.proxy
			});
			if (result.type === "success") {
				if (!account.clientId && result.clientId) {
					await this.store.mutate((s) => {
						const target = s.accounts.find((candidate) => this.accountKey(candidate) === key);
						if (!target) throw new Error(`Account ${key} not found during clientId migration`);
						target.clientId = result.clientId;
					});
					account.clientId = result.clientId;
				}
				this.tokenCache.set(key, {
					access: result.auth.access,
					expires: result.auth.expires
				});
				return result.auth;
			}
			if (result.type === "failed") {
				if (cached && !accessTokenExpired({
					access: cached.access,
					expires: cached.expires,
					refresh: account.refresh
				})) return {
					access: cached.access,
					expires: cached.expires,
					refresh: account.refresh
				};
				if (account.proxy && isProxyUnreachableError(result.error)) throw new AgyAuthError("transport", "proxy_unreachable", { cause: result.error });
				const kind = result.error.status === 429 ? "rate-limit" : result.error.status === 0 || result.error.status === 408 || result.error.status >= 500 ? "transport" : "invalid-credential";
				throw new AgyAuthError(kind, describeFetchError(result.error), { cause: result.error });
			}
			if (result.type === "revoked") {
				this.tokenCache.delete(key);
				await this.store.mutate((s) => {
					const target = s.accounts.find((candidate) => this.accountKey(candidate) === key);
					if (target) {
						target.enabled = false;
						target.verificationRequired = true;
						target.verificationRequiredAt = Date.now();
						target.verificationRequiredReason = "auth-failure";
					}
				});
				account.enabled = false;
				account.verificationRequired = true;
				account.verificationRequiredAt = Date.now();
				account.verificationRequiredReason = "auth-failure";
				return;
			}
		})();
		this.refreshInFlight.set(key, refreshing);
		refreshing.then(() => this.refreshInFlight.delete(key), () => this.refreshInFlight.delete(key));
		return refreshing;
	}
	/** Resolve a usable access token for the account, pre-emptively refreshing near expiry. */
	async accessTokenFor(account) {
		const key = this.accountKey(account);
		const cached = this.tokenCache.get(key);
		const now = Date.now();
		if (cached && !accessTokenExpired({
			access: cached.access,
			expires: cached.expires,
			refresh: account.refresh
		})) {
			if (cached.expires <= now + AgySessionManager.REFRESH_SKEW_MS) this.refreshToken(key, account, cached);
			return {
				access: cached.access,
				expires: cached.expires,
				refresh: account.refresh
			};
		}
		return this.refreshToken(key, account, cached);
	}
	/**
	* Refresh the display-only 5h/weekly windows for every enabled account.
	*
	* SEPARATE from `refreshQuotaCache`, and deliberately so. That method writes
	* `cachedQuota`, which feeds the scheduling path: `rankPoolCandidates` turns a
	* measured `remainingFraction <= 0` into a `blockedUntil`, so measuring a
	* pool's quota can BLOCK an account. That is safe only with a fallback, which
	* is why `getSession` gates it on `eligible.length > 1` — and that gate is also
	* why a solo account never had `cachedLimits` populated and the limits card
	* showed "not measured yet" forever.
	*
	* Dropping the gate instead would have been a real outage, not a display fix:
	* a solo account whose family is measured at 0 gets `AgyPoolBlockedError` with
	* no other account to serve the request (verified). So the windows are fetched
	* here WITHOUT writing `cachedQuota`, which makes them safe to measure for a
	* pool of any size — a solo account included.
	*
	* Cost is bounded by the same TTL the scheduling path uses, so this runs at
	* most once per window rather than per request.
	*
	* KNOWN LIMITATION (deliberate, not overlooked): a FAILED probe writes no
	* marker, so "probe failed" and "never probed" are indistinguishable and
	* `isLimitsStale` reports stale again on the next call. The practical effect is
	* that an account whose endpoint never returns groups is re-probed each time
	* the accounts page is opened, with no backoff. Acceptable today — the call is
	* display-only, TTL-bounded, and triggered by opening a tab rather than by a
	* poll — so no negative-TTL field is added yet. Revisit if the trigger becomes
	* frequent or the pool grows enough that the extra calls matter.
	*
	* @param storage - the loaded storage document, overlaid in memory on success.
	* @param options - `force` re-probes inside the TTL.
	* @returns which accounts were measured, so a caller that asked for a refresh
	*   can REPORT it. Without this a forced refresh that failed was completely
	*   silent: no cache write, no `updatedAt` change, nothing on screen — the
	*   same "clicked it, saw a flicker" defect as an unread RPC verdict.
	*/
	async refreshLimits(storage, options = {}) {
		const now = Date.now();
		const candidates = storage.accounts.filter((account) => account.enabled !== false);
		const targets = options.force === true ? candidates : candidates.filter((account) => isLimitsStale(account, now));
		if (targets.length === 0) return {
			measured: [],
			failed: [],
			skipped: candidates.length
		};
		const probes = await Promise.all(targets.map(async (account) => {
			const key = this.accountKey(account);
			try {
				const auth = await this.accessTokenFor(account);
				if (!auth) return {
					key,
					ok: false
				};
				const { fetchQuotaSummary } = await import("./quota-summary-5CypVffd.mjs");
				const routed = accountFetch({ proxyUrl: account.proxy });
				const bounded = (input, init) => {
					const timeout = AbortSignal.timeout(AgySessionManager.QUOTA_FETCH_TIMEOUT_MS);
					const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
					return routed(input, {
						...init,
						signal
					});
				};
				const groups = await fetchQuotaSummary(auth.access, account.projectId, bounded);
				if (groups.length === 0) return {
					key,
					ok: false
				};
				return {
					key,
					ok: true,
					groups,
					updatedAt: Date.now()
				};
			} catch {
				return {
					key,
					ok: false
				};
			}
		}));
		const updates = probes.filter((probe) => probe.ok);
		const failed = probes.filter((probe) => !probe.ok).map((probe) => probe.key);
		const result = {
			measured: updates.map((update) => update.key),
			failed,
			skipped: candidates.length - targets.length
		};
		if (updates.length === 0) return result;
		for (const update of updates) {
			const target = storage.accounts.find((candidate) => this.accountKey(candidate) === update.key);
			if (target) target.cachedLimits = {
				groups: update.groups,
				updatedAt: update.updatedAt
			};
		}
		try {
			await this.store.mutate((s) => {
				for (const update of updates) {
					const target = s.accounts.find((candidate) => this.accountKey(candidate) === update.key);
					if (target) target.cachedLimits = {
						groups: update.groups,
						updatedAt: update.updatedAt
					};
				}
			});
		} catch {}
		return result;
	}
	/**
	* Refresh stale per-account quota caches (family-scoped, health-based TTL).
	* Failures leave the account unmeasured: ranking treats it as a fallback
	* instead of blocking selection on a hung endpoint.
	*/
	async refreshQuotaCache(storage) {
		const now = Date.now();
		const stale = storage.accounts.filter((account) => account.enabled !== false && isQuotaStale(account, now));
		if (stale.length === 0) return;
		const updates = (await Promise.all(stale.map(async (account) => {
			const key = this.accountKey(account);
			if (this.quotaRefreshInFlight.has(key)) return this.quotaRefreshInFlight.get(key);
			const refresh = (async () => {
				try {
					const auth = await this.accessTokenFor(account);
					if (!auth) return null;
					const { fetchAvailableModels } = await import("./models-BGuwl50d.mjs").then((n) => n.r);
					const routed = accountFetch({ proxyUrl: account.proxy });
					const quotas = ingestFamilyQuotas(await fetchAvailableModels(auth.access, account.projectId, (input, init) => {
						const timeout = AbortSignal.timeout(AgySessionManager.QUOTA_FETCH_TIMEOUT_MS);
						const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
						return routed(input, {
							...init,
							signal
						});
					}));
					return {
						key,
						quotas,
						updatedAt: Date.now()
					};
				} catch {
					return null;
				}
			})();
			this.quotaRefreshInFlight.set(key, refresh);
			try {
				return await refresh;
			} finally {
				this.quotaRefreshInFlight.delete(key);
			}
		}))).filter((r) => Boolean(r && Object.keys(r.quotas).length > 0));
		if (updates.length > 0) {
			for (const update of updates) {
				const target = storage.accounts.find((candidate) => this.accountKey(candidate) === update.key);
				if (target) {
					target.cachedQuota = update.quotas;
					target.cachedQuotaUpdatedAt = update.updatedAt;
				}
			}
			try {
				await this.store.mutate((s) => {
					for (const update of updates) {
						const target = s.accounts.find((candidate) => this.accountKey(candidate) === update.key);
						if (target) {
							target.cachedQuota = update.quotas;
							target.cachedQuotaUpdatedAt = update.updatedAt;
						}
					}
				});
			} catch {}
		}
	}
	/**
	* Pick the account for one request: the affinity pin wins while it is fresh,
	* healthy, and not drained for the requested model; otherwise the pool is
	* ranked by family-scoped usage (OMP-aligned) and the best candidate wins.
	*/
	async pickAccount(storage, model, conversationKey) {
		const now = Date.now();
		for (const account of storage.accounts) clearExpiredState(account, now);
		const family = modelFamilyOf(model);
		const familyKey = familyKeyOf(model);
		const pinnedKey = this.affinityFor(conversationKey, now);
		if (pinnedKey !== null) {
			const lastIndex = storage.accounts.findIndex((a) => this.accountKey(a) === pinnedKey);
			if (lastIndex !== -1) {
				const last = storage.accounts[lastIndex];
				if (last.enabled !== false && !isCoolingDown(last, now) && !isFamilyRateLimited(last, familyKey, now) && !isFamilyDrained(last, family, now)) return {
					account: last,
					index: lastIndex
				};
			}
		}
		const eligible = storage.accounts.map((account, index) => ({
			account,
			index
		})).filter(({ account }) => account.enabled !== false);
		if (eligible.length === 0) return void 0;
		const ranked = rankPoolCandidates(eligible, model, now, storage.activeIndex);
		const picked = ranked.find((candidate) => candidate.blockedUntil === null && this.inFlightCount(this.accountKey(candidate.account), now) < 3) ?? ranked.find((candidate) => candidate.blockedUntil === null);
		if (!picked) {
			const quotaExhausted = (account) => {
				if (account.cooldownReason === "quota-exhausted" && (account.coolingDownUntil ?? 0) > now) return true;
				const quota = familyQuotaFor(account, family);
				if ((quota?.remainingFraction ?? 1) > 0 || !quota?.resetTime) return false;
				const resetAt = Date.parse(quota.resetTime);
				return !Number.isNaN(resetAt) && resetAt > now;
			};
			const retryable = ranked.filter((candidate) => !quotaExhausted(candidate.account));
			const blocked = retryable.length > 0 ? retryable : ranked;
			const blockedUntil = Math.min(...blocked.map((candidate) => candidate.blockedUntil ?? now));
			throw new AgyPoolBlockedError(retryable.length > 0 ? "retryable" : "quota-exhausted", blockedUntil);
		}
		if (picked.index !== storage.activeIndex) {
			storage.activeIndex = picked.index;
			await this.store.mutate((s) => {
				s.activeIndex = picked.index;
			});
		}
		return {
			account: picked.account,
			index: picked.index
		};
	}
	/**
	* Adapter hook: resolve the active session (refresh if needed), healing a
	* missing projectId at request time — the OAuth-time loadCodeAssist may have
	* transiently failed even when the Google account owns a Cloud Code project
	* (mirrors OmniRoute's ensureAntigravityProjectAssigned + persistence).
	* @param model - requested model id; drives family-scoped quota ranking.
	* @param accountIndex - resolve this exact account instead of ranking the pool.
	*   Used by the management "Test call" action, where testing a different
	*   account than the one the user clicked would report a result for the wrong
	*   account. Deliberately does NOT update the affinity pin: a one-shot test
	*   must not steer the next real conversation onto the account it probed.
	* @param conversationKey - the conversation's identity (`GenerateOptions.sessionId`),
	*   which scopes account affinity. Concurrent conversations therefore hold
	*   independent pins. Omitted by callers with no conversation (CLI, probes),
	*   which share one anonymous bucket.
	*/
	async getSession(model, accountIndex, conversationKey) {
		let storage = await this.store.load();
		if (accountIndex !== void 0) {
			const account = storage.accounts[accountIndex];
			if (!account) throw new Error(`account #${accountIndex} not found`);
			if (account.enabled === false) throw new Error(`account #${accountIndex} is disabled`);
		}
		const maxAttempts = accountIndex === void 0 ? storage.accounts.filter((account) => account.enabled !== false).length : 1;
		let proxyUnreachableCount = 0;
		/**
		* Last transport failure seen on a *proxyless* account. Such an account is
		* skipped (another enabled account may be healthy) without writing a
		* cooldown: a cooldown would surface as AgyPoolBlockedError — i.e. RATE_LIMIT
		* for a plain network error — and would block a solo pool outright. It is
		* remembered so the request still reports its real cause rather than
		* degrading into "no account configured" when every account fails this way.
		*/
		let lastTransportError;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const eligible = storage.accounts.filter((account) => account.enabled !== false);
			if (accountIndex === void 0 && eligible.length > 1) await this.refreshQuotaCache(storage);
			const picked = accountIndex === void 0 ? await this.pickAccount(storage, model, conversationKey) : (() => {
				const account = storage.accounts[accountIndex];
				if (!account) throw new Error(`account #${accountIndex} not found`);
				if (account.enabled === false) throw new Error(`account #${accountIndex} is disabled`);
				return {
					account,
					index: accountIndex
				};
			})();
			if (!picked) return void 0;
			let auth;
			try {
				auth = await this.accessTokenFor(picked.account);
			} catch (error) {
				if (Boolean(picked.account.proxy) && isProxyUnreachableError(error)) {
					proxyUnreachableCount++;
					if (accountIndex !== void 0) throw error;
					storage = await this.skipAccount(storage, picked.account);
					continue;
				}
				lastTransportError = error;
				if (accountIndex !== void 0) throw error;
				storage = await this.skipAccount(storage, picked.account);
				continue;
			}
			if (!auth) {
				if (accountIndex !== void 0) throw new Error(`account #${accountIndex} credential is no longer valid — run \`dsh-agy login\``);
				this.clearAffinityForAccount(this.accountKey(picked.account));
				storage = await this.store.load();
				continue;
			}
			const key = this.accountKey(picked.account);
			if (!picked.account.projectId && !this.projectRetryFailed.has(key)) try {
				const { loadCodeAssist } = await import("./exchange-yZPIZumk.mjs").then((n) => n.n);
				const { projectId } = await loadCodeAssist(auth.access, { proxyUrl: picked.account.proxy });
				if (projectId) {
					await this.store.mutate((s) => {
						const account = s.accounts.find((candidate) => this.accountKey(candidate) === key);
						if (account) {
							account.projectId = projectId;
							const parts = parseRefreshParts(account.refresh);
							account.refresh = formatRefreshParts({
								refreshToken: parts.refreshToken,
								projectId,
								managedProjectId: parts.managedProjectId
							});
						}
					});
					picked.account.projectId = projectId;
				} else this.projectRetryFailed.add(key);
			} catch {
				this.projectRetryFailed.add(key);
			}
			if (!picked.account.fingerprint) {
				const fingerprint = generateFingerprint(void 0, currentAgyVersion());
				const history = recordFingerprintVersion(picked.account.fingerprintHistory, fingerprint, "initial");
				await this.store.mutate((s) => {
					const account = s.accounts.find((candidate) => this.accountKey(candidate) === key);
					if (account && !account.fingerprint) {
						account.fingerprint = fingerprint;
						account.fingerprintHistory = history;
					}
				});
				picked.account.fingerprint = fingerprint;
				picked.account.fingerprintHistory = history;
			}
			if (accountIndex === void 0) this.setAffinity(conversationKey, key, Date.now());
			return {
				auth,
				account: picked.account,
				index: picked.index,
				impersonation: impersonationHeadersFor(picked.account)
			};
		}
		if (proxyUnreachableCount === maxAttempts && maxAttempts > 0) throw new AgyAuthError("transport", "proxy_unreachable");
		if (lastTransportError !== void 0) throw lastTransportError;
	}
	/**
	* Drop the session pin and move the pool cursor off an account that just
	* failed, so the next `pickAccount` in this same request tries another one.
	* State on the account itself is deliberately left untouched (no cooldown).
	*/
	async skipAccount(storage, account) {
		this.clearAffinityForAccount(this.accountKey(account));
		const key = this.accountKey(account);
		const deadIndex = storage.accounts.findIndex((candidate) => this.accountKey(candidate) === key);
		if (deadIndex !== -1) {
			const next = pickNextAccountIndex(storage.accounts, deadIndex, Date.now());
			if (next !== storage.activeIndex) {
				storage.activeIndex = next;
				await this.store.mutate((s) => {
					s.activeIndex = next;
				}).catch(() => {});
			}
		}
		return this.store.load();
	}
	/** Adapter hook: apply rotation decisions and fingerprint regeneration. */
	async reportFailure(kind, session, info) {
		if (!session?.account) return;
		const key = this.accountKey(session.account);
		const consecutive = (this.failureCounts.get(key) ?? 0) + 1;
		this.failureCounts.set(key, consecutive);
		let nextIndexToRotate = null;
		const fpCachedVersion = kind === "rate-limit" ? peekCachedAntigravityVersion() : null;
		const fpResolvedVersion = kind === "rate-limit" ? fpCachedVersion ?? await resolveAntigravityVersionBounded(750, probeFetch(session.account.proxy)) ?? currentAgyVersion() : currentAgyVersion();
		await this.store.mutate((storage) => {
			const account = storage.accounts.find((a) => this.accountKey(a) === key);
			if (!account) return;
			const decision = decideRotation(kind, account, consecutive, info?.retryAfterMs, info?.rateLimitCategory, info?.resetTime);
			if (kind === "verification-required" && info?.verificationUrl) account.verificationUrl = info.verificationUrl;
			if (kind === "rate-limit" && info?.rateLimitCategory !== "soft_rate_limit") recordRateLimit(account, familyKeyOf(info?.model), parseFutureResetMs$1(info?.resetTime, Date.now()) ?? Date.now() + Math.min(info?.retryAfterMs ?? 3e5, 18e5));
			if (decision.action === "revoke") {
				this.tokenCache.delete(key);
				this.failureCounts.delete(key);
				return;
			}
			if (kind === "rate-limit" && info?.rateLimitCategory !== "soft_rate_limit") {
				if (!account.fingerprint) {
					account.fingerprint = generateFingerprint(void 0, fpResolvedVersion);
					account.fingerprintHistory = recordFingerprintVersion(account.fingerprintHistory, account.fingerprint, "initial");
				} else {
					if (fpCachedVersion) updateFingerprintVersion(account.fingerprint, fpCachedVersion);
					if (fingerprintMode() !== "stable" && consecutive >= 2) {
						const fresh = generateFingerprint(void 0, fpResolvedVersion);
						account.fingerprintHistory = recordFingerprintVersion(account.fingerprintHistory, fresh, "regenerated");
						account.fingerprint = fresh;
					}
				}
			}
			if (decision.action === "rotate") {
				const currentIndex = storage.accounts.findIndex((a) => this.accountKey(a) === key);
				const familyKey = familyKeyOf(info?.model);
				const nextIndex = pickNextAccountIndex(storage.accounts, currentIndex >= 0 ? currentIndex : storage.activeIndex, Date.now(), familyKey);
				if (nextIndex !== storage.activeIndex) {
					storage.activeIndex = nextIndex;
					nextIndexToRotate = nextIndex;
				}
				this.clearAffinityForAccount(key);
			}
		});
		if (nextIndexToRotate !== null) {
			this.onRotate?.(session.index, nextIndexToRotate, kind);
			this.emitUsage({
				...session.account.email === void 0 && session.account.id === void 0 ? {} : { account: session.account.email ?? session.account.id },
				source: "chat",
				ok: false,
				rotated: true,
				poolEvent: true
			});
		}
	}
	/** Adapter hook: reset the failure counter after a clean completion. */
	async markSuccess(session) {
		const account = session.account;
		const key = this.accountKey(account);
		this.failureCounts.delete(key);
	}
	/**
	* Test call: one short streaming request against the live backend.
	* Returns the collected text or a structured error message.
	* @param model - model id to exercise.
	* @param options - probe overrides.
	*   - `prompt` / `maxTokens`: the request shape (defaults to a one-token reply).
	*   - `accountIndex`: test this exact account instead of letting the pool rank
	*     one. The management UI exposes "Test call" per account row, so without
	*     this the probe ran on whichever account affinity picked, and its result
	*     was both returned and recorded against that other account.
	*/
	async testCall(model, options = {}) {
		const prompt = options.prompt ?? "Reply with exactly: OK";
		const maxTokens = options.maxTokens ?? 1024;
		const startedAt = Date.now();
		let session;
		try {
			session = await this.getSession(model, options.accountIndex);
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
		if (!session) return {
			ok: false,
			error: "No agy account configured — run `dsh-agy login` first."
		};
		try {
			const account = session.account.email ?? session.account.id;
			const { toAgyRequestBody } = await import("./translate-Cq2OV9JT.mjs").then((n) => n.n);
			const { fetchAgyFirstOk } = await import("./constants-Db4tmyfb.mjs").then((n) => n.f);
			const { parseAgySse } = await import("./parse-CgQleYmH.mjs").then((n) => n.n);
			const requestId = generateAntigravityRequestId();
			const body = toAgyRequestBody({
				provider: "agy",
				model,
				messages: [{
					id: "test-1",
					role: "user",
					content: [{
						type: "text",
						text: prompt
					}]
				}],
				maxTokens
			}, {
				projectId: session.account.projectId,
				sessionId: deriveAntigravitySessionId(session.account.email) ?? void 0,
				requestId
			});
			const headers = {
				authorization: `Bearer ${session.auth.access}`,
				"content-type": "application/json",
				accept: "text/event-stream",
				"User-Agent": session.impersonation["User-Agent"],
				"X-Goog-Api-Client": session.impersonation["X-Goog-Api-Client"]
			};
			const routing = {
				proxyUrl: session.account.proxy,
				streaming: true
			};
			const response = await fetchAgyFirstOk("/v1internal:streamGenerateContent?alt=sse", {
				method: "POST",
				headers,
				body: JSON.stringify(body)
			}, accountFetch(routing), routing);
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				this.emitUsage({
					account,
					model,
					source: "test",
					ok: false,
					latencyMs: Date.now() - startedAt
				});
				return {
					ok: false,
					error: `HTTP ${response.status}: ${text.slice(0, 300)}`
				};
			}
			if (!response.body) {
				this.emitUsage({
					account,
					model,
					source: "test",
					ok: false,
					latencyMs: Date.now() - startedAt
				});
				return {
					ok: false,
					error: "no response body"
				};
			}
			const text = [];
			let usage;
			let ttftMs;
			for await (const chunk of parseAgySse(response.body)) if (chunk.type === "usage") usage = {
				input: chunk.usage.inputTokens,
				output: chunk.usage.outputTokens,
				cacheRead: chunk.usage.cacheReadTokens ?? 0,
				cacheWrite: chunk.usage.cacheWriteTokens ?? 0
			};
			else if (chunk.type === "text-delta") {
				if (ttftMs === void 0) ttftMs = Date.now() - startedAt;
				text.push(chunk.text);
			}
			const ok = text.length > 0;
			this.emitUsage({
				account,
				model,
				source: "test",
				ok,
				...usage === void 0 ? {} : { usage },
				...ttftMs === void 0 ? {} : { ttftMs },
				latencyMs: Date.now() - startedAt
			});
			return {
				ok,
				text: text.join(""),
				error: ok ? void 0 : "empty response"
			};
		} catch (error) {
			this.emitUsage({
				source: "test",
				ok: false,
				latencyMs: Date.now() - startedAt
			});
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
	/** Export one account as a paste-credential blob (for migration to another host). */
	async exportBlob(index) {
		const account = (await this.store.load()).accounts[index];
		if (!account) return { error: "account not found" };
		try {
			const auth = await this.accessTokenFor(account);
			if (!auth) return { error: "refresh failed (revoked?)" };
			const { encodeCredentialBlob } = await import("./blob-D1e7_uT1.mjs").then((n) => n.t);
			const parts = parseRefreshParts(account.refresh);
			return { blob: encodeCredentialBlob("agy", {
				access_token: auth.access,
				refresh_token: parts.refreshToken,
				expires_in: Math.max(0, Math.round((auth.expires - Date.now()) / 1e3))
			}) };
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error) };
		}
	}
	/** Probe one account: refresh + userinfo; a live credential re-enables the account. */
	async probeAccount(index, account) {
		const startedAt = Date.now();
		const key = account.email ?? account.id;
		try {
			const auth = await this.accessTokenFor(account);
			if (!auth) {
				this.emitUsage({
					account: key,
					source: "verify",
					ok: false,
					latencyMs: Date.now() - startedAt
				});
				return {
					ok: false,
					error: "refresh failed (revoked?)"
				};
			}
			const response = await proxiedFetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", { headers: { Authorization: `Bearer ${auth.access}` } }, account.proxy ? { proxyUrl: account.proxy } : void 0);
			if (!response.ok) {
				this.emitUsage({
					account: key,
					source: "verify",
					ok: false,
					latencyMs: Date.now() - startedAt
				});
				return {
					ok: false,
					error: `userinfo ${response.status}`
				};
			}
			const info = await response.json();
			await this.store.mutate((s) => {
				const target = s.accounts[index];
				if (target) {
					target.enabled = true;
					target.verificationRequired = false;
					target.verificationRequiredAt = void 0;
					target.verificationRequiredReason = void 0;
					target.verificationUrl = void 0;
				}
			});
			this.emitUsage({
				account: info.email ?? key,
				source: "verify",
				ok: true,
				latencyMs: Date.now() - startedAt
			});
			return {
				ok: true,
				email: info.email
			};
		} catch (error) {
			this.emitUsage({
				account: key,
				source: "verify",
				ok: false,
				latencyMs: Date.now() - startedAt
			});
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
	/** CLI/web helper: verify an account's credentials (refresh + userinfo). */
	async verifyAccount(index) {
		const account = (await this.store.load()).accounts[index];
		if (!account) return {
			ok: false,
			error: "account not found"
		};
		return this.probeAccount(index, account);
	}
	/**
	* Batch health check over all enabled accounts (or the given indices):
	* refresh + userinfo per account, live credentials re-enable the account.
	* Reports results through onHealthReport when a listener is registered.
	*/
	async checkAccounts(indices) {
		const storage = await this.store.load();
		const targets = indices !== void 0 ? indices.filter((index) => storage.accounts[index]) : storage.accounts.map((_, index) => index).filter((index) => storage.accounts[index].enabled !== false);
		const results = await Promise.all(targets.map(async (index) => {
			return {
				index,
				...await this.probeAccount(index, storage.accounts[index])
			};
		}));
		this.onHealthReport?.(results);
		return results;
	}
	/**
	* Start a background health probe on an interval (disposable stop handle).
	* The timer is unref'd unless told otherwise so harness processes can still
	* exit; the CLI loop mode passes `unref: false`.
	*/
	startHealthProbe(intervalMs, options = {}) {
		if (!Number.isFinite(intervalMs) || intervalMs <= 0) return () => {};
		const timer = setInterval(() => {
			this.checkAccounts().catch(() => {});
		}, intervalMs);
		if (options.unref !== false) timer.unref?.();
		return () => clearInterval(timer);
	}
};
const ENC_PREFIX = "enc:v1:";
const properFileLock = { async withLock(file, fn) {
	const release = await lockfile.lock(file, {
		stale: 3e4,
		update: 1e4,
		retries: {
			retries: 10,
			factor: 1.5,
			minTimeout: 50,
			maxTimeout: 2e3
		}
	});
	try {
		return await fn();
	} finally {
		await release();
	}
} };
function isEncrypted(value) {
	return value.startsWith(ENC_PREFIX);
}
/** Decrypt one account's refresh/proxy fields when encrypted; plaintext passes through (legacy). */
function decryptAccount(account, codec) {
	let out = account;
	if (isEncrypted(out.refresh)) out = {
		...out,
		refresh: codec.decrypt(out.refresh)
	};
	if (out.proxy && isEncrypted(out.proxy)) out = {
		...out,
		proxy: codec.decrypt(out.proxy)
	};
	return out;
}
/** Encrypt one account's refresh/proxy fields (plaintext stays plaintext if no codec change). */
function encryptAccount(account, codec) {
	let out = account;
	if (!isEncrypted(out.refresh)) out = {
		...out,
		refresh: codec.encrypt(out.refresh)
	};
	if (out.proxy && !isEncrypted(out.proxy)) out = {
		...out,
		proxy: codec.encrypt(out.proxy)
	};
	return out;
}
/** Mask a proxy URL for display/logs: protocol//host:port (no credentials, no query). */
function maskProxyUrl(proxyUrl) {
	if (!proxyUrl) return null;
	try {
		const u = new URL(proxyUrl);
		const port = u.port || (u.protocol === "https:" ? "443" : u.protocol === "socks5:" || u.protocol === "socks5h:" ? "1080" : "8080");
		return `${u.protocol}//${u.hostname}:${port}`;
	} catch {
		return null;
	}
}
function ensureAccountIds(storage) {
	let mutated = false;
	const seenIds = /* @__PURE__ */ new Set();
	for (const account of storage.accounts) {
		if (!account.id || seenIds.has(account.id)) {
			account.id = randomUUID();
			mutated = true;
		}
		seenIds.add(account.id);
	}
	return {
		storage,
		mutated
	};
}
function decryptStorage(storage, codec) {
	return {
		...storage,
		accounts: storage.accounts.map((a) => decryptAccount(a, codec))
	};
}
function encryptStorage(storage, codec) {
	return {
		...storage,
		accounts: storage.accounts.map((a) => encryptAccount(a, codec))
	};
}
function migrateV1ToV2(v1) {
	return {
		version: 2,
		accounts: v1.accounts.map((acc) => ({
			email: acc.email,
			refreshToken: acc.refreshToken,
			projectId: acc.projectId,
			managedProjectId: acc.managedProjectId,
			addedAt: acc.addedAt,
			lastUsed: acc.lastUsed,
			lastSwitchReason: acc.lastSwitchReason,
			rateLimitResetTimes: acc.isRateLimited && acc.rateLimitResetTime ? { default: acc.rateLimitResetTime } : void 0
		})),
		activeIndex: v1.activeIndex
	};
}
function migrateV2ToV3(v2) {
	return {
		version: 3,
		accounts: v2.accounts.map((acc) => ({
			email: acc.email,
			refresh: `${acc.refreshToken}|${acc.projectId ?? ""}|${acc.managedProjectId ?? ""}`,
			projectId: acc.projectId,
			managedProjectId: acc.managedProjectId,
			addedAt: acc.addedAt,
			lastUsed: acc.lastUsed,
			enabled: true,
			lastSwitchReason: acc.lastSwitchReason,
			rateLimitResetTimes: acc.rateLimitResetTimes
		})),
		activeIndex: v2.activeIndex
	};
}
function migrateV3ToV4(v3) {
	return {
		version: 4,
		accounts: v3.accounts,
		activeIndex: v3.activeIndex
	};
}
function migrateStorage(raw) {
	switch (raw.version) {
		case 1: return migrateStorage(migrateV1ToV2(raw));
		case 2: return migrateStorage(migrateV2ToV3(raw));
		case 3: return migrateStorage(migrateV3ToV4(raw));
		case 4: return raw;
		default: throw new Error(`migrateStorage: unsupported storage version ${raw.version}`);
	}
}
var JsonAccountStore = class {
	file;
	codec;
	lock;
	constructor(options) {
		this.file = options.file;
		this.codec = options.codec;
		this.lock = options.lock ?? properFileLock;
	}
	ensureFile() {
		if (existsSync(this.file)) return;
		mkdirSync(dirname(this.file), { recursive: true });
		const tmp = `${this.file}.tmp-init`;
		writeFileSync(tmp, JSON.stringify({
			version: 4,
			accounts: [],
			activeIndex: 0
		}) + "\n", { mode: 384 });
		renameSync(tmp, this.file);
	}
	readAndMigrateUnlocked() {
		let text;
		try {
			text = readFileSync(this.file, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") return {
				storage: {
					version: 4,
					accounts: [],
					activeIndex: 0
				},
				mutated: false
			};
			throw error;
		}
		assertOwnerOnly(this.file);
		return ensureAccountIds(decryptStorage(migrateStorage(JSON.parse(text)), this.codec));
	}
	writeUnlocked(storage) {
		const encrypted = encryptStorage(ensureAccountIds(storage).storage, this.codec);
		mkdirSync(dirname(this.file), { recursive: true });
		const tmp = `${this.file}.tmp`;
		writeFileSync(tmp, JSON.stringify(encrypted, null, 2) + "\n", { mode: 384 });
		renameSync(tmp, this.file);
	}
	/**
	* Materialize and persist generated/repaired UUIDs under the file lock:
	* re-reads the fresh on-disk state under the lock so concurrent mutations
	* are never clobbered by a stale pre-lock snapshot.
	*/
	async materializeIdsWithLock() {
		this.ensureFile();
		return this.lock.withLock(this.file, async () => {
			const { storage, mutated } = this.readAndMigrateUnlocked();
			if (mutated) this.writeUnlocked(storage);
			return storage;
		});
	}
	async load() {
		const { storage, mutated } = this.readAndMigrateUnlocked();
		if (mutated) return this.materializeIdsWithLock();
		return storage;
	}
	async save(storage) {
		this.ensureFile();
		await this.lock.withLock(this.file, async () => {
			this.writeUnlocked(storage);
		});
	}
	async mutate(fn) {
		this.ensureFile();
		return this.lock.withLock(this.file, async () => {
			const { storage } = this.readAndMigrateUnlocked();
			const result = await fn(storage);
			this.writeUnlocked(storage);
			return result;
		});
	}
};
//#endregion
export { resolveMasterKeyCodec as _, generateFingerprint as a, describeFetchError as b, resolveAntigravityVersionBounded as c, MASTER_KEY_REF as d, createAesGcmCodec as f, resolveDshHome as g, persistMasterKey as h, isAgyDisabled as i, clearExpiredState as l, loadMasterKey as m, maskProxyUrl as n, recordFingerprintVersion as o, deriveKey as p, AgySessionManager as r, resolveAntigravityVersion as s, JsonAccountStore as t, pickProbeProxyUrl as u, classifyFetchError as v, isSessionAccumulationOverflow as x, classifyHttpError as y };

//# sourceMappingURL=accounts-D0KoucnO.mjs.map