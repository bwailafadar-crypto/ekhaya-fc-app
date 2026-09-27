import { Component, type ReactNode } from 'react'
import { Button, Card } from './UI'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
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
