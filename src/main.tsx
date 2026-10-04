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

// If the app was updated while open and an old piece of it is gone, load the
// new version once instead of showing a broken page.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('ekhaya-reloaded-at') || 0)
    if (Date.now() - last < 30000) return
    sessionStorage.setItem('ekhaya-reloaded-at', String(Date.now()))
  } catch { /* storage blocked: still try once */ }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
