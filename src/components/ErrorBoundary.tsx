import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../utils/logger'
import { Button, Card } from './UI'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Anything can be thrown (even null), so never assume it is an Error.
    const where = (info.componentStack ?? '').split('\n').slice(0, 4).join('\n')
    if (error instanceof Error) error.stack = `${error.stack ?? ''}\n${where}`
    logError('render', error ?? new Error(`Empty error thrown${where}`))
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="content" role="alert">
          <Card>
            <h2>Something went wrong</h2>
            <p>Please reload the app and try again.</p>
            <Button type="button" onClick={() => window.location.reload()}>Reload</Button>
          </Card>
        </main>
      )
    }

    return this.props.children
  }
}
