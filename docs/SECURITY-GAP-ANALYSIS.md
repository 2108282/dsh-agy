# Security / Account-Masquerading Gap Analysis (dsh-agy vs Antigravity-Manager)

> **TEMPORARY SCOPING DOCUMENT — delete once the work in §5 is complete.**
> Deliberately NOT maintained as an EN/zh mirror pair (the `docs/*_zh.md` rule
> does not apply here), NOT linked from `README.md`, and NOT bundled with npm.
>
> **Purpose**: the baseline + acceptance criteria for the security/masquerade
> hardening work. It records what the gap **is today**, with `file:line`
> evidence, so that after implementation a reviewer can answer "is this feature
> actually done?" by re-running the acceptance criteria in §5 rather than
> re-deriving the analysis.

## Status — Tier 1 implemented

| ID | State | Evidence |
|---|---|---|
| G1 | ✅ **done** | `attributionHeaders()` no longer merged into `buildRequestHeaders`. **[V]** wire capture: `user-agent: "antigravity/2.0.0 darwin/arm64"` — no `deepseek-harness`, no comma. Regression test asserts the wire value (`tests/adapter.test.ts`). `AGENTS.md` invariant corrected. |
| G2 | ✅ **done** | The version is no longer a per-call parameter: `setResolvedAgyVersion` publishes into `oauth/constants.ts` (the dependency leaf) and every UA builder's default reads it. All six call sites fixed without touching them. Test: `bootstrap UA version freshness`. |
| G3 | ✅ **done** | `deriveAntigravitySessionId(account, conversation, generation)`; conversation = `String(options.sessionId)`. Tests pin cross-conversation, cross-account and generation separation, plus the CLI degradation. |
| G3b | ✅ **done** | `isSessionAccumulationOverflow` + one resend under a bumped generation; ordinary 400s still do **not** resend. Two adapter tests. |
| G4 | ✅ **done** | The pre-fingerprint fallback now reads `getFingerprintData()` (honouring the `$DSH_HOME` override) and is deterministic. `versionPool` refreshed to real releases; the pinned fallback no longer acts as a floor that could outrank feed data. |
| G11 | ✅ **done** | Identity is created on first **use**, not first rate-limit, so platform/version/SDK-client are frozen per account. Test: `freezes one device identity per account from the first request`. |
| G8a | 🟡 **partial** | The version feeds no longer self-identify (`dsh-agy/0.1` → the client UA). Routing them through `accountFetch` is **not** done — they still use the env/direct route, so a per-account-proxy user without an env proxy leaks the host IP to the two feeds. |
| D6 | ✅ **done** | `architectures` / `osVersions` / `pluginTypes` deleted (never read); `versionPool` refreshed to `2.0.0 / 1.23.2 / 1.22.2`. |
| **Tier 2** | ✅ **done** | **G5**: a 403 carrying `VALIDATION_REQUIRED` now classifies as `verification-required`, parks the account for 15 min (`VERIFICATION_COOLDOWN_MS`) **without** disabling it, and surfaces the appeal URL through the account list. **G7**: affinity is a per-conversation map keyed by `options.sessionId`. **G6**: reassessed — no functional gap (the delay is DSH's, and the account-level cooldowns already exist); only dead computation remains, which is G10. |
| **Tier 3** | ✅ **done** | **G8**: per-account in-flight accounting spreads concurrent fan-out, with its boundary documented (a preference, not a gate). **G9**: reassessed — the behaviour was already correct; the previously un-pinned only-candidate case now has a test. **G10**: every unreachable symbol deleted. |
| S1–S6 | ✅ **done (4 fixed, 2 deliberately not)** | **S1** `0600` + test. **S2** redacting fallback, plus the two latent tail leaks it hid. **S3** origin-scoped `postMessage` on both sides. **S6** `escapeHtml()` + `jsonForInlineScript()` — the second was a **live** break-out (S6a). **S4/S5** evaluated and recorded as non-goals in §6. |

Gate at this revision: `pnpm test` 389 passed / 15 files · `pnpm run typecheck` clean ·
`pnpm run build` clean · CLI bundle verified free of `@deepseek-ai/*` runtime imports ·
`npm pack --dry-run` 46 files.

### Corrections made to this document during implementation

Two claims were wrong and are corrected above rather than silently dropped:

* **G6** was overstated. `decideRotation`'s `backoffMs` is discarded, but the
  cooldowns it was assumed to provide are delivered by other means
  (`coolingDownUntil` on the quota/network/project paths, family-scoped
  `rateLimitResetTimes` on the rate-limit path) and DSH's retry policy does sleep
  on `providerRetryAfterMs`. The real gap is only the `retry` path. See G6.
* **G9** was overstated. `isOverSoftQuota` is dead code, but the live
  `isFamilyDrained` **is** wired (`src/session.ts:361`), so a pre-check exists;
  the gap is narrower than first written. See G9.

Three findings were **understated**, and were only found by trying to write the
test that was supposed to prove them already fixed:

* **S6** — escaping the markup was not enough; the same value reached the inline
  `<script>` through `JSON.stringify`, which does not escape `<`. The page was
  still injectable (S6a).
* **S2** — `proxyUrlForLogs`' fallback was not the only leak on that path: the
  scheme-less redaction pass truncated an `@`-bearing password and could not
  match a `:`-bearing one at all (S2a), and a scheme-less input never reached the
  fallback in the first place (S2b).
* **S1** — the `0600` claim was only checkable by execution: the pre-fix default
  mode measured `644`, which is what makes `tests/cli.test.ts` red-capable rather
  than decorative.

One **drive-by fix** on the same page: the failure branch's button linked to
`${baseUrl}/agy`, the retired dashboard route (asserted gone in
`tests/web.test.ts`), so it 404'd. It now points at the GUI root, where the agy
surface lives as a Settings section. Escaping a dead link would have preserved a
broken feature, which is why this is fixed rather than recorded.

## 0. Method and evidence basis

The comparison target is [`lbjlaq/Antigravity-Manager`](https://github.com/lbjlaq/Antigravity-Manager)
(AM), v4.7.13 @ `78e6acb`, ~31.7k stars, Rust/Tauri, 168 `.rs` files. It was
shallow-cloned and read file by file.

Evidence grades used below — a reviewer should treat them differently. (Called
*grade*, not *tier*, to keep it distinct from the work sequencing in §0.1.)

| Grade | Meaning |
|---|---|
| **[V]** | Verified by executing real code or a live network call during this analysis |
| **[R]** | Read directly from source with a `file:line` citation |
| **[A]** | Absence: established by a repo-wide search; the search term is stated |

Two source trees back the citations:

* **This repo** — `src/…`, unqualified paths.
* **The DSH harness** — `/Users/chaos/Development/deepseek-harness`, cited as
  `packages/…`. It is a *separate checkout* of the harness, not a dependency of
  this repo. §D1 and §D2 were resolved by reading it; those conclusions are only
  as current as that checkout.

**[V] results are the load-bearing ones.** They were reproduced by running the
actual `buildRequestHeaders()` against a loopback HTTP server, running the real
`classifyHttpError()` against captured upstream error bodies, and querying the
live Antigravity release feed. Re-run them before trusting a "fixed" claim.

## 0.1 Scope and sequencing (what "Tier 1/2/3" means)

The Status table above assigns each gap to a tier. The tiers are **work
sequencing by ban-risk per unit of risk**, agreed before implementation — they
are not a severity scale, and a Tier 3 item is not unimportant.

| Tier | Definition | Members |
|---|---|---|
| **Tier 1** | Behaviour that is *provably* unlike any official client and present on **every** request, or that permanently loses an account. Fix first: highest signal, lowest ambiguity. | G1 (dual UA), G2 (pinned control-plane version), G3 (per-account constant `sessionId`), G3b (1M wall has no recovery), G4 (stale fallback), G11 (per-request platform) |
| **Tier 2** | Missing *countermeasures*: the client does nothing wrong, but it also does nothing to avoid or recover from upstream risk control. Still entirely within this repo's control. | **G5** (403 risk-control semantics) ✅, **G6** (retry-path backoff) — reassessed, no change needed, **G7** (affinity keyed by conversation) ✅ |
| **Tier 3** | Hardening and hygiene: real improvements with no direct ban vector. | G8 (pacing/concurrency), G9 (quota hard-exclusion), G10 (dead code) |
| **Security track** | Local-security defects, tracked separately because they do **not** raise ban probability and so do not belong in a ban-risk ordering. Four are fixed; two are recorded as non-goals with the reasoning in §6. | S1 ✅, S2 ✅ (+S2a/S2b), S3 ✅, S4 ⬜ non-goal, S5 ⬜ non-goal, S6 ✅ (+S6a) |

## 1. License constraint (read first — it constrains every fix)

AM is **CC BY-NC-SA 4.0** (`LICENSE:1`, `src-tauri/Cargo.toml:6`; README:518
states 严禁任何形式的商业行为). dsh-agy is **MIT** (`LICENSE:1`) and is
published to npm.

**Therefore: no code, comment, constant, or structure may be copied from AM.**
ShareAlike is viral — copying any portion would require relicensing this whole
project to CC BY-NC-SA, which a non-commercial clause makes untenable for a
published npm package. CC also explicitly advises against using CC licenses for
software (no patent grant, no source/binary distinction).

**Permitted**: clean-room reimplementation from protocol facts (status codes,
error-body strings, header names — these are functional, not expressive) and
from independently documented behavior. AM may be *read* to confirm a technique
is viable; it may not be transcribed.

**Not eligible for the README Credits table** (which lists MIT sources only).

Independent of licensing, most items below **do not need AM at all**: G2, G4,
G6, G9, S1–S6 are dsh-agy's own defects. AM is cited only as corroboration.

## 2. Baseline gap inventory (AS OF THIS DOCUMENT)

### G1 — Every generation request self-identifies as `deepseek-harness` **[V]**

`src/adapter/adapter.ts:116-125` builds headers as
`{ ...attributionHeaders(), ...session.impersonation }`. `attributionHeaders()`
returns the **lower-case** key `'user-agent'` (`@deepseek-ai/dsh-llm`,
`lib/types/attribution.js:43-45`); the impersonation object uses **camel-case**
`'User-Agent'` (`src/session.ts:117-134`). Two distinct JS properties; `Headers`
is case-insensitive and merges them.

Captured wire value from the real function:

```
user-agent: deepseek-harness/0.1.5-rc.2 (+https://github.com/deepseek-ai/deepseek-harness), antigravity/1.18.3 darwin/arm64
```

Impact is not "imperfect spoofing" but a **stable, official-client-impossible
fingerprint shared by every dsh-agy user**. The UA-spoofing layer is defeated.

⚠️ `AGENTS.md:140` documents this as *"overridden by the impersonation UA
(header expansion order) — intentional and DSH-compliant"*. **That invariant is
false** and must be corrected in the same change; anyone reading it will not
look for this bug. No test asserts the outgoing `user-agent` (`tests/adapter.test.ts:972`
is a mock fixture only).

### G2 — Control-plane version is pinned; live version is 2.0.0 **[V]**

`AGY_VERSION_FALLBACK = '1.18.3'` (`src/oauth/constants.ts:128`).
`getAgyBootstrapUserAgent()` is called **without an argument** at all six
call sites — `src/oauth/exchange.ts:120,173,250,272`, `src/adapter/models.ts:172`,
`src/cli/import.ts:114` — so every bootstrap/control-plane call pins `1.18.3`.

Live feed at analysis time: IDE releases max **2.0.0**; `antigravity.google/changelog`
max **2.16.0**. `src/runtime/version.ts` (6h TTL) feeds **only** the data-plane
fingerprint, so one process can present `1.18.3` on the control plane and `2.0.0`
on the data plane — a self-contradictory client.

`src/runtime/version.ts:2-5` names this exact failure: *"a stale version is the
most detectable fingerprint anomaly"*. The mitigation is not wired here.

### G3 — `sessionId` is a per-account constant, not per-conversation **[R]**

`src/adapter/adapter.ts:280` passes `deriveAntigravitySessionId(session.account.email)`;
`src/runtime/identity.ts:46-52` is FNV-1a of that string. **No conversation
component, no generation counter.** The docblock states this is deliberate.

Two consequences, the second of which is the more serious:

1. The 1M session-accumulation 400 cannot self-heal. **[V]** The real body
   (`"The input token count exceeds the maximum number of tokens..."`) classifies
   as `request-error` — terminal, no retry, no rotation (`src/runtime/classify.ts:137-152`).
2. **Every conversation on one account is the same upstream session.** A real
   client never reuses one session id across days and unrelated conversations;
   this is a structural anomaly detectable *without inspecting the UA*.

**New finding relevant to the fix**: `GenerateOptions.sessionId` already exists —
`@deepseek-ai/dsh-llm` `lib/types/types.d.ts:437`, documented as *"Session
identity stamped by the loop for request routing. Replay uses it to separate
cursors; adapters may map it to model-hidden transport metadata."* dsh-agy reads
it nowhere (`grep -rn 'options\.sessionId' src/` → 0 hits). This contradicts
`AGENTS.md:119` ("DSH exposes no conversation id, so the window is the proxy").
Whether it is populated at runtime **must be measured before implementing** — see
decision **D1**.

### G4 — Fallback header path bypasses the user override and ships stale versions **[R]**

`src/session.ts:127-128` selects `getStableHeaders(DEFAULT_FINGERPRINT_DATA)` /
`getRandomizedHeaders(DEFAULT_FINGERPRINT_DATA)` — the **bundled** data, and
**no version argument**, so `randomFrom(versionPool)` decides. The user's
hot-update file (`$DSH_HOME/agy-fingerprint-data.json`, `src/runtime/fingerprint.ts:34-59`)
is not consulted on this path.

`src/runtime/fingerprint-data.json:3` pool is `["1.18.3","1.17.0","1.16.0"]`.
Until the first non-soft rate-limit ("sanity limit" in arm's reach), every
request presents a client 3+ minor versions old. **[V]** reproduced: the pool
yields `antigravity/1.17.0 darwin/arm64`.

### G5 — 403 has no risk-control semantics **[V]**

`src/runtime/classify.ts:114-129`: a 403 is `quota_exhausted` (→ cooldown) only
if the body matches the quota keyword list; **everything else is `auth-failure`
→ `revoke` → `enabled = false` permanently** (`src/runtime/rotation.ts:138-145`).

Verified against three real upstream bodies:

| 403 body | dsh-agy verdict |
|---|---|
| `VALIDATION_REQUIRED` + `validation_url` | `auth-failure` → permanent revoke |
| `account has been suspended due to a violation of the Terms of Service` | `auth-failure` → permanent revoke |
| any 403 without quota wording | `auth-failure` → permanent revoke |

`grep -rn 'VALIDATION_REQUIRED\|validation_url\|appeal' src/` → **0 hits [A]**.
The account-disabled signal is discarded as a credential failure. Recovery is
manual only (`src/session.ts:791`; no automatic re-enable path).

AM corroborates that this is a real upstream signal with distinct meaning
(`handlers/gemini.rs:841-866`, `token_manager.rs:3947-4028`) — a 10-minute block
plus `validation_url`/`appeal_url` extraction. *(AM then also sets a permanent
`is_forbidden` on the same 403, which is self-contradictory — do not mirror that
part.)*

### G6 — `backoffMs` is computed and discarded — **reassessed: no functional gap**

`src/runtime/rotation.ts:9` defines `BACKOFF_TIERS_MS = [5_000, 10_000, 20_000, 30_000, 60_000]`;
`:16-20` computes a tier plus up to 1s jitter, and `grep -rn 'backoffMs' src/` outside
`rotation.ts`/`types.ts` → **0 hits [A]**. That much is true.

**The conclusion originally drawn from it — "rotation is immediate, so the pool
hammers upstream" — is wrong**, and the correction matters more than the original
claim. Verified against the code:

* The **account-level** cooldowns the ladder was assumed to supply are already
  delivered by other means: `coolingDownUntil` on the quota / network-error /
  project-error paths, and family-scoped `rateLimitResetTimes` on the rate-limit
  path — the latter read back by `isFamilyRateLimited` and `rankPoolCandidates`,
  so a limited account is not re-selected.
* The **request-level** delay is owned by DSH and really is applied:
  `llm-retry/src/index.ts:227-238` sleeps `providerRetryAfterMs` when present,
  else its own exponential `localDelay` (500 ms base, 10 s cap, 5 attempts).
* Rotating to a *different* account should be immediate — waiting while a healthy
  account is idle would be the defect, not the fix.

So the only real finding is that `backoffMs` is **dead computation**, which
belongs to **G10** (hygiene), not here. Deliberately **no code change**: feeding
the local tier into `providerRetryAfterMs` would suppress retries outright once a
tier exceeds DSH's 10 s `maxDelayMs` (normal mode returns without retrying),
turning a recoverable 5xx into a failed turn — a worse trade for no measured gain.

AM does index `[60,300,1800,7200]` seconds by consecutive failure count
(`rate_limit.rs:544`), but AM *sleeps* on that value; the two designs are not
comparable, and copying the constant without AM's sleeping loop would change
nothing.

### G7 — Session affinity is a single-slot time window **[R]**

`SESSION_AFFINITY_WINDOW_MS = 10 * 60 * 1000` (`src/session.ts:99`); the pin is
`lastUsed: { key, at }` — **one slot, unsynchronized** (`src/session.ts:162`), so
two concurrent conversations overwrite each other's pin.

`AGENTS.md:119` justifies the window as *"upstream prefix-cache + sessionId
continuity; DSH exposes no conversation id, so the window is the proxy"*. **Both
halves of that justification are now known to be wrong or unnecessary:**

* **"DSH exposes no conversation id" is false.** `GenerateOptions.sessionId` is
  stamped on every loop-built request (see D1). The window was compensating for a
  missing input that was present all along.
* **"prefix-cache continuity" does not depend on affinity either.**
  `docs/ANTIGRAVITY-API.md:93` records a measured result: *"Cache key = prefix
  content, independent of sessionId (verified)"* — a probe reused the same
  byte-for-byte 20.5k prefix with a **fresh** sessionId and still hit 20447 cached
  tokens on the first round. The upstream cache is keyed by prefix hash, so
  keeping one conversation on one account is not what preserves cache hits;
  keeping the *prefix* stable is.

So the window's real remaining job is narrower than documented. With D1 resolved,
replace it with a per-conversation map keyed by `String(options.sessionId)`.

AM's equivalent is a concurrent map keyed by a SHA-256 of the first user message
(`proxy/session_manager.rs:58-80`), with three selectable strategies
(`proxy/sticky_config.rs`). The map shape is worth mirroring; the content hash is
not (see D1 on fork).

### G8 — No pacing or concurrency limit — **partially addressed**

`grep -rn 'Semaphore\|p-limit\|throttle\|pacing\|warmup\|minInterval' src/` → no
traffic-shaping primitives. `src/session.ts` fans out quota probes over all stale
accounts in parallel via `Promise.all`. The only randomized pacing is first-time
onboarding (`src/oauth/exchange.ts:165-169`, `3s + random(4s)`), whose comment
names it ban-safety hardening.

**Shipped**: per-account in-flight accounting (`MAX_IN_FLIGHT_PER_ACCOUNT`,
`IN_FLIGHT_STALE_MS` in `rotation.ts`; `noteRequestStarted`/`noteRequestSettled` on
the session manager, driven by the adapter's `stream` wrapper whose `finally` runs
on completion, error, and abandoned streams alike). Selection prefers an account
with headroom, so parallel conversations spread instead of stacking.

**Boundary, deliberately chosen**: it is a *preference*, not a gate. When every
eligible account is saturated, selection proceeds with the best-ranked one rather
than waiting. A hard gate would need a reliable release on every path plus a
bounded wait to avoid deadlock, and a leaked counter would then stall real
requests — a worse failure than the burst it prevents. Consequence: **this spreads
load across a multi-account pool and cannot throttle a single-account one.**

**Not shipped, and why**:

* **Minimum request interval** — no evidence of benefit, and evidence of cost: AM's
  own `RateLimiter` (500 ms minimum interval) is **commented out** in the current
  version (`src-tauri/src/proxy/common/mod.rs:4`). Anyone with the measurements
  disabled theirs. Adopting an unmeasured, latency-adding pacer on the strength of
  a constant alone is the cargo-cult failure this document exists to avoid.
* **Warmup** — AM's is a 300 s scheduler that fires when a 7-day bucket resets
  (`modules/scheduler.rs:103`, `proxy/handlers/warmup.rs`). It matters for a shared
  gateway keeping many accounts primed; for a single-user plugin the first request
  of a conversation is the warmup, and an extra scheduled request would be added
  traffic with no measured purpose.
* **Quota-probe fan-out** — the `Promise.all` above probes every stale account in
  parallel. Left as-is: it is control-plane, once per conversation, and bounded by
  the per-account single-flight map.

### G9 — Quota threshold is a ranking signal, not a stop — **reassessed: already correct**

`isOverSoftQuota` was dead code (now deleted, see G10). The live equivalent is
`isFamilyDrained` (`src/runtime/quota.ts:99-107`), **which is wired**
(`src/session.ts`), plus a hard block at ≤0 remaining (`quota.ts:187-190`).

**Both halves of the intended behaviour already hold**, so this needed a test, not
a change:

* *Excluded when an alternative exists* — a sub-threshold account has used ≥85%,
  which sets `hot: true` (`quota.ts:199`, `PRIMARY_WINDOW_HOT_FRACTION`), and the
  sort puts hot last. It is therefore only chosen when nothing better exists.
* *Used when it is the only candidate* — the hard block triggers at ≤0 only, by
  design: spending a resettable last 5% beats failing the turn outright.

That second half is now pinned by a session-level test. AM's
`threshold_percentage = 10` instead persists a per-model `protected_models`
exclusion (`models/config.rs:76-105`, `token_manager.rs:1104-1160`) — a *reserve*,
which suits a shared gateway serving other people's requests. For a single-user
plugin whose alternative is "no answer", reserving quota would be a regression.

### G11 — Platform is re-randomized per request **[V]**

On the same no-fingerprint path as G4, `getRandomizedHeaders()`
(`src/runtime/fingerprint.ts:92-104`) picks `platform` from the pool **on every
call** (`:96-97`). Consecutive requests from one account therefore claim
`windows/amd64` and then `darwin/arm64`. **[V]** reproduced.

A client whose operating system changes between two requests of one session is a
stronger and cheaper-to-detect signal than a stale version number, and it is
independent of G1's UA concatenation. Note the fingerprint, once created, fixes
platform — so this is again a *pre-first-rate-limit* window problem.

### G10 — Dead security-relevant code — **all deleted**

| Symbol | Why dead | Resolution |
|---|---|---|
| `restoreFingerprint` | the `'restored'` reason is never written anywhere, so it is unreachable | **deleted**, along with the `'restored'` member of the reason union. The history stays as a bounded audit trail; a user-facing *restore* action is a feature, recorded in §6 as a non-goal rather than half-built |
| `MAX_ACCOUNTS = 10` | never enforced anywhere | **deleted**; the `proxy.ts` comment that cited it as a cache bound was corrected to describe what actually bounds the map |
| `buildFingerprintHeaders` | test-only | **deleted** |
| `generateAntigravitySessionId` | test-only | **deleted** (`deriveAntigravitySessionId` covers the wire shape) |
| `isRateLimited` | test-only; `isFamilyRateLimited` is the live reader | **deleted**; the test now exercises the family-scoped reader |
| `isOverSoftQuota` | test-only; `isFamilyDrained` is the live reader | **deleted**; the test now asserts the shared threshold |
| `architectures`/`osVersions`/`pluginTypes` | never read; `osVersions` content also stale | **deleted** from `fingerprint-data.json` and the `FingerprintData` interface |

### S1–S6 — Security items (not ban-vector, tracked separately)

| ID | Finding | Location | Resolution |
|---|---|---|---|
| S1 | `dsh-agy export --out` writes live credential blobs world-readable (0644) — the only `writeFileSync` without `mode: 0o600` **[V]** | `cli/index.ts:274` | ✅ fixed — the write moved into `writeBlobFile()` with `mode: 0o600`; `tests/cli.test.ts` asserts the group/other bits are clear (red-capable: the pre-fix default mode measured `644`) |
| S2 | Proxy credentials leak via `normalizeProxyUrl`'s error message into GUI/stderr: the throw embeds `proxyUrlForLogs()`, whose `catch` returns the raw input **[V]** | `proxy.ts:56` + `:100-102` | ✅ fixed — the catch redacts in place; the two latent tail leaks found while pinning it are fixed too (S2a/S2b) |
| S3 | `postMessage(…, '*')` with no `event.origin` check on the receiver | `web/page.ts:132`, `client/index.ts:1012-1014` | ✅ fixed — the page targets `window.location.origin` and the receiver returns early unless `event.origin === window.location.origin` |
| S4 | Master key KDF is a single unsalted SHA-256 (no work factor). Acceptable only because the key is 32 random bytes; must be documented as a constraint | `store/keyring.ts:52-55` | ⬜ **evaluated, deliberately not changed** — see §6 |
| S5 | `account.exportAll` returns live credential blobs for every account to whatever the DSH `/api/*` fence admits | `web/management.ts:343-351` | ⬜ **evaluated, deliberately not changed** — see §6 |
| S6 | Unescaped HTML interpolation of the upstream error body into the OAuth callback page | `web/page.ts:115` | ✅ fixed — `escapeHtml()` on every markup interpolation and `jsonForInlineScript()` for the `<script>` payload; see S6a, which was still exploitable |

#### S2a/S2b — found while pinning S2 (both were live leaks)

* **S2a, first-`@` truncation.** The scheme-less pass of `redactCredentials` used
  `[^\s/@]*` for the password, so it stopped at the first `@`: `user:p@ss@host`
  redacted only `user:p` and left `ss@host` in the message. Both passes now split
  at the **last** `@`, matching RFC 3986. The `:`-bearing password shape
  (`user:pa:ss@host`) was worse: the old pattern could not match it at all, so it
  passed through **completely unredacted**.
* **S2b, scheme-less input reported as a host that was never there.**
  `new URL('user:pa@ss@h:9')` does not throw — it parses as the non-special
  scheme `user:` with an **empty hostname**, so the redacting fallback was never
  reached and the message read `[proxy] invalid proxy URL: user://:8080`. No leak,
  but actively misleading. `proxyUrlForLogs` now falls through to the redacting
  path when the parsed host is empty.

#### S6a — found while pinning S6: the inline script was still breakable **[V]**

The `textContent` fix covered the markup branch, but the same email is **also**
interpolated into the inline `<script>` as `JSON.stringify(email)`.
`JSON.stringify` escapes for a JS *string* context, not for the HTML script-data
state: it leaves `<` alone, so an email containing `</script>` terminated the
element early and everything after it was parsed as markup. Measured on the
pre-fix renderer, an email of `a"b</script><img src=x onerror=alert(1)>@example.com`
emitted a live `<img onerror>` **on the DSH GUI's own origin** — i.e. exactly the
chain that made S6 worth fixing. `jsonForInlineScript()` now escapes `<`, `>` and
`&` as `\uXXXX` (same JSON value; the byte sequence becomes unrepresentable in the
source), and the test asserts the extracted script still parses under
`new Function`.

## 3. Decisions required before implementation

These are **not** implementation details; each changes the design.

### D1 — RESOLVED (was: what is the conversation key for G3/G7?)

**The DSH harness source is available at `/Users/chaos/Development/deepseek-harness`
and settles this. Use `options.sessionId`.**

The loop stamps it unconditionally on every built request:

```ts
// packages/core/agent-loop/src/agent.ts:611-616
const request = markAgentLoopRequest(Object.freeze({
  ...header.config,
  messages: boundaryMessages,
  ...header.tools !== undefined ? { tools: header.tools } : {},
  sessionId: this.session.id,     // <-- :615
  signal,
}))
```

* The field is declared at `packages/llm/llm/src/types.ts:488` as
  `sessionId?: Branded<'SessionId'>`. It is optional **in the type** only so
  hand-built callers (our own CLI's `testCall`) can omit it.
* `SessionId` **does** have a factory — `packages/core/session/src/types.ts:19,26`.
  (The earlier suspicion that it lacked one came from reading the `dsh-llm`
  brand module, which owns a different set of ids. That reasoning was wrong.)
* **Fork gets a fresh id**, so content-hashing would have collided here:
  `packages/core/session/src/index.ts:1236-1242` calls
  `this.create(childSessionId, …)`, and `prepare()` (`:1001-1006`) mints
  `session-{++counter}` when no id is supplied. A fork replays its parent's
  history — including its first user message — but carries a **different**
  session id. This is exactly the case `[R]`-predicted would break a
  first-user-message hash.
* Compaction keeps the same session (it is a request on the same session with
  `purpose: 'compaction'`), so the conversation's upstream session id is stable
  across a compaction — which is what the 1M counter must see.

**Decision**: `deriveAntigravitySessionId` takes `(accountKey, conversationKey,
generation)`, where `conversationKey = String(options.sessionId)` when present.
The content-hash fallback (AM's technique) is **not needed** for loop-built
requests; it is only reachable from the standalone CLI, which does not go through
a session store.

⚠️ **One caveat, worth a code comment.** `session-{counter}` is a **process-local
counter** (`packages/core/session/src/index.ts:910` `private counter = 0`), and
its `while (this.store.has(sessionId))` guard only consults the *live* store. A
fresh process therefore re-mints `session-1`, which could name the same value as
a conversation restored from disk. Treat `options.sessionId` as a
process-lifetime conversation key, not a globally unique one. Practical impact is
low (a colliding predecessor's upstream session has usually expired), but it is
one more reason the generation counter exists rather than being decorative.

### D2 — RESOLVED to a product decision (was: how to resolve G1?)

The authoritative policy is an implemented Agent Note in the harness repo:
`.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`.
Its Decision section states the rule directly:

> every product LLM adapter sends a static, non-secret application identity on
> every provider HTTP request, and every adapter has tests proving that
> `User-Agent` reaches the wire

and names the escape hatch:

> **White-label deployments pass their own `AppIdentity` to
> `attributionHeaders(identity)` — the override hook is the function parameter**
> — and omission falls back to the harness default rather than suppressing
> attribution.

It also states the hard constraint that kills the naive fix:

> There is no per-request API for the model, user prompt, session id, cwd, user
> email, API key owner, or local machine identity to influence these fields.
> … No app-attribution field carries secrets, local paths, session ids, prompt
> text, model output, user email, or per-user stable identifiers.

Consequences for G1:

* **The spec's own framing is "override", not "suppress".** `attributionHeaders(customIdentity)`
  still calls the same function and still sends a `User-Agent`; only the values
  change. A provider-required UA therefore does **not** violate the letter of the
  contract — this is not a hack to be smuggled in.
* **But the hook was designed for deployments rebranding the harness**, not for a
  third-party plugin impersonating a different vendor's client. Using it for
  Antigravity is available, and is arguably an abuse of intent.
* **There is precedent for provider-specific identity, and it points the other
  way.** `.agents/notes/implemented/feature/2026-08-11-deepseek-request-user-id-header.md`
  adds `x-deepseek-harness-user-id` / `x-deepseek-harness-session-id` as *extra*
  headers sent to the resolved base URL, while `User-Agent` stays attribution.
  The reference adapter (`packages/llm/llm-deepseek/src/protocols/chat-completions/adapter.ts:257-267`)
  shows the sanctioned shape: `...attributionHeaders()` first, provider-specific
  headers after. **Antigravity cannot use that pattern** — it *requires*
  `User-Agent` to be the client string, and there is only one `User-Agent`
  field. That collision is the actual problem, and it is why this is a product
  decision rather than a wiring bug.

The three options, restated with the policy in hand:

- **(a)** Pass a white-label `AppIdentity` (`antigravity/<version> …`). Literally
  sanctioned by the mechanism; the cost is that the harness's own attribution is
  replaced by a false one for this provider.
- **(b)** Keep honest attribution and accept the dual UA, documenting it. No
  policy violation, but ships the stable `deepseek-harness, antigravity/…`
  fingerprint from G1.
- **(c)** Raise it upstream with DSH: *may a provider adapter that is required by
  its upstream to own `User-Agent` do so, moving attribution to a custom
  header?* This is a legitimate question — the DeepSeek note shows the project
  already reasons about provider-specific identity headers — and it is the only
  option that is both honest and clean.

**Recommendation: (c), with (a) as the interim.** Do not ship (b): a
`User-Agent` no official client can emit, identical across all users, is the
single highest-signal item in this document.

**Do not naively rename the key.** Making the impersonation UA overwrite
`'user-agent'` suppresses harness attribution, which the policy forbids.

### D3 — G2 behavior when the feed is unreachable and the cache is cold?

Keep the pinned fallback (then it must be refreshed on a schedule — see §4),
fail the control-plane call, or reuse a version already resolved by the data
plane. Recommend: reuse-then-fallback, plus §4.

### D4 — Where does the G3 generation counter persist?

**Revised after reading the harness.** AM keeps its equivalent counter in a
process-local `static` map and never persists it
(`src-tauri/src/proxy/common/session.rs:23`, no serialization anywhere).

Recommend **the same choice — in-memory**, for two reasons:

- The counter exists to escape one upstream session that has hit the 1M
  accumulation wall. An upstream session is server-side state that expires; a
  generation counter surviving a local restart buys little, since the upstream
  session it was escaping is likely gone too.
- Persisting it means a storage-schema version bump, and `AGENTS.md` constrains
  store migrations tightly. Not worth it for a cache-refresh optimization.

Cost: if a process restarts mid-conversation while still over 1M, one extra 400
is paid before recovery. Acceptable.

This supersedes the earlier "persist in the account store" recommendation, which
was justified by a property (upstream session continuity) that does not hold.

### D5 — Version-freshness gate policy

Tolerance (recommend: failing when the compiled fallback trails the live feed by
more than one minor), and whether the gate only alerts or opens a PR. Recommend
**alert only** — `versionPool` also contains platform/OS strings needing human
review.

### D6 — Dead data in `fingerprint-data.json` (G10)

Wire `architectures`/`osVersions`/`pluginTypes` into real headers, or delete them.
Recommend **delete**.

Note the actual UA shape: `platforms` entries already embed the arch
(`"windows/amd64"`, `"darwin/arm64"`, `"darwin/amd64"`), so the emitted UA
**does** match `docs/ANTIGRAVITY-API.md:32`'s documented
`antigravity/{version} {platform}/{arch}`. `architectures` is dead because it is
**redundant** with `platforms`, not because arch is missing.

The related live defect is separate and worth its own decision: **platform is
re-randomized per request** (`src/runtime/fingerprint.ts:96-97`), so one
account's consecutive requests claim `windows/amd64` and then `darwin/arm64` —
an OS that changes between two requests of the same session. `[V]` reproduced.
This is a stronger signal than a stale version. Decide alongside D2.

## 4. Version-freshness gate (§4 implements D3/D5)

**A PR-time gate cannot detect upstream drift** — agy ships without a PR here.
This requires a **scheduled** workflow, which the repo does not have today
(`.github/workflows/` contains only `ci.yml` and `publish.yml`; `grep schedule` → 0 hits).

Two pieces:

1. `scripts/verify-version-freshness.mts`, following the existing `verify:*`
   convention (`package.json` scripts; `scripts/` may use the network — `AGENTS.md`
   permits real HTTP only there, never in `tests/`).
2. `.github/workflows/freshness.yml` with `on: schedule:` (cron) — failing opens
   or updates an issue rather than only reddening a check, because drift is not
   the fault of any PR author.

**The gate must be provably red-capable**: demonstrate it failing against a
deliberately stale fallback, mirroring how `scripts/verify-claude-cap.mts`
re-measures its own boundary so a passing run is not vacuous.

## 5. Acceptance criteria (the review checklist)

Each item is "done" only when every criterion is met. **[V]** criteria must be
reproduced by running the command, not by reading the diff.

| ID | Done when |
|---|---|
| G1 | A test asserts the **exact** outgoing `user-agent` for a generation request, and it contains no `deepseek-harness` token unless D2(b) was chosen explicitly. `AGENTS.md:140` no longer states the false invariant. |
| G2 | No control-plane call site invokes `getAgyBootstrapUserAgent()` with the default version; a test pins that a resolved version is threaded through all six sites. |
| G3 | `sessionId` derives from `options.sessionId` when present: stable across a conversation's turns **and across a compaction**, different after a fork, and different for a different conversation. A 400 `"exceeds the maximum number of tokens"` bumps the generation and retries instead of surfacing terminal. |
| G4 | The no-fingerprint path honours `$DSH_HOME/agy-fingerprint-data.json`, and its emitted version is not older than the policy set in D5. |
| G5 | A 403 carrying `VALIDATION_REQUIRED` produces a **temporary** block (not `enabled = false`), and the `validation_url` is surfaced to the UI. A 403 with genuine credential wording still revokes. |
| G6 | **Superseded by reassessment.** The original criterion ("rotation waits at least `backoffMs`") assumed a gap that does not exist: the account cooldowns are already applied and DSH applies the request delay. The criterion that survives is *negative*: the local tier must NOT be fed into `providerRetryAfterMs`, because a tier above DSH's 10s `maxDelayMs` suppresses the retry entirely. |
| G7 | Two concurrent conversations hold independent affinity, keyed by `options.sessionId`; neither overwrites the other. `AGENTS.md:119` no longer claims DSH lacks a conversation id, and no longer credits the window with prefix-cache continuity (see G7 for the measurement). |
| G8 | **Narrowed by reassessment.** A per-account in-flight cap exists and is tested: saturated accounts are skipped while any candidate has headroom, and the slot is released on success, failure, and an abandoned stream. A minimum request interval is a **documented non-goal** (see G8 for the evidence). The criterion this must NOT regress: the cap stays a preference, so it can never stall a request when every account is saturated. |
| G9 | Below-threshold accounts are excluded when any alternative exists; behaviour when they are the only candidate is explicitly decided and tested. |
| G10 | Every symbol in the G10 table is either wired with a test or deleted. |
| G11 | Two consecutive requests from one account, before any fingerprint exists, present a platform that does not change between them. A test asserts platform stability across calls. |
| S1 | Exported blobs are `0600`; a test asserts the mode. ✅ `tests/cli.test.ts` |
| S2 | No path can emit proxy credentials; `proxyUrlForLogs`' catch does not return its input. ✅ `tests/proxy.test.ts` + `tests/redact.test.ts` cover both passes, both `@`/`:` password shapes, and idempotence. |
| S3 | The `postMessage` receiver validates `event.origin`. ✅ both sides; `tests/web.test.ts` asserts the origin-scoped call and that no wildcard target remains. |
| S5 | **Superseded** — evaluated and recorded as a non-goal in §6; the trust requirement is documented instead of gated. |
| S6 | The callback page HTML-escapes every interpolated value **and** every inline-`<script>` payload. ✅ `escapeHtml()` + `jsonForInlineScript()`; the test drives a `</script>`-bearing email and asserts no tag survives and the extracted script still parses. |

## 6. Non-goals

- **Vendoring or transcribing AM code** — see §1.
- Matching AM's surface area (tunnels, multi-tenant user tokens, IP allowlists,
  100MB bodies). Those solve AM's problem (a shared public gateway), not this
  project's (a single-user local plugin). dsh-agy is *ahead* of AM on credentials
  at rest (AES-256-GCM), PKCE, network exposure, and OAuth state binding; nothing
  here should regress those.
- TLS/JA3 emulation: noted as an AM capability, out of scope for a Node client.
- **A user-facing fingerprint *restore* action.** `restoreFingerprint` was deleted
  as unreachable (G10) rather than wired up. The 5-entry history is kept as an
  audit trail of identities an account has presented, and the store field and the
  UI count remain — but choosing a prior identity is a new feature with its own
  questions (which entry, and does the previous identity's upstream state still
  exist), so it is recorded here instead of being half-built. Wiring it is a
  small, bounded follow-up if the need appears.
- **Hard per-account pacing** (a minimum interval, or an in-flight *gate* rather
  than a preference) — see G8 for the evidence against, and the exact boundary
  of what shipped.
- **S4 — a key-derivation work factor on the store master key.** Evaluated and
  deliberately not implemented. The only source of the master key is
  `randomBytes(32).toString('hex')` (`store/keyring.ts:316`), i.e. 256 bits of CSPRNG
  output; there is no passphrase path, no env-var override, and no user-supplied
  input anywhere in the derivation. A KDF (PBKDF2/scrypt/Argon2) buys resistance to
  *guessing a low-entropy input*, which cannot happen here, so adding one would be
  cargo-cult hardening that only slows every unlock. The constraint that makes it
  safe is the **32-byte random source**, and that is what a future change must not
  break: if a passphrase or env-supplied key is ever added, this decision is void
  and the KDF becomes mandatory in the same commit. Recorded, not coded.
- **S5 — a confirmation parameter on `account.exportAll`.** Evaluated and
  deliberately not implemented. The RPC rides DSH's `/api/*` fence, which is behind
  the host's browser-trust check and BrowserAuth: any caller that can reach it can
  also drive the Settings UI, which exports the same blobs through the same
  channel. A "type the account name to confirm" parameter would be UI theater that
  stops nothing an attacker who already holds the session could not do. The real
  defence is the fence, and it belongs to the host. This is also why S6 mattered:
  script injection on the callback page (same origin as the GUI) was the **only**
  path that turned S5 into an exploit rather than a design note — and that path is
  now closed (S6a).

## 7. Appendix — AM capability reference (for comparison only)

Present in AM, absent in dsh-agy: 403 → 10-minute validation block + appeal-URL
extraction; a real `[60,300,1800,7200]`s cooldown ladder; persisted per-model
quota-protection exclusions; 1M session accumulation recovery via a session
generation bump; per-account proxy binding with a `max_accounts` hotspot cap;
weekly-reset warmup scheduler; `JETSKI` vs `ANTIGRAVITY` selection by email domain;
`x-client-name`/`x-client-version`/`x-machine-id`/`x-vscode-sessionid` headers;
`Emulation::Chrome123`; a prompt sanitizer stripping third-party billing headers
that trip the upstream WAF.

**AM weaknesses — do not port**: per-account device fingerprints are never sent
upstream (`x-machine-id` is the host UID, `upstream/client.rs:383-387`), so all
accounts share one machine id; no automatic fingerprint rotation; a
`KNOWN_STABLE_VERSION = "4.3.0"` floor that exists in neither of its own version
sources (live max 2.0.0 / 2.16.0); plaintext account JSON with no `mode` bits;
no PKCE anywhere; no constant-time comparison; a second unauthenticated HTTP API
(`http_api.rs`, port 19527) and a cloudflared tunnel with no added protection;
legacy fixed-nonce AES-GCM still accepted; SQL string interpolation in the
security-log search.
