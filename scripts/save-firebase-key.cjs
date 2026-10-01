// Copies the Firebase service account from .env into a private file outside
// the project (~/ekhaya-keys/firebase-sa.json) so the Firebase CLI can deploy
// without a browser login. Never prints the secret itself.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
require('dotenv').config({ quiet: true })

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is missing from .env')
  process.exit(1)
}

let key
try {
  key = JSON.parse(raw)
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON in .env is not valid JSON.')
  process.exit(1)
}
if (!key.client_email || !key.private_key) {
  console.error('The service account in .env is missing client_email or private_key.')
  process.exit(1)
}

const dir = path.join(os.homedir(), 'ekhaya-keys')
fs.mkdirSync(dir, { recursive: true })
const file = path.join(dir, 'firebase-sa.json')
fs.writeFileSync(file, JSON.stringify(key, null, 2), { mode: 0o600 })
fs.chmodSync(file, 0o600)
console.log(`Saved ${file}`)
console.log(`Account: ${key.client_email}`)
console.log(`Project: ${key.project_id}`)
