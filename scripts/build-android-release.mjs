// Builds a SIGNED release APK and publishes it to public/downloads/EkhayaFC.apk.
// With --bundle it builds the signed .aab that Google Play needs instead
// (saved to release/EkhayaFC.aab, never inside public/).
//
// Steps: build an unsigned release APK with Cordova, align it with zipalign,
// then sign it with Android's apksigner. Signing with apksigner (instead of
// Gradle) gives clear error messages and never writes passwords to disk.
//
// The keystore lives OUTSIDE the project (default ~/ekhaya-keys/ekhaya-release.jks)
// and passwords come from environment variables only:
//   EKHAYA_KEYSTORE_PASSWORD   (required)
//   EKHAYA_KEY_PASSWORD        (optional, defaults to the keystore password)
//   EKHAYA_KEYSTORE / EKHAYA_KEY_ALIAS (optional overrides)
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const keystore = process.env.EKHAYA_KEYSTORE || join(homedir(), 'ekhaya-keys', 'ekhaya-release.jks')
const alias = process.env.EKHAYA_KEY_ALIAS || 'ekhaya'

if (!existsSync(keystore)) {
  console.error(`Release keystore not found at ${keystore}. Create it first (see README).`)
  process.exit(1)
}
if (!process.env.EKHAYA_KEYSTORE_PASSWORD) {
  console.error('Set EKHAYA_KEYSTORE_PASSWORD in this terminal before building (see README).')
  process.exit(1)
}
if (!process.env.EKHAYA_KEY_PASSWORD) process.env.EKHAYA_KEY_PASSWORD = process.env.EKHAYA_KEYSTORE_PASSWORD

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Android', 'Sdk')
const buildToolsRoot = join(sdk, 'build-tools')
const versions = existsSync(buildToolsRoot) ? readdirSync(buildToolsRoot).sort().reverse() : []
const buildTools = versions.map((v) => join(buildToolsRoot, v)).find((dir) => existsSync(join(dir, 'apksigner')))
if (!buildTools) {
  console.error(`Android build-tools with apksigner not found in ${buildToolsRoot}.`)
  process.exit(1)
}

const javaHome = process.env.JAVA_HOME || '/usr/lib/jvm/java-17-openjdk-amd64'
// Gradle: the newest one unpacked under ~/.local/gradle (8.14.2 or later for Android 16).
const gradleRoot = join(homedir(), '.local/gradle')
const gradleDirs = existsSync(gradleRoot) ? readdirSync(gradleRoot).sort().reverse() : []
const gradleBin = gradleDirs.map((v) => join(gradleRoot, v, `gradle-${v}`, 'bin')).find((dir) => existsSync(join(dir, 'gradle'))) ?? ''
const bundle = process.argv.includes('--bundle')
const env = { ...process.env, JAVA_HOME: javaHome, CORDOVA_JAVA_HOME: javaHome, PATH: `${gradleBin ? `${gradleBin}:` : ''}${javaHome}/bin:${process.env.PATH}` }

const run = (label, command, args, options = {}) => {
  console.log(`\n▶ ${label}`)
  const result = spawnSync(command, args, { stdio: 'inherit', env, ...options })
  if (result.status !== 0) {
    console.error(`\n✖ Failed at: ${label}`)
    process.exit(result.status ?? 1)
  }
}

run('Copy Android shell', 'node', ['scripts/copy-android-www.mjs'])

if (bundle) {
  // Google Play: an Android App Bundle signed with the upload key (jarsigner signs .aab files).
  run('Build release App Bundle', 'cordova', ['build', 'android', '--release', '--', '--packageType=bundle'], { cwd: resolve('cordova') })
  const bundleDir = resolve('cordova/platforms/android/app/build/outputs/bundle/release')
  const built = existsSync(bundleDir) ? readdirSync(bundleDir).find((name) => name.endsWith('.aab')) : null
  if (!built) { console.error(`App Bundle not found in ${bundleDir}`); process.exit(1) }
  mkdirSync(resolve('release'), { recursive: true })
  const aab = resolve('release/EkhayaFC.aab')
  copyFileSync(join(bundleDir, built), aab)
  run('Sign App Bundle', join(javaHome, 'bin', 'jarsigner'), [
    '-keystore', keystore, '-storepass:env', 'EKHAYA_KEYSTORE_PASSWORD', '-keypass:env', 'EKHAYA_KEY_PASSWORD',
    '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', aab, alias,
  ])
  run('Verify App Bundle signature', join(javaHome, 'bin', 'jarsigner'), ['-verify', aab])
  console.log('\n✔ Signed App Bundle ready: release/EkhayaFC.aab')
  console.log('Upload it in Google Play Console → Test and release → Production (or Internal testing) → Create new release.')
  process.exit(0)
}
run('Build unsigned release APK', 'cordova', ['build', 'android', '--release', '--', '--packageType=apk'], { cwd: resolve('cordova') })

const outDir = resolve('cordova/platforms/android/app/build/outputs/apk/release')
const unsigned = join(outDir, 'app-release-unsigned.apk')
if (!existsSync(unsigned)) {
  console.error(`Unsigned APK not found at ${unsigned}`)
  process.exit(1)
}
const aligned = join(outDir, 'app-release-aligned.apk')
const signed = join(outDir, 'EkhayaFC-signed.apk')
rmSync(aligned, { force: true })
rmSync(signed, { force: true })

run('Align APK', join(buildTools, 'zipalign'), ['-p', '-f', '4', unsigned, aligned])
run('Sign APK', join(buildTools, 'apksigner'), [
  'sign', '--ks', keystore, '--ks-key-alias', alias,
  '--ks-pass', 'env:EKHAYA_KEYSTORE_PASSWORD', '--key-pass', 'env:EKHAYA_KEY_PASSWORD',
  '--out', signed, aligned,
])
run('Verify signature', join(buildTools, 'apksigner'), ['verify', signed])

mkdirSync(resolve('public/downloads'), { recursive: true })
copyFileSync(signed, resolve('public/downloads/EkhayaFC.apk'))
console.log('\n✔ Signed APK ready: public/downloads/EkhayaFC.apk')
console.log('Upload it to Google Drive (Anyone with the link), set VITE_APK_URL in .env, then run: npm run deploy')
