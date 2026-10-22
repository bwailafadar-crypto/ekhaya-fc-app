import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../utils/logger'
import { clearReloadGuard, isOldVersionError, reloadOnce } from '../utils/reloadOnce'
import { Button, Card } from './UI'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean; message: string; path: string }

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '', path: '' }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error')
    return { hasError: true, message: message.slice(0, 200), path: window.location.hash.replace(/^#/, '') || '/' }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Anything can be thrown (even null), so never assume it is an Error.
    const where = (info.componentStack ?? '').split('\n').slice(0, 4).join('\n')
    if (error instanceof Error) error.stack = `${error.stack ?? ''}\n${where}`
    logError('render', error ?? new Error(`Empty error thrown${where}`))
    // After an update the phone may still ask for old files: load the new version once.
    if (isOldVersionError(this.state.message)) reloadOnce()
  }

  goHome = () => {
    window.location.hash = '#/'
    this.setState({ hasError: false, message: '', path: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="content" role="alert">
          <Card className="error-screen">
            <h2>Something went wrong</h2>
            <p>Please reload the app and try again.</p>
            <div className="admin-actions">
              <Button type="button" onClick={() => { clearReloadGuard(); window.location.reload() }}>Reload</Button>
              <Button type="button" variant="ghost" onClick={this.goHome}>Go to Home</Button>
            </div>
            {/* Shown so a screenshot tells the club exactly what broke. */}
            <small className="error-screen-detail">Page {this.state.path} · {this.state.message}</small>
          </Card>
        </main>
      )
    }

    return this.props.children
  }
}
