// Which phone or computer this is (for the admin "signed-in devices" list).
const KEY = 'ekhaya-device-id'
export function deviceId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) { id = `d${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`; localStorage.setItem(KEY, id) }
    return id
  } catch { return null }
}
export const thisDeviceId = () => { try { return localStorage.getItem(KEY) } catch { return null } }

export function deviceLabel(agent = navigator.userAgent) {
  const app = /EkhayaFCApp\//.test(agent) ? 'Ekhaya app' : /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /SamsungBrowser/.test(agent) ? 'Samsung Internet' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Browser'
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iPhone/iPad' : /Windows/.test(agent) ? 'Windows' : /Mac OS X/.test(agent) ? 'Mac' : /CrOS/.test(agent) ? 'Chromebook' : /Linux/.test(agent) ? 'Linux' : 'device'
  const model = agent.match(/Android [\d.]+; ([^;)]+)/)?.[1]?.trim()
  return `${app} on ${os}${model && !/^K$|wv/.test(model) ? ` (${model.slice(0, 30)})` : ''}`
}

