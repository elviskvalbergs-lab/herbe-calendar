'use client'
import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-bg text-text p-8">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-text-muted text-sm mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
