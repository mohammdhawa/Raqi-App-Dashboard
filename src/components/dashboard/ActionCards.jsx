import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Inbox, CalendarCheck, Fingerprint, UserX, Plane, WalletCards, ArrowLeft,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import { damascusToday, formatTime, readDayStatus } from '../../utils/attendanceCapture'
import { canReviewLeave, readLeaveBalance } from '../../utils/leave'

/**
 * "Waiting for you" — the part of the home page every role can use.
 *
 * The statistics below it are behind `dashboard.view`, which only admins hold,
 * so without this a manager or employee landed on a page of dashes. Each card
 * is one thing the signed-in person can act on or needs to know today, and
 * links to the page where they do it.
 *
 * Every card mirrors the gate of the page it links to, so nobody is shown a
 * number they cannot open. A request that fails drops its card rather than
 * showing a zero that would read as "nothing to do".
 */

// Paginated payloads arrive under different keys; find the page object.
function pickPage(data, keys) {
  for (const k of keys) {
    const v = data?.[k]
    if (v && Array.isArray(v.data)) return v
  }
  if (data && Array.isArray(data.data)) return data
  if (Array.isArray(data)) return { data, last_page: 1, total: data.length }
  return null
}

const days = n => (Number.isInteger(n) ? String(n) : n.toFixed(1))

// Each card is reported through `onCard` as soon as its own request settles,
// so a slow endpoint holds back one card, not the whole row.
function loadCards({ user, canCheckAttendance, canViewAttendance }, onCard) {
  const role = user?.role
  const jobs = []
  const add = (order, run) => jobs.push(
    run().then(card => { if (card) onCard({ order, ...card }) }, () => {})
  )

  // Documents waiting on this person's signature.
  if (['admin', 'chief', 'manager'].includes(role)) {
    add(1, async () => {
      const res = await api.get('/documents', { params: { type: 'inbox', status: 'pending' } })
      const total = res.data?.documents?.total
      if (total == null) return null
      return {
        key: 'docs', to: '/documents/inbox', icon: Inbox, urgent: total > 0,
        value: total, label: 'مستندات بانتظار اعتمادك',
        sub: total > 0 ? 'افتح الوارد للمراجعة' : 'لا شيء بانتظارك في الوارد',
      }
    })
  }

  // Leave requests. A manager or chief sees every request whose chain they sit
  // on, so only the ones at their own step (`can_review`) count as theirs. An
  // admin is never on a chain: for them it is the company-wide pending total.
  if (['manager', 'chief'].includes(role)) {
    add(2, async () => {
      const res = await api.get('/attendance/leave-requests/approvals', { params: { statuses: 'pending', per_page: 100 } })
      const page = pickPage(res.data, ['leave_requests', 'requests', 'approvals'])
      if (!page) return null
      const mine = page.data.filter(canReviewLeave).length
      const more = (page.last_page ?? 1) > 1
      return {
        key: 'leave', to: '/admin/leave', icon: CalendarCheck, urgent: mine > 0,
        value: more ? `${mine}+` : mine, label: 'طلبات إجازة بانتظار مراجعتك',
        sub: mine > 0 ? 'وافق أو ارفض من صفحة الإجازات' : 'لا توجد طلبات عند دورك الآن',
      }
    })
  } else if (role === 'admin') {
    add(2, async () => {
      const res = await api.get('/attendance/leave-requests/approvals', { params: { statuses: 'pending', per_page: 100 } })
      const page = pickPage(res.data, ['leave_requests', 'requests', 'approvals'])
      if (!page) return null
      return {
        key: 'leave', to: '/admin/leave', icon: CalendarCheck,
        value: page.total ?? page.data.length, label: 'طلبات إجازة قيد المراجعة',
        sub: 'على مستوى الشركة',
      }
    })
  }

  // Own attendance today.
  if (canCheckAttendance) {
    add(3, async () => {
      const res = await api.get('/attendance/my-records', { params: { date: damascusToday() } })
      const rows = pickPage(res.data, ['records'])?.data ?? res.data?.records ?? []
      const status = readDayStatus(Array.isArray(rows) ? rows : [])
      const card = { key: 'me', to: '/attendance', icon: Fingerprint, label: 'حضورك اليوم' }
      if (status.hasCheckOut) return { ...card, value: formatTime(status.last?.recorded_at), sub: 'سُجّل انصرافك' }
      if (status.lastCheckIn) return { ...card, value: formatTime(status.lastCheckIn.recorded_at), sub: 'سُجّل حضورك، لم تسجّل الانصراف بعد' }
      return { ...card, value: '—', sub: 'لم تسجّل حضورك اليوم' }
    })
  }

  // Team attendance today.
  if (canViewAttendance) {
    add(4, async () => {
      const res = await api.get('/attendance/absent-today', { params: { per_page: 1 } })
      const total = res.data?.employees?.total
      if (total == null) return null
      const working = res.data?.working_day ?? true
      return {
        key: 'absent', to: '/admin/attendance', icon: UserX,
        value: working ? total : '—', label: 'غائبون اليوم',
        sub: working ? 'لم يسجّلوا حضوراً حتى الآن' : 'اليوم ليس يوم عمل',
      }
    })
    add(5, async () => {
      const res = await api.get('/attendance/approved-leave-users', { params: { per_page: 1 } })
      const total = res.data?.users?.total
      if (total == null) return null
      return {
        key: 'onleave', to: '/admin/attendance', icon: Plane,
        value: total, label: 'في إجازة اليوم', sub: 'إجازات معتمدة تشمل اليوم',
      }
    })
  }

  // Own leave balance — the roles that can submit a request.
  if (['employee', 'manager', 'chief'].includes(role)) {
    add(6, async () => {
      const res = await api.get('/attendance/leave-balance')
      const b = readLeaveBalance(res.data)
      if (b.remaining == null) return null
      return {
        key: 'balance', to: '/admin/leave', icon: WalletCards,
        value: days(b.remaining), label: 'رصيد إجازاتك المتبقي',
        sub: b.allocated != null ? `من أصل ${days(b.allocated)} يوماً هذا العام` : 'يوم',
      }
    })
  }

  return Promise.all(jobs)
}

function ActionCard({ card }) {
  const Icon = card.icon
  // Something to act on: a solid green block on a bronze base (signature 05).
  const urgent = Boolean(card.urgent)
  const numeric = /^[d.+—]+$/.test(String(card.value))
  const fg = urgent ? '#fff' : 'var(--c-text)'
  const muted = urgent ? 'rgba(255,255,255,0.82)' : 'var(--c-text-2)'
  return (
    <Link
      to={card.to}
      className="action-card"
      style={{
        display: 'flex', flexDirection: 'column', gap: 14, textDecoration: 'none',
        padding: '18px 20px 16px', borderRadius: 8,
        background: urgent ? 'var(--c-primary)' : '#fff',
        border: `1px solid ${urgent ? 'var(--c-primary)' : 'var(--c-border)'}`,
        borderBottom: urgent ? '4px solid var(--c-accent)' : '1px solid var(--c-border)',
        color: fg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{
          lineHeight: 1, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          // Counts are figures, set in mono like drawing labels; a clock time
          // carries Arabic text and stays in the body face.
          ...(numeric
            ? { fontFamily: 'var(--font-mono)', fontSize: 34, letterSpacing: -1, direction: 'ltr' }
            : { fontSize: 26, paddingTop: 4 }),
        }}>
          {card.value}
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 4, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: urgent ? 'rgba(255,255,255,0.12)' : 'var(--c-surface)',
          color: urgent ? 'var(--c-accent-on-dark)' : 'var(--c-primary)',
        }}>
          <Icon size={18} strokeWidth={1.8} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{card.label}</div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 3, lineHeight: 1.5 }}>{card.sub}</div>
        </div>
        <ArrowLeft size={16} className="action-card-arrow" style={{ flexShrink: 0, color: urgent ? 'var(--c-accent-on-dark)' : 'var(--c-accent-text)' }} />
      </div>
    </Link>
  )
}

function CardSkeleton() {
  return (
    <div style={{
      height: 128, borderRadius: 8, background: '#fff', border: '1px solid var(--c-border)',
      padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div style={{ width: 64, height: 30, borderRadius: 4, background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '60%', height: 13, borderRadius: 4, background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  )
}

export default function ActionCards() {
  const { user, canCheckAttendance, canViewAttendance } = useAuth()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)

  const role = user?.role
  const refresh = useCallback(() => {
    let live = true
    const seen = new Set()
    loadCards({ user: { role }, canCheckAttendance, canViewAttendance }, card => {
      if (!live) return
      seen.add(card.key)
      // Replace in place on a refresh, so figures update without the row
      // collapsing to skeletons first.
      setCards(prev => [...prev.filter(c => c.key !== card.key), card].sort((a, b) => a.order - b.order))
    }).then(() => {
      if (!live) return
      // Drop cards whose request failed this time round.
      setCards(prev => prev.filter(c => seen.has(c.key)))
      setLoading(false)
    })
    return () => { live = false }
  }, [role, canCheckAttendance, canViewAttendance])

  useEffect(() => refresh(), [refresh])

  useEffect(() => {
    window.addEventListener('topbar:refresh', refresh)
    return () => window.removeEventListener('topbar:refresh', refresh)
  }, [refresh])

  if (!loading && cards.length === 0) {
    return (
      <div style={{
        padding: '22px 16px', borderRadius: 8, textAlign: 'center',
        background: 'var(--c-surface-2)', fontSize: 13, color: 'var(--c-text-2)',
      }}>
        لا شيء بانتظارك اليوم
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      {cards.map(card => <ActionCard key={card.key} card={card} />)}
      {loading && cards.length === 0 && [0, 1, 2].map(i => <CardSkeleton key={i} />)}
      {loading && cards.length > 0 && <CardSkeleton />}
    </div>
  )
}
