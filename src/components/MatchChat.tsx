// Live fan chat on the match page (fixtures/{id}/chat). Open from team news
// until 2 hours after full time. Fans need only to be signed in; admins can
// delete messages, block a fan or close the chat.
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Lock, LockOpen, MessageCircle, Send, ShieldBan, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import type { Fixture } from '../types'
import { useToast } from './ToastContext'
import { chatOpen } from '../utils/chatOpen'
import { logAction } from '../utils/audit'

type ChatMessage = { id: string; uid: string; name: string; text: string; club?: boolean; createdAt?: { toMillis?: () => number } }

const MAX = 200
const WAIT_MS = 5000
const QUICK = ['⚽ Come on Ekhaya!', '🔥 What a move!', '👏 Great save', '😱 So close!', '💛 Ekhaya forever']
// Words that are hidden (shown as ***). The club can ask for more to be added.
const BLOCKED = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'nigger', 'whore', 'slut', 'idiot', 'stupid', 'mbuzi', 'chitsiru', 'nyoko', 'matako', 'mako']
const cleanText = (text: string) => BLOCKED.reduce((out, word) => out.replace(new RegExp(`\\b${word}\\w*`, 'gi'), (match) => '*'.repeat(match.length)), text)


export default function MatchChat({ fixture }: { fixture: Fixture }) {
  const { user, profile, role } = useAuth()
  const { showToast } = useToast()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const [messages, setMessages] = useState<{ fixtureId: string; items: ChatMessage[] } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [lastSent, setLastSent] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const listRef = useRef<HTMLOListElement>(null)
  const open = chatOpen(fixture, now)
  const items = messages?.fixtureId === fixture.id ? messages.items : []

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => onSnapshot(
    query(collection(db, 'fixtures', fixture.id, 'chat'), orderBy('createdAt', 'desc'), limit(60)),
    (snapshot) => setMessages({ fixtureId: fixture.id, items: snapshot.docs.map((item) => ({ ...(item.data() as Omit<ChatMessage, 'id'>), id: item.id })).reverse() }),
    () => setMessages({ fixtureId: fixture.id, items: [] }),
  ), [fixture.id])

  // Keep the newest message in view.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [items.length])

  const wait = Math.max(0, Math.ceil((lastSent + WAIT_MS - now) / 1000))

  async function send(message: string) {
    const body = message.trim().slice(0, MAX)
    if (!user || !body || sending || wait > 0 || !open) return
    setSending(true)
    try {
      await addDoc(collection(db, 'fixtures', fixture.id, 'chat'), {
        uid: user.uid, name: (profile?.fullName ?? '').slice(0, 120), text: cleanText(body),
        ...(isAdmin ? { club: true } : {}), createdAt: serverTimestamp(),
      })
      setText('')
      setLastSent(now)
    } catch (error) {
      const code = (error as { code?: string }).code
      showToast(code === 'permission-denied' ? 'Your message was not sent. The chat may be closed, or sign out and in again.' : 'Your message was not sent. Check your connection.', 'error')
    } finally { setSending(false) }
  }

  async function remove(message: ChatMessage) {
    try { await deleteDoc(doc(db, 'fixtures', fixture.id, 'chat', message.id)) } catch { showToast('The message was not deleted.', 'error') }
  }
  async function block(message: ChatMessage) {
    if (!window.confirm(`Block ${message.name || 'this fan'}? They will not be able to chat, vote or predict until you unblock them in Admin → Fans.`)) return
    try {
      await updateDoc(doc(db, 'users', message.uid), { disabled: true, updatedAt: serverTimestamp() })
      await deleteDoc(doc(db, 'fixtures', fixture.id, 'chat', message.id))
      void logAction('Blocked a fan (chat)', `${message.name || ''}: "${String(message.text ?? '').slice(0, 80)}"`)
      showToast(`${message.name || 'The fan'} is blocked.`)
    } catch { showToast('Only the superadmin can block fans.', 'error') }
  }
  async function toggleChat() {
    try { await updateDoc(doc(db, 'fixtures', fixture.id), { chatClosed: !fixture.chatClosed, updatedAt: serverTimestamp() }) } catch { showToast('The chat was not changed.', 'error') }
  }

  const time = (message: ChatMessage) => { const ms = message.createdAt?.toMillis?.(); return ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now' }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(text) }

  return <section className="match-chat" aria-label="Fan chat">
    <div className="matchday-section-title"><h2><MessageCircle size={18} aria-hidden="true" /> Fan chat</h2><span>{open ? <><i className="live-pulse-dot" /> Open</> : 'Closed'}</span></div>
    {isAdmin && <button type="button" className="chat-admin-toggle" onClick={() => void toggleChat()}>{fixture.chatClosed ? <><LockOpen size={14} /> Open the chat</> : <><Lock size={14} /> Close the chat</>}</button>}
    <ol className="chat-list" ref={listRef}>
      {!items.length && <li className="chat-empty">{open ? 'Be the first to say something! 💛' : 'The chat opens when the team news is out and stays open until 2 hours after full time.'}</li>}
      {items.map((message) => {
        const mine = message.uid === user?.uid
        return <li key={message.id} className={`chat-msg${mine ? ' mine' : ''}${message.club ? ' club' : ''}`}>
          <div className="chat-bubble">
            <span className="chat-name">{mine ? 'You' : message.name || 'Fan'}{message.club && <em>Club</em>}<small>{time(message)}</small></span>
            <p>{message.text}</p>
          </div>
          {(isAdmin || mine) && <div className="chat-tools">
            <button type="button" aria-label="Delete message" onClick={() => void remove(message)}><Trash2 size={13} /></button>
            {isAdmin && !mine && !message.club && <button type="button" aria-label={`Block ${message.name}`} onClick={() => void block(message)}><ShieldBan size={13} /></button>}
          </div>}
        </li>
      })}
    </ol>
    {open && user && <>
      <div className="chat-quick" role="group" aria-label="Quick messages">{QUICK.map((quick) => <button type="button" key={quick} disabled={sending || wait > 0} onClick={() => void send(quick)}>{quick}</button>)}</div>
      <form className="chat-form" onSubmit={submit}>
        <input value={text} maxLength={MAX} placeholder={wait > 0 ? `Wait ${wait}s…` : 'Say something to the fans…'} aria-label="Your message" onChange={(event) => setText(event.target.value)} disabled={sending} />
        <button type="submit" aria-label="Send" disabled={sending || wait > 0 || !text.trim()}><Send size={17} /></button>
      </form>
      <p className="chat-rules">Be respectful. Messages with bad words are hidden and the club can block anyone.</p>
    </>}
  </section>
}
