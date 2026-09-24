import { describe, expect, it } from 'vitest'
import { redactCredentials } from '../src/redact.ts'

/**
 * `redactCredentials` is the last line of defence before proxy credentials reach
 * a log line, the GUI, or a terminal. Its input is by definition text that did
 * not parse as a URL — a rejected proxy URL is exactly the case that still holds
 * a password — so the fallback must redact rather than echo.
 */
describe('credential redaction', () => {
  it('redacts userinfo and keeps the host for a well-formed URL', () => {
    expect(redactCredentials('http://user:pass@127.0.0.1:9')).toBe('http://<REDACTED>@127.0.0.1:9')
    expect(redactCredentials('socks5://u:p@h:1080')).toBe('socks5://<REDACTED>@h:1080')
    // The whole authority is replaced, not just the password, so the username
    // does not survive either.
    expect(redactCredentials('http://user:pass@h')).not.toContain('user')
    expect(redactCredentials('http://user:pass@h')).not.toContain('pass')
  })

  it('splits the authority at the LAST @ so an @-bearing password is redacted whole', () => {
    // RFC 3986: a host cannot contain a raw `@`, so the last one delimits the
    // userinfo. Truncating at the first `@` is what leaked the password tail
    // (`ss@127.0.0.1:9`) in the character-class version this replaced.
    expect(redactCredentials('http://user:p@ss@127.0.0.1:9')).toBe('http://<REDACTED>@127.0.0.1:9')
    expect(redactCredentials('not a url user:p@ss@host')).toBe('not a url <REDACTED>@host')
    expect(redactCredentials('http://user:p@ss@127.0.0.1:9')).not.toContain('ss@')
  })

  it('redacts a scheme-less userinfo, which never reaches a URL parser', () => {
    // This shape is what `normalizeProxyUrl` rejects before building a `URL`, and
    // its error message is embedded in the GUI-visible text.
    expect(redactCredentials('user:pass@host')).toBe('<REDACTED>@host')
    expect(redactCredentials('user:p@ss@host:8080')).toBe('<REDACTED>@host:8080')
    // A password containing `:` must not stop the match either.
    expect(redactCredentials('user:pa:ss@host')).toBe('<REDACTED>@host')
    expect(redactCredentials('//user:pass@host')).toBe('//<REDACTED>@host')
  })

  it('leaves a bare address alone, because it has no password to hide', () => {
    // Over-redaction is the intended bias, but an email in a log line is common
    // enough that the `:` requirement is worth keeping.
    expect(redactCredentials('someone@example.com')).toBe('someone@example.com')
    expect(redactCredentials('no credentials here')).toBe('no credentials here')
  })

  it('is idempotent, and does not eat a scheme it already redacted', () => {
    // Redaction runs over text that may contain several URLs, and over text that
    // a previous pass already rewrote (an error message re-thrown through two
    // classifiers). Re-matching `http://<REDACTED>@` with `http` as the user and
    // `//<REDACTED>` as the password dropped the scheme from the message.
    for (const input of [
      'http://user:pass@h',
      'http://<REDACTED>@h:9',
      'not a url user:p@ss@host',
      '<REDACTED>@host',
      '//user:pass@host',
    ]) {
      const once = redactCredentials(input)
      expect(redactCredentials(once), `not idempotent for ${input}`).toBe(once)
    }
    expect(redactCredentials('http://user:pass@')).toBe('http://<REDACTED>@')
    expect(redactCredentials('user:pa@ss@h:1')).toBe('<REDACTED>@h:1')
  })

  it('redacts every occurrence in a sentence', () => {
    expect(redactCredentials('see http://u:p@h and mail:x@y')).toBe('see http://<REDACTED>@h and <REDACTED>@y')
  })
})
