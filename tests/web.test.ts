import { describe, it, expect } from 'vitest'
import { renderCallbackHtml } from '../src/web/page.ts'
import { I18N_DICT } from '../src/web/i18n.ts'

/**
 * The dashboard page is gone: the account/statistics UI is now the Settings
 * section in `src/client/`, rendered over the `/api/agy` RPC. Only the OAuth
 * callback is still served as a page, because Google redirects a browser to it.
 */
describe('dsh-agy web page rendering', () => {
  it('renders the callback page for success and failure states', () => {
    const successHtml = renderCallbackHtml({ ok: true, email: 'test@example.com', baseUrl: 'http://127.0.0.1:3080' })
    expect(successHtml).toContain('Sign-in Successful')
    expect(successHtml).toContain('test@example.com')
    expect(successHtml).toContain('window.close()')
    // The callback announces success to its opener, which is how the Settings
    // section learns to refresh without polling. The target origin is this
    // page's own origin, never '*': a wildcard delivered the success message to
    // whatever window happened to open the callback.
    expect(successHtml).toContain("postMessage({ type: 'agy_login_success' }, window.location.origin)")
    expect(successHtml).not.toContain("'*')")

    const failedHtml = renderCallbackHtml({ ok: false, error: 'Access denied', baseUrl: 'http://127.0.0.1:3080' })
    expect(failedHtml).toContain('Sign-in Failed')
    expect(failedHtml).toContain('Access denied')
    // The `/agy` dashboard route is gone (asserted in the suite below), so a
    // link to it 404s. The failure branch points at the GUI root, where the agy
    // surface now lives as a Settings section.
    expect(failedHtml).toContain('href="http://127.0.0.1:3080/"')
    expect(failedHtml).not.toContain('/agy"')
  })

  it('escapes attacker- and upstream-influenced text out of the markup', () => {
    // `error` is the token endpoint's raw response body and `email` comes from
    // Google's userinfo. This page shares an origin with the DSH GUI, so markup
    // injected here would run with the GUI session and could reach `/api/agy`
    // (where `account.exportAll` returns live credential blobs).
    const failedHtml = renderCallbackHtml({
      ok: false,
      error: '<img src=x onerror="alert(1)">',
      baseUrl: 'http://127.0.0.1:3080',
    })
    expect(failedHtml).not.toContain('<img src=x')
    expect(failedHtml).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')

    // The base URL reaches an href attribute; a quote would break out of it.
    const attributeHtml = renderCallbackHtml({
      ok: false,
      error: 'nope',
      baseUrl: 'http://127.0.0.1:3080" onmouseover="alert(1)',
    })
    expect(attributeHtml).not.toContain('" onmouseover="alert(1)')
    expect(attributeHtml).toContain('&quot; onmouseover=&quot;alert(1)')

    // The success branch interpolates the email into the markup AND into the
    // inline `<script>`. The script payload goes through jsonForInlineScript:
    // bare JSON.stringify escapes for a JS string, not for the HTML script-data
    // state, so a `</script>` in the value terminated the element early and
    // everything after it was parsed as markup (measured, not hypothesised).
    const email = `a"b</script><img src=x onerror=alert(1)>@example.com`
    const successHtml = renderCallbackHtml({ ok: true, email, baseUrl: 'http://127.0.0.1:3080' })
    expect(successHtml).not.toContain('<img src=x')
    expect(successHtml).not.toContain('</script><img')
    expect(successHtml).toContain('\\u003c/script\\u003e')
    const script = successHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(() => new Function(script!)).not.toThrow()
  })

  it('serves a syntactically valid callback script (template-literal escapes)', () => {
    // Regression: a '\n' inside the page.ts template literal renders as a real
    // newline, breaking the inline <script> and killing its handlers.
    const html = renderCallbackHtml({ ok: true, email: 'a@b.c', baseUrl: 'http://127.0.0.1:3080' })
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeTruthy()
    expect(() => new Function(script!)).not.toThrow()
  })

  it('provides complete bilingual keys in the i18n dictionary', () => {
    const enKeys = Object.keys(I18N_DICT.en)
    const zhKeys = Object.keys(I18N_DICT.zh)
    expect(enKeys.sort()).toEqual(zhKeys.sort())
  })
})

describe('dsh-agy web entry injection contract', () => {
  it('never statically injects a Web-only service', async () => {
    // Regression, measured on a real TUI profile: `webServer` sat in the static
    // `inject`. No provider of that service is mounted outside a Web
    // composition, so the entry stayed permanently pending — and the loader
    // treats a pending entry as a FAILED PROFILE, not a skipped one:
    //
    //   dsh: plugin tree failed to load: dsh: 1 entry did not activate
    //   dsh-agy/web: pending (waiting for service: webServer)
    //
    // Installing dsh-agy into dsh-tui therefore broke TUI startup outright.
    // Both Web-only services must be reached through `ctx.inject([...])`.
    const { inject } = await import('../src/web/plugin.ts')
    expect(inject).toEqual(['llm'])
    for (const service of ['webServer', 'connection', 'webStartup', 'attachments']) {
      expect(inject as readonly string[]).not.toContain(service)
    }
  })

  it('drops the dashboard route, keeping only the OAuth callback', async () => {
    // The management surface moved to the `/api/agy` RPC channel; the callback
    // stays a real route because Google redirects a browser to it with a GET.
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../src/web/plugin.ts', import.meta.url), 'utf8')
    expect(source).toContain("path: '/agy/oauth-callback'")
    expect(source).not.toContain('renderDashboardHtml')
  })
})
