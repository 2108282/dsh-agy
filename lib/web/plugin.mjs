import { p as currentAgyVersion } from "../constants-Db4tmyfb.mjs";
import { i as normalizeProxyUrl, n as isProxyReachable, s as proxyUrlForLogs } from "../proxy-DfaL73mL.mjs";
import { a as generateFingerprint, i as isAgyDisabled, l as clearExpiredState, n as maskProxyUrl, o as recordFingerprintVersion } from "../accounts-D0KoucnO.mjs";
import "../models-BGuwl50d.mjs";
import { a as THINKING_BUDGET_MAX, i as CLAUDE_BUDGET_MIN, n as foldWindowBreakdown, r as CLAUDE_BUDGET_MAX, t as createAgyRuntime } from "../plugin-common-CxG_kP7j.mjs";
import { t as exchangeAntigravity } from "../exchange-yZPIZumk.mjs";
import { n as upsertImportedAccount, r as authorizeAntigravity, t as importManySources } from "../import-BaFULQnH.mjs";
//#region src/web/management.ts
/**
* agy management API: one method dispatcher shared by the RPC transport.
*
* Every method is a pure `(payload) => result` function so the transport stays
* thin and the handlers stay testable without HTTP. Failures throw; the
* transport converts a thrown error into the RPC failure envelope.
*
* This module owns the OAuth pending-authorization state because `auth.url`
* issues it and the callback route consumes it — they must share one map, and
* splitting them would let a verifier and its callback drift apart.
*/
/** Fail one RPC with a message the UI can show verbatim. */
function fail(message) {
	throw new Error(message);
}
function asIndex(payload) {
	const index = Number(payload?.index);
	if (!Number.isInteger(index) || index < 0) fail("invalid index");
	return index;
}
/**
* Flatten one account's ledger entry for transport.
*
* `models` and `lastUsedAt` are deliberately NOT carried: the per-model table
* that read `models` was removed (the cumulative metric strip states the same
* figures better), and the `lastUsedAt` ordering rule went with it. Sending
* fields no client reads is a wire surface with no consumer, which reads as
* intentional to the next person and invites a stale assumption.
*/
function toAccountUsageView(usage) {
	if (usage === void 0) return null;
	return {
		totals: usage.totals,
		sources: usage.sources
	};
}
function createAgyManagement(options) {
	const { store, sessions, stats, modelVisibility, listAllModels, baseUrl, notifyModelsChanged } = options;
	const thinkingBudget = options.thinkingBudget;
	/** Authorizations issued by `auth.url`, keyed by raw state. */
	const pendingAuth = /* @__PURE__ */ new Map();
	const PENDING_AUTH_TTL_MS = 6e5;
	const prunePendingAuth = (now = Date.now()) => {
		for (const [key, entry] of pendingAuth) if (entry.expiresAt <= now) pendingAuth.delete(key);
		while (pendingAuth.size > 100) {
			let oldestKey = null;
			let oldestExpiry = Infinity;
			for (const [key, entry] of pendingAuth) if (entry.expiresAt < oldestExpiry) {
				oldestExpiry = entry.expiresAt;
				oldestKey = key;
			}
			if (oldestKey === null) break;
			pendingAuth.delete(oldestKey);
		}
	};
	const listAccounts = async () => {
		const storage = await store.load();
		const now = Date.now();
		for (const account of storage.accounts) clearExpiredState(account, now);
		const ledger = stats.snapshot();
		const rows = [];
		for (const [index, account] of storage.accounts.entries()) {
			const state = account.enabled === false ? "disabled" : account.verificationRequired === true ? "verification-required" : account.coolingDownUntil !== void 0 && account.coolingDownUntil > now ? "cooling" : "active";
			const key = account.email ?? account.id;
			rows.push({
				index,
				email: account.email ?? null,
				projectId: account.projectId ?? null,
				active: index === storage.activeIndex && account.enabled !== false,
				state,
				cooldownUntil: account.coolingDownUntil !== void 0 && account.coolingDownUntil > now ? new Date(account.coolingDownUntil).toISOString() : null,
				cooldownReason: account.cooldownReason ?? null,
				cooldownSetAt: account.cooldownSetAt === void 0 ? null : new Date(account.cooldownSetAt).toISOString(),
				/**
				* Appeal link from an upstream verification challenge. Surfaced, never
				* followed automatically: only the account owner can complete it, and the
				* account returns to service on its own once the wall clears.
				*/
				verificationUrl: account.verificationUrl ?? null,
				verificationRequired: account.verificationRequired === true && account.enabled !== false,
				rateLimits: account.rateLimitResetTimes ?? null,
				fingerprint: account.fingerprint ? {
					userAgent: account.fingerprint.userAgent,
					deviceId: account.fingerprint.deviceId,
					createdAt: account.fingerprint.createdAt
				} : null,
				fingerprintHistory: (account.fingerprintHistory ?? []).length,
				proxy: account.proxy ? maskProxyUrl(account.proxy) : null,
				limits: account.cachedLimits?.groups ?? null,
				limitsUpdatedAt: account.cachedLimits?.updatedAt ?? null,
				usage: key === void 0 ? null : toAccountUsageView(ledger.accounts[key])
			});
		}
		return rows;
	};
	/** Fold the ledger into the Usage tab's view. */
	const statsView = () => {
		const doc = stats.snapshot();
		const now = Date.now();
		const byModel = /* @__PURE__ */ new Map();
		for (const usage of Object.values(doc.accounts)) for (const [model, counters] of Object.entries(usage.models)) {
			const current = byModel.get(model);
			if (current === void 0) byModel.set(model, { ...counters });
			else for (const key of Object.keys(current)) current[key] += counters[key];
		}
		const allModels = [...byModel.entries()].map(([model, counters]) => ({
			model,
			counters
		})).sort((a, b) => b.counters.requests - a.counters.requests);
		const allAccounts = Object.entries(doc.accounts).map(([account, usage]) => ({
			account,
			counters: usage.totals
		})).sort((a, b) => b.counters.requests - a.counters.requests);
		const breakdown = (days) => {
			const { totals, models, accounts } = foldWindowBreakdown(doc, days, now);
			return {
				counters: totals,
				models,
				accounts
			};
		};
		return {
			since: doc.totals.requests > 0 ? doc.since : null,
			all: {
				counters: doc.totals,
				models: allModels,
				accounts: allAccounts
			},
			today: breakdown(1),
			week: breakdown(7),
			month: breakdown(30)
		};
	};
	const methods = {
		"account.list": async () => ({ accounts: await listAccounts() }),
		"account.activate": async (payload) => {
			const index = asIndex(payload);
			await store.mutate((storage) => {
				if (index >= storage.accounts.length) fail("account not found");
				storage.activeIndex = index;
			});
			return {
				ok: true,
				index
			};
		},
		"account.delete": async (payload) => {
			const index = asIndex(payload);
			await store.mutate((storage) => {
				if (index >= storage.accounts.length) fail("account not found");
				storage.accounts.splice(index, 1);
				if (storage.activeIndex >= storage.accounts.length) storage.activeIndex = 0;
			});
			return { ok: true };
		},
		"account.verify": async (payload) => sessions.verifyAccount(asIndex(payload)),
		"account.health": async (payload) => {
			const raw = payload?.indices;
			const indices = Array.isArray(raw) ? raw.map((value) => Number(value)) : void 0;
			return { results: await sessions.checkAccounts(indices) };
		},
		/**
		* Refresh and return the 5h/weekly windows for every enabled account.
		*
		* A SEPARATE call rather than a field on `account.list`, because that reply
		* is deliberately probe-free (see the note above its return): folding an
		* upstream call into it made the whole accounts+usage view wait on the
		* network and show "no accounts" behind a spinner. Here the client renders
		* the list from `account.list` immediately and merges these in when they
		* arrive, so a slow probe costs a placeholder, not the page.
		*
		* Server-side this is TTL-gated, so the upstream call happens at most once
		* per window rather than once per view. `force` bypasses that gate for an
		* EXPLICIT refresh — without it the toolbar's Refresh button could not
		* deliver "the latest numbers now", which is the only reason to click it
		* while the snapshot is still inside its TTL.
		*/
		"account.limits": async (payload) => {
			const force = payload?.force === true;
			const storage = await store.load();
			const result = await sessions.refreshLimits(storage, { force }).catch(() => ({
				measured: [],
				failed: [],
				skipped: 0
			}));
			return {
				limits: (await store.load()).accounts.map((account, index) => ({
					index,
					groups: account.cachedLimits?.groups ?? null,
					updatedAt: account.cachedLimits?.updatedAt ?? null
				})),
				measured: result.measured.length,
				failed: result.failed.length,
				skipped: result.skipped
			};
		},
		"account.test": async (payload) => {
			const model = payload?.model;
			if (typeof model !== "string" || model === "") fail("model is required");
			const rawIndex = payload?.index;
			return sessions.testCall(model, { ...rawIndex === void 0 ? {} : { accountIndex: asIndex(payload) } });
		},
		"account.export": async (payload) => sessions.exportBlob(asIndex(payload)),
		"account.exportAll": async () => {
			const storage = await store.load();
			const blobs = [];
			for (let index = 0; index < storage.accounts.length; index++) {
				const result = await sessions.exportBlob(index);
				if (result.blob !== void 0) blobs.push({
					index,
					blob: result.blob
				});
			}
			return { blobs };
		},
		"account.import": async (payload) => {
			const body = payload;
			const kind = body?.kind === "blob" ? "blob" : "json";
			const sources = Array.isArray(body?.sources) ? body.sources : [];
			if (sources.length === 0) fail("nothing to import");
			const result = await importManySources(sources.map((source) => ({
				source,
				kind
			})), store, { overwriteExisting: true });
			return {
				imported: result.imported,
				replaced: result.replaced,
				errors: result.errors.map((error) => String(error))
			};
		},
		"account.fingerprint": async (payload) => {
			const index = asIndex(payload);
			const action = payload?.action === "regenerate" ? "regenerate" : "show";
			return store.mutate(async (storage) => {
				const account = storage.accounts[index];
				if (!account) fail("account not found");
				if (action === "regenerate") {
					const fresh = generateFingerprint(void 0, currentAgyVersion());
					account.fingerprint = fresh;
					account.fingerprintHistory = recordFingerprintVersion(account.fingerprintHistory, fresh, "regenerated");
				}
				return {
					action,
					fingerprint: account.fingerprint ? {
						userAgent: account.fingerprint.userAgent,
						deviceId: account.fingerprint.deviceId,
						createdAt: account.fingerprint.createdAt
					} : null,
					history: account.fingerprintHistory?.length ?? 0
				};
			});
		},
		"account.proxy": async (payload) => {
			const index = asIndex(payload);
			const raw = payload?.proxy;
			const proxy = typeof raw === "string" ? raw : "";
			if (proxy.trim() === "") {
				await store.mutate((storage) => {
					const account = storage.accounts[index];
					if (!account) fail("account not found");
					delete account.proxy;
				});
				return {
					ok: true,
					proxy: null,
					proxyMasked: null,
					rawLogs: null
				};
			}
			let normalized;
			try {
				normalized = normalizeProxyUrl(proxy);
			} catch (error) {
				fail(error instanceof Error ? error.message : String(error));
			}
			await store.mutate((storage) => {
				const account = storage.accounts[index];
				if (!account) fail("account not found");
				account.proxy = normalized;
			});
			return {
				ok: true,
				proxy: maskProxyUrl(normalized),
				proxyMasked: maskProxyUrl(normalized),
				rawLogs: proxyUrlForLogs(normalized)
			};
		},
		"account.proxyTest": async (payload) => {
			const body = payload;
			const hasExplicit = typeof body?.proxy === "string" && body.proxy.trim() !== "";
			let target;
			if (hasExplicit) try {
				target = normalizeProxyUrl(body.proxy);
			} catch (error) {
				fail(error instanceof Error ? error.message : String(error));
			}
			else {
				const index = asIndex(payload);
				const account = (await store.load()).accounts[index];
				if (!account) fail("account not found");
				if (!account.proxy) fail("no proxy configured for this account");
				target = account.proxy;
			}
			const masked = maskProxyUrl(target) ?? proxyUrlForLogs(target);
			try {
				const ok = await isProxyReachable(target, 2e3);
				return ok ? {
					ok,
					masked
				} : {
					ok,
					masked,
					error: `proxy unreachable: ${masked}`
				};
			} catch (error) {
				return {
					ok: false,
					masked,
					error: error instanceof Error ? error.message : String(error)
				};
			}
		},
		"auth.url": async () => {
			const authorization = await authorizeAntigravity(`${baseUrl}/agy/oauth-callback`);
			prunePendingAuth();
			pendingAuth.set(authorization.state, {
				verifier: authorization.verifier,
				expiresAt: Date.now() + PENDING_AUTH_TTL_MS
			});
			return { url: authorization.url };
		},
		"model.list": async () => {
			const session = await sessions.getSession().catch(() => void 0);
			if (session === void 0) fail("No agy account configured — run `dsh-agy login` first.");
			const models = await listAllModels();
			const hidden = modelVisibility.disabledFor("agy");
			const rows = models.map((model) => ({
				id: model.id,
				name: model.name,
				disabled: hidden.has(model.id)
			}));
			return {
				account: session.account.email ?? null,
				models: rows
			};
		},
		"model.setDisabled": async (payload) => {
			const body = payload;
			const modelId = body?.modelId;
			if (typeof modelId !== "string" || modelId === "") fail("modelId is required");
			const disabled = body?.disabled === true;
			modelVisibility.setDisabled("agy", modelId, disabled);
			notifyModelsChanged();
			return {
				modelId,
				disabled
			};
		},
		"thinking.get": async () => ({
			budgets: thinkingBudget.all(),
			min: -1,
			max: THINKING_BUDGET_MAX,
			tieredBudget: thinkingBudget.tiered() ?? null,
			claudeBudget: thinkingBudget.claude() ?? null,
			claudeMin: CLAUDE_BUDGET_MIN,
			claudeMax: CLAUDE_BUDGET_MAX
		}),
		"thinking.setTiered": async (payload) => {
			const raw = payload?.budget;
			if (raw !== void 0 && raw !== null && typeof raw !== "number") fail("budget must be a number");
			try {
				return { tieredBudget: thinkingBudget.setTiered(raw === void 0 || raw === null ? void 0 : raw) ?? null };
			} catch (error) {
				fail(error instanceof Error ? error.message : String(error));
			}
		},
		"thinking.setClaude": async (payload) => {
			const raw = payload?.budget;
			if (raw !== void 0 && raw !== null && typeof raw !== "number") fail("budget must be a number");
			try {
				return { claudeBudget: thinkingBudget.setClaude(raw === void 0 || raw === null ? void 0 : raw) ?? null };
			} catch (error) {
				fail(error instanceof Error ? error.message : String(error));
			}
		},
		"thinking.set": async (payload) => {
			const body = payload;
			const level = body?.level;
			if (typeof level !== "string" || level === "") fail("level is required");
			const raw = body?.budget;
			if (raw !== void 0 && raw !== null && typeof raw !== "number") fail("budget must be a number");
			const value = raw === void 0 || raw === null ? void 0 : raw;
			try {
				return { budgets: thinkingBudget.set(level, value) };
			} catch (error) {
				fail(error instanceof Error ? error.message : String(error));
			}
		},
		"stats.get": async () => statsView()
	};
	return {
		async call(method, payload) {
			const handler = methods[method];
			if (handler === void 0) fail(`unknown method: ${method}`);
			return handler(payload);
		},
		async handleCallback(params) {
			const code = params.get("code");
			const state = params.get("state");
			if (!code || !state) return {
				ok: false,
				error: "Missing code or state parameter"
			};
			const expected = pendingAuth.get(state);
			if (expected === void 0) return {
				ok: false,
				error: "Unknown or expired authorization — please start a new login."
			};
			pendingAuth.delete(state);
			const redirectUri = `${baseUrl}/agy/oauth-callback`;
			const result = await exchangeAntigravity(code, state, redirectUri, expected.verifier);
			if (result.type === "failed") return {
				ok: false,
				error: result.error
			};
			await upsertImportedAccount(store, {
				accessToken: result.access,
				refreshToken: result.refresh.split("|")[0],
				tokenType: "Bearer",
				expiresAt: new Date(result.expires).toISOString(),
				authMethod: "oauth",
				email: result.email ?? null,
				projectId: result.projectId || null,
				clientId: result.clientId || null
			}, { overwriteExisting: true });
			return {
				ok: true,
				email: result.email ?? null
			};
		}
	};
}
//#endregion
//#region src/web/i18n.ts
const I18N_DICT = {
	en: {
		loginSuccessTitle: "Sign-in Successful",
		loginSuccessDesc: "Your Antigravity account has been authorized and saved.",
		loginFailedTitle: "Sign-in Failed",
		windowClosing: "This window will close automatically in a moment..."
	},
	zh: {
		loginSuccessTitle: "授权登录成功",
		loginSuccessDesc: "Antigravity 账号已成功接入并保存。",
		loginFailedTitle: "授权登录失败",
		windowClosing: "此窗口即将在 2 秒内自动关闭..."
	}
};
//#endregion
//#region src/web/page.ts
/**
* Browser-facing HTML for the agy OAuth callback.
*
* This is the only page agy serves. The account/statistics dashboard that used
* to live at `/agy` is gone: that surface is now the Settings section rendered
* by `src/client/` over the `/api/agy` RPC, so there is no longer a second UI to
* keep in step with it.
*
* The callback stays a real page because Google redirects the browser here.
*/
/**
* Escape text for an HTML text/attribute position.
*
* Every interpolation below except the static markup is attacker-influenced or
* upstream-influenced: `error` is the token endpoint's raw response body, and
* `email` comes from Google's userinfo. This page is served by the SAME web
* server, and therefore the same origin, as the DSH GUI — so injected script
* here would run with the GUI's session and could reach `/api/agy`
* (`account.exportAll` returns live credential blobs). That chain is why the
* escaping matters more than the narrow trigger suggests.
*
* Text in markup goes through {@link escapeHtml}; text inside the inline
* `<script>` goes through {@link jsonForInlineScript}. Neither is optional.
*/
function escapeHtml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/**
* Serialize a value for interpolation into the inline `<script>`.
*
* `JSON.stringify` escapes for a JS string context only, NOT for the HTML script
* data state: it leaves `<` alone, so an email or error body containing
* `<\/script>` terminates the element early and everything after it is parsed as
* markup. Escaping the three HTML-significant characters as `\uXXXX` keeps the
* JSON value identical while making the byte sequence unrepresentable in the
* source. (The `JSON.stringify` output above is a valid JS string either way,
* because a `\u003c` escape and a literal `<` denote the same character.)
*/
function jsonForInlineScript(value) {
	return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function renderCallbackHtml(options) {
	const { ok, error, email, baseUrl } = options;
	const i18nJson = jsonForInlineScript(I18N_DICT);
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Antigravity Sign-in</title>
  <style>
    :root {
      color-scheme: light dark;
      --dsw-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      --bg-page: #0f1115;
      --bg-surface: #171a21;
      --border-l2: rgba(255, 255, 255, 0.12);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --brand-primary: #5686fe;
      --state-success: #34d399;
      --state-error: #f87171;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg-page: #f8fafc;
        --bg-surface: #ffffff;
        --border-l2: rgba(0, 0, 0, 0.12);
        --text-primary: #0f172a;
        --text-secondary: #475569;
        --brand-primary: #4176e6;
        --state-success: #22c55e;
        --state-error: #ef4444;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--dsw-font-family);
      background-color: var(--bg-page);
      color: var(--text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-l2);
      border-radius: 12px;
      padding: 24px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 24px;
    }
    .icon-success { background: rgba(52, 211, 153, 0.15); color: var(--state-success); }
    .icon-error { background: rgba(248, 113, 113, 0.15); color: var(--state-error); }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 13.5px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      height: 34px;
      padding: 0 16px;
      border-radius: 17px;
      border: 1px solid var(--border-l2);
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      text-decoration: none;
    }
    .btn:hover { background: rgba(128, 128, 128, 0.1); }
    .btn-primary { background: var(--brand-primary); color: #ffffff; border-color: transparent; }
  </style>
</head>
<body>
  <div class="card">
    ${ok ? `
      <div class="icon-wrap icon-success">✓</div>
      <h1 id="title">Sign-in Successful</h1>
      <p id="desc">Your Antigravity account ${email ? "<strong>" + escapeHtml(email) + "</strong> " : ""}has been authorized and saved.</p>
      <p style="font-size:12px;opacity:0.8;" id="closing">This window will close automatically...</p>
      <button class="btn" onclick="window.close()">Close Window</button>
    ` : `
      <div class="icon-wrap icon-error">✕</div>
      <h1 id="title">Sign-in Failed</h1>
      <p id="desc">Error details: ${escapeHtml(error || "Unknown error")}</p>
      <a class="btn btn-primary" href="${escapeHtml(baseUrl)}/">Return to Settings</a>
    `}
  </div>
  <script>
    const I18N = ${i18nJson};
    const lang = localStorage.getItem('agy_lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
    const dict = I18N[lang] || I18N.en;

    if (${ok ? "true" : "false"}) {
      document.getElementById('title').textContent = dict.loginSuccessTitle;
      // textContent, not innerHTML: an email containing markup must never be
      // parsed as HTML. The string itself is serialized for the script data
      // state by jsonForInlineScript, so it cannot terminate this element.
      document.getElementById('desc').textContent = dict.loginSuccessDesc + (${jsonForInlineScript(email ? " (" + email + ")" : "")});
      document.getElementById('closing').textContent = dict.windowClosing;
      
      // Notify parent window & close
      try {
        if (window.opener) {
          // Target this page's own origin rather than '*', so the message cannot
          // be delivered to an unrelated opener.
          window.opener.postMessage({ type: 'agy_login_success' }, window.location.origin);
        }
      } catch (e) {}
      setTimeout(() => {
        window.close();
      }, 1800);
    } else {
      document.getElementById('title').textContent = dict.loginFailedTitle;
    }
  <\/script>
</body>
</html>`;
}
//#endregion
//#region src/web/plugin.ts
const name = "dsh-agy-web";
/** The one service every composition provides; the rest are resolved lazily. */
const inject = ["llm"];
function apply(ctx) {
	if (isAgyDisabled()) {
		ctx.logger.warn("[dsh-agy] disabled by DSH_AGY_DISABLE=1 — skipping web registration");
		return;
	}
	ctx.inject(["webServer"], (webCtx) => {
		const webServer = webCtx.get("webServer");
		if (!webServer) return;
		webCtx.effect(() => registerAgyWeb(webCtx, webServer));
	});
}
/**
* Register the OAuth callback route, and the management RPC once `connection`
* appears.
* @param ctx - the web-server-bearing context (owns both registrations).
* @param webServer - the host web server.
* @returns disposer for every registration this function made.
*/
async function registerAgyWeb(ctx, webServer) {
	const webStartup = ctx.get("webStartup");
	const host = webStartup?.host ?? "127.0.0.1";
	const port = webStartup?.port ?? 3080;
	const bindHost = webServer.host ?? host;
	if (![
		"127.0.0.1",
		"localhost",
		"::1"
	].includes(bindHost)) {
		ctx.logger.warn("[dsh-agy] web server bound to \"" + bindHost + "\" (non-loopback): not registering the agy routes (they manage account credentials and must stay loopback-only). Bind the web server to 127.0.0.1 to enable them.");
		return () => {};
	}
	const { store, sessions, adapter, stats, modelVisibility, thinkingBudget } = await createAgyRuntime(ctx);
	const baseUrl = `http://${host}:${port}`;
	const management = createAgyManagement({
		store,
		sessions,
		stats,
		modelVisibility,
		thinkingBudget: {
			all: () => thinkingBudget.all(),
			set: (level, value) => thinkingBudget.setBudget(level, value),
			claude: () => thinkingBudget.claudeBudget(),
			setClaude: (value) => thinkingBudget.setClaudeBudget(value).claudeBudget,
			tiered: () => thinkingBudget.tieredBudget(),
			setTiered: (value) => thinkingBudget.setTieredBudget(value).tieredBudget
		},
		listAllModels: () => adapter.listAllModels(),
		baseUrl,
		notifyModelsChanged: () => {
			ctx.emit("llm/adapters-updated");
		}
	});
	const disposers = [];
	disposers.push(webServer.register({
		kind: "exact",
		path: "/agy/oauth-callback",
		handler: async (req, res) => {
			const url = new URL(req.url ?? "/", baseUrl);
			const result = await management.handleCallback(url.searchParams).catch((error) => ({
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			}));
			res.writeHead(result.ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
			res.end(result.ok ? renderCallbackHtml({
				ok: true,
				email: result.email ?? null,
				baseUrl
			}) : renderCallbackHtml({
				ok: false,
				error: result.error ?? "Unknown error",
				baseUrl
			}));
		}
	}));
	ctx.inject(["connection"], (connectionCtx) => {
		const connection = connectionCtx.get("connection");
		if (!connection || typeof connection.fetch?.register !== "function") {
			connectionCtx.logger.warn("[dsh-agy] connection.fetch unavailable — management RPC not registered");
			return;
		}
		connectionCtx.effect(() => connection.fetch.register({
			path: "/api/agy",
			methods: ["POST"],
			requestBody: "buffered",
			async fetch(request) {
				if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
				if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return new Response("content type must be application/json", { status: 415 });
				let message;
				try {
					message = await request.json();
				} catch {
					return new Response("body is not JSON", { status: 400 });
				}
				const rpcId = typeof message.rpcId === "string" ? message.rpcId : "invalid-request";
				const call = message.payload;
				if (message.type !== "client-request" || typeof message.rpcId !== "string" || typeof call?.method !== "string") return reply(rpcId, {
					ok: false,
					error: {
						code: "agy/bad-request",
						message: "Invalid agy management request."
					}
				});
				try {
					return reply(rpcId, {
						ok: true,
						value: await management.call(call.method, call.payload)
					});
				} catch (error) {
					const text = error instanceof Error ? error.message : String(error);
					connectionCtx.logger.warn(`[dsh-agy] ${call.method} failed: ${text}`);
					return reply(rpcId, {
						ok: false,
						error: {
							code: "agy/handler-failed",
							message: text
						}
					});
				}
			}
		}), "dsh-agy: /api/agy management RPC");
	});
	return () => {
		for (const dispose of disposers) dispose();
	};
}
/**
* Wrap one result in the Connection RPC response envelope.
*
* A failure MUST carry `error.details` as an object: the client's envelope
* parser rejects a failure without it as "invalid server-response", which hides
* the real message behind a transport-sounding error.
*/
function reply(rpcId, result) {
	const normalized = isFailure(result) ? {
		...result,
		error: {
			details: {},
			...result.error
		}
	} : result;
	return Response.json({
		type: "server-response",
		rpcId,
		result: normalized
	});
}
/** Whether one result is an RPC failure envelope. */
function isFailure(value) {
	return typeof value === "object" && value !== null && value.ok === false && typeof value.error === "object" && value.error !== null;
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=plugin.mjs.map