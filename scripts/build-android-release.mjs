// Builds a SIGNED release APK and publishes it to public/downloads/EkhayaFC.apk.
//
// The keystore lives OUTSIDE the project (default ~/ekhaya-keys/ekhaya-release.jks)
// and its passwords are read from environment variables, never from files in the repo:
//   EKHAYA_KEYSTORE_PASSWORD   (required)
//   EKHAYA_KEY_PASSWORD        (optional, defaults to the keystore password)
//   EKHAYA_KEYSTORE / EKHAYA_KEY_ALIAS (optional overrides)
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const keystore = process.env.EKHAYA_KEYSTORE || join(homedir(), 'ekhaya-keys', 'ekhaya-release.jks')
const alias = process.env.EKHAYA_KEY_ALIAS || 'ekhaya'
const storePassword = process.env.EKHAYA_KEYSTORE_PASSWORD
const keyPassword = process.env.EKHAYA_KEY_PASSWORD || storePassword

if (!existsSync(keystore)) {
  console.error(`Release keystore not found at ${keystore}. Create it first (see README).`)
  process.exit(1)
}
if (!storePassword) {
  console.error('Set EKHAYA_KEYSTORE_PASSWORD in this terminal before building (see README).')
  process.exit(1)
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('node', ['scripts/copy-android-www.mjs'])

// Signing config goes in a private temp file that is deleted right after the build.
const tempDir = mkdtempSync(join(tmpdir(), 'ekhaya-sign-'))
const buildConfig = join(tempDir, 'build.json')
writeFileSync(buildConfig, JSON.stringify({
  android: { release: { keystore, storePassword, alias, password: keyPassword, packageType: 'apk' } },
}))
chmodSync(buildConfig, 0o600)

const javaHome = process.env.JAVA_HOME || '/usr/lib/jvm/java-17-openjdk-amd64'
const gradleBin = join(homedir(), '.local/gradle/8.10.2/gradle-8.10.2/bin')
try {
  run('cordova', ['build', 'android', '--release', `--buildConfig=${buildConfig}`], {
    cwd: resolve('cordova'),
    env: { ...process.env, JAVA_HOME: javaHome, CORDOVA_JAVA_HOME: javaHome, PATH: `${gradleBin}:${javaHome}/bin:${process.env.PATH}` },
  })
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

const apk = resolve('cordova/platforms/android/app/build/outputs/apk/release/app-release.apk')
if (!existsSync(apk)) {
  console.error(`Signed APK not found at ${apk}`)
  process.exit(1)
}
mkdirSync(resolve('public/downloads'), { recursive: true })
copyFileSync(apk, resolve('public/downloads/EkhayaFC.apk'))
console.log('\nSigned APK ready: public/downloads/EkhayaFC.apk')
console.log('Now run: netlify deploy --prod')
