// Club-style story posters drawn in the browser (1080 × 1920, a phone story):
// Match day, Starting XI, Goal, Half-time and Full time. Everything comes from
// the app's own data (match, crests, players); an admin can add a big photo.
import type { Fixture, MatchEvent, Player } from '../types'
import { competitionLabel } from './competitions'

export const W = 1080
export const H = 1920

export type DesignKind = 'matchday' | 'lineup' | 'goal' | 'halftime' | 'fulltime'
export const DESIGNS: Array<{ kind: DesignKind; label: string; story: 'Match day' | 'Team news' | 'Goal' | 'Club' }> = [
  { kind: 'matchday', label: 'Match day', story: 'Match day' },
  { kind: 'lineup', label: 'Starting XI', story: 'Team news' },
  { kind: 'goal', label: 'Goal', story: 'Goal' },
  { kind: 'halftime', label: 'Half-time', story: 'Match day' },
  { kind: 'fulltime', label: 'Full time', story: 'Match day' },
]

export type DesignInput = {
  kind: DesignKind
  fixture: Fixture
  /** Image elements already loaded (crests may be missing: initials are drawn instead). */
  homeCrest: HTMLImageElement | null
  awayCrest: HTMLImageElement | null
  photo: HTMLImageElement | null
  players: Player[]
  events: MatchEvent[]
  /** Goal design: the goal to show. */
  goal?: MatchEvent | null
  headline?: string
}

const SERIF = '"Playfair Display", Georgia, serif'
const SANS = 'Oswald, "Arial Narrow", sans-serif'
const GOLD_DARK = '#8a6a08'

const isClub = (name: string) => /ekhaya/i.test(name)
const upper = (text: string) => text.toLocaleUpperCase()

function malawi(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Blantyre', ...options }).format(new Date(date))
}

/** Small seeded random so the background "map lines" are the same every time. */
function seeded(seed: number) {
  let value = seed
  return () => { value = (value * 16807) % 2147483647; return (value - 1) / 2147483646 }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Largest font size (down to `min`) at which the text fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, font: (size: number) => string, min = 20) {
  let current = size
  ctx.font = font(current)
  while (current > min && ctx.measureText(text).width > maxWidth) { current -= 2; ctx.font = font(current) }
  return current
}

function background(ctx: CanvasRenderingContext2D, seed: number, tone: 'gold' | 'dark' = 'gold') {
  const base = ctx.createLinearGradient(0, 0, W, H)
  if (tone === 'gold') { base.addColorStop(0, '#d9a91c'); base.addColorStop(0.5, '#c8960f'); base.addColorStop(1, '#a87b06') }
  else { base.addColorStop(0, '#2a220a'); base.addColorStop(1, '#0f0d08') }
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.55, H * 0.45, 40, W * 0.55, H * 0.45, W * 0.9)
  glow.addColorStop(0, tone === 'gold' ? 'rgba(255,226,120,.75)' : 'rgba(233,201,90,.28)')
  glow.addColorStop(1, 'rgba(255,226,120,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  // Thin "street map" lines like the club's posters.
  const random = seeded(seed)
  ctx.lineCap = 'round'
  for (let i = 0; i < 70; i += 1) {
    ctx.strokeStyle = tone === 'gold' ? `rgba(110,72,0,${0.12 + random() * 0.18})` : `rgba(233,201,90,${0.05 + random() * 0.08})`
    ctx.lineWidth = 1.5 + random() * 4
    ctx.beginPath()
    const x = random() * W; const y = random() * H
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + (random() - 0.5) * 500, y + (random() - 0.5) * 500, x + (random() - 0.5) * 600, y + (random() - 0.5) * 600, x + (random() - 0.5) * 700, y + (random() - 0.5) * 700)
    ctx.stroke()
  }
  // Frame.
  ctx.strokeStyle = 'rgba(255,255,255,.35)'
  ctx.lineWidth = 3
  roundRect(ctx, 34, 34, W - 68, H - 68, 46)
  ctx.stroke()
}

function crest(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, name: string, cx: number, cy: number, size: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.25)'
  ctx.shadowBlur = 24
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  if (image) {
    const inner = size * 0.86
    const ratio = Math.min(inner / image.width, inner / image.height)
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(image, cx - (image.width * ratio) / 2, cy - (image.height * ratio) / 2, image.width * ratio, image.height * ratio)
    ctx.restore()
  } else {
    const letters = name.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase()
    ctx.fillStyle = GOLD_DARK
    ctx.font = `700 ${Math.round(size * 0.38)}px ${SANS}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(letters, cx, cy + 2)
  }
}

/** Photo drawn to fill a rounded box (cropped from the top so faces stay in). */
function photoBox(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, radius: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(60,40,0,.45)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18
  roundRect(ctx, x, y, w, h, radius); ctx.fillStyle = '#fff'; ctx.fill()
  ctx.restore()
  ctx.save()
  roundRect(ctx, x + 8, y + 8, w - 16, h - 16, radius - 8); ctx.clip()
  const scale = Math.max((w - 16) / image.width, (h - 16) / image.height)
  const dw = image.width * scale; const dh = image.height * scale
  ctx.drawImage(image, x + 8 + ((w - 16) - dw) / 2, y + 8, dw, dh)
  // Gold fade at the bottom so text over it stays readable.
  const fade = ctx.createLinearGradient(0, y + h * 0.65, 0, y + h)
  fade.addColorStop(0, 'rgba(120,85,0,0)'); fade.addColorStop(1, 'rgba(120,85,0,.55)')
  ctx.fillStyle = fade; ctx.fillRect(x, y, w, h)
  ctx.restore()
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color = '#fff', align: CanvasTextAlign = 'center', shadow = true) {
  ctx.save()
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  if (shadow) { ctx.shadowColor = 'rgba(70,45,0,.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6 }
  ctx.fillText(value, x, y)
  ctx.restore()
}

function pin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(x, y, size * 0.42, Math.PI, 0)
  ctx.quadraticCurveTo(x + size * 0.42, y + size * 0.35, x, y + size * 0.9)
  ctx.quadraticCurveTo(x - size * 0.42, y + size * 0.35, x - size * 0.42, y)
  ctx.fill()
  ctx.fillStyle = '#c8960f'
  ctx.beginPath(); ctx.arc(x, y, size * 0.16, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function footer(ctx: CanvasRenderingContext2D, venue: string | null) {
  if (venue) {
    const label = upper(venue)
    ctx.font = `700 46px ${SERIF}`
    const width = Math.min(ctx.measureText(label).width, 620)
    pin(ctx, W - 90 - width / 2, 1700, 70)
    fit(ctx, label, 620, 46, (size) => `700 ${size}px ${SERIF}`)
    text(ctx, label, W - 90, 1830, ctx.font, '#fff', 'right')
  }
  text(ctx, 'ekhaya-fc-app.web.app', 90, 1830, `500 30px ${SANS}`, 'rgba(255,255,255,.85)', 'left', false)
}

function nickname(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.translate(W - 70, 620)
  ctx.rotate(Math.PI / 2)
  ctx.font = `900 120px ${SERIF}`
  ctx.fillStyle = 'rgba(120,80,0,.18)'
  ctx.textAlign = 'left'
  ctx.fillText('THE COWBOYS', 0, 0)
  ctx.restore()
}

function headerBlock(ctx: CanvasRenderingContext2D, fixture: Fixture, big: string, top = 240) {
  text(ctx, upper(competitionLabel(fixture.competition)), W / 2, top, `700 38px ${SANS}`, '#fff')
  if (fixture.round) text(ctx, upper(fixture.round), W / 2, top + 44, `500 30px ${SANS}`, 'rgba(255,255,255,.9)')
  const teams = `${upper(fixture.home)} || ${upper(fixture.away)}`
  fit(ctx, teams, W - 200, 54, (size) => `600 ${size}px ${SERIF}`)
  text(ctx, teams, W / 2, top + 120, ctx.font)
  fit(ctx, big, W - 140, 230, (size) => `900 ${size}px ${SERIF}`, 80)
  text(ctx, big, W / 2, top + 350, ctx.font)
}

function scoreOf(fixture: Fixture) { return `${fixture.homeScore ?? 0}–${fixture.awayScore ?? 0}` }

function shortName(name = '') {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name
}

export function drawDesign(ctx: CanvasRenderingContext2D, input: DesignInput) {
  const { kind, fixture, homeCrest, awayCrest, photo, players, events } = input
  ctx.clearRect(0, 0, W, H)
  const seed = [...fixture.id].reduce((sum, char) => sum + char.charCodeAt(0), 7)

  if (kind === 'matchday') {
    background(ctx, seed)
    nickname(ctx)
    headerBlock(ctx, fixture, input.headline?.trim() ? upper(input.headline.trim()) : 'MATCH DAY')
    // Left panel: crests, kick-off time and date.
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.22)'; roundRect(ctx, 80, 720, 270, 820, 30); ctx.fill(); ctx.restore()
    crest(ctx, homeCrest, fixture.home, 215, 860, 190)
    ctx.fillStyle = 'rgba(110,72,0,.6)'; ctx.fillRect(120, 1000, 190, 4)
    crest(ctx, awayCrest, fixture.away, 215, 1140, 190)
    text(ctx, `${malawi(fixture.date, { hour: '2-digit', minute: '2-digit', hour12: false })} HRS`, 215, 1340, `700 52px ${SERIF}`)
    text(ctx, upper(malawi(fixture.date, { weekday: 'short', day: 'numeric', month: 'short' })), 215, 1410, `600 36px ${SANS}`, 'rgba(255,255,255,.92)')
    if (photo) photoBox(ctx, photo, 400, 720, 600, 880, 40)
    else { ctx.save(); ctx.globalAlpha = 0.2; crest(ctx, homeCrest, fixture.home, 700, 1150, 560); ctx.restore() }
    footer(ctx, fixture.venue)
    return
  }

  if (kind === 'lineup') {
    background(ctx, seed, 'dark')
    const club = isClub(fixture.home) ? 'home' : 'away'
    const opponent = club === 'home' ? fixture.away : fixture.home
    text(ctx, upper(competitionLabel(fixture.competition)), W / 2, 200, `700 36px ${SANS}`, '#e9c95a', 'center', false)
    text(ctx, 'STARTING XI', W / 2, 360, `900 150px ${SERIF}`, '#fff', 'center', false)
    crest(ctx, club === 'home' ? homeCrest : awayCrest, club === 'home' ? fixture.home : fixture.away, W / 2 - 150, 500, 130)
    text(ctx, 'v', W / 2, 518, `600 50px ${SERIF}`, '#e9c95a', 'center', false)
    crest(ctx, club === 'home' ? awayCrest : homeCrest, opponent, W / 2 + 150, 500, 130)
    const starters = (fixture.startingPlayerIds ?? []).map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
    const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as Record<string, number>
    starters.sort((a, b) => (order[a.position ?? ''] ?? 4) - (order[b.position ?? ''] ?? 4))
    starters.slice(0, 11).forEach((player, index) => {
      const y = 640 + index * 88
      ctx.save(); ctx.fillStyle = index % 2 ? 'rgba(255,255,255,.04)' : 'rgba(233,201,90,.08)'; roundRect(ctx, 120, y, W - 240, 76, 18); ctx.fill(); ctx.restore()
      ctx.save(); ctx.fillStyle = '#e9c95a'; ctx.beginPath(); ctx.arc(176, y + 38, 28, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      text(ctx, player.number != null ? String(player.number) : '–', 176, y + 50, `700 32px ${SANS}`, '#15130d', 'center', false)
      const name = upper(player.name)
      fit(ctx, name, W - 480, 40, (size) => `600 ${size}px ${SANS}`)
      text(ctx, name, 232, y + 52, ctx.font, '#fff', 'left', false)
      if (player.position) text(ctx, player.position, W - 150, y + 50, `500 30px ${SANS}`, 'rgba(233,201,90,.85)', 'right', false)
    })
    if (!starters.length) text(ctx, 'Confirm the line-up first', W / 2, 1000, `500 44px ${SANS}`, 'rgba(255,255,255,.7)', 'center', false)
    const bench = (fixture.benchPlayerIds ?? []).map((id) => players.find((player) => player.id === id)?.name).filter(Boolean).map((name) => shortName(name))
    if (bench.length) {
      text(ctx, 'SUBS', W / 2, 1650, `700 34px ${SANS}`, '#e9c95a', 'center', false)
      const line = bench.join(' · ')
      fit(ctx, line, W - 200, 30, (size) => `400 ${size}px ${SANS}`, 18)
      text(ctx, line, W / 2, 1700, ctx.font, 'rgba(255,255,255,.85)', 'center', false)
    }
    const kick = `${upper(malawi(fixture.date, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${malawi(fixture.date, { hour: '2-digit', minute: '2-digit', hour12: false })}${fixture.venue ? ` · ${upper(fixture.venue)}` : ''}${fixture.formation ? ` · ${fixture.formation}` : ''}`
    fit(ctx, kick, W - 200, 34, (size) => `500 ${size}px ${SANS}`, 20)
    text(ctx, kick, W / 2, 1790, ctx.font, '#fff', 'center', false)
    text(ctx, 'ekhaya-fc-app.web.app', W / 2, 1850, `500 26px ${SANS}`, 'rgba(255,255,255,.6)', 'center', false)
    return
  }

  if (kind === 'goal') {
    background(ctx, seed)
    nickname(ctx)
    const goal = input.goal
    if (photo) photoBox(ctx, photo, 140, 560, 800, 900, 44)
    else { ctx.save(); ctx.globalAlpha = 0.22; crest(ctx, isClub(fixture.home) ? homeCrest : awayCrest, 'Ekhaya FC', W / 2, 1000, 620); ctx.restore() }
    text(ctx, upper(competitionLabel(fixture.competition)), W / 2, 200, `700 36px ${SANS}`)
    text(ctx, input.headline?.trim() ? upper(input.headline.trim()) : 'GOAL!', W / 2, 470, `900 260px ${SERIF}`)
    const scorer = upper(goal?.playerName || goal?.team || 'Ekhaya FC')
    fit(ctx, scorer, W - 160, 96, (size) => `900 ${size}px ${SERIF}`, 40)
    text(ctx, scorer, W / 2, 1560, ctx.font)
    if (goal) text(ctx, `${goal.minute}'${goal.assistPlayerName ? `  ·  ASSIST ${upper(goal.assistPlayerName)}` : ''}`, W / 2, 1625, `600 40px ${SANS}`)
    crest(ctx, homeCrest, fixture.home, 250, 1720, 110)
    text(ctx, scoreOf(fixture), W / 2, 1752, `900 96px ${SERIF}`)
    crest(ctx, awayCrest, fixture.away, W - 250, 1720, 110)
    text(ctx, 'ekhaya-fc-app.web.app', W / 2, 1850, `500 28px ${SANS}`, 'rgba(255,255,255,.85)', 'center', false)
    return
  }

  // Half-time / full time.
  background(ctx, seed, kind === 'fulltime' ? 'gold' : 'dark')
  if (kind === 'fulltime') nickname(ctx)
  const label = input.headline?.trim() ? upper(input.headline.trim()) : kind === 'fulltime' ? 'FULL TIME' : 'HALF TIME'
  text(ctx, upper(competitionLabel(fixture.competition)), W / 2, 220, `700 36px ${SANS}`, kind === 'fulltime' ? '#fff' : '#e9c95a', 'center', kind === 'fulltime')
  fit(ctx, label, W - 140, 200, (size) => `900 ${size}px ${SERIF}`, 80)
  text(ctx, label, W / 2, 440, ctx.font, '#fff', 'center', kind === 'fulltime')
  if (photo) photoBox(ctx, photo, 190, 520, 700, 560, 40)
  const top = photo ? 1180 : 760
  crest(ctx, homeCrest, fixture.home, 230, top + 110, 220)
  crest(ctx, awayCrest, fixture.away, W - 230, top + 110, 220)
  text(ctx, scoreOf(fixture), W / 2, top + 160, `900 170px ${SERIF}`, '#fff', 'center', kind === 'fulltime')
  const nameFont = (size: number) => `600 ${size}px ${SANS}`
  fit(ctx, upper(fixture.home), 340, 38, nameFont, 22); text(ctx, upper(fixture.home), 230, top + 290, ctx.font, '#fff', 'center', false)
  fit(ctx, upper(fixture.away), 340, 38, nameFont, 22); text(ctx, upper(fixture.away), W - 230, top + 290, ctx.font, '#fff', 'center', false)
  const goals = events.filter((event) => event.kind === 'goal').sort((a, b) => a.minute - b.minute)
  const side = (team: string) => goals.filter((event) => event.team.trim().toLowerCase() === team.trim().toLowerCase()).map((event) => `${shortName(event.playerName || 'Goal')} ${event.minute}'`)
  const homeGoals = side(fixture.home); const awayGoals = side(fixture.away)
  homeGoals.slice(0, 5).forEach((line, index) => text(ctx, `⚽ ${line}`, 90, top + 370 + index * 52, `500 34px ${SANS}`, '#fff', 'left', false))
  awayGoals.slice(0, 5).forEach((line, index) => text(ctx, `${line} ⚽`, W - 90, top + 370 + index * 52, `500 34px ${SANS}`, '#fff', 'right', false))
  footer(ctx, fixture.venue)
}

/** Loads an image from a data URL or a same-site path (null when it fails). */
export function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

export async function loadDesignFonts() {
  await import('@fontsource/playfair-display/700.css')
  await import('@fontsource/playfair-display/900.css')
  try {
    await Promise.all([
      document.fonts.load(`900 120px "Playfair Display"`), document.fonts.load(`700 60px "Playfair Display"`),
      document.fonts.load(`600 60px "Playfair Display"`), document.fonts.load(`700 60px Oswald`), document.fonts.load(`500 40px Oswald`),
    ])
  } catch { /* fallback fonts */ }
}
