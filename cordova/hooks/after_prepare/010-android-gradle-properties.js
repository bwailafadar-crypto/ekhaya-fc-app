const fs = require('node:fs')
const path = require('node:path')

module.exports = (context) => {
  const gradleProperties = path.join(context.opts.projectRoot, 'platforms', 'android', 'gradle.properties')
  if (!fs.existsSync(gradleProperties)) return

  const settings = new Map([
    ['org.gradle.jvmargs', '-Xmx1536m'],
    ['org.gradle.daemon', 'false'],
  ])
  const lines = fs.readFileSync(gradleProperties, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !settings.has(line.split('=', 1)[0]))

  for (const [key, value] of settings) lines.push(`${key}=${value}`)
  fs.writeFileSync(gradleProperties, `${lines.filter(Boolean).join('\n')}\n`)
}