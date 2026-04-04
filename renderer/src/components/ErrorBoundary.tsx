import React from 'react'
import { handleError } from '../../lib/error-handler'

// Error boundaries must be class components — getDerivedStateFromError 
// and componentDidCatch have no hook equivalents.
interface Props { children: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  // called during render when a child throws; flips hasError to show fallback
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  // called after fallback renders; safe for side effects like logging and dialogs
  componentDidCatch(error: Error, _errorInfo: React.ErrorInfo) {
    handleError(error)
    window.dialog.showError('Something went wrong :( Please reload the app.')
  }

  // show children normally; hide them if something broke
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
