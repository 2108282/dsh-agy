/**
 * Credential redaction for text that may reach logs, the GUI, or a terminal.
 *
 * A leaf module on purpose: `runtime/classify.ts` and `proxy.ts` both need it,
 * and `classify.ts` already imports `proxy.ts`, so importing redaction from
 * either one into the other would close an import cycle.
 */

/**
 * Strip proxy credentials from URL-like text so `user:pass` never reaches logs
 * or the GUI. Splits at the LAST `@` of the authority, which is the real
 * userinfo delimiter (RFC 3986: a host cannot contain a raw `@`), so a password
 * that itself contains `@` is redacted whole rather than truncated at the first
 * one — the failure mode of the character-class regex this replaced.
 *
 * Two passes, because a rejected proxy URL is exactly the input that does not
 * parse: the first handles `scheme://user:pass@host`, the second catches a
 * scheme-less `user:pass@host` that {@link import('./proxy.ts').normalizeProxyUrl}
 * rejects before ever building a `URL`. Both split at the LAST `@`, so a password
 * containing `@` is redacted whole in either shape (truncating at the first `@`
 * left the password's tail in the message). The second requires a `:` inside the
 * userinfo, so a bare address (`someone@example.com`) is left alone.
 *
 * Over-redaction is the intended bias: an error message losing a detail costs
 * nothing, while an unredacted one can put a live proxy password in a screenshot.
 */
export function redactCredentials(text: string): string {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/?#]+)/gi, (match, scheme: string, authority: string) => {
      const at = authority.lastIndexOf('@')
      if (at === -1) return match
      return `${scheme}<REDACTED>@${authority.slice(at + 1)}`
    })
    // The password class must allow `@` and `:` (bounded only by whitespace):
    // excluding them makes the engine stop at the FIRST `@` or `:`, which is what
    // truncated a password containing either one. Greedy matching plus
    // backtracking lands on the last `@` of the token, matching pass 1's rule.
    //
    // The `(?!//)` guard and the `//` anchor keep this pass off a string pass 1
    // already rewrote: without them `http://<REDACTED>@` re-matched with `http` as
    // the user and `//<REDACTED>` as the password, so the message lost the scheme
    // it was trying to report. `//user:pass@host` (protocol-relative) still needs
    // the `//` anchor to be caught at all.
    .replace(/(^|[\s(]|\/\/)([^\s/@:]+:(?!\/\/)[^\s]*)@/g, (_match, lead: string) => `${lead}<REDACTED>@`)
}
