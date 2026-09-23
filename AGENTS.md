# AGENTS.md

dsh-agy: DeepSeek Harness plugin + standalone CLI providing Google Antigravity (agy)
OAuth, multi-account pool rotation, device fingerprinting, and the `agy` LLM provider.
To be published as an npm package. Product positioning is a grey-zone
tool (reusing the official client's quota machinery); Development uses pnpm (lockfile
`pnpm-lock.yaml`).

## Repository Layout

```
src/adapter/    DSH adapter: request translation (translate), SSE parsing (parse), model catalog (catalog/models)
src/oauth/      OAuth: authorize/PKCE, code exchange, refresh, paste-blob codec, endpoint constants
src/runtime/    State machine: 429 classification (classify), rotation decisions (rotation), fingerprints (fingerprint),
                session/request id (identity), thoughtSignature caching, version freshness (version)
src/store/      Account storage: encrypted JSON file (accounts, proper-lockfile), master key / keyring doc (keyring)
src/session.ts  Shared runtime glue: token caching, rotation execution, fingerprint lifecycle, verify/test/export
src/web/        Web plugin entry: management RPC (`/api/agy`) + OAuth callback route (loopback only)
src/client/     Inline Settings section (browser half): 4 tabs over the management RPC,
                UI primitives + bilingual dictionaries (locales.ts, styles.ts)
src/stats.ts    Cumulative usage ledger ($DSH_HOME/agy-stats.json)
src/model-visibility.ts  Hidden-model blacklist ($DSH_HOME/agy-models.json)
src/cli/        Standalone CLI (login/status/import/verify/logout) + loopback callback server
tests/          Vitest test suite: fixture-driven, zero network
docs/           Architecture & API facts (EN + zh); maintenance-oriented, not bundled in npm package
scripts/        Developer tools (record:fixtures / e2e / debug / verify) requiring live accounts or network
```

The two plugin entry points (`src/index.ts` main plugin, `src/web/plugin.ts` web plugin)
share the same store/session/adapter instances via `createAgyRuntime` (`plugin-common.ts`).

The management surface is an **inline Settings section**, not a standalone page: the
browser half (`src/client/`) calls the host over DSH's own RPC channel
(`connection.fetch.register('/api/agy')` on the host, `connection.rpc.call` in the
browser). Only the OAuth callback remains a plain HTTP route, because Google
redirects a browser to it with a GET.

## Non-negotiable Invariants (Violations are Regressions; all have test/code anchors)

- **Security (Loopback Trust Model)**:
  - The OAuth callback route has no authentication of its own and is ONLY allowed to register on loopback host bindings (`web/plugin.ts` gate). Management endpoints ride `/api/*`, which sits behind the host's browser-trust fence and BrowserAuth — that fence IS the defence, so a "confirm before export" parameter is deliberately absent: anything that can reach `/api/*` can already drive the Settings UI that exports the same blobs.
  - The callback page is served by the same web server, and therefore the same origin, as the DSH GUI, so anything injected into it can reach `/api/agy` (where `account.exportAll` returns live credential blobs). Every interpolation is escaped (`escapeHtml`), and inline-`<script>` payloads go through `jsonForInlineScript` — `JSON.stringify` alone escapes for a JS string, not for the HTML script-data state, so a value containing `</script>` still breaks out.
  - OAuth exchanges MUST bind to the exact PKCE verifier issued for that authorization attempt (`pendingAuth` Map in `web/management.ts`, local verifier in CLI); relaxing this verification is a security regression.
  - No request field or telemetry payload may ever transmit a raw refresh token — `sessionId` must be a derived identifier.
  - `~/.dsh/.credentials.yaml` is a version-1 (`refs:` / `records:`) YAML document owned by DSH's credentials provider, and `AGY_MASTER_KEY` MUST nest under `refs` — the provider rejects any other top-level key, which makes every credential in the file unreadable.
  - The credentials document may ONLY be rewritten by parsing + editing + atomic replacement (`persistMasterKey`); rebuilding it from a partial view wipes other services' credentials.
  - Reading it MUST go through a real YAML parse (`readCredentialsDocument`), because values are folded across physical lines and a `records` payload can otherwise shadow a top-level name.
  - Read-only CLI commands (`status`, `verify`, `logout`) must NEVER create a master key or credential document if one does not exist.
  - Every write of credential material is owner-only (`0600`) — the store, the master key, and the CLI's exported blobs (`writeBlobFile`); a `writeFileSync` with no `mode` lands at the umask default (0644) and is world-readable.
  - The store master key is 32 bytes of CSPRNG output (`randomBytes(32)`) and deliberately NOT stretched by a KDF: a work factor defends low-entropy input, and there is no passphrase or env-supplied path. Adding one is void the moment such a source appears — then the KDF becomes mandatory in the same commit.
- **Usage Ledger (`stats.ts`)**:
  - `record()` is the generation hot path and MUST stay I/O-free; writes are merged under a file lock in `flush()`, because a plain overwrite drops counts another process (Desktop / web server / CLI) wrote in the meantime.
  - Counter semantics deliberately differ from DSH's: DSH replaces a step's usage (a retried attempt counts once, for conversation cost), while this ledger accumulates per attempt — every retry really did consume quota, which is what an account-level view must show.
  - A rotation is recorded as a `poolEvent`, never as a request: the adapter has already recorded the failing request, so counting it again inflates it.
  - `totals` never expires (all-time); `days` keeps a rolling `DAY_WINDOW`. A day leaving the window loses granularity only — its counts already live in `totals`.
  - The ledger MUST NOT store raw tokens, proxies, or project ids (account emails only).
  - A ledger that cannot be written MUST fail soft AND stay bounded: the pending backlog is capped (`maxPending`), count-based flushing is suspended while writes fail (otherwise every `record()` becomes a synchronous flush, breaking the I/O-free rule above), and the first error of each failure run is reported once through `onFlushError`. A silent, unbounded ledger is the regression.
- **Client Presentation (`src/client/`)**:
  - Follows DSH's own styling contract (deepseek-harness `docs/web-styling.md`): `--dsw-alias-*` semantic tokens only, typography through the theme's role variables (`--dsw-font-*`, which carry size+line-height+weight together), and neutral solid borders at `0.5px`. Hand-picked px/weight pairs drift from the host's scale and are a regression.
  - Controls come from the `@deepseek-ai/dsh-client-ui-primitives` catalog, which the shell shares into the frozen module table (`packages/client/web/src/platform.ts`). The package must stay in `dsh.client.external` and in the tsdown `external` list, or the bundle inlines a second copy that cannot see the host theme.
  - All copy goes through the `agy` locale namespace (`locales.ts`); the `zh` dictionary is the key source of truth, and a test enforces zh/en key and placeholder parity **plus** that no key is unused and no CJK literal appears outside the dictionaries.
  - A destructive store write is never behind an empty input: an empty proxy draft used to reach `account.proxy`, whose empty string means "delete the proxy", so Save silently cleared it. Clearing is its own explicit action.
  - The account list and its detail panel are a two-column master/detail (`agy-split`); stacking them pushed the opened detail below the fold.
  - The devDependency on `@deepseek-ai/dsh-client-ui-primitives` is pinned to the generation the Desktop host bundles (`^0.1.5-rc.1`); an older range resolves to types that predate `Switch`/`Tag`/`Pill`.
- **Model Visibility (`model-visibility.ts`)**:
  - Blacklist, never whitelist: only explicitly disabled models are hidden, so a model the server adds later still appears.
  - `AgyAdapter.listModels()` applies the filter (that is what hides a model from the DSH selector); `listAllModels()` MUST stay unfiltered, because the settings list is the only place a hidden model's switch can be turned back on.
  - `disabledFor()` MUST revalidate against the file mtime. The main plugin and the web entry each build their own instance in ONE process, and the toggle is written by the web instance while the model selector reads the main one — without the check the switch appears broken until the host restarts.
  - Persisted to agy's own JSON, not a `ctx.settings` namespace: that service requires a `@deepseek-ai/schemastery` schema, and the CLI must not import any `@deepseek-ai/*` package at runtime.
- **Management RPC (`web/management.ts`)**: a mutation that names an account (test call included) MUST carry its index end to end. Dropping it made "Test call" probe whichever account affinity picked and report the result as that row's.
- **Classification Semantics**:
  - HTTP 403 responses containing quota / `RESOURCE_EXHAUSTED` phrasing MUST be classified as rate-limit (cooldown). Treating all 403s as auth-failures would permanently disable healthy accounts. Only true auth failures trigger account revocation, and a successful `verify` automatically re-enables the account. A 403 naming `VALIDATION_REQUIRED` is a third case: it parks the account for `VERIFICATION_COOLDOWN_MS` without disabling it and surfaces the appeal URL, and no `providerRetryAfterMs` may accompany it.
  - Generic 400s are `request-error` (terminal — retrying resends the same broken payload, no rotation); only capacity-style 400s (context overflow / model unavailable) are transient.
  - `isProxyUnreachableError` is context-free: `ECONNRESET`/`UND_ERR_SOCKET`/`ETIMEDOUT` describe *the connection*, not *which* connection. Fail-closed (skip the account, don't cool it; don't retry the next endpoint) applies ONLY when an explicit per-account proxy is in play — without one these are ordinary network errors, and treating them as proxy failures reported healthy accounts as dead proxies. Every call site threads its routing context (`classifyFetchError(err, routing)`, `fetchAgyFirstOk(..., routing)`).
  - A transport failure's actionable code lives on `error.cause` (`TypeError: fetch failed` → `cause.code = UND_ERR_SOCKET`); it must be surfaced via `describeFetchError()` and never leaked unredacted (proxy `user:pass` is stripped, splitting the authority at its LAST `@` so a password containing `@` is redacted whole — `redact.ts`'s scheme-less pass obeys the same rule, since a rejected proxy URL is exactly the input that does not parse). `LlmFailure` has no `cause` field, so the sanitized cause belongs in the message.
  - A stream that dies mid-body stays `UPSTREAM` (terminal), NOT `TRANSPORT`: content may already be emitted, and DSH retries `TRANSPORT`, which would replay a partially-delivered turn. The account-level `reportFailure('network-error')` absorbs the transient case instead.
- **Proxy Routing**:
  - Every account-scoped request (generation, test call, model/quota discovery, project healing, import enrichment, login-time exchange) MUST route through `accountFetch(routing)`; omitting it silently falls back to the env/direct route and leaks the account's real IP. `AccountRouting.proxyUrl` is the single source of truth, so routing and failure classification cannot disagree.
  - Streaming uses a separate dispatcher class (`streaming: true`, `bodyTimeout: 0`): `bodyTimeout` is a per-*gap* inactivity timer, so the 30s control-plane value kills a reasoning pause mid-turn. `keepAliveTimeout: 1` is deliberately NOT loosened — undici applies it only when `pipelining` is non-zero, and `pipelining: 0` resets every connection, so it is inert.
  - `normalizeProxyUrl` MUST stay idempotent: a stored proxy URL is normalized again on every request, so non-idempotent encoding compounds (`p@ss` → `p%2540ss` → …) until proxy auth fails. `URL.username`/`password` return percent-ENCODED substrings, so decode before re-encoding.
  - The CLI threads `--proxy` through login AND import enrichment (verified: `importManySources` normalizes it into `enrichWithAntigravityBackend`), but the WEB login/import flow has no proxy context at all and therefore goes direct — recorded as a non-goal rather than half-built, since there is no account to bind a proxy to at that point.
  - A proxyless account's transient transport failure falls over to the next enabled account WITHOUT a cooldown (a cooldown would surface as `AgyPoolBlockedError` → `RATE_LIMIT` for a plain network error); when every account fails this way the real error is rethrown rather than degrading into `NO_CREDENTIAL`.
- **Upstream Wire Facts** (`docs/ANTIGRAVITY-API.md`, verified empirically):
  - The endpoint fallback order `daily -> prod -> daily-sandbox -> autopush` is load-bearing.
  - HTTP 403 on the autopush endpoint for consumer accounts indicates "no license" (not credential failure).
  - Client identity travels in the request BODY, not in a header. The message is `google.internal.cloud.code.v1internal.ClientMetadata` and the FIELD that carries it is `metadata` (evidenced on `LoadCodeAssistRequest`, `OnboardUserRequest`, `RecordCodeAssistMetricsRequest`); the snake_case name `client_metadata` occurs zero times in the official binary. `Client-Metadata` as a HEADER name is absent from both official binaries and must never be re-added.
  - The old rule "`metadata` must only transmit `ideType`" is VOID, and was a misreading of a real measurement: the live `INVALID_ARGUMENT` was on the VALUE `"MACOS"`, which is not a member of the `Platform` enum. `platform` takes the enum NAME (`DARWIN_ARM64`) — a different vocabulary from the UA's `darwin/arm64` token, and conflating the two is what produced `"MACOS"`. Full enums are in `docs/official-identity.json`.
  - Only fields with a captured vocabulary may be sent (`ideType`, `ideVersion`, `platform`): an absent field is merely incomplete, a wrong one is a new anomaly. Those three are MEASURED accepted (200) on `loadCodeAssist` — `pnpm run verify:metadata-acceptance` re-runs it with the legacy `{ ideType }` body as a control, so a future rejection is attributable to the added fields rather than blamed on the credentials. `dsh-agy verify` cannot answer this question: it only refreshes the token and calls `userinfo`, never the Cloud Code backend.
  - `maxOutputTokens` ceilings are model-family-specific and measured, never derived from Anthropic/Google public limits: this channel rejects the Claude family above 64000 (64001 → 400 `INVALID_ARGUMENT`) while Gemini accepts 65536. Since `catalog.ts` `maxOutputTokens` becomes the harness-injected `defaultMaxTokens`, an over-cap Claude value fails every Claude request; `AGY_CLAUDE_MAX_OUTPUT_TOKENS` in `translate.ts` clamps explicit `maxTokens` too, and `pnpm run verify:claude-cap` re-measures the boundary.
  - The Claude path runs an Anthropic-backed validator that is stricter than Gemini's about `contents[]` parts (errors name the exact part as `messages.N.content.M`, so read them before bisecting): empty text parts and replayed thought blocks are dropped in `translate.ts` (a thought can only be re-signed by its own model), and every `functionResponse` carries the tool-call id. `pnpm run verify:claude-parts` re-measures all three; the raw-shape baselines in it are red-capable, so a passing run is not vacuous.
- **Version Freshness**:
  - The fingerprint User-Agent version is resolved dynamically via `version.ts` (750ms timeout ceiling + 6-hour cache + warm-up on boot).
  - `fingerprint-data.json` is compiled into the bundle; user hot-updates use the `$DSH_HOME/agy-fingerprint-data.json` override file.
  - `AGY_VERSION_FALLBACK` and `versionPool` are only for the unreachable-feed case, and they rot silently: `pnpm run verify:version-freshness` (`freshness.yml`, weekly) fails when either trails the live feed by more than one minor. No User-Agent builder may carry a version literal of its own, and a newly created fingerprint never takes `generateFingerprint`'s random pool default — it is frozen for the account's life.
  - **One product line, one namespace.** This client claims the **CLI** (`docs/official-identity.json`), so the resolver reads the CLI feed ONLY. Taking the numeric max across the IDE and CLI feeds is a category error — the lines are disjoint (IDE `2.x`, hub `2.15.x`, CLI `1.2.x`) — and it advertised whichever line counted higher. `resolveObservedAgyVersion` therefore reads the CLI feed; the IDE resolver stays exported for the freshness gate's cross-check and never for the wire.
  - The platform is PINNED, and the rationale is now measured rather than inherited: `ClientMetadata.Platform`'s official enumeration is `PLATFORM_UNSPECIFIED | DARWIN_AMD64 | DARWIN_ARM64 | LINUX_AMD64 | LINUX_ARM64 | WINDOWS_AMD64`, so Go-style tokens ARE the official vocabulary for that field. The removed `windows/amd64` / `darwin/amd64` entries were removed for the UA's *token* pool, which is a separate and still-uncaptured vocabulary — do not re-derive one from the other.
  - The freshness gate also cross-checks the separate `antigravity-hub` updater line and WARNS when it disagrees, because which line the backend validates is unproven — do not "fix" the fallback to the hub value without the A/B measurement described in the gate's output.
  - The release feeds belong to no account but their request still egresses HOST: the boot probe goes through the pool's representative account (`pickProbeProxyUrl`), the rate-limit fingerprint path through the FAILING account's proxy, and the CLI through the login proxy — all via `probeFetch`, never a bare env/direct route.

## Commands

```sh
pnpm install                 # Development install; CI uses --frozen-lockfile
pnpm test                    # Vitest: fixture-driven, zero network
pnpm run typecheck           # tsc --noEmit
pnpm run build               # tsdown -> lib/ (four entrypoints: index / cli / web / client)
npm pack --dry-run           # Verify packaged files before release (npm ships with Node)
```

## Testing Conventions

- **Zero Network in Tests**: Any `fetch` call in unit tests MUST be stubbed (`vi.stubGlobal`). Real HTTP requests are only permitted in `scripts/` validation scripts. Any test touching the real network is invalid.
- `tests/*.test.ts` mirrors modules in `src/`. **Behavioral changes must update tests in lockstep** ("tests describe behavior, not correctness"). When adjusting classification, rotation, or fingerprint semantics, review what is pinned in runtime/session tests first.
- `tests/fixtures/recorded/` is gitignored. Re-recording uses `pnpm run record:fixtures` (requires a real account), and resulting diffs must be reviewed carefully.

## Scripts and CI/CD

- `scripts/` contains developer tools (`record:fixtures`, `e2e`, `debug:request`, `verify:tools`, `verify:blocks`, `verify:claude-cap`, `verify:claude-parts`, `verify:proxy-routing`, `verify:version-freshness`, `verify:official-identity`, `verify:metadata-acceptance`), **all requiring real accounts or network access**. They are not part of routine dev loops, are not packaged into npm, and are not run in CI. `scripts/unfold-credentials.mjs` is the exception: a standalone stopgap for the published 0.2.7 reader, run directly with node.
- `ci.yml` (runs on every PR and push to `main`): 3 OS (Ubuntu / Windows / macOS) × 2 Node versions (22 / 24; pnpm 11 requires 22.13+) -> pnpm install -> test -> typecheck -> build -> `npm pack --dry-run` -> **tarball smoke test** (installs into a clean temp directory and verifies CLI `--help`, `import('dsh-agy')`, and `import('dsh-agy/web')`).
- `freshness.yml` (weekly cron + manual dispatch): runs `verify:version-freshness` and opens or updates ONE issue on failure. Deliberately scheduled rather than per-PR — agy ships without a PR here — and alert-only, because bumping the version needs a human to confirm the release.
- Package contents gate: `package.json` `files` only contains `lib/`, `bin/`, `cordis.patch.yml`, `README.md`, `LICENSE`. Adding a new entrypoint requires updating `tsdown.config.ts`, `exports`, and `files` simultaneously.
- `publish.yml` (triggered on `v*` tag push or manual dispatch): test -> build -> `npm publish` (requires `NPM_TOKEN` secret) -> GitHub Release. **Releases are made via `npm version patch|minor|major` + git tag push; do not run manual `npm publish`**.

## Conventions and Pitfalls

- ESM + `.ts` relative imports; new entrypoints must update `tsdown.config.ts`, `package.json` `exports`, and `files`.
- **CLI Entrypoint (`src/cli/`) MUST NOT import any `@deepseek-ai/*` packages at runtime** — this fulfills the `peerDependenciesMeta` optional contract. Indirect imports via shared chunks (`session.ts`) also break this guarantee. Always verify the CLI bundle has zero harness runtime dependencies.
- The version string is only defined in `package.json` (read at CLI runtime, see `src/cli/index.ts`).
- `lbjlaq/Antigravity-Manager` is comparison material ONLY: it is CC BY-NC-SA 4.0, which is incompatible with this MIT package and with npm publishing, so no code, comment, or constant may be transcribed from it — read it, then write the equivalent from the measured upstream behaviour.
- `AGY_CLIENT_ID` and `AGY_CLIENT_SECRET` are **public client credentials** embedded in the Antigravity desktop application; they are not project secrets — do not "fix" them by deletion or obfuscation.
- Upstream tool-schema 400s are fixed by extending the contract (`sanitizeToolSchema` + a fixture test), never by one-off keyword patches — contract, values, and corpus are pinned in `docs/ANTIGRAVITY-API.md` §3.1.
- **Session affinity**: `AgySessionManager` pins requests to the last-used account for `SESSION_AFFINITY_WINDOW_MS`. Rotation clears the pin. The window is an affinity heuristic only — it is NOT what preserves upstream cache hits (`docs/ANTIGRAVITY-API.md` measures the cache as prefix-keyed, independent of `sessionId`), and it is NOT a stand-in for a conversation id: `GenerateOptions.sessionId` carries one.
- **Account selection**: the per-account in-flight cap (`MAX_IN_FLIGHT_PER_ACCOUNT`) is a PREFERENCE that spreads genuine fan-out, never a gate — a request must not stall when every account is saturated, which is why a saturated pool falls back to plain ranking.
- **Conversation identity**: the upstream accumulates a conversation's input server-side per `sessionId`, so `deriveAntigravitySessionId(account, conversation, generation)` derives it from all three — `String(options.sessionId)` is the conversation (the DSH agent loop stamps it on every loop-built request), and the generation counter is bumped to escape the 1M accumulation 400 (`isSessionAccumulationOverflow`). Omitting the conversation degrades to the per-account id for the standalone CLI. All three components are load-bearing: dropping the conversation made every conversation on one account share an upstream session.
- **Model catalog (AGY)**: `src/adapter/catalog.ts` is the capability source; `v1internal:fetchAvailableModels` is the liveness source. For tiered selectable-thinking models (`*-tiered` → `low/medium/high`) dynamic inference is allowed: `catalogModel()` synthesizes a `thinking:'level'` entry (1M context, vision, `formatTieredModelName()` for display) and `isLevelThinkingModel()` returns true for any `*-tiered` so `translate.ts` auto-exposes `reasoning`/`generationConfig.thinkingConfig` without per-model logic change; still pin one `AGY_PUBLIC_MODELS` entry per released tiered model for offline fallback (e.g. `gemini-3.8-flash-tiered`). Legacy id-bound ids stay without `thinking`.
- Commit messages follow Conventional Commits (`fix(scope): ...`, `feat(scope): ...`).
- The `@deepseek-ai/dsh-llm` peer range must cover what the DSH host actually bundles (Desktop currently `^0.1.5-rc.1`) — the npm `latest` tag trails it, so registry `latest` is not the reference.
- `AgyAdapter` must NOT re-declare `prepareCall`: `LlmAdapter` supplies the default binding, and `noImplicitOverride` makes the `override` keyword a hard error against any pre-`0.1.1-rc.2` base — so overriding it would re-pin the peer range to a version the host no longer ships.
- Cross-version differences inside `dsh-llm` are handled at runtime (`ToolCallId ?? CallId` in `parse.ts`), never by widening the peer range to cover two incompatible type surfaces.
- `docs/` is not bundled with npm: links from `README.md` to `docs/` must resolve properly on GitHub.
- Docs are maintained as EN + zh mirrors (`docs/*_zh.md`); any update to one must update the other in the same commit. Temporary scoping/review documents are exempt (single-language, not linked from `README.md`, deleted once their work closes) — record the exemption here rather than leaving the rule and the file contradicting each other.
- Windows skips POSIX owner-only file permission checks by design (see `keyring.ts`); `$DSH_HOME` relocates all stored paths.

## DSH / Toolchain Pitfalls (from decommissioned ENGINEERING-NOTES)

- `ctx.get(name)` defaults to **strict**: returns `undefined` for services whose fiber isn't ACTIVE yet (webServer activates later than llm). Split a plugin entrypoint so it applies only once its injected deps are ACTIVE.
- **NEVER put a composition-specific service in the static `inject`.** A statically injected service that never appears leaves the entry permanently pending, and the loader treats a pending entry as a FAILED PROFILE, not a skipped one — `dsh-agy/web`'s static `webServer` broke `dsh-tui` startup outright (`1 entry did not activate`). Reach such services with `ctx.inject([...])` so a non-Web profile boots with the feature inert. `webServer`, `connection`, `webStartup`, and `attachments` all qualify.
- This Cordis fork has **no optional injection syntax** (`{required,optional}`) — optional deps must use `ctx.get` + timing checks.
- A profile's `file:` dependency is a **copy, not a symlink** — after changing source, re-sync with `rm -rf node_modules/<pkg> && pnpm install --offline` or the profile runs stale artifacts.
- A `file:` tarball install is keyed by its **path**, not its contents: rebuilding to the same filename makes pnpm report "Already up to date" and keep the previous build. Give each dev build a content-addressed name (`dsh-agy-<version>-dev.<sha>.tgz`) or the profile silently keeps running stale code.
- `proper-lockfile` throws ENOENT on a nonexistent target file — atomically pre-create the empty store document (0600, tmp+rename) before locking.
- `tsdown` `allowImportingTsExtensions` is mutually exclusive with `tsc` JS output (TS5096); JSON imports bundle directly into the mjs.
- `LlmError.code` drives DSH retry: the default retry policy only honors `RATE_LIMIT`/`SERVER`/`TIMEOUT`/`TRANSPORT`/`EMPTY_RESPONSE`; `QUOTA` is terminal. The adapter does **not** silent-retry — each call is one provider attempt.
- NEVER feed a local cooldown into `providerRetryAfterMs`: DSH's policy is `mode: 'normal'` with a 10s `maxDelayMs`, and `llm-retry` calls `next()` — giving up on the turn — when the value exceeds it. The account-level park is the cooldown; the retry is DSH's. Passing the UPSTREAM's own `Retry-After` through is deliberate even when it exceeds that cap: retrying sooner than the upstream asked, during a window it just asked us to wait out, is the more detectable shape.
- Branded types (e.g. `CallId`) must be constructed via their factory (`CallId()`), not cast.
- No client-identifying header is SYNTHESIZED beyond the impersonation set, and that set is now down to `User-Agent` + `X-Goog-Api-Client`: `x-client-name` / `x-client-version` / `x-machine-id` / `x-vscode-sessionid` (present in another implementation) were already absent, and `x-goog-request-id` + `Client-Metadata` were REMOVED because neither official binary contains them either — inventing a header's value is a new anomaly while a subset is merely incomplete. A capture of the official client is the only thing that should add one.
- **A reference object must be the product you claim to be AND re-measurable at will.** For this project that is the installed official artifact plus its release feed, recorded in `docs/official-identity.json` and re-checked by `pnpm run verify:official-identity`. `lbjlaq/Antigravity-Manager`, `router-for-me/CLIProxyAPI` and OmniRoute are LEADS, never references: they imitate three different products, contradict each other, and are frozen at the version they were written against.
- The official client's identity is parameterized PER AUTH PROVIDER (`codeassistclient.(*<X>AuthProvider).GetUserAgentName` / `.SetHTTPHeaders` / `.GetAuthMethod`, for X in CLI, Standalone, IDE, Host, AntigravityHub, Stubby, GeminiAPIKey), which is what makes "which product do we claim" a real question with a real answer — ours is the CLI. The CLI and hub providers build DIFFERENT header sets, so a header list borrowed from a hub-shaped client is wrong here.
- The CLI contains NO User-Agent builder: `Antigravity/` appears zero times; the `%s/%s (%s)` + `os_type=%s` pair that looks like a UA template is referenced by exactly one function, `codeassistclient.printDebugInfo`, i.e. it is a diagnostic FORMAT STRING. Our `antigravity/<ver> <platform>` UA is therefore unverified and must not be described as "the official client string"; `docs/official-identity.json` records the candidates and the capture recipe.
- `buildRequestHeaders` sends exactly ONE `User-Agent`, and it is the claimed client string (`antigravity/<ver> <platform>`, whose shape is unverified — see the identity record). The harness's `attributionHeaders()` is deliberately NOT merged in: it returns a lowercase `user-agent` while the impersonation object uses camel-case, so spreading both produced two properties that `fetch` folded into one comma-joined header naming this tool on every request. `tests/adapter.test.ts` asserts the wire value, not the intermediate object.
- A success page's keep-alive connection can hang `server.close()` — send `connection: close` + call `closeAllConnections()`.

## Editing this File

This file is the single source of truth at the repository root. Keep each rule to approximately one sentence. Before adding content, ask whether it is already obvious from the code — AGENTS.md only documents non-obvious constraints.
