import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useMatch } from 'react-router-dom'
import { Bell, BellOff, CheckCheck, RefreshCw, Menu, Check } from 'lucide-react'
import api from '../../services/api'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'

const PAGE_META = {
  '/dashboard':         { name: 'لوحة المعلومات',     section: 'الرئيسية' },
  '/documents/inbox':   { name: 'الوارد',             section: 'المستندات' },
  '/documents/sent':    { name: 'الصادر',             section: 'المستندات' },
  '/documents/new':     { name: 'مستند جديد',         section: 'المستندات' },
  '/admin/documents':   { name: 'كل المستندات',       section: 'الإدارة' },
  '/admin/users':       { name: 'الأشخاص والصلاحيات', section: 'الإدارة' },
  '/admin/attendance':  { name: 'الحضور والانصراف',   section: 'الإدارة' },
  '/admin/attendance/report': { name: 'التقرير اليومي للحضور', section: 'الإدارة' },
  '/admin/attendance/monthly': { name: 'التقرير الشهري للحضور', section: 'الإدارة' },
  '/admin/attendance/employee': { name: 'تقرير الموظف التفصيلي', section: 'الإدارة' },
  '/admin/leave':       { name: 'إدارة الإجازات',     section: 'الإدارة' },
  '/admin/departments': { name: 'الإدارات',           section: 'الإدارة' },
  '/admin/sections':    { name: 'الأقسام',            section: 'الإدارة' },
  '/admin/templates':   { name: 'قوالب المستندات',    section: 'الإدارة' },
  '/admin/audit':       { name: 'سجل التدقيق',        section: 'الإدارة' },
  '/admin/settings':    { name: 'الإعدادات',          section: 'الإدارة' },
}

const ACTION_LABELS = {
  '/admin/users':       '+ مستخدم جديد',
  '/admin/departments': '+ إدارة جديدة',
  '/admin/sections':    '+ قسم جديد',
  '/admin/templates':   '+ قالب جديد',
}

const IconBtn = ({ children, ...props }) => (
  <button
    style={{
      width: 34, height: 34, borderRadius: 9,
      border: '1px solid var(--c-border)',
      background: '#fff', color: 'var(--c-text-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
    }}
    {...props}
  >
    {children}
  </button>
)

function pluralAr(n, singular, dual, plural) {
  if (n === 1) return singular
  if (n === 2) return dual
  if (n >= 3 && n <= 10) return plural
  return singular
}

function timeAgo(iso) {
  const d = new Date(iso)
  if (!iso || isNaN(d.getTime())) return ''
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (sec < 60) return 'الآن'
  const min = Math.floor(sec / 60)
  if (min < 60) return `منذ ${min} ${pluralAr(min, 'دقيقة', 'دقيقتين', 'دقائق')}`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `منذ ${hr} ${pluralAr(hr, 'ساعة', 'ساعتين', 'ساعات')}`
  const day = Math.floor(hr / 24)
  if (day < 30) return `منذ ${day} ${pluralAr(day, 'يوم', 'يومين', 'أيام')}`
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Laravel notification `data` payloads aren't documented per-type, so this
// reads the common field-name variants and falls back to a generic label.
function notifText(n) {
  const d = (n && typeof n.data === 'object' && n.data) || {}
  const title = n?.title ?? d.title ?? d.subject ?? d.heading ?? 'إشعار جديد'
  const body = n?.body ?? d.message ?? d.body ?? d.text ?? d.description ?? ''
  return { title, body }
}

function NotificationsPanel() {
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  openRef.current = open

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingAll, setMarkingAll] = useState(false)
  const wrapRef = useRef(null)
  const prevUnreadRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const fetchNotifications = useCallback(() => {
    setLoading(true)
    return api.get('/notifications')
      .then(res => {
        const pag = res.data?.notifications ?? res.data
        const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
        setItems(list)
        return list
      })
      .catch(() => { setItems([]); return [] })
      .finally(() => setLoading(false))
  }, [])

  const fetchUnreadCount = useCallback(() => {
    api.get('/notifications/unread-count')
      .then(res => {
        const count = res.data?.unread_count ?? 0
        const prev = prevUnreadRef.current
        prevUnreadRef.current = count

        if (prev !== null && count > prev) {
          if (openRef.current) {
            fetchNotifications()
          } else {
            api.get('/notifications')
              .then(r => {
                const pag = r.data?.notifications ?? r.data
                const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
                list.filter(n => !n.read_at).slice(0, count - prev).reverse().forEach(n => {
                  const { title, body } = notifText(n)
                  toastRef.current.info(body ? `${title} — ${body}` : title)
                })
              })
              .catch(() => {})
          }
        }

        setUnreadCount(count)
      })
      .catch(() => {})
  }, [fetchNotifications])

  useEffect(() => {
    fetchUnreadCount()
    const t = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(t)
  }, [fetchUnreadCount])

  const toggleOpen = () => {
    setOpen(o => {
      const next = !o
      if (next) fetchNotifications()
      return next
    })
  }

  const markRead = n => {
    if (n.read_at) return
    setItems(prev => prev.map(it => (it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it)))
    setUnreadCount(c => Math.max(0, c - 1))
    api.post(`/notifications/${n.id}/read`).catch(() => { fetchNotifications(); fetchUnreadCount() })
  }

  const markAllRead = () => {
    if (!unreadCount || markingAll) return
    setMarkingAll(true)
    const now = new Date().toISOString()
    setItems(prev => prev.map(it => ({ ...it, read_at: it.read_at ?? now })))
    setUnreadCount(0)
    api.post('/notifications/read-all')
      .catch(() => { fetchNotifications(); fetchUnreadCount() })
      .finally(() => setMarkingAll(false))
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <IconBtn onClick={toggleOpen} aria-label="الإشعارات">
        <Bell size={15} strokeWidth={1.8} />
      </IconBtn>
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute', top: -5, insetInlineEnd: -5,
          minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9.5, fontWeight: 800, lineHeight: 1, color: '#fff',
          background: 'var(--c-rejected)', border: '1.5px solid #fff',
        }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', insetInlineEnd: 0, zIndex: 30,
          width: 360, maxWidth: '90vw', maxHeight: 440,
          display: 'flex', flexDirection: 'column',
          background: '#fff', borderRadius: 14,
          border: '1px solid var(--c-border)', boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1px solid var(--c-border)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)' }}>الإشعارات</span>
            {unreadCount > 0 && (
              <button
                type="button" onClick={markAllRead} disabled={markingAll}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  border: 'none', background: 'transparent', cursor: markingAll ? 'default' : 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
                  color: 'var(--c-primary)', opacity: markingAll ? 0.5 : 1,
                }}
              >
                <CheckCheck size={13} />
                تحديد الكل كمقروء
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--c-text-3)' }}>
                جارٍ التحميل...
              </div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <BellOff size={26} style={{ color: 'var(--c-text-3)', marginBottom: 8 }} />
                <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>لا توجد إشعارات حالياً</div>
              </div>
            )}
            {!loading && items.map(n => {
              const { title, body } = notifText(n)
              const unread = !n.read_at
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n)}
                  style={{
                    display: 'flex', gap: 10, padding: '12px 14px',
                    borderBottom: '1px solid var(--c-border)',
                    background: unread ? 'var(--c-accent-tint)' : 'transparent',
                    cursor: unread ? 'pointer' : 'default',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (unread) e.currentTarget.style.background = 'var(--c-accent-soft)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = unread ? 'var(--c-accent-tint)' : 'transparent' }}
                >
                  <span style={{
                    flexShrink: 0, marginTop: 5, width: 7, height: 7, borderRadius: '50%',
                    background: unread ? 'var(--c-accent)' : 'transparent',
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>{title}</div>
                    {body && (
                      <div style={{
                        fontSize: 11.5, color: 'var(--c-text-2)', marginTop: 2, lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {body}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Topbar({ onMenuToggle }) {
  const { pathname } = useLocation()
  const builderMatch = useMatch('/admin/templates/:id/edit')
  const newTplMatch = useMatch('/admin/templates/new')
  const isBuilder = !!builderMatch || !!newTplMatch
  const detailMatch = useMatch('/documents/:id')
  // useMatch('/documents/:id') also matches static pages like /documents/sent
  // or /documents/new (treating "sent"/"new" as the :id param), so exclude
  // any path that already has its own PAGE_META entry.
  const isDetail = !!detailMatch && !PAGE_META[pathname]

  const [builderName, setBuilderName] = useState('')
  const [detailTitle, setDetailTitle] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!isBuilder) setBuilderName('')
  }, [isBuilder])

  useEffect(() => {
    if (!isDetail) setDetailTitle('')
  }, [isDetail])

  const handleRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    window.dispatchEvent(new CustomEvent('topbar:refresh'))
    setTimeout(() => setRefreshing(false), 700)
  }

  useEffect(() => {
    const h = e => setBuilderName(e.detail?.name ?? '')
    window.addEventListener('topbar:builder-name', h)
    return () => window.removeEventListener('topbar:builder-name', h)
  }, [])

  useEffect(() => {
    const h = e => setDetailTitle(e.detail?.title ?? '')
    window.addEventListener('topbar:detail-title', h)
    return () => window.removeEventListener('topbar:detail-title', h)
  }, [])

  const meta = PAGE_META[pathname] ?? { name: '', section: 'الرئيسية' }
  const actionLabel = (isBuilder || isDetail) ? null : ACTION_LABELS[pathname]

  return (
    <header
      className="adm-topbar"
      style={{
        background: '#fff',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 10,
      }}
    >
      {/* Page info — first in DOM = rightmost in RTL */}
      <div style={{ flexShrink: 0 }}>
        {isBuilder ? (
          <>
            <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', fontWeight: 600, lineHeight: 1 }}>
              الرئيسية
              <span style={{ margin: '0 3px' }}>·</span>
              <span style={{ color: 'var(--c-text-2)' }}>القوالب</span>
              {builderName && (
                <>
                  <span style={{ margin: '0 3px' }}>·</span>
                  <span style={{ color: 'var(--c-text)' }}>{builderName}</span>
                </>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)', marginTop: 3, lineHeight: 1 }}>
              محرّر القالب
            </div>
          </>
        ) : isDetail ? (
          <>
            <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', fontWeight: 600, lineHeight: 1 }}>
              الرئيسية
              <span style={{ margin: '0 3px' }}>·</span>
              <span style={{ color: 'var(--c-text-2)' }}>المستندات</span>
            </div>
            <div style={{
              fontSize: 15, fontWeight: 800, color: 'var(--c-text)', marginTop: 3, lineHeight: 1,
              maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {detailTitle || 'تفاصيل المستند'}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', fontWeight: 600, lineHeight: 1 }}>
              الرئيسية
              {meta.section !== 'الرئيسية' && (
                <> · <span style={{ color: 'var(--c-text-2)' }}>{meta.section}</span></>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)', marginTop: 3, lineHeight: 1 }}>
              {meta.name}
            </div>
          </>
        )}
      </div>

      {/* Spacer pushes actions to the start (left in RTL) */}
      <div style={{ flex: 1 }} />

      {/* Actions — last in DOM = leftmost in RTL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isBuilder ? (
          <>
            <span className="hidden sm:inline-flex">
              <Button
                variant="primary"
                style={{ height: 34, fontSize: 12.5 }}
                onClick={() => window.dispatchEvent(new CustomEvent('topbar:builder-save'))}
              >
                حفظ القالب
                <Check size={14} />
              </Button>
            </span>
          </>
        ) : (
          <>
            <IconBtn onClick={handleRefresh} aria-label="تحديث">
              <RefreshCw
                size={15}
                strokeWidth={1.8}
                style={{ animation: refreshing ? 'spin 0.7s linear' : 'none' }}
              />
            </IconBtn>

            <NotificationsPanel />

            {actionLabel && (
              <span className="hidden sm:inline-flex">
                <Button
                  variant="primary" style={{ height: 34, fontSize: 12.5 }}
                  onClick={() => window.dispatchEvent(new CustomEvent('topbar:action'))}
                >
                  {actionLabel}
                </Button>
              </span>
            )}
          </>
        )}

        {/* Hamburger — mobile only */}
        <span className="lg:hidden">
          <IconBtn onClick={onMenuToggle} aria-label="القائمة">
            <Menu size={17} strokeWidth={1.8} />
          </IconBtn>
        </span>
      </div>
    </header>
  )
}
