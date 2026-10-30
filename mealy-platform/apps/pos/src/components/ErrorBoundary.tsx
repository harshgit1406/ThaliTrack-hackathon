import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('POS screen recovered from an unexpected error.', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="recovery-screen">
          <div className="recovery-card">
            <TriangleAlert size={30} aria-hidden="true" />
            <h1>We hit a snag, but your saved bill is safe.</h1>
            <p>Refresh this screen to continue. If it happens again, note the time and contact your manager.</p>
            <button className="button button-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={18} /> Refresh POS
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
