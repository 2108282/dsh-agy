/** Shared domain types for dsh-agy. */

/**
 * Device fingerprint persisted per account (rate-limit mitigation).
 * Client-Metadata must only transmit ideType: the backend's enum validation
 * rejects freely-added platform/pluginType fields (AGENTS.md invariant).
 */
export interface ClientMetadata {
  ideType: string
}

export interface Fingerprint {
  deviceId: string
  sessionToken: string
  userAgent: string
  apiClient: string
  clientMetadata: ClientMetadata
  createdAt: number
}

export interface FingerprintVersion {
  fingerprint: Fingerprint
  timestamp: number
  reason: 'initial' | 'regenerated' | 'restored'
}

export type CooldownReason =
  | 'auth-failure'
  | 'network-error'
  | 'project-error'
  | 'quota-exhausted'
  | 'validation-required'

/** Per-account quota cache keyed by model id. */
export interface CachedQuota {
  remainingFraction?: number
  resetTime?: string
  modelCount?: number
}

/** One account in the pool. `refresh` is the packed `refreshToken|projectId|managedProjectId` string. */
export interface ManagedAccount {
  id?: string
  email?: string
  refresh: string
  projectId?: string
  managedProjectId?: string
  clientId?: string
  addedAt: number
  lastUsed: number
  enabled?: boolean
  rateLimitResetTimes?: Record<string, number>
  coolingDownUntil?: number
  cooldownReason?: CooldownReason
  verificationRequired?: boolean
  verificationRequiredAt?: number
  verificationRequiredReason?: string
  verificationUrl?: string
  fingerprint?: Fingerprint
  fingerprintHistory?: FingerprintVersion[]
  cachedQuota?: Record<string, CachedQuota>
  cachedQuotaUpdatedAt?: number
  /** Per-account proxy URL (e.g. http://user:pass@host:8080 or socks5://host:1080). Undefined = follow env. */
  proxy?: string
}

export interface AccountStorageV1 {
  version: 1
  accounts: Array<{
    email?: string
    refreshToken: string
    projectId?: string
    managedProjectId?: string
    addedAt: number
    lastUsed: number
    isRateLimited?: boolean
    rateLimitResetTime?: number
    lastSwitchReason?: 'rate-limit' | 'initial' | 'rotation'
  }>
  activeIndex: number
}

export interface AccountStorageV2 {
  version: 2
  accounts: Array<{
    email?: string
    refreshToken: string
    projectId?: string
    managedProjectId?: string
    addedAt: number
    lastUsed: number
    lastSwitchReason?: 'rate-limit' | 'initial' | 'rotation'
    rateLimitResetTimes?: Record<string, number>
  }>
  activeIndex: number
}

export interface AccountStorageV3 {
  version: 3
  accounts: ManagedAccount[]
  activeIndex: number
}

export interface AccountStorageV4 {
  version: 4
  accounts: ManagedAccount[]
  activeIndex: number
}

export type AccountStorage = AccountStorageV1 | AccountStorageV2 | AccountStorageV3 | AccountStorageV4

/**
 * How one account-scoped request is routed — and therefore how its transport
 * failures must be read. `proxyUrl` is the single source of truth: fail-closed
 * applies exactly when it is set, so routing and failure classification can
 * never disagree (splitting them into two arguments let them drift).
 */
export interface AccountRouting {
  /** Per-account proxy; unset means the env/direct route. */
  proxyUrl?: string
  /**
   * Generation stream: long model silences are normal, so the per-gap body
   * inactivity timer must be disabled (AGENTS.md "Proxy Routing").
   */
  streaming?: boolean
}

/** Whether a request ran through an explicit per-account proxy. */
export function isProxyRouted(routing: AccountRouting | undefined): boolean {
  return Boolean(routing?.proxyUrl)
}

/** Parsed halves of the packed refresh string. */
export interface RefreshParts {
  refreshToken?: string
  projectId?: string
  managedProjectId?: string
}

/** OAuth token view of an account used by the refresh path. */
export interface OAuthAuthDetails {
  access: string
  expires: number
  refresh: string
}

/** Result of the OAuth token exchange. */
export interface TokenExchangeSuccess {
  type: 'success'
  refresh: string
  access: string
  expires: number
  email?: string
  projectId: string
  tier?: string
  clientId?: string
}

export interface TokenExchangeFailure {
  type: 'failed'
  error: string
}

export type TokenExchangeResult = TokenExchangeSuccess | TokenExchangeFailure

export interface AgyAccountSession {
  auth: OAuthAuthDetails
  account: ManagedAccount
  index: number
  /** Fingerprint + randomized impersonation headers for this request. */
  impersonation: {
    'User-Agent': string
    'X-Goog-Api-Client': string
    'Client-Metadata': string
  }
}

/** Authentication failure while resolving an account session. */
export type AgyAuthErrorKind = 'transport' | 'rate-limit' | 'invalid-credential'

/**
 * Host-independent authentication error. The adapter maps `kind` to the DSH
 * error protocol without coupling the session or CLI layers to dsh-llm.
 */
export class AgyAuthError extends Error {
  readonly kind: AgyAuthErrorKind

  constructor(kind: AgyAuthErrorKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AgyAuthError'
    this.kind = kind
  }
}

/** Why an enabled account pool cannot currently serve one model family. */
export type PoolBlockedKind = 'retryable' | 'quota-exhausted'

/**
 * Enabled accounts exist, but every candidate is temporarily blocked. Kept
 * independent of dsh-llm so CLI and web entry points do not gain a host import.
 */
export class AgyPoolBlockedError extends Error {
  readonly kind: PoolBlockedKind
  readonly blockedUntil: number

  constructor(kind: PoolBlockedKind, blockedUntil: number) {
    super(kind === 'quota-exhausted'
      ? 'All agy accounts have exhausted quota for the requested model family.'
      : 'All agy accounts are temporarily blocked for the requested model family.')
    this.name = 'AgyPoolBlockedError'
    this.kind = kind
    this.blockedUntil = blockedUntil
  }
}

/** Classified upstream failure kinds consumed by the rotation state machine. */
export type FailureKind =
  | 'rate-limit'
  | 'auth-failure'
  /**
   * Upstream asked for account verification (`VALIDATION_REQUIRED`) rather than
   * rejecting the credential. Deliberately distinct from `auth-failure` because
   * it is RECOVERABLE: the account is temporarily walled, not dead, and the user
   * can act on the returned URL. Treating it as `auth-failure` permanently
   * disabled a healthy account on a signal that meant "come back after
   * verifying", with no automatic way back.
   */
  | 'verification-required'
  | 'network-error'
  | 'project-error'
  | 'request-error'
  | 'transient'
  | 'proxy-unreachable'

/** Rotation state machine decision for one failed attempt. */
/**
 * Rotation state machine decision for one failed attempt.
 *
 * `backoffMs` is **advisory**, and for `retry`/`rotate` no caller consumes it.
 * It is not the mechanism that paces the pool: the account-level `cool` paths
 * write it into `coolingDownUntil` themselves, `rotate` blocks the failed
 * account through `rateLimitResetTimes`, and the delay before the retry of a
 * single request belongs to DSH's retry policy (`providerRetryAfterMs`, else its
 * own exponential `localDelay`). Do NOT "wire it up" by feeding it into
 * `providerRetryAfterMs`: a tier above DSH's `maxDelayMs` makes the normal retry
 * mode give up entirely, turning a recoverable 5xx into a failed turn.
 */
export type RotationAction =
  | { action: 'retry'; backoffMs: number }
  | { action: 'cool'; backoffMs: number }
  | { action: 'rotate'; backoffMs: number }
  | { action: 'revoke' }
  /** Permanent request-construction error: no state change, surface as-is. */
  | { action: 'noop' }
