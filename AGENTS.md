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
src/web/        /agy dashboard route + web plugin entry (only registered on loopback bindings)
src/cli/        Standalone CLI (login/status/import/verify/logout) + loopback callback server
tests/          Vitest test suite: fixture-driven, zero network
docs/           Architecture & API facts (EN + zh); maintenance-oriented, not bundled in npm package
scripts/        Developer tools (record:fixtures / e2e / debug / verify) requiring live accounts or network
```

The two plugin entry points (`src/index.ts` main plugin, `src/web/plugin.ts` web plugin)
share the same store/session/adapter instances via `createAgyRuntime` (`plugin-common.ts`).

## Non-negotiable Invariants (Violations are Regressions; all have test/code anchors)

- **Security (Loopback Trust Model)**:
  - The `/agy` route has no authentication and is ONLY allowed to register on loopback host bindings (`web/plugin.ts` gate).
  - OAuth exchanges MUST bind to the exact PKCE verifier issued for that authorization attempt (`pendingAuth` Map in web, local verifier in CLI); relaxing this verification is a security regression.
  - No request field or telemetry payload may ever transmit a raw refresh token — `sessionId` must be a derived identifier.
  - `~/.dsh/.credentials.yaml` is a version-1 (`refs:` / `records:`) YAML document owned by DSH's credentials provider, and `AGY_MASTER_KEY` MUST nest under `refs` — the provider rejects any other top-level key, which makes every credential in the file unreadable.
  - The credentials document may ONLY be rewritten by parsing + editing + atomic replacement (`persistMasterKey`); rebuilding it from a partial view wipes other services' credentials.
  - Reading it MUST go through a real YAML parse (`readCredentialsDocument`), because values are folded across physical lines and a `records` payload can otherwise shadow a top-level name.
  - Read-only CLI commands (`status`, `verify`, `logout`) must NEVER create a master key or credential document if one does not exist.
- **Classification Semantics**:
  - HTTP 403 responses containing quota / `RESOURCE_EXHAUSTED` phrasing MUST be classified as rate-limit (cooldown). Treating all 403s as auth-failures would permanently disable healthy accounts. Only true auth failures trigger account revocation, and a successful `verify` automatically re-enables the account.
  - Generic 400s are `request-error` (terminal — retrying resends the same broken payload, no rotation); only capacity-style 400s (context overflow / model unavailable) are transient.
  - `isProxyUnreachableError` is context-free: `ECONNRESET`/`UND_ERR_SOCKET`/`ETIMEDOUT` describe *the connection*, not *which* connection. Fail-closed (skip the account, don't cool it; don't retry the next endpoint) applies ONLY when an explicit per-account proxy is in play — without one these are ordinary network errors, and treating them as proxy failures reported healthy accounts as dead proxies. Every call site threads its routing context (`classifyFetchError(err, routing)`, `fetchAgyFirstOk(..., routing)`).
  - A transport failure's actionable code lives on `error.cause` (`TypeError: fetch failed` → `cause.code = UND_ERR_SOCKET`); it must be surfaced via `describeFetchError()` and never leaked unredacted (proxy `user:pass` is stripped, splitting the authority at its LAST `@` so a password containing `@` is redacted whole). `LlmFailure` has no `cause` field, so the sanitized cause belongs in the message.
  - A stream that dies mid-body stays `UPSTREAM` (terminal), NOT `TRANSPORT`: content may already be emitted, and DSH retries `TRANSPORT`, which would replay a partially-delivered turn. The account-level `reportFailure('network-error')` absorbs the transient case instead.
- **Proxy Routing**:
  - Every account-scoped request (generation, test call, model/quota discovery, project healing, import enrichment, login-time exchange) MUST route through `accountFetch(routing)`; omitting it silently falls back to the env/direct route and leaks the account's real IP. `AccountRouting.proxyUrl` is the single source of truth, so routing and failure classification cannot disagree.
  - Streaming uses a separate dispatcher class (`streaming: true`, `bodyTimeout: 0`): `bodyTimeout` is a per-*gap* inactivity timer, so the 30s control-plane value kills a reasoning pause mid-turn. `keepAliveTimeout: 1` is deliberately NOT loosened — undici applies it only when `pipelining` is non-zero, and `pipelining: 0` resets every connection, so it is inert.
  - `normalizeProxyUrl` MUST stay idempotent: a stored proxy URL is normalized again on every request, so non-idempotent encoding compounds (`p@ss` → `p%2540ss` → …) until proxy auth fails. `URL.username`/`password` return percent-ENCODED substrings, so decode before re-encoding.
  - A proxyless account's transient transport failure falls over to the next enabled account WITHOUT a cooldown (a cooldown would surface as `AgyPoolBlockedError` → `RATE_LIMIT` for a plain network error); when every account fails this way the real error is rethrown rather than degrading into `NO_CREDENTIAL`.
- **Upstream Wire Facts** (`docs/ANTIGRAVITY-API.md`, verified empirically):
  - The endpoint fallback order `daily -> prod -> daily-sandbox -> autopush` is load-bearing.
  - HTTP 403 on the autopush endpoint for consumer accounts indicates "no license" (not credential failure).
  - `Client-Metadata` must only transmit `ideType`.
- **Version Freshness**:
  - The fingerprint User-Agent version is resolved dynamically via `version.ts` (750ms timeout ceiling + 6-hour cache + warm-up on boot).
  - `fingerprint-data.json` is compiled into the bundle; user hot-updates use the `$DSH_HOME/agy-fingerprint-data.json` override file.

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

- `scripts/` contains developer tools (`record:fixtures`, `e2e`, `debug:request`, `verify:tools`, `verify:blocks`), **all requiring real accounts or network access**. They are not part of routine dev loops, are not packaged into npm, and are not run in CI. `scripts/unfold-credentials.mjs` is the exception: a standalone stopgap for the published 0.2.7 reader, run directly with node.
- `ci.yml` (runs on every PR and push to `main`): 3 OS (Ubuntu / Windows / macOS) × 2 Node versions (22 / 24; pnpm 11 requires 22.13+) -> pnpm install -> test -> typecheck -> build -> `npm pack --dry-run` -> **tarball smoke test** (installs into a clean temp directory and verifies CLI `--help`, `import('dsh-agy')`, and `import('dsh-agy/web')`).
- Package contents gate: `package.json` `files` only contains `lib/`, `bin/`, `cordis.patch.yml`, `README.md`, `LICENSE`. Adding a new entrypoint requires updating `tsdown.config.ts`, `exports`, and `files` simultaneously.
- `publish.yml` (triggered on `v*` tag push or manual dispatch): test -> build -> `npm publish` (requires `NPM_TOKEN` secret) -> GitHub Release. **Releases are made via `npm version patch|minor|major` + git tag push; do not run manual `npm publish`**.

## Conventions and Pitfalls

- ESM + `.ts` relative imports; new entrypoints must update `tsdown.config.ts`, `package.json` `exports`, and `files`.
- **CLI Entrypoint (`src/cli/`) MUST NOT import any `@deepseek-ai/*` packages at runtime** — this fulfills the `peerDependenciesMeta` optional contract. Indirect imports via shared chunks (`session.ts`) also break this guarantee. Always verify the CLI bundle has zero harness runtime dependencies.
- The version string is only defined in `package.json` (read at CLI runtime, see `src/cli/index.ts`).
- `AGY_CLIENT_ID` and `AGY_CLIENT_SECRET` are **public client credentials** embedded in the Antigravity desktop application; they are not project secrets — do not "fix" them by deletion or obfuscation.
- Upstream tool-schema 400s are fixed by extending the contract (`sanitizeToolSchema` + a fixture test), never by one-off keyword patches — contract, values, and corpus are pinned in `docs/ANTIGRAVITY-API.md` §3.1.
- **Session affinity**: `AgySessionManager` pins requests to the last-used account for `SESSION_AFFINITY_WINDOW_MS` (upstream prefix-cache + sessionId continuity; DSH exposes no conversation id, so the window is the proxy). Rotation clears the pin.
- **Model catalog (AGY)**: `src/adapter/catalog.ts` is the capability source; `v1internal:fetchAvailableModels` is the liveness source. For tiered selectable-thinking models (`*-tiered` → `low/medium/high`) dynamic inference is allowed: `catalogModel()` synthesizes a `thinking:'level'` entry (1M context, vision, `formatTieredModelName()` for display) and `isLevelThinkingModel()` returns true for any `*-tiered` so `translate.ts` auto-exposes `reasoning`/`generationConfig.thinkingConfig` without per-model logic change; still pin one `AGY_PUBLIC_MODELS` entry per released tiered model for offline fallback (e.g. `gemini-3.8-flash-tiered`). Legacy id-bound ids stay without `thinking`.
- Commit messages follow Conventional Commits (`fix(scope): ...`, `feat(scope): ...`).
- The `@deepseek-ai/dsh-llm` peer range must cover what the DSH host actually bundles (Desktop currently `^0.1.5-rc.1`) — the npm `latest` tag trails it, so registry `latest` is not the reference.
- `AgyAdapter` must NOT re-declare `prepareCall`: `LlmAdapter` supplies the default binding, and `noImplicitOverride` makes the `override` keyword a hard error against any pre-`0.1.1-rc.2` base — so overriding it would re-pin the peer range to a version the host no longer ships.
- Cross-version differences inside `dsh-llm` are handled at runtime (`ToolCallId ?? CallId` in `parse.ts`), never by widening the peer range to cover two incompatible type surfaces.
- `docs/` is not bundled with npm: links from `README.md` to `docs/` must resolve properly on GitHub.
- Docs are maintained as EN + zh mirrors (`docs/*_zh.md`); any update to one must update the other in the same commit.
- Windows skips POSIX owner-only file permission checks by design (see `keyring.ts`); `$DSH_HOME` relocates all stored paths.

## DSH / Toolchain Pitfalls (from decommissioned ENGINEERING-NOTES)

- `ctx.get(name)` defaults to **strict**: returns `undefined` for services whose fiber isn't ACTIVE yet (webServer activates later than llm). Prefer splitting a plugin entrypoint so it applies only once its injected deps are ACTIVE (`inject:['llm','webServer']`).
- This Cordis fork has **no optional injection syntax** (`{required,optional}`) — optional deps must use `ctx.get` + timing checks.
- A profile's `file:` dependency is a **copy, not a symlink** — after changing source, re-sync with `rm -rf node_modules/<pkg> && pnpm install --offline` or the profile runs stale artifacts.
- `proper-lockfile` throws ENOENT on a nonexistent target file — atomically pre-create the empty store document (0600, tmp+rename) before locking.
- `tsdown` `allowImportingTsExtensions` is mutually exclusive with `tsc` JS output (TS5096); JSON imports bundle directly into the mjs.
- `LlmError.code` drives DSH retry: the default retry policy only honors `RATE_LIMIT`/`SERVER`/`TIMEOUT`/`TRANSPORT`/`EMPTY_RESPONSE`; `QUOTA` is terminal. The adapter does **not** silent-retry — each call is one provider attempt.
- Branded types (e.g. `CallId`) must be constructed via their factory (`CallId()`), not cast.
- `attributionHeaders()`'s User-Agent is overridden by the impersonation UA (header expansion order) — intentional and DSH-compliant.
- A success page's keep-alive connection can hang `server.close()` — send `connection: close` + call `closeAllConnections()`.

## Editing this File

This file is the single source of truth at the repository root. Keep each rule to approximately one sentence. Before adding content, ask whether it is already obvious from the code — AGENTS.md only documents non-obvious constraints.
