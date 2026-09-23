/**
 * Risk-control switches (compliance posture): env-gated behaviors that keep
 * the grey-zone product honest —
 *
 * - DSH_AGY_DISABLE=1: global kill switch, the plugin registers nothing.
 * - DSH_AGY_FINGERPRINT_MODE=stable: one identity per account, never
 *   regenerated. `dynamic` (the default) regenerates the identity after
 *   repeated rate-limits — that is now the flag's ONLY effect. It no longer
 *   selects per-request header randomization: an account with no fingerprint yet
 *   presents one fixed identity either way, because re-rolling a platform per
 *   request is the anomaly that posture was meant to remove.
 *
 * The BYO OAuth app escape hatch (AGY_CLIENT_ID / AGY_CLIENT_SECRET) lives in
 * oauth/constants.ts (resolveAgyClientCredentials) — oauth/ is a dependency
 * leaf and must not import runtime/.
 */

export type FingerprintMode = 'dynamic' | 'stable'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

function envFlag(name: string): boolean {
  const value = process.env[name]
  return value !== undefined && TRUE_VALUES.has(value.trim().toLowerCase())
}

/** Global kill switch: DSH_AGY_DISABLE=1 keeps the plugin from registering anything. */
export function isAgyDisabled(): boolean {
  return envFlag('DSH_AGY_DISABLE')
}

/**
 * Fingerprint strategy: `dynamic` (default, identity regenerated after repeated
 * rate-limits) or `stable` (one identity per account, never regenerated —
 * mirrors OMP's fixed-client posture). Only the regeneration step differs; both
 * modes present a single fixed identity when no fingerprint exists yet.
 */
export function fingerprintMode(): FingerprintMode {
  return process.env.DSH_AGY_FINGERPRINT_MODE === 'stable' ? 'stable' : 'dynamic'
}
