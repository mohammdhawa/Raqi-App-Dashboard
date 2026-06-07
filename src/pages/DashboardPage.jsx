import { useState, useEffect, useCallback } from 'react'
import {
  Users, Building2, Layers, LayoutTemplate,
  FileText, CheckCircle2, Clock, XCircle,
  TrendingUp, AlertCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'

function formatShortDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
}

function SkeletonRect({ w = '100%', h = 16, r = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'var(--c-surface-2)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  )
}

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, loading }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--c-border)',
      borderRadius: 16, padding: '20px 20px 18px',
      boxShadow: 'var(--sh-card)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: iconBg ?? 'var(--c-surface)',
          color: iconColor ?? 'var(--c-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={19} />
        </div>
        {loading ? (
          <SkeletonRect w={52} h={28} r={8} />
        ) : (
          <div style={{
            fontSize: 28, fontWeight: 800, color: 'var(--c-text)',
            letterSpacing: -1, fontVariantNumeric: 'tabular-nums',
          }}>
            {value ?? '—'}
          </div>
        )}
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <SkeletonRect w="55%" h={13} />
          <SkeletonRect w="35%" h={11} />
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{label}</div>
          {sub != null && (
            <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 3 }}>{sub}</div>
          )}
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, sub, height = 180, loading, empty, emptyText, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--c-border)',
      borderRadius: 16, padding: '20px', boxShadow: 'var(--sh-card)',
    }}>
      <div style={{ marginBottom: 16 }}>
        {loading ? (
          <>
            <SkeletonRect w={140} h={14} />
            <div style={{ marginTop: 6 }}><SkeletonRect w={90} h={11} /></div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>{title}</div>
            {sub != null && <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3 }}>{sub}</div>}
          </>
        )}
      </div>
      {loading ? (
        <div style={{ height, background: 'var(--c-surface)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : empty ? (
        <div style={{
          height, borderRadius: 12, background: 'var(--c-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{emptyText}</span>
        </div>
      ) : children}
    </div>
  )
}

function RecentActivityItem({ label, sub, status, loading }) {
  const STATUS_META = {
    approved: { color: 'var(--c-approved)', bg: 'var(--c-approved-bg)', label: 'معتمد' },
    rejected: { color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)', label: 'مرفوض' },
    pending:  { color: '#D4900A',           bg: '#FFF8E1',              label: 'قيد الاعتماد' },
  }
  const meta = STATUS_META[status] ?? STATUS_META.pending
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--c-border)' }}>
        <SkeletonRect w={32} h={32} r={9} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonRect w="60%" h={12} />
          <SkeletonRect w="40%" h={10} />
        </div>
        <SkeletonRect w={60} h={22} r={999} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--c-border)' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: 'var(--c-surface)', color: 'var(--c-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileText size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{
        padding: '3px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 700,
        background: meta.bg, color: meta.color,
        whiteSpace: 'nowrap',
      }}>
        {meta.label}
      </span>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [statusBreakdown, setStatusBreakdown] = useState(null)
  const [activity, setActivity] = useState([])
  const [recentDocs, setRecentDocs] = useState([])
  const [staffDistribution, setStaffDistribution] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, statusRes, activityRes, recentRes, staffRes] = await Promise.allSettled([
        api.get('/admin/dashboard/stats'),
        api.get('/admin/dashboard/documents/status-breakdown'),
        api.get('/admin/dashboard/documents/activity', { params: { range: '30d' } }),
        api.get('/admin/dashboard/documents/recent', { params: { limit: 5 } }),
        api.get('/admin/dashboard/departments/staff-distribution'),
      ])
      setStats(statsRes.status === 'fulfilled' ? statsRes.value.data : null)
      setStatusBreakdown(statusRes.status === 'fulfilled' ? statusRes.value.data : null)
      setActivity(activityRes.status === 'fulfilled' ? (activityRes.value.data?.data ?? []) : [])
      setRecentDocs(recentRes.status === 'fulfilled' ? (recentRes.value.data?.documents ?? []) : [])
      setStaffDistribution(staffRes.status === 'fulfilled' ? (staffRes.value.data?.departments ?? []) : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  // Topbar refresh button
  useEffect(() => {
    window.addEventListener('topbar:refresh', fetchDashboard)
    return () => window.removeEventListener('topbar:refresh', fetchDashboard)
  }, [fetchDashboard])

  const statusCounts = {
    pending:  statusBreakdown?.pending  ?? 0,
    approved: statusBreakdown?.approved ?? 0,
    rejected: statusBreakdown?.rejected ?? 0,
  }
  const statusTotal = statusCounts.pending + statusCounts.approved + statusCounts.rejected
  const statusPct = n => statusTotal > 0 ? `${Math.round((n / statusTotal) * 100)}%` : '—'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور'

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Welcome banner ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(120deg, var(--c-primary) 0%, #1C3A5E 100%)',
        borderRadius: 18, padding: '28px 32px', marginBottom: 28,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(34,65,103,0.22)',
      }}>
        <div style={{
          position: 'absolute', top: -50, left: -50,
          width: 200, height: 200, borderRadius: '50%',
          background: 'rgba(200,163,107,0.1)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -30, right: 60,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: 'var(--c-accent)', textTransform: 'uppercase', marginBottom: 8 }}>
            {greeting}
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.4 }}>
            {user?.name ?? 'مرحباً بك'}
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6 }}>
            مرحباً في لوحة إدارة الراقي للاعتمادات. هنا نظرة سريعة على حالة المنظومة.
          </p>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard
          icon={Users}
          label="إجمالي المستخدمين"
          value={stats?.totalUsers}
          sub="حسابات نشطة في النظام"
          iconBg="rgba(34,65,103,0.08)" iconColor="var(--c-primary)"
          loading={loading}
        />
        <StatCard
          icon={Building2}
          label="الإدارات"
          value={stats?.totalDepartments}
          sub="وحدات تنظيمية مفعّلة"
          iconBg="rgba(200,163,107,0.12)" iconColor="#8A6A23"
          loading={loading}
        />
        <StatCard
          icon={Layers}
          label="الأقسام"
          value={stats?.totalSections}
          sub="أقسام تابعة للإدارات"
          iconBg="rgba(30,143,94,0.1)" iconColor="var(--c-approved)"
          loading={loading}
        />
        <StatCard
          icon={LayoutTemplate}
          label="قوالب المستندات"
          value={stats?.totalTemplates}
          sub="نماذج جاهزة للإطلاق"
          iconBg="rgba(101,78,163,0.1)" iconColor="#654EA3"
          loading={loading}
        />
      </div>

      {/* ── Two-column grid: activity chart + status breakdown ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginBottom: 24 }}>

        {/* Left: document activity chart */}
        <ChartCard
          title="نشاط المستندات"
          sub="آخر 30 يوماً"
          height={220}
          loading={loading}
          empty={activity.length === 0}
          emptyText="لا يوجد نشاط مسجّل خلال هذه الفترة"
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={activity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#E2E6EF" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: '#9AABBE' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9AABBE' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip labelFormatter={formatShortDate} contentStyle={{ borderRadius: 10, border: '1px solid #E2E6EF', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="submitted" name="مُرسلة" stroke="#224167" fill="#224167" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="approved"  name="معتمدة"  stroke="#1E8F5E" fill="#1E8F5E" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="rejected"  name="مرفوضة" stroke="#C0392B" fill="#C0392B" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Right: document status breakdown */}
        <div style={{
          background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 16, padding: '20px', boxShadow: 'var(--sh-card)',
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>توزيع حالات المستندات</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3 }}>نظرة عامة على مسار الاعتماد</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'pending',  label: 'قيد الاعتماد', icon: Clock,        bg: '#FFF8E1', color: '#D4900A' },
              { key: 'approved', label: 'معتمدة',      icon: CheckCircle2,  bg: 'var(--c-approved-bg)', color: 'var(--c-approved)' },
              { key: 'rejected', label: 'مرفوضة',     icon: XCircle,       bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)' },
            ].map(({ key, label, icon: Icon, bg, color }) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 11,
                background: bg, border: `1px solid ${color}22`,
              }}>
                <Icon size={16} style={{ color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : statusPct(statusCounts[key])}
                </span>
              </div>
            ))}
          </div>
          {!loading && statusTotal === 0 && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 10,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertCircle size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: 'var(--c-text-3)', lineHeight: 1.5 }}>
                لا توجد مستندات مسجّلة في النظام بعد
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row: staff distribution chart + recent docs ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Department staff distribution chart */}
        <ChartCard
          title="توزيع الموظفين على الإدارات"
          height={160}
          loading={loading}
          empty={staffDistribution.length === 0}
          emptyText="لا توجد بيانات إدارات بعد"
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={staffDistribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#E2E6EF" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9AABBE' }} axisLine={false} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9AABBE' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E2E6EF', fontSize: 12 }} />
              <Bar dataKey="userCount" name="عدد الموظفين" fill="#224167" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Recent documents list */}
        <div style={{
          background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 16, padding: '20px', boxShadow: 'var(--sh-card)',
        }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>آخر المستندات</div>
          </div>
          <div>
            {loading ? (
              [0, 1, 2, 3].map(i => <RecentActivityItem key={i} loading={true} />)
            ) : recentDocs.length > 0 ? (
              recentDocs.map(doc => (
                <RecentActivityItem
                  key={doc.id}
                  label={doc.title}
                  sub={`${doc.submittedBy} · ${formatShortDate(doc.createdAt)}`}
                  status={doc.status}
                />
              ))
            ) : (
              <div style={{
                marginTop: 6, padding: '24px 12px', borderRadius: 10,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  لا توجد مستندات حديثة بعد
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
