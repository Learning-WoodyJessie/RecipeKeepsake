// This file defines the layout for the application.
// Purpose: Provides a consistent structure and styling for all pages within the app.
// Why: Ensures a unified user experience across different pages.
// How: Wraps child components with shared layout elements like headers and footers.

'use client'
import { useState } from 'react'
import AuthGuard from '@/components/AuthGuard'
import AppTopBar from '@/components/AppTopBar'
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <AuthGuard>
      <style>{`
        /* Desktop: sidebar is always in the flow */
        .rk-sidebar-wrap { display: flex; }
        @media (max-width: 699px) {
          /* Mobile: sidebar becomes a fixed drawer */
          .rk-sidebar-wrap { display: block; }
        }
      `}</style>

      <div className="rk-sidebar-wrap" style={{ height: '100vh', overflow: 'hidden', background: 'var(--cream)' }}>
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'none',
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40,
            }}
            className="rk-mobile-backdrop"
          />
        )}

        <style>{`
          @media (max-width: 699px) {
            .rk-mobile-backdrop { display: block !important; }
          }
        `}</style>

        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100vh' }}>
          <AppTopBar onMenuClick={() => setSidebarOpen(o => !o)} />
          <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</main>
        </div>
      </div>
    </AuthGuard>
  )
}
