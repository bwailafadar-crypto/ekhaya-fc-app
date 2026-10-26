// Admin activity log: who did what, and when. Only the superadmin can read it,
// and nobody can change or delete an entry (enforced by the database rules).
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

export async function logAction(action: string, detail = '') {
  const user = auth.currentUser
  if (!user) return
  try {
    await addDoc(collection(db, 'auditLogs'), { action: action.slice(0, 60), detail: detail.slice(0, 300), by: user.uid, byName: (user.displayName || user.email || '').slice(0, 80), at: serverTimestamp() })
  } catch { /* the action itself already succeeded */ }
}
