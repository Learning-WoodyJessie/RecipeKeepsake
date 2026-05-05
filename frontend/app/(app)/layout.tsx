// This file defines the layout for the application.
// Purpose: Provides a consistent structure and styling for all pages within the app.
// Why: Ensures a unified user experience across different pages.
// How: Wraps child components with shared layout elements like headers and footers.

'use client'
import AuthGuard from '@/components/AuthGuard'
import AppTopBar from '@/components/AppTopBar'
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--cream)' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <AppTopBar />
          <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</main>
        </div>
      </div>
    </AuthGuard>
  )
}
