// The Android APK appends this marker to its WebView user agent
// (AppendUserAgent in cordova/config.xml), so the website knows it is
// running inside the installed Ekhaya FC app.
export function isAndroidApp() {
  return /EkhayaFCApp\//.test(navigator.userAgent)
}

export const APK_PATH = '/downloads/EkhayaFC.apk'
