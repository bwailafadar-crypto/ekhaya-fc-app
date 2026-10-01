import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

// The Android app is a thin shell that opens the live website, so only the
// small loading/offline pages are bundled into the APK (not the web build).
const bootstrap = resolve('cordova/bootstrap')
const www = resolve('cordova/www')

if (!existsSync(resolve(bootstrap, 'index.html'))) throw new Error('cordova/bootstrap/index.html is missing.')

rmSync(www, { recursive: true, force: true })
mkdirSync(www, { recursive: true })
cpSync(bootstrap, www, { recursive: true })
console.log('Android shell copied to cordova/www')
