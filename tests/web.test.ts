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
    // section learns to refresh without polling.
    expect(successHtml).toContain("postMessage({ type: 'agy_login_success' }, '*')")

    const failedHtml = renderCallbackHtml({ ok: false, error: 'Access denied', baseUrl: 'http://127.0.0.1:3080' })
    expect(failedHtml).toContain('Sign-in Failed')
    expect(failedHtml).toContain('Access denied')
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
