import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/oswald/700.css'
import './index.css'
import { captureInviteCode } from './utils/community'
import { startLiveReconnect } from './utils/liveReconnect'
import { installGlobalErrorHandlers } from './utils/logger'
import { reloadOnce } from './utils/reloadOnce'
import { startAuthDiagnostics } from './utils/authDiagnostics'

// Remember who invited this visitor before the router changes the address.
startAuthDiagnostics()
installGlobalErrorHandlers()
captureInviteCode()
// Reconnect to live data straight away when the fan returns to the app.
startLiveReconnect()

// If the app was updated while open and an old piece of it is gone, load the
// new version once instead of showing a broken page.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
