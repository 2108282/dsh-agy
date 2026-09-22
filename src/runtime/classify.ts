/**
 * Upstream failure classification: HTTP status + headers + body → FailureKind.
 * Conservative by design: only auth-failure may revoke an account; everything
 * else cools, rotates, or retries.
 */

import { isProxyRouted } from '../types.ts'
import type { AccountRouting, FailureKind } from '../types.ts'
import { isProxyUnreachableError } from '../proxy.ts'

export interface ClassifiedError {
  kind: FailureKind
  status?: number
  /** Server-provided retry delay (ms), when the response carried it. */
  retryAfterMs?: number
  /** Server-provided absolute reset time, when the response carried it. */
  resetTime?: string
  message?: string
  /** 429 sub-category, present when kind is rate-limit. */
  rateLimitCategory?: RateLimitCategory
}

/**
 * 429 sub-category (mirrors CLIProxyAPI/OmniRoute's classify429):
 * - soft_rate_limit: transient burst, retry immediately on the same account
 * - rate_limited:    per-minute limit, short cooldown then retry (same account
 *                    when there is no other)
 * - quota_exhausted: daily/plan quota gone, long cooldown (24h)
 * - unknown:         exponential backoff
 */
export type RateLimitCategory = 'soft_rate_limit' | 'rate_limited' | 'quota_exhausted' | 'unknown'

const QUOTA_EXHAUSTED_KEYWORDS = [
  'quota_exhausted',
  'quota exhausted',
  'quota reached',
  'enable overages',
  'individual quota',
]

/** Classify a 429 body into the four upstream categories. */
export function classifyRateLimit(
  bodyText: string | undefined,
  retryAfterMs: number | undefined,
): RateLimitCategory {
  const text = (bodyText ?? '').toLowerCase()
  if (QUOTA_EXHAUSTED_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'quota_exhausted'
  }
  if (retryAfterMs !== undefined && retryAfterMs < 3000) {
    return 'soft_rate_limit'
  }
  if (retryAfterMs !== undefined) {
    return 'rate_limited'
  }
  // No explicit retry hint: "quota" wording → daily quota, otherwise unknown.
  return text.includes('quota') || text.includes('resource_exhausted') ? 'quota_exhausted' : 'unknown'
}

const RATE_LIMIT_RESET_FIELDS = ['resetTime', 'reset_time', 'resetAt', 'quotaResetTime'] as const

function extractResetTime(bodyText: string | undefined): string | undefined {
  if (!bodyText) return undefined
  try {
    const data = JSON.parse(bodyText) as Record<string, unknown>
    for (const field of RATE_LIMIT_RESET_FIELDS) {
      const value = data[field]
      if (typeof value === 'string' && value) return value
      if (typeof value === 'number' && Number.isFinite(value)) {
        // Unix ms when large, seconds when small (relative to now).
        return value > 1_000_000_000_000 ? new Date(value).toISOString() : new Date(Date.now() + value * 1000).toISOString()
      }
    }
    const quotaInfo = data.quotaInfo as Record<string, unknown> | undefined
    if (quotaInfo && typeof quotaInfo.resetTime === 'string') return quotaInfo.resetTime
  } catch {
    // not JSON — no reset info
  }
  return undefined
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return undefined
}

/** Classify a completed HTTP response (non-2xx). */
export function classifyHttpError(
  status: number,
  headers: Headers,
  bodyText?: string,
): ClassifiedError {
  const retryAfterMs = parseRetryAfter(headers.get('retry-after'))
  const resetTime = extractResetTime(bodyText)

  if (status === 429) {
    const category = classifyRateLimit(bodyText, retryAfterMs)
    return {
      kind: 'rate-limit',
      rateLimitCategory: category,
      status,
      retryAfterMs,
      resetTime,
      message: bodyText ? bodyText.slice(0, 200) : undefined,
    }
  }
  if (status === 401) {
    return { kind: 'auth-failure', status, message: bodyText ? bodyText.slice(0, 200) : undefined }
  }
  if (status === 403) {
    // Google also reports quota walls as 403 RESOURCE_EXHAUSTED, and the
    // endpoint fallback chain ends on hosts answering 403 for "no license"
    // (not bad auth). Only treat a 403 as auth-failure when the body carries
    // no quota wording — a false revoke permanently disables the account.
    const category = classifyRateLimit(bodyText, undefined)
    if (category === 'quota_exhausted') {
      return {
        kind: 'rate-limit',
        rateLimitCategory: category,
        status,
        message: bodyText ? bodyText.slice(0, 200) : undefined,
      }
    }
    return { kind: 'auth-failure', status, message: bodyText ? bodyText.slice(0, 200) : undefined }
  }
  if (status === 404) {
    // Model/route missing — nothing to rotate for; surface as transient request error.
    return { kind: 'transient', status, message: bodyText ? bodyText.slice(0, 200) : undefined }
  }
  if (status >= 500) {
    return { kind: 'transient', status, retryAfterMs, message: bodyText ? bodyText.slice(0, 200) : undefined }
  }
  if (status === 400) {
    // A 400 is a request-construction error (permanent — retrying sends the
    // same broken payload). Only capacity-style phrases are recoverable
    // (context overflow / model unavailable), mirroring OmniRoute's
    // classifyProviderError: everything else surfaces as a terminal
    // request-error so rotation does not waste attempts.
    const text = (bodyText ?? '').toLowerCase()
    const recoverable = (
      (text.includes('context') && (text.includes('overflow') || text.includes('too long') || text.includes('exceeded')))
      || (text.includes('model') && (text.includes('not found') || text.includes('unavailable') || text.includes('not supported')))
    )
    if (recoverable) {
      return { kind: 'transient', status, message: bodyText ? bodyText.slice(0, 200) : undefined }
    }
    return { kind: 'request-error', status, message: bodyText ? bodyText.slice(0, 200) : undefined }
  }
  // 400-range others (401 handled above): request-level errors, no rotation semantics.
  return { kind: 'transient', status, message: bodyText ? bodyText.slice(0, 200) : undefined }
}

/** Codes that carry a socket/syscall `code` worth surfacing in a failure message. */
const TRANSPORT_CAUSE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_ABORTED',
])

/**
 * Strip proxy credentials from URL-like text so `user:pass` never reaches logs
 * or the GUI. Splits at the LAST `@` of the authority, which is the real
 * userinfo delimiter (RFC 3986: a host cannot contain a raw `@`), so a password
 * that itself contains `@` is redacted whole rather than truncated at the first
 * one — the failure mode of the character-class regex this replaced.
 */
function redactCredentials(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/?#]+)/gi, (match, scheme: string, authority: string) => {
    const at = authority.lastIndexOf('@')
    if (at === -1) return match
    return `${scheme}<REDACTED>@${authority.slice(at + 1)}`
  })
}

/**
 * Placeholder messages undici/Node emit while the real reason sits deeper in
 * the cause chain; they must not shadow a usable code further down.
 */
const GENERIC_CAUSE_MESSAGES = new Set(['fetch failed', 'terminated', 'other side closed', 'aborted'])

/**
 * Walk the error cause chain collecting the actionable `code` and message.
 * Node/undici reports `TypeError: fetch failed` and stores the real reason in
 * `error.cause` (verified against live failures): without this, DNS, TLS,
 * timeout, reset, and proxy failures are indistinguishable in DSH session
 * events and the GUI.
 */
function describeCause(error: unknown): { code?: string; message?: string } {
  const seen = new Set<unknown>()
  let current: unknown = (error as { cause?: unknown })?.cause ?? error
  let fallbackMessage: string | undefined
  // A recognized `code` anywhere wins over any message: the outer wrappers
  // (`TypeError: fetch failed`, or a refresh error repeating that text)
  // otherwise shadow the real reason.
  for (let depth = 0; current && depth < 6 && !seen.has(current); depth++) {
    seen.add(current)
    if (typeof current === 'object') {
      const code = (current as { code?: unknown }).code
      const message = (current as { message?: unknown }).message
      const usableMessage = typeof message === 'string' && message.length > 0 ? message : undefined
      if (typeof code === 'string' && TRANSPORT_CAUSE_CODES.has(code)) {
        return { code, message: usableMessage }
      }
      if (usableMessage && !GENERIC_CAUSE_MESSAGES.has(usableMessage) && !fallbackMessage) {
        fallbackMessage = usableMessage
      }
      // An AggregateError (Happy Eyeballs) carries its reasons in `errors`.
      const errors = (current as { errors?: unknown }).errors
      if (Array.isArray(errors)) {
        for (const nested of errors) {
          const described = describeCause({ cause: nested })
          if (described.code) return described
          if (described.message && !fallbackMessage) fallbackMessage = described.message
        }
      }
    }
    current = (current as { cause?: unknown })?.cause
  }
  return fallbackMessage ? { message: fallbackMessage } : {}
}

/**
 * Human-readable transport failure: `fetch failed (UND_ERR_SOCKET: other side
 * closed)`. The sanitized cause code/message is what makes a transient socket
 * error distinguishable from a DNS, TLS, or proxy failure in session records.
 */
export function describeFetchError(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error)
  const { code, message } = describeCause(error)
  if (!code && !message) return redactCredentials(base)
  // Prefer the richer text: a syscall message already carrying the code
  // ("getaddrinfo ENOTFOUND host") keeps its host, while a bare reason
  // ("other side closed") is prefixed with the code.
  const detail = code && message
    ? (message.includes(code) ? message : `${code}: ${message}`)
    : (code ?? message)!
  // Skip a detail that merely repeats the base ("fetch failed (fetch failed)").
  if (detail === base) return redactCredentials(base)
  return redactCredentials(`${base} (${detail})`)
}

/**
 * Classify a fetch-level failure (DNS, refused, timeout, abort).
 * @param routing - how the failed request was routed; fail-closed applies only
 *   when it carried an explicit per-account proxy (see {@link AccountRouting}).
 */
export function classifyFetchError(error: unknown, routing?: AccountRouting): ClassifiedError {
  const message = describeFetchError(error)
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'network-error', message }
  }
  // A tagged error is a definite proxy verdict (fast-fail pre-check, or a
  // dispatcher failure), so it stays authoritative in either context.
  const tagged = (error as { errorCode?: unknown })?.errorCode === 'proxy_unreachable'
    || (error as { code?: unknown })?.code === 'PROXY_UNREACHABLE'
  if (tagged) {
    return { kind: 'proxy-unreachable', message }
  }
  // Otherwise the bare socket codes in PROXY_UNREACHABLE_CODES are ambiguous:
  // they describe *the connection*, not *which* connection. Reading them as
  // "proxy unreachable" without a proxy in play skipped healthy accounts
  // un-cooldowned, so the context decides (issue #29).
  if (isProxyRouted(routing) && isProxyUnreachableError(error)) {
    return { kind: 'proxy-unreachable', message }
  }
  return { kind: 'network-error', message }
}

/** Classify the result of a refresh attempt (shared by adapter + verify paths). */
export function classifyRefreshFailure(status: number, code?: string): ClassifiedError {
  if (code === 'invalid_grant') return { kind: 'auth-failure', status, message: code }
  if (status === 429) return { kind: 'rate-limit', status, message: code }
  if (status >= 500) return { kind: 'transient', status, message: code }
  return { kind: 'transient', status, message: code }
}

export type { FailureKind }
