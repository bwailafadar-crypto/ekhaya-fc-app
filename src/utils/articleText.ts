// Turns a pasted article (from the club website or anywhere) into clean
// article blocks: proper paragraphs, with ALL-CAPS section titles pulled out as
// headings. It decodes HTML bits like &#8217; and &hellip;, removes stray tags,
// and keeps paragraph breaks. When a whole article arrives as one block of text
// with no line breaks, it still separates the headings and groups the running
// text into readable paragraphs instead of one wall of words.
import type { NewsBodyBlock } from '../types'

let counter = 0
function blockId() {
  counter += 1
  return `block-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}`
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', middot: '·', bull: '•', deg: '°', eacute: 'é',
}

/** Decodes &#8217; &#x2019; &amp; &hellip; and friends into real characters. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED[name.toLowerCase()] ?? whole)
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code <= 0) return ''
  try { return String.fromCodePoint(code) } catch { return '' }
}

/** A word is "shouty" when it has letters and none of them are lower case. */
function shouty(token: string): boolean {
  return /[A-Z]/.test(token) && !/[a-z]/.test(token)
}
function hasLetter(token: string): boolean {
  return /[A-Za-z]/.test(token)
}

/** Pulls runs of 3+ consecutive capitalised words out of a line as headings. */
function splitHeadings(line: string): NewsBodyBlock[] {
  const tokens = line.split(/\s+/).filter(Boolean)
  const out: NewsBodyBlock[] = []
  let normal: string[] = []
  let i = 0
  const flushNormal = () => { if (normal.length) { out.push({ id: blockId(), type: 'paragraph', text: normal.join(' ') }); normal = [] } }
  while (i < tokens.length) {
    // Measure a run of shouty words (punctuation-only tokens may sit inside it).
    let j = i
    let letters = 0
    while (j < tokens.length && (shouty(tokens[j]) || !hasLetter(tokens[j]))) {
      if (shouty(tokens[j])) letters += 1
      j += 1
    }
    // Trim trailing punctuation-only tokens back onto the body.
    let end = j
    while (end > i && !hasLetter(tokens[end - 1])) end -= 1
    if (letters >= 3 && end - i >= 3) {
      flushNormal()
      out.push({ id: blockId(), type: 'heading', text: tokens.slice(i, end).join(' ') })
      i = end
    } else {
      normal.push(tokens[i])
      i += 1
    }
  }
  flushNormal()
  return out
}

/** Splits a long, break-free paragraph into readable ~3-sentence paragraphs. */
function groupSentences(text: string): string[] {
  if (text.length <= 400) return [text]
  const sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?\s*/g) ?? [text]
  const paras: string[] = []
  let buffer = ''
  for (const sentence of sentences) {
    buffer += sentence
    if (buffer.length >= 280) { paras.push(buffer.trim()); buffer = '' }
  }
  if (buffer.trim()) paras.push(buffer.trim())
  return paras.length ? paras : [text]
}

/**
 * Parses pasted article text into blocks. Existing photo blocks are untouched;
 * callers decide whether to keep them.
 */
export function parseArticleText(raw: string): NewsBodyBlock[] {
  if (!raw || !raw.trim()) return []
  // Turn common block-level HTML into line breaks, then drop any other tags.
  const withBreaks = raw
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  const text = decodeEntities(withBreaks)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
  // Each non-empty line is a chunk; blank lines separate chunks.
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const blocks: NewsBodyBlock[] = []
  for (const line of lines) {
    for (const piece of splitHeadings(line)) {
      if (piece.type === 'paragraph') {
        for (const para of groupSentences(piece.text)) blocks.push({ id: blockId(), type: 'paragraph', text: para })
      } else {
        blocks.push(piece)
      }
    }
  }
  return blocks
}
