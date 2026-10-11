// Share cards: club-styled images (result, starting XI, man of the match) drawn
// on a canvas in the browser, then shared to WhatsApp/Facebook or downloaded.
// No server needed, so it works on the free plan.

export type ShareTeam = { name: string; logo: string | null }
export type SharePlayer = { name: string; number: number | null; photo: string | null }

export type ShareCard =
  | { kind: 'result'; home: ShareTeam; away: ShareTeam; homeScore: number; awayScore: number; status: string; competition: string; date: string; venue: string; homeScorers: string[]; awayScorers: string[] }
  | { kind: 'lineup'; opponent: ShareTeam; club: ShareTeam; competition: string; date: string; formation: string; lines: SharePlayer[][]; subs: string[] }
  | { kind: 'motm'; club: ShareTeam; player: SharePlayer; votes: number | null; share: number | null; match: string; competition: string }

const W = 1080
const H = 1350
const GOLD = '#C9A227'
const GOLD_LIGHT = '#E8C95A'
const INK = '#1C1C1C'
const MUTED = '#6B6455'

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return (words[0] ?? 'FC').slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

/** Shrinks text until it fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: string, family: string) {
  let s = size
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2 } while (ctx.measureText(text).width > maxWidth && s > 12)
}

function background(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#FFFDF7')
  bg.addColorStop(1, '#F5EEDB')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.1, 40, W * 0.8, H * 0.1, 700)
  glow.addColorStop(0, 'rgba(232, 201, 90, 0.35)')
  glow.addColorStop(1, 'rgba(232, 201, 90, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  // Gold frame
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 6
  ctx.strokeRect(28, 28, W - 56, H - 56)
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)'
  ctx.lineWidth = 2
  ctx.strokeRect(44, 44, W - 88, H - 88)
}

function header(ctx: CanvasRenderingContext2D, eyebrow: string, title: string) {
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD
  ctx.font = '600 30px Inter, sans-serif'
  ctx.fillText(eyebrow.toUpperCase(), W / 2, 120)
  ctx.fillStyle = INK
  fitText(ctx, title.toUpperCase(), W - 160, 76, '700', 'Oswald, sans-serif')
  ctx.fillText(title.toUpperCase(), W / 2, 205)
}

function footer(ctx: CanvasRenderingContext2D) {
  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = '500 26px Inter, sans-serif'
  ctx.fillText('ekhaya-fc-app.web.app', W / 2, H - 78)
  ctx.fillStyle = GOLD
  ctx.fillRect(W / 2 - 60, H - 130, 120, 4)
}

async function crest(ctx: CanvasRenderingContext2D, team: ShareTeam, cx: number, cy: number, size: number) {
  const img = await loadImage(team.logo)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, size / 2 + 14, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = 'rgba(120, 90, 10, 0.25)'
  ctx.shadowBlur = 30
  ctx.fill()
  ctx.restore()
  if (img) {
    const ratio = Math.min(size / img.width, size / img.height)
    ctx.drawImage(img, cx - img.width * ratio / 2, cy - img.height * ratio / 2, img.width * ratio, img.height * ratio)
  } else {
    ctx.fillStyle = GOLD
    ctx.textAlign = 'center'
    ctx.font = `700 ${Math.round(size * 0.38)}px Oswald, sans-serif`
    ctx.fillText(initials(team.name), cx, cy + size * 0.13)
  }
}

async function avatar(ctx: CanvasRenderingContext2D, player: SharePlayer, cx: number, cy: number, r: number) {
  const img = await loadImage(player.photo)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.clip()
  if (img) {
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height)
    ctx.drawImage(img, cx - img.width * scale / 2, cy - img.height * scale / 2, img.width * scale, img.height * scale)
  } else {
    ctx.fillStyle = '#F3E7C2'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = GOLD
    ctx.textAlign = 'center'
    ctx.font = `700 ${Math.round(r * 0.8)}px Oswald, sans-serif`
    ctx.fillText(initials(player.name), cx, cy + r * 0.28)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = Math.max(3, r * 0.06)
  ctx.stroke()
}

async function drawResult(ctx: CanvasRenderingContext2D, card: Extract<ShareCard, { kind: 'result' }>) {
  header(ctx, card.competition, card.status)
  await crest(ctx, card.home, 260, 420, 170)
  await crest(ctx, card.away, W - 260, 420, 170)
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.font = '700 170px Oswald, sans-serif'
  ctx.fillText(`${card.homeScore}–${card.awayScore}`, W / 2, 480)
  fitText(ctx, card.home.name, 340, 36, '600', 'Inter, sans-serif')
  ctx.fillText(card.home.name, 260, 620)
  fitText(ctx, card.away.name, 340, 36, '600', 'Inter, sans-serif')
  ctx.fillText(card.away.name, W - 260, 620)

  // Scorers, one column per side.
  ctx.fillStyle = 'rgba(201, 162, 39, 0.5)'
  ctx.fillRect(W / 2 - 1, 690, 2, 360)
  const col = (names: string[], x: number) => {
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    names.slice(0, 7).forEach((name, i) => {
      fitText(ctx, `⚽ ${name}`, 420, 32, '500', 'Inter, sans-serif')
      ctx.fillText(`⚽ ${name}`, x, 730 + i * 50)
    })
    if (names.length > 7) { ctx.fillStyle = MUTED; ctx.fillText(`+${names.length - 7} more`, x, 730 + 7 * 50) }
  }
  col(card.homeScorers, 270)
  col(card.awayScorers, W - 270)

  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = '500 30px Inter, sans-serif'
  ctx.fillText([card.date, card.venue].filter(Boolean).join(' · '), W / 2, 1140)
}

async function drawLineup(ctx: CanvasRenderingContext2D, card: Extract<ShareCard, { kind: 'lineup' }>) {
  header(ctx, `${card.competition} · ${card.formation}`, `Starting XI v ${card.opponent.name}`)
  // Pitch
  const px = 110, py = 250, pw = W - 220, ph = 800
  const grass = ctx.createLinearGradient(0, py, 0, py + ph)
  grass.addColorStop(0, '#2F7D46')
  grass.addColorStop(1, '#246338')
  ctx.fillStyle = grass
  ctx.beginPath()
  ctx.roundRect(px, py, pw, ph, 28)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 3
  ctx.strokeRect(px + 24, py + 24, pw - 48, ph - 48)
  ctx.beginPath(); ctx.moveTo(px + 24, py + ph / 2); ctx.lineTo(px + pw - 24, py + ph / 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(W / 2, py + ph / 2, 80, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeRect(W / 2 - 160, py + ph - 24 - 130, 320, 130)
  ctx.strokeRect(W / 2 - 160, py + 24, 320, 130)

  // Attack at the top, keeper at the bottom.
  const lines = [...card.lines].reverse().filter((line) => line.length)
  const rowGap = (ph - 190) / Math.max(1, lines.length - 1)
  for (let row = 0; row < lines.length; row += 1) {
    const line = lines[row]
    const y = py + 80 + row * rowGap
    for (let i = 0; i < line.length; i += 1) {
      const x = px + (pw / (line.length + 1)) * (i + 1)
      const player = line[i]
      await avatar(ctx, player, x, y - 8, 44)
      if (player.number != null) {
        ctx.beginPath(); ctx.arc(x + 34, y - 44, 18, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill()
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = '700 20px Inter, sans-serif'
        ctx.fillText(String(player.number), x + 34, y - 37)
      }
      const surname = player.name.trim().split(/\s+/).slice(-1)[0] ?? player.name
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      fitText(ctx, surname, pw / (line.length + 1) - 8, 26, '600', 'Inter, sans-serif')
      ctx.fillText(surname, x, y + 66)
    }
  }
  if (card.subs.length) {
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    const text = `SUBS: ${card.subs.join(', ')}`
    fitText(ctx, text, W - 180, 28, '500', 'Inter, sans-serif')
    ctx.fillText(text, W / 2, 1110)
  }
  ctx.fillStyle = MUTED
  ctx.font = '500 28px Inter, sans-serif'
  ctx.fillText(card.date, W / 2, 1165)
}

async function drawMotm(ctx: CanvasRenderingContext2D, card: Extract<ShareCard, { kind: 'motm' }>) {
  header(ctx, card.competition, "Fans' man of the match")
  await avatar(ctx, card.player, W / 2, 560, 230)
  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  fitText(ctx, card.player.name.toUpperCase(), W - 180, 84, '700', 'Oswald, sans-serif')
  ctx.fillText(card.player.name.toUpperCase(), W / 2, 905)
  if (card.player.number != null) {
    ctx.fillStyle = GOLD
    ctx.font = '700 46px Oswald, sans-serif'
    ctx.fillText(`#${card.player.number}`, W / 2, 970)
  }
  ctx.fillStyle = MUTED
  ctx.font = '500 32px Inter, sans-serif'
  ctx.fillText(card.match, W / 2, 1050)
  if (card.share != null) {
    ctx.fillStyle = GOLD
    ctx.font = '600 32px Inter, sans-serif'
    ctx.fillText(`${card.share}% of fan votes${card.votes ? ` · ${card.votes} vote${card.votes === 1 ? '' : 's'}` : ''}`, W / 2, 1105)
  }
  // Star burst
  ctx.fillStyle = GOLD_LIGHT
  ctx.font = '72px serif'
  ctx.fillText('★', W / 2, 300)
}

/** Draws a share card and returns it as a PNG. */
export async function renderShareCard(card: ShareCard): Promise<Blob> {
  try { await Promise.all(['700 80px Oswald', '600 30px Inter', '500 30px Inter'].map((font) => document.fonts.load(font))) } catch { /* system fonts are fine */ }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Images are not supported on this device.')
  background(ctx)
  if (card.kind === 'result') await drawResult(ctx, card)
  else if (card.kind === 'lineup') await drawLineup(ctx, card)
  else await drawMotm(ctx, card)
  footer(ctx)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The image could not be made.')), 'image/png'))
}

/** Opens the phone's share sheet (WhatsApp, Facebook…) or downloads the image. */
export async function shareImage(blob: Blob, fileName: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}
