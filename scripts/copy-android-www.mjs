import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve('dist')
const www = resolve('cordova/www')

if (!existsSync(dist)) throw new Error('Run the Vite build before copying Android web assets.')

rmSync(www, { recursive: true, force: true })
mkdirSync(www, { recursive: true })
cpSync(dist, www, { recursive: true })

const indexPath = resolve(www, 'index.html')
const indexHtml = readFileSync(indexPath, 'utf8')
if (!indexHtml.includes('cordova.js')) {
	const androidIndexHtml = indexHtml.replace('</head>', '    <script src="./cordova.js"></script>\n  </head>')
	if (androidIndexHtml === indexHtml) throw new Error('Could not add cordova.js to the Android index.html.')
	writeFileSync(indexPath, androidIndexHtml)
}