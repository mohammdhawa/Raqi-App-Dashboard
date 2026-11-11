import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'

// Shown in the content area while a page's code is fetched. Delayed, so a
// chunk that arrives quickly (the usual case) never flashes it.
function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-label="جارٍ التحميل">
      <span /><span /><span />
    </div>
  )
}

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
            background: 'rgba(14,22,19,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 25,
          }}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onNavigate={closeSidebar} />

      <Topbar onMenuToggle={() => setSidebarOpen(o => !o)} />

      <main className="adm-main">
        <Suspense fallback={<PageLoading />}>
          <Outlet key={location.pathname} />
        </Suspense>
      </main>
    </div>
  )
}
