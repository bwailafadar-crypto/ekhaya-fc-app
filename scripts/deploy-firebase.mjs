// Builds the app and deploys it to Firebase Hosting (https://ekhaya-fc-app.web.app).
// Uses ~/ekhaya-keys/firebase-sa.json when it exists, so no browser login is
// needed; otherwise falls back to the normal `firebase login` session.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const keyFile = join(homedir(), 'ekhaya-keys', 'firebase-sa.json')
const env = { ...process.env }
if (existsSync(keyFile)) {
  env.GOOGLE_APPLICATION_CREDENTIALS = keyFile
  console.log(`Using service account key: ${keyFile}`)
} else {
  console.log('No service account key found; using your firebase login session.')
}

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: false })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npm', ['run', 'build'])
run('npx', ['firebase', 'deploy', '--only', 'hosting', '--project', 'ekhaya-fc-app', '--non-interactive'])
