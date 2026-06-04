import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar on navigation (mobile)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          className="lg:hidden"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,32,50,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 25,
          }}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onNavigate={closeSidebar} />

      <Topbar onMenuToggle={() => setSidebarOpen(o => !o)} />

      <main className="adm-main">
        <Outlet key={location.pathname} />
      </main>
    </div>
  )
}
