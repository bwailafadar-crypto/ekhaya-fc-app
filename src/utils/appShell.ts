// The Android APK appends this marker to its WebView user agent
// (AppendUserAgent in cordova/config.xml), so the website knows it is
// running inside the installed Ekhaya FC app.
export function isAndroidApp() {
  return /EkhayaFCApp\//.test(navigator.userAgent)
}

// Firebase Hosting's free plan does not allow .apk files, so the APK can be
// hosted elsewhere (e.g. a Google Drive direct-download link) via VITE_APK_URL.
export const APK_URL = (import.meta.env.VITE_APK_URL ?? '').trim()
export const APK_PATH = '/downloads/EkhayaFC.apk'
