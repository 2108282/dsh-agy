/**
 * Browser-facing HTML for the agy OAuth callback.
 *
 * This is the only page agy serves. The account/statistics dashboard that used
 * to live at `/agy` is gone: that surface is now the Settings section rendered
 * by `src/client/` over the `/api/agy` RPC, so there is no longer a second UI to
 * keep in step with it.
 *
 * The callback stays a real page because Google redirects the browser here.
 */

import { I18N_DICT } from './i18n.ts'

export function renderCallbackHtml(options: { ok: boolean; error?: string; email?: string | null; baseUrl: string }): string {
  const { ok, error, email, baseUrl } = options
  const i18nJson = JSON.stringify(I18N_DICT)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Antigravity Sign-in</title>
  <style>
    :root {
      color-scheme: light dark;
      --dsw-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      --bg-page: #0f1115;
      --bg-surface: #171a21;
      --border-l2: rgba(255, 255, 255, 0.12);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --brand-primary: #5686fe;
      --state-success: #34d399;
      --state-error: #f87171;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg-page: #f8fafc;
        --bg-surface: #ffffff;
        --border-l2: rgba(0, 0, 0, 0.12);
        --text-primary: #0f172a;
        --text-secondary: #475569;
        --brand-primary: #4176e6;
        --state-success: #22c55e;
        --state-error: #ef4444;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--dsw-font-family);
      background-color: var(--bg-page);
      color: var(--text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-l2);
      border-radius: 12px;
      padding: 24px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 24px;
    }
    .icon-success { background: rgba(52, 211, 153, 0.15); color: var(--state-success); }
    .icon-error { background: rgba(248, 113, 113, 0.15); color: var(--state-error); }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 13.5px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      height: 34px;
      padding: 0 16px;
      border-radius: 17px;
      border: 1px solid var(--border-l2);
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      text-decoration: none;
    }
    .btn:hover { background: rgba(128, 128, 128, 0.1); }
    .btn-primary { background: var(--brand-primary); color: #ffffff; border-color: transparent; }
  </style>
</head>
<body>
  <div class="card">
    ${ok ? `
      <div class="icon-wrap icon-success">✓</div>
      <h1 id="title">Sign-in Successful</h1>
      <p id="desc">Your Antigravity account ${email ? '<strong>' + email + '</strong> ' : ''}has been authorized and saved.</p>
      <p style="font-size:12px;opacity:0.8;" id="closing">This window will close automatically...</p>
      <button class="btn" onclick="window.close()">Close Window</button>
    ` : `
      <div class="icon-wrap icon-error">✕</div>
      <h1 id="title">Sign-in Failed</h1>
      <p id="desc">Error details: ${error || 'Unknown error'}</p>
      <a class="btn btn-primary" href="${baseUrl}/agy">Return to Dashboard</a>
    `}
  </div>
  <script>
    const I18N = ${i18nJson};
    const lang = localStorage.getItem('agy_lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
    const dict = I18N[lang] || I18N.en;

    if (${ok ? 'true' : 'false'}) {
      document.getElementById('title').textContent = dict.loginSuccessTitle;
      document.getElementById('desc').innerHTML = dict.loginSuccessDesc + (${JSON.stringify(email ? ' (' + email + ')' : '')});
      document.getElementById('closing').textContent = dict.windowClosing;
      
      // Notify parent window & close
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'agy_login_success' }, '*');
        }
      } catch (e) {}
      setTimeout(() => {
        window.close();
      }, 1800);
    } else {
      document.getElementById('title').textContent = dict.loginFailedTitle;
    }
  </script>
</body>
</html>`
}
