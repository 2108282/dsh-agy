import { h as AgyPoolBlockedError, m as AgyAuthError, u as fetchAgyFirstOk } from "./constants-BFKYjOmh.mjs";
import { t as accountFetch } from "./proxy-DLvX8yxv.mjs";
import { _ as classifyHttpError, a as deriveKey, c as resolveDshHome, g as classifyFetchError, i as createAesGcmCodec, l as resolveMasterKeyCodec, m as resolveAntigravityVersion, o as loadMasterKey, r as MASTER_KEY_REF, s as persistMasterKey, t as JsonAccountStore, u as AgySessionManager, v as describeFetchError } from "./accounts-wzH9KGR7.mjs";
import { n as generateAntigravityRequestId, t as deriveAntigravitySessionId } from "./identity-DsftHTJC.mjs";
import { i as setThoughtSignature, r as resolveMultimodalFiles, t as toAgyRequestBody } from "./translate-D_o2YANO.mjs";
import { t as parseAgySse } from "./parse-CgQleYmH.mjs";
import { i as resolveAgyModel, n as listAgyModels, t as catalogModelList } from "./models-BP9kYRcK.mjs";
import { randomBytes } from "node:crypto";
import { LlmAdapter, LlmError, ProviderRequestId, QUOTA_EXCEEDED_CODE, attributionHeaders } from "@deepseek-ai/dsh-llm";
//#region src/adapter/adapter.ts
/**
* AgyAdapter: the DSH seam. A thin orchestrator over the deep modules —
* account session resolution (shell-provided), request translation, SSE
* parsing, failure classification, and rotation reporting. All wire details
* live in translate.ts / parse.ts / models.ts.
*/
/** Collect image refs from user-message content only (spec scope: user images; tool-result nesting out of scope). */
function collectImageRefs(options) {
	const refs = [];
	for (const message of options.messages) {
		if (message.role !== "user") continue;
		for (const block of message.content) if (block.type === "image") refs.push(block.attachment);
	}
	return refs;
}
const UPSTREAM_ERROR_CODE = "UPSTREAM";
/** First-class DSH retryable code: the default retry policy honors SERVER (5xx), not UPSTREAM. */
const SERVER_ERROR_CODE = "SERVER";
/** Build the impersonation headers for one request (per-request randomization applied by the shell). */
function buildRequestHeaders(session) {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${session.auth.access}`,
		Accept: "text/event-stream",
		...attributionHeaders(),
		...session.impersonation
	};
}
var AgyAdapter = class extends LlmAdapter {
	options;
	constructor(options) {
		super();
		this.options = options;
	}
	async listProviders() {
		return [{
			id: "agy",
			name: "Google Antigravity"
		}];
	}
	async listModels(_provider) {
		try {
			const session = await this.options.getSession();
			const routing = { proxyUrl: session?.account.proxy };
			return await listAgyModels(session?.auth.access, session?.account.projectId, accountFetch(routing));
		} catch (error) {
			if (error instanceof AgyPoolBlockedError || error instanceof AgyAuthError) return catalogModelList();
			throw error;
		}
	}
	async resolveModel(provider, model) {
		return resolveAgyModel(provider, model);
	}
	/**
	* Pre-resolve every image attachment into base64 bytes before translation.
	* Image input hard-fails with UNSUPPORTED_CONTENT (terminal, never retried)
	* when the store is missing or a read fails — silently dropping images and
	* sending text-only is the exact failure mode this path exists to prevent.
	*/
	async resolveRequestImages(options) {
		const refs = collectImageRefs(options);
		const images = /* @__PURE__ */ new Map();
		if (refs.length === 0) return images;
		const store = this.options.resolveAttachments?.();
		if (!store) throw new LlmError("agy image input requires the durable attachment service (in-harness plugin only)", "UNSUPPORTED_CONTENT");
		const settled = await Promise.allSettled(refs.map(async (ref) => {
			const stored = await store.readImage(ref);
			return {
				attachmentId: ref.attachmentId,
				image: {
					mediaType: stored.ref.mediaType,
					data: Buffer.from(stored.data).toString("base64")
				}
			};
		}));
		const failedIndex = settled.findIndex((outcome) => outcome.status === "rejected");
		if (failedIndex !== -1) {
			const ref = refs[failedIndex];
			const cause = settled[failedIndex].reason;
			throw new LlmError(`agy image attachment "${ref.attachmentId}" could not be loaded: ${cause instanceof Error ? cause.message : String(cause)}`, "UNSUPPORTED_CONTENT", { cause: cause instanceof Error ? cause : void 0 });
		}
		for (const outcome of settled) if (outcome.status === "fulfilled") images.set(outcome.value.attachmentId, outcome.value.image);
		return images;
	}
	async *stream(options) {
		const images = await this.resolveRequestImages(options);
		let session;
		try {
			session = await this.options.getSession(options.model);
		} catch (error) {
			if (error instanceof AgyAuthError) {
				if (error.kind === "transport") throw new LlmError(error.message, "TRANSPORT", { cause: error });
				if (error.kind === "rate-limit") throw new LlmError(error.message, "RATE_LIMIT", { requestId: ProviderRequestId(generateAntigravityRequestId()) });
				throw new LlmError(error.message, "INVALID_CREDENTIAL", { cause: error });
			}
			if (error instanceof AgyPoolBlockedError) {
				if (error.kind === "quota-exhausted") throw new LlmError(error.message, QUOTA_EXCEEDED_CODE);
				const delta = Math.ceil(error.blockedUntil - Date.now());
				const providerRetryAfterMs = Number.isFinite(delta) && delta > 0 ? delta : 1;
				throw new LlmError(error.message, "RATE_LIMIT", {
					providerRetryAfterMs,
					requestId: ProviderRequestId(generateAntigravityRequestId())
				});
			}
			throw error;
		}
		if (!session) throw new LlmError("No agy account configured — run `dsh-agy login` to authenticate.", "NO_CREDENTIAL");
		const multimodalFiles = await resolveMultimodalFiles(options);
		const body = toAgyRequestBody(options, {
			projectId: session.account.projectId,
			sessionId: deriveAntigravitySessionId(session.account.email) ?? void 0,
			appendBehaviorInstruction: true,
			...images.size > 0 ? { images } : {},
			...multimodalFiles.size > 0 ? { multimodalFiles } : {}
		});
		const headers = buildRequestHeaders(session);
		let response;
		try {
			const routing = {
				proxyUrl: session.account.proxy,
				streaming: true
			};
			response = await fetchAgyFirstOk("/v1internal:streamGenerateContent?alt=sse", {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: options.signal
			}, accountFetch(routing), routing);
		} catch (error) {
			const classified = classifyFetchError(error, { proxyUrl: session.account.proxy });
			await this.options.reportFailure(classified.kind, session);
			throw new LlmError(classified.message ?? "agy fetch failed", "TRANSPORT", { cause: error });
		}
		if (!response.ok) {
			const bodyText = await response.text().catch(() => void 0);
			const classified = classifyHttpError(response.status, response.headers, bodyText);
			await this.options.reportFailure(classified.kind, session, {
				retryAfterMs: classified.retryAfterMs,
				status: response.status,
				rateLimitCategory: classified.rateLimitCategory,
				resetTime: classified.resetTime,
				model: options.model
			});
			if (classified.kind === "rate-limit") {
				if (classified.rateLimitCategory === "quota_exhausted") throw new LlmError(`agy daily quota exhausted (${response.status}): ${classified.message ?? ""}`, QUOTA_EXCEEDED_CODE);
				throw new LlmError(`agy rate-limited (${response.status}): ${classified.message ?? ""}`, "RATE_LIMIT", {
					providerRetryAfterMs: classified.retryAfterMs ?? void 0,
					requestId: ProviderRequestId(generateAntigravityRequestId())
				});
			}
			if (classified.kind === "auth-failure") throw new LlmError(`agy authentication failed (${response.status}) — run \`dsh-agy login\``, "INVALID_CREDENTIAL");
			if (classified.status !== void 0 && classified.status >= 500) throw new LlmError(`agy upstream error (${response.status}): ${classified.message ?? ""}`, SERVER_ERROR_CODE, {
				providerRetryAfterMs: classified.retryAfterMs ?? void 0,
				requestId: ProviderRequestId(generateAntigravityRequestId())
			});
			throw new LlmError(`agy upstream error (${response.status}): ${classified.message ?? ""}`, UPSTREAM_ERROR_CODE);
		}
		if (!response.body) throw new LlmError("agy stream returned no body", UPSTREAM_ERROR_CODE);
		try {
			yield* parseAgySse(response.body, {
				signal: options.signal,
				onToolSignature: (toolCallId, signature) => {
					setThoughtSignature(toolCallId, signature);
				}
			});
			await this.options.markSuccess?.(session);
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") throw new LlmError("agy stream aborted", "ABORTED", { cause: error });
			await this.options.reportFailure("network-error", session);
			throw new LlmError(error instanceof Error ? describeFetchError(error) : "agy stream parse failed", UPSTREAM_ERROR_CODE, { cause: error });
		}
	}
};
//#endregion
//#region src/plugin-common.ts
/**
* Shared runtime construction for the in-harness plugin entries: master-key
* codec resolution (credentials seam first, credentials document fallback),
* account store, session manager, and adapter. Used by the main plugin
* (adapter registration) and the web plugin (route registration) so both
* entries operate on the same store.
*/
function codecFrom(masterKey) {
	return createAesGcmCodec(deriveKey(masterKey));
}
/** Resolve or create the master key, preferring the credentials seam when available. */
async function resolveCodec(ctx) {
	const dshHome = resolveDshHome();
	const credentials = ctx.get("credentials");
	if (credentials) {
		const resolved = await credentials.resolve(MASTER_KEY_REF);
		if (resolved) return {
			codec: codecFrom(resolved.value),
			created: false
		};
		const fileKey = loadMasterKey(dshHome);
		if (fileKey) return {
			codec: codecFrom(fileKey),
			created: false
		};
		const fresh = randomBytes(32).toString("hex");
		try {
			await credentials.set(MASTER_KEY_REF, fresh);
			return {
				codec: codecFrom(fresh),
				created: true
			};
		} catch {
			persistMasterKey(dshHome, fresh);
			return {
				codec: codecFrom(fresh),
				created: true
			};
		}
	}
	return resolveMasterKeyCodec(dshHome);
}
/** Build the store, session manager, and adapter for one plugin entry. */
async function createAgyRuntime(ctx) {
	resolveAntigravityVersion().catch(() => {});
	const { codec } = await resolveCodec(ctx);
	const dshHome = resolveDshHome();
	const store = new JsonAccountStore({
		file: `${dshHome}/agy-accounts.json`,
		codec
	});
	const sessions = new AgySessionManager({ store });
	const healthIntervalMs = Number(process.env.DSH_AGY_HEALTH_INTERVAL_MS ?? 0);
	if (Number.isFinite(healthIntervalMs) && healthIntervalMs > 0) sessions.startHealthProbe(healthIntervalMs);
	return {
		store,
		sessions,
		adapter: new AgyAdapter({
			getSession: (model) => sessions.getSession(model),
			reportFailure: (kind, session, info) => sessions.reportFailure(kind, session, info),
			markSuccess: (session) => sessions.markSuccess(session),
			resolveAttachments: () => ctx.get("attachments")
		})
	};
}
//#endregion
export { createAgyRuntime as t };

//# sourceMappingURL=plugin-common-CLXsvFaD.mjs.map