import { lazy, Suspense } from 'react'
import { useAuth } from '../context/AuthContext'
import ActionCards from '../components/dashboard/ActionCards'
import SectionHeading from '../components/dashboard/SectionHeading'

// Statistics and charts are admin-only (`dashboard.view`), and they are the
// only use of the charting library, so they live in their own chunk: everyone
// else gets the action cards alone, without a page of dashes or the download.
const AdminOverview = lazy(() => import('../components/dashboard/AdminOverview'))

export default function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور'

  return (
    <div className="px-4 py-6 sm:px-7 sm:py-8" style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Welcome banner ─────────────────────────────────────────────────── */}
      <div className="px-5 py-6 sm:px-8 sm:py-7" style={{
        background: 'var(--c-primary)',
        borderRadius: 8, marginBottom: 28,
        position: 'relative', overflow: 'hidden',
        /* Sunaa signature 05: bronze base rule under a dark block */
        borderBottom: '4px solid var(--c-accent)',
      }}>
        {/* Signature 02: hairline site grid */}
        <div className="site-grid-dark" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        {/* Signature 03: cropped Kufic monogram */}
        <img
          src="/assets/sunaa-mark-on-dark.png" alt="" aria-hidden="true"
          className="hidden sm:block"
          style={{
            position: 'absolute', left: 24, top: -18, height: 190, width: 190,
            objectFit: 'contain', opacity: 0.16, pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--c-accent-on-dark)', marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, background: 'var(--c-accent)', flexShrink: 0 }} />
            {greeting}
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: -0.4 }}>
            {user?.name ?? 'مرحباً بك'}
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            {isAdmin
              ? 'مرحباً في لوحة إدارة صنع للإنشاءات. هنا ما ينتظرك اليوم ونظرة سريعة على حالة المنظومة.'
              : 'مرحباً في لوحة صنع للإنشاءات. هنا ما ينتظرك اليوم.'}
          </p>
        </div>
      </div>

      {/* ── Waiting for you (every role) ───────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeading index="01" title="بانتظارك اليوم" />
        <ActionCards />
      </section>

      {isAdmin && (
        <Suspense fallback={null}>
          <AdminOverview />
        </Suspense>
      )}
    </div>
  )
}
