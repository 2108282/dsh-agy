/**
 * AgyAdapter: the DSH seam. A thin orchestrator over the deep modules —
 * account session resolution (shell-provided), request translation, SSE
 * parsing, failure classification, and rotation reporting. All wire details
 * live in translate.ts / parse.ts / models.ts.
 */

import {
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  QUOTA_EXCEEDED_CODE,
  attributionHeaders,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
  ToolSchema,
} from '@deepseek-ai/dsh-llm'

import { AgyAuthError, AgyPoolBlockedError } from '../types.ts'
import type { AgyAccountSession, FailureKind, ManagedAccount, OAuthAuthDetails } from '../types.ts'
import type { RateLimitCategory } from '../runtime/classify.ts'
import { fetchAgyFirstOk } from '../oauth/constants.ts'
import { classifyFetchError, classifyHttpError, describeFetchError } from '../runtime/classify.ts'
import { accountFetch } from '../proxy.ts'
import { deriveAntigravitySessionId, generateAntigravityRequestId } from '../runtime/identity.ts'
import { setThoughtSignature } from '../runtime/signature-cache.ts'
import { toAgyRequestBody } from './translate.ts'
import type { AgyResolvedImage } from './translate.ts'
import { resolveMultimodalFiles } from './multimodal.ts'
import { parseAgySse } from './parse.ts'
import { AGY_PROVIDER, catalogModelList, listAgyModels, resolveAgyModel } from './models.ts'

export type { AgyAccountSession }

/**
 * Structural view of the harness attachment service (ctx.attachments).
 * Deliberately not an import of @deepseek-ai/dsh-attachment: the CLI bundle
 * must stay free of harness runtime dependencies, and the real store
 * satisfies this shape.
 */
export interface AgyAttachmentStore {
  readImage(ref: {
    attachmentId: string
    mediaType: string
  }): Promise<{ ref: { mediaType: string }; data: Uint8Array }>
}

/** Collect image refs from user-message content only (spec scope: user images; tool-result nesting out of scope). */
function collectImageRefs(options: GenerateOptions): Array<{ attachmentId: string; mediaType: string }> {
  const refs: Array<{ attachmentId: string; mediaType: string }> = []
  for (const message of options.messages) {
    if (message.role !== 'user') continue
    for (const block of message.content) {
      if (block.type === 'image') refs.push(block.attachment)
    }
  }
  return refs
}

export interface AgyAdapterOptions {
  /** Resolve the active account for a request (model-aware: family-scoped quota ranking). */
  getSession(model?: string): Promise<AgyAccountSession | undefined>
  /** Report a classified upstream failure so the shell can cool/rotate/revoke. */
  reportFailure(
    kind: FailureKind,
    session: AgyAccountSession,
    info?: {
      retryAfterMs?: number
      status?: number
      rateLimitCategory?: RateLimitCategory
      /** Server-reported absolute reset time; drives precise cooldowns. */
      resetTime?: string
      /** Requested model id; drives family-scoped rate-limit bookkeeping. */
      model?: string
    },
  ): Promise<void>
  /** Report a clean stream completion (resets the failure counter). */
  markSuccess?(session: AgyAccountSession): Promise<void>
  /** Resolve the harness attachment store; undefined outside the harness (standalone CLI). */
  resolveAttachments?(): AgyAttachmentStore | undefined
  /**
   * Hidden-model lookup. Optional so an adapter stays constructible without the
   * settings layer (tests, standalone use); absent means nothing is hidden.
   */
  modelVisibility?: { disabledFor(provider: string): ReadonlySet<string> }
  /**
   * Record one request's usage. Optional by design: the CLI must be able to
   * build an adapter without the stats ledger, and a statistics failure must
   * never break a generation.
   */
  recordUsage?(record: {
    account?: string
    model?: string
    usage?: { input: number; output: number; cacheRead: number; cacheWrite: number }
    ok: boolean
    latencyMs?: number
    ttftMs?: number
  }): void
}

const UPSTREAM_ERROR_CODE = 'UPSTREAM'
/** First-class DSH retryable code: the default retry policy honors SERVER (5xx), not UPSTREAM. */
const SERVER_ERROR_CODE = 'SERVER'

/** Stable ledger key for an account: email when present, else the generated id. */
function ledgerAccountKey(session: AgyAccountSession): string | undefined {
  return session.account.email ?? session.account.id
}

/** Build the impersonation headers for one request (per-request randomization applied by the shell). */
export function buildRequestHeaders(session: AgyAccountSession): Record<string, string> {
  return {
    authorization: `Bearer ${session.auth.access}`,
    'content-type': 'application/json',
    accept: 'text/event-stream',
    'x-goog-request-id': generateAntigravityRequestId(),
    ...attributionHeaders(),
    ...session.impersonation,
  }
}

export class AgyAdapter extends LlmAdapter {
  private readonly options: AgyAdapterOptions

  constructor(options: AgyAdapterOptions) {
    super()
    this.options = options
  }

  override providerInfo(_provider: string): LlmProviderInfo {
    return { id: AGY_PROVIDER, name: 'Antigravity (agy)' }
  }

  /**
   * The catalog as DSH's model selector sees it: discovered models minus the
   * user's hidden set. Filtering here is what makes "turn a model off" hide it
   * from the picker — the selector reads this, and DSH itself is untouched.
   */
  override async listModels(_provider: string): Promise<readonly LlmModelInfo[]> {
    const all = await this.listAllModels()
    const hidden = this.options.modelVisibility?.disabledFor(AGY_PROVIDER)
    if (hidden === undefined || hidden.size === 0) return all
    return all.filter((model) => !hidden.has(model.id))
  }

  /**
   * The complete catalog, ignoring the user's hidden set.
   *
   * The settings page lists models through this rather than `listModels`: if it
   * read the filtered list, a hidden model would vanish from the page along
   * with the switch that hides it, leaving no way to turn it back on without
   * hand-editing the file.
   */
  async listAllModels(): Promise<readonly LlmModelInfo[]> {
    try {
      const session = await this.options.getSession()
      // Model discovery is account-scoped: route it through the account's proxy
      // (control-plane class, so the standard timeouts apply).
      const routing = { proxyUrl: session?.account.proxy }
      return await listAgyModels(session?.auth.access, session?.account.projectId, accountFetch(routing))
    } catch (error) {
      if (error instanceof AgyPoolBlockedError || error instanceof AgyAuthError) {
        return catalogModelList()
      }
      throw error
    }
  }

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return resolveAgyModel(provider, model)
  }

  // `prepareCall` is deliberately NOT overridden: the LlmAdapter base class
  // (dsh-llm 0.1.1-rc.2+) already binds the resolved model to the stream, which
  // is exactly what this adapter would do. The base implementation also
  // forwards the cancellation signal, which the previous hand-written copy
  // dropped. Only dynamic adapters — those needing different capabilities per
  // generation — should override it.

  /**
   * Pre-resolve every image attachment into base64 bytes before translation.
   * Image input hard-fails with UNSUPPORTED_CONTENT (terminal, never retried)
   * when the store is missing or a read fails — silently dropping images and
   * sending text-only is the exact failure mode this path exists to prevent.
   */
  private async resolveRequestImages(options: GenerateOptions): Promise<Map<string, AgyResolvedImage>> {
    const refs = collectImageRefs(options)
    const images = new Map<string, AgyResolvedImage>()
    if (refs.length === 0) return images
    const store = this.options.resolveAttachments?.()
    if (!store) {
      throw new LlmError(
        'agy image input requires the durable attachment service (in-harness plugin only)',
        'UNSUPPORTED_CONTENT',
      )
    }
    // Read every attachment concurrently (N images cost one round-trip, not N).
    // allSettled rather than all: more than one read may reject, and the
    // surfaced error must be deterministic (first failure in ref order) instead
    // of whichever concurrent read happened to reject first — and no rejection
    // may escape as unhandled.
    const settled = await Promise.allSettled(
      refs.map(async (ref) => {
        const stored = await store.readImage(ref)
        return {
          attachmentId: ref.attachmentId,
          image: {
            mediaType: stored.ref.mediaType,
            data: Buffer.from(stored.data).toString('base64'),
          },
        }
      }),
    )
    const failedIndex = settled.findIndex((outcome) => outcome.status === 'rejected')
    if (failedIndex !== -1) {
      const ref = refs[failedIndex]!
      const cause: unknown = (settled[failedIndex] as PromiseRejectedResult).reason
      throw new LlmError(
        `agy image attachment "${ref.attachmentId}" could not be loaded: ${cause instanceof Error ? cause.message : String(cause)}`,
        'UNSUPPORTED_CONTENT',
        { cause: cause instanceof Error ? cause : undefined },
      )
    }
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        images.set(outcome.value.attachmentId, outcome.value.image)
      }
    }
    return images
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // Spec D1 sequence: resolve images first — a locally-failing image request
    // must surface UNSUPPORTED_CONTENT (user story 8) instead of being masked
    // by account-pool errors, and must not touch pool state at all.
    const images = await this.resolveRequestImages(options)
    let session: AgyAccountSession | undefined
    try {
      session = await this.options.getSession(options.model)
    } catch (error) {
      if (error instanceof AgyAuthError) {
        if (error.kind === 'transport') {
          throw new LlmError(error.message, 'TRANSPORT', { cause: error })
        }
        if (error.kind === 'rate-limit') {
          throw new LlmError(error.message, 'RATE_LIMIT', {
            requestId: ProviderRequestId(generateAntigravityRequestId()),
          })
        }
        throw new LlmError(error.message, 'INVALID_CREDENTIAL', { cause: error })
      }
      if (error instanceof AgyPoolBlockedError) {
        if (error.kind === 'quota-exhausted') {
          throw new LlmError(error.message, QUOTA_EXCEEDED_CODE)
        }
        const delta = Math.ceil(error.blockedUntil - Date.now())
        const providerRetryAfterMs = Number.isFinite(delta) && delta > 0 ? delta : 1
        throw new LlmError(error.message, 'RATE_LIMIT', {
          providerRetryAfterMs,
          requestId: ProviderRequestId(generateAntigravityRequestId()),
        })
      }
      throw error
    }
    if (!session) {
      throw new LlmError(
        'No agy account configured — run `dsh-agy login` to authenticate.',
        'NO_CREDENTIAL',
      )
    }

    const multimodalFiles = await resolveMultimodalFiles(options)
    const body = toAgyRequestBody(options, {
      projectId: session.account.projectId,
      sessionId: deriveAntigravitySessionId(session.account.email) ?? undefined,
      ...(images.size > 0 ? { images } : {}),
      ...(multimodalFiles.size > 0 ? { multimodalFiles } : {}),
    })
    const headers = buildRequestHeaders(session)
    /** Wall-clock origin for this attempt's latency figures. */
    const startedAt = Date.now()

    let response: Response
    try {
      // Streaming dispatch: the account proxy MUST carry the generation request
      // (it carried only the control-plane calls before, so a proxied account
      // silently generated from the host's real IP), and the streaming
      // dispatcher drops the per-gap body timeout a reasoning pause would trip.
      const routing = { proxyUrl: session.account.proxy, streaming: true }
      response = await fetchAgyFirstOk(
        '/v1internal:streamGenerateContent?alt=sse',
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: options.signal,
        },
        accountFetch(routing),
        routing,
      )
    } catch (error) {
      const classified = classifyFetchError(error, { proxyUrl: session.account.proxy })
      await this.options.reportFailure(classified.kind, session)
      // A transport failure consumed no tokens, but it is a real attempt
      // against this account's quota — record the request, not the usage.
      this.recordUsage(session, options.model, { ok: false }, startedAt)
      throw new LlmError(classified.message ?? 'agy fetch failed', 'TRANSPORT', { cause: error })
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => undefined)
      const classified = classifyHttpError(response.status, response.headers, bodyText)
      await this.options.reportFailure(classified.kind, session, {
        retryAfterMs: classified.retryAfterMs,
        status: response.status,
        rateLimitCategory: classified.rateLimitCategory,
        resetTime: classified.resetTime,
        model: options.model,
      })
      this.recordUsage(session, options.model, {
        ok: false,
        rateLimited: classified.kind === 'rate-limit',
      }, startedAt)
      if (classified.kind === 'rate-limit') {
        // soft/rate limits are retryable by the harness (RATE_LIMIT + delay);
        // daily quota exhaustion is terminal (QUOTA, 24h cooldown already set).
        if (classified.rateLimitCategory === 'quota_exhausted') {
          throw new LlmError(
            `agy daily quota exhausted (${response.status}): ${classified.message ?? ''}`,
            QUOTA_EXCEEDED_CODE,
          )
        }
        throw new LlmError(
          `agy rate-limited (${response.status}): ${classified.message ?? ''}`,
          'RATE_LIMIT',
          {
            providerRetryAfterMs: classified.retryAfterMs ?? undefined,
            requestId: ProviderRequestId(generateAntigravityRequestId()),
          },
        )
      }
      if (classified.kind === 'auth-failure') {
        throw new LlmError(
          `agy authentication failed (${response.status}) — run \`dsh-agy login\``,
          'INVALID_CREDENTIAL',
        )
      }
      // 5xx upstream failures (e.g. 503 "No capacity available") are transient:
      // the DSH retry policy honors SERVER but treats UPSTREAM as terminal, so
      // classifying 5xx as UPSTREAM kills the turn with zero retries. Non-5xx
      // transient/request errors (404, generic 400, other 4xx) stay terminal.
      if (classified.status !== undefined && classified.status >= 500) {
        throw new LlmError(
          `agy upstream error (${response.status}): ${classified.message ?? ''}`,
          SERVER_ERROR_CODE,
          {
            providerRetryAfterMs: classified.retryAfterMs ?? undefined,
            requestId: ProviderRequestId(generateAntigravityRequestId()),
          },
        )
      }
      throw new LlmError(
        `agy upstream error (${response.status}): ${classified.message ?? ''}`,
        UPSTREAM_ERROR_CODE,
      )
    }

    if (!response.body) {
      throw new LlmError('agy stream returned no body', UPSTREAM_ERROR_CODE)
    }

    try {
      // The usage chunk is the ledger's only token source, so the stream is
      // consumed here rather than piped: every chunk still reaches DSH
      // unchanged, but the terminal `usage` chunk is also folded into this
      // account's record. Upstream repeats `usageMetadata` on every SSE event
      // (cumulative); parse.ts already reduces that to one final chunk.
      let usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | undefined
      let ttftMs: number | undefined
      for await (const chunk of parseAgySse(response.body, {
        signal: options.signal,
        onToolSignature: (toolCallId, signature) => {
          setThoughtSignature(toolCallId, signature)
        },
      })) {
        if (chunk.type === 'usage') {
          usage = {
            input: chunk.usage.inputTokens,
            output: chunk.usage.outputTokens,
            cacheRead: chunk.usage.cacheReadTokens ?? 0,
            cacheWrite: chunk.usage.cacheWriteTokens ?? 0,
          }
        } else if (ttftMs === undefined && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta')) {
          // First model-authored output: the honest end of "time to first token".
          ttftMs = Date.now() - startedAt
        }
        yield chunk
      }
      await this.options.markSuccess?.(session)
      this.recordUsage(session, options.model, { ok: true, usage, ttftMs }, startedAt)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LlmError('agy stream aborted', 'ABORTED', { cause: error })
      }
      await this.options.reportFailure('network-error', session)
      // A stream that died mid-body may already have delivered billable
      // content, so the attempt is recorded even though no usage chunk arrived.
      this.recordUsage(session, options.model, { ok: false }, startedAt)
      // Deliberately UPSTREAM (terminal), not TRANSPORT: content may already
      // have been emitted, and DSH's retry policy honours TRANSPORT, so retrying
      // here would replay a partially-delivered turn. The account-level report
      // above already absorbs the transient case by cooling/rotating. The cause
      // code is still surfaced so the socket failure is legible in session events.
      throw new LlmError(
        error instanceof Error ? describeFetchError(error) : 'agy stream parse failed',
        UPSTREAM_ERROR_CODE,
        { cause: error },
      )
    }
  }

  /**
   * Fold one attempt into the usage ledger.
   *
   * Statistics are diagnostics, never load-bearing: a ledger failure must not
   * fail a generation, so this swallows its own errors.
   */
  private recordUsage(
    session: AgyAccountSession,
    model: string | undefined,
    result: {
      ok: boolean
      rateLimited?: boolean
      usage?: { input: number; output: number; cacheRead: number; cacheWrite: number }
      ttftMs?: number
    },
    startedAt: number,
  ): void {
    const record = this.options.recordUsage
    if (record === undefined) return
    try {
      record({
        ...(ledgerAccountKey(session) === undefined ? {} : { account: ledgerAccountKey(session) }),
        ...(model === undefined ? {} : { model }),
        ok: result.ok,
        ...(result.rateLimited === true ? { rateLimited: true } : {}),
        ...(result.usage === undefined ? {} : { usage: result.usage }),
        ...(result.ttftMs === undefined ? {} : { ttftMs: result.ttftMs }),
        latencyMs: Math.max(0, Date.now() - startedAt),
      })
    } catch {
      // Swallowed by design.
    }
  }
}

export type { ToolSchema }
