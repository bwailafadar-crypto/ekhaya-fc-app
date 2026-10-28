// Shown for any address the app doesn't have (an old or mistyped link), instead
// of an empty screen.
import { Link } from 'react-router-dom'

export default function NotFound() {
  return <section className="page not-found" style={{ textAlign: 'center', padding: '48px 16px' }}>
    <h1 style={{ fontSize: 22, marginBottom: 8 }}>Page not found</h1>
    <p style={{ opacity: 0.75, marginBottom: 20 }}>This page doesn't exist or has moved.</p>
    <Link className="button button-primary" to="/">Back to home</Link>
  </section>
}
