/**
 * Bilingual UI dictionary for the dsh-agy web dashboard and OAuth callbacks.
 */

export interface I18nStrings {
  loginSuccessTitle: string
  loginSuccessDesc: string
  loginFailedTitle: string
  windowClosing: string
}

export const I18N_DICT: { en: I18nStrings; zh: I18nStrings } = {
  en: {
    loginSuccessTitle: 'Sign-in Successful',
    loginSuccessDesc: 'Your Antigravity account has been authorized and saved.',
    loginFailedTitle: 'Sign-in Failed',
    windowClosing: 'This window will close automatically in a moment...',
  },
  zh: {
    loginSuccessTitle: '授权登录成功',
    loginSuccessDesc: 'Antigravity 账号已成功接入并保存。',
    loginFailedTitle: '授权登录失败',
    windowClosing: '此窗口即将在 2 秒内自动关闭...',
  },
}
