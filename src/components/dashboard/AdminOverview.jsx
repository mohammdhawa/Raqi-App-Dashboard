import { useState, useEffect, useCallback } from 'react'
import {
  Users, Building2, Layers, LayoutTemplate,
  FileText, CheckCircle2, Clock, XCircle,
  TrendingUp, AlertCircle,
} from 'lucide-react'
import api from '../../services/api'
import BlockProgress from '../ui/BlockProgress'
import SectionHeading from './SectionHeading'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'

/**
 * The admin half of the home page: company-wide statistics and charts.
 *
 * Its endpoints sit behind `dashboard.view`, which only admins hold, so the
 * home page mounts it for admins alone — and loads it as a separate chunk, so
 * nobody else downloads the charting library.
 */

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
      borderRadius: 8, padding: '20px 20px 18px',
      boxShadow: 'var(--sh-card)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 8, flexShrink: 0,
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
            fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 600, color: 'var(--c-text)',
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
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3 }}>{sub}</div>
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
      borderRadius: 8, padding: '20px', boxShadow: 'var(--sh-card)',
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
        <div style={{ height, background: 'var(--c-surface)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : empty ? (
        <div style={{
          height, borderRadius: 8, background: 'var(--c-surface)',
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
    pending:  { color: '#8A5A0B',           bg: '#FBF1D9',              label: 'قيد الاعتماد' },
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
        width: 32, height: 32, borderRadius: 4, flexShrink: 0,
        background: 'var(--c-surface)', color: 'var(--c-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileText size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{
        padding: '3px 10px', borderRadius: 2,
        fontSize: 12, fontWeight: 700,
        background: meta.bg, color: meta.color,
        whiteSpace: 'nowrap',
      }}>
        {meta.label}
      </span>
    </div>
  )
}

export default function AdminOverview() {
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

  return (
    <>
      <SectionHeading index="02" title="حالة المنظومة" />

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatCard
          icon={Users}
          label="إجمالي المستخدمين"
          value={stats?.totalUsers}
          sub="حسابات نشطة في النظام"
          iconBg="rgba(29,84,70,0.08)" iconColor="var(--c-primary)"
          loading={loading}
        />
        <StatCard
          icon={Building2}
          label="الإدارات"
          value={stats?.totalDepartments}
          sub="وحدات تنظيمية مفعّلة"
          iconBg="var(--c-accent-tint)" iconColor="var(--c-accent-text)"
          loading={loading}
        />
        <StatCard
          icon={Layers}
          label="الأقسام"
          value={stats?.totalSections}
          sub="أقسام تابعة للإدارات"
          iconBg="rgba(46,125,91,0.1)" iconColor="var(--c-approved)"
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
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 mb-6">

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
              <CartesianGrid stroke="#D6D1C6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12, fill: '#6F7873' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6F7873' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip labelFormatter={formatShortDate} contentStyle={{ borderRadius: 4, border: '1px solid #D6D1C6', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="submitted" name="مُرسلة" stroke="#1D5446" fill="#1D5446" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="approved"  name="معتمدة"  stroke="#857245" fill="#857245" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="rejected"  name="مرفوضة" stroke="#B3261E" fill="#B3261E" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Right: document status breakdown */}
        <div style={{
          background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 8, padding: '20px', boxShadow: 'var(--sh-card)',
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>توزيع حالات المستندات</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3 }}>نظرة عامة على مسار الاعتماد</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'pending',  label: 'قيد الاعتماد', icon: Clock,        bg: '#FBF1D9', color: '#8A5A0B' },
              { key: 'approved', label: 'معتمدة',      icon: CheckCircle2,  bg: 'var(--c-approved-bg)', color: 'var(--c-approved)' },
              { key: 'rejected', label: 'مرفوضة',     icon: XCircle,       bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)' },
            ].map(({ key, label, icon: Icon, bg, color }) => (
              <div key={key} style={{
                padding: '10px 12px 12px', borderRadius: 4,
                background: bg, border: `1px solid color-mix(in srgb, ${color} 13%, transparent)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <Icon size={16} style={{ color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
                    {loading ? '—' : statusPct(statusCounts[key])}
                  </span>
                </div>
                <BlockProgress
                  value={loading ? 0 : statusCounts[key]} max={statusTotal} blocks={10}
                  color={color} track="rgba(14,22,19,0.10)" height={5} label={label}
                />
              </div>
            ))}
          </div>
          {!loading && statusTotal === 0 && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 4,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertCircle size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.5 }}>
                لا توجد مستندات مسجّلة في النظام بعد
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row: staff distribution chart + recent docs ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

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
              <CartesianGrid stroke="#D6D1C6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6F7873' }} axisLine={false} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6F7873' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ borderRadius: 4, border: '1px solid #D6D1C6', fontSize: 12 }} />
              <Bar dataKey="userCount" name="عدد الموظفين" fill="#1D5446" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Recent documents list */}
        <div style={{
          background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 8, padding: '20px', boxShadow: 'var(--sh-card)',
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
                marginTop: 6, padding: '24px 12px', borderRadius: 4,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  لا توجد مستندات حديثة بعد
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
