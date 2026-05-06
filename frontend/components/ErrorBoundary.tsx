'use client'
import React from 'react'

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0A0A18', color: '#e8e0d4', fontFamily: 'Georgia, serif',
          padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏡</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong.</h2>
          <p style={{ opacity: 0.6, marginBottom: '1.5rem' }}>
            Please refresh the page. If this keeps happening, try signing out and back in.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#A78BFA', color: '#0A0A18', border: 'none',
              borderRadius: '8px', padding: '0.6rem 1.4rem',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Refresh
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
