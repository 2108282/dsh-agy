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
