/**
 * One captured CLI build, shared by every Cloud Code request.
 * Source: official CLI 1.5.8, SHA256 and local capture in
 * docs/official-cli-1.5.8.json. Version and changelist must change together after
 * a new artifact capture; a release feed alone cannot supply its changelist.
 */
export const AGY_CLI_IDENTITY = Object.freeze({
  version: '1.5.8',
  changelist: '1020628950',
  osType: 'linux',
  arch: 'arm64',
  authMethod: 'consumer',
})

export function officialCliUserAgent(): string {
  const { version, osType, arch, changelist, authMethod } = AGY_CLI_IDENTITY
  return `antigravity/cli/${version} (aidev_client; os_type=${osType}; arch=${arch}; cl=${changelist}; auth_method=${authMethod})`
}

/** Explicit construction: no attribution spread, random SDK pool or browser UA. */
export function buildCloudCodeHeaders(accessToken: string, streaming = false): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    'User-Agent': officialCliUserAgent(),
    ...(streaming ? { accept: 'text/event-stream' } : {}),
  }
}

const EXTRA_IDENTITY_HEADERS = new Set([
  'x-goog-api-client', 'client-metadata', 'x-goog-request-id',
  'x-client-name', 'x-client-version', 'x-machine-id', 'x-vscode-sessionid',
])

/** Check before fetch can fold differently-cased duplicate identity headers. */
export function assertCloudCodeIdentity(headers: NonNullable<Parameters<typeof fetch>[1]>['headers']): void {
  if (!headers) throw new Error('Missing Cloud Code request headers')
  const entries: [string, string | undefined][] = headers instanceof Headers
    ? [...headers.entries()]
    : Array.isArray(headers) ? headers : Object.entries(headers)
  const userAgents = entries.filter(([name]) => name.toLowerCase() === 'user-agent')
  if (userAgents.length !== 1 || userAgents[0]![1] !== officialCliUserAgent()) {
    throw new Error('Cloud Code request must carry exactly one canonical CLI User-Agent')
  }
  if (entries.some(([name]) => EXTRA_IDENTITY_HEADERS.has(name.toLowerCase()))) {
    throw new Error('Cloud Code request contains an identity header outside the captured CLI contract')
  }
}

/** Guard only Cloud Code actions, not OAuth, userinfo or release-feed requests. */
export function isCloudCodeRequest(url: string): boolean {
  try {
    const parsed = new URL(url)
    return /^(?:(?:daily|preprod-daily|autopush)-)?cloudcode-pa(?:\.sandbox)?\.googleapis\.com$/.test(parsed.hostname)
      && parsed.pathname.startsWith('/v1internal:')
  } catch {
    return false
  }
}
