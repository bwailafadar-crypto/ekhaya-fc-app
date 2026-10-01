import { useState } from 'react'
import { ArrowUpRight, Check, CircleCheck, Copy, Download, ExternalLink, Plus, Share2 } from 'lucide-react'
import ApkDownload from '../components/ApkDownload'
import InstallSharePanel from '../components/InstallSharePanel'
import { isAndroidApp } from '../utils/appShell'
import { useInstallPrompt } from '../components/useInstallPrompt'

function deviceDetails() {
  const userAgent = navigator.userAgent
  const iOS = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(userAgent)
  const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|TikTok|BytedanceWebview|\bwv\b|Line\/|LinkedInApp|Snapchat|Telegram|Pinterest|MicroMessenger|Twitter/i.test(userAgent)
    || (iOS && /AppleWebKit/i.test(userAgent) && !/Safari/i.test(userAgent))
  const iosNonSafari = iOS && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)
  const safari = iOS && /Safari/i.test(userAgent) && !iosNonSafari
  const desktopChrome = !iOS && !android && /Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)
  const desktopEdge = !iOS && !android && /Edg\//i.test(userAgent)
  return { iOS, android, inAppBrowser, iosNonSafari, safari, desktopChrome, desktopEdge }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && navigator.standalone === true)
}

async function copyInstallLink() {
  const link = new URL('/download', window.location.origin).toString()
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(link)
    return
  }
  const input = document.createElement('textarea')
  input.value = link
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) throw new Error('Copy is unavailable in this browser.')
}

export default function InstallPage() {
  const { canPromptInstall, installed: promptInstalled, promptInstall } = useInstallPrompt()
  const [installing, setInstalling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [installMessage, setInstallMessage] = useState('')
  const device = deviceDetails()
  const insideApk = isAndroidApp()
  const installed = insideApk || isStandalone() || promptInstalled
  const installLink = new URL('/download', window.location.origin).toString()
  const chromeIntent = `intent://${window.location.host}/download#Intent;scheme=https;package=com.android.chrome;end`

  async function install() {
    setInstalling(true)
    setInstallMessage('')
    try {
      const outcome = await promptInstall()
      if (!outcome) setInstallMessage('Use your browser menu to install Ekhaya FC.')
    } catch {
      setInstallMessage('Installation could not start. Use your browser menu to install the app.')
    } finally {
      setInstalling(false)
    }
  }

  async function copyLink() {
    setCopied(false)
    try {
      await copyInstallLink()
      setCopied(true)
    } catch {
      setInstallMessage(`Copy this link: ${installLink}`)
    }
  }

  return <main className="install-page">
    <header className="install-page-header">
      <img src="/team-logos/ekhaya-fc.png" alt="Ekhaya FC crest" />
      <span>EKHAYA FC <small>OFFICIAL SUPPORTERS APP</small></span>
    </header>
    <section className="install-hero" aria-labelledby="install-heading">
      <div className="install-hero-crest"><img src="/team-logos/ekhaya-fc.png" alt="" /></div>
      <span className="page-eyebrow">Together, we are home</span>
      <h1 id="install-heading">Get the Ekhaya FC app</h1>
      <p>Match updates, club news, fixtures and your supporter community, all in one place.</p>

      {installed ? <div className="install-state install-state-success" role="status">
        <CircleCheck size={23} aria-hidden="true" />
        <div><strong>You already have the app</strong><span>Open Ekhaya FC from your home screen.</span></div>
        <a className="button button-primary" href="/#/"><ArrowUpRight size={16} aria-hidden="true" />Open</a>
      </div> : device.inAppBrowser ? <div className="install-state">
        <strong>Open in your browser</strong>
        {device.android ? <>
          <p>Installation is blocked inside this app. Continue in Chrome to install Ekhaya FC.</p>
          <a className="button button-primary" href={chromeIntent}><ExternalLink size={16} aria-hidden="true" />Open in Chrome</a>
          <ApkDownload />
        </> : <>
          <p>Installation is blocked inside this app. Copy the link, then open Safari and paste it into the address bar.</p>
          <button className="button button-primary" type="button" onClick={() => void copyLink()}><Copy size={16} aria-hidden="true" />{copied ? 'Link copied' : 'Copy link'}</button>
        </>}
      </div> : device.iOS && device.iosNonSafari ? <div className="install-state">
        <strong>Open this link in Safari</strong>
        <p>On iPhone and iPad, install from Safari. Copy this page’s link, open Safari, and paste it into the address bar.</p>
        <button className="button button-primary" type="button" onClick={() => void copyLink()}><Copy size={16} aria-hidden="true" />{copied ? 'Link copied' : 'Copy link'}</button>
      </div> : device.safari ? <div className="install-state install-ios-steps">
        <strong>Add Ekhaya FC to your Home Screen</strong>
        <ol>
          <li><span><Share2 size={19} aria-hidden="true" /></span><span>Tap <b>Share</b> in Safari</span></li>
          <li><span><Plus size={19} aria-hidden="true" /></span><span>Tap <b>Add to Home Screen</b></span></li>
          <li><span><Check size={19} aria-hidden="true" /></span><span>Tap <b>Add</b></span></li>
        </ol>
      </div> : <div className="install-state">
        <strong>{device.android ? 'Install on Android' : device.desktopChrome ? 'Install on this computer' : 'Install Ekhaya FC'}</strong>
        {canPromptInstall ? <>
          <p>Install Ekhaya FC for quick access from your home screen or apps list.</p>
          <button className="button button-primary" type="button" onClick={() => void install()} disabled={installing}>
            <Download size={17} aria-hidden="true" />{installing ? 'Opening install…' : 'Install app'}
          </button>
        </> : <p>{device.android ? 'Open the browser menu and choose “Install app” or “Add to Home screen”.' : device.desktopChrome || device.desktopEdge ? 'Open the browser menu and choose “Install Ekhaya FC” or use the install icon by the address bar.' : 'Open this link in Chrome to install Ekhaya FC.'}</p>}
        {installMessage && <p className="install-page-message" role="status">{installMessage}</p>}
        {device.android && <ApkDownload />}
      </div>}
    </section>
    <InstallSharePanel />
    <footer className="install-page-footer"><a href="https://ekhayafc.com/" target="_blank" rel="noreferrer">ekhayafc.com <ExternalLink size={13} aria-hidden="true" /></a></footer>
  </main>
}
