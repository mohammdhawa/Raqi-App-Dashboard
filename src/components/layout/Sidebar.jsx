import { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import {
  LayoutDashboard, Inbox, Send, Plus,
  Users, Building2, Layers, LayoutTemplate, History,
  Settings, LogOut, Files, Fingerprint, CalendarCheck, ClipboardList, CalendarRange, WalletCards,
  Megaphone, Tags,
} from 'lucide-react'

// Grouped by what the person is doing rather than by who may do it: every
// group hides itself when none of its items are visible to the current user.
const NAV = [
  {
    label: 'الرئيسية',
    items: [
      { label: 'لوحة المعلومات', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'تسجيل الحضور', icon: Fingerprint, path: '/attendance', show: (auth) => auth.canCheckAttendance },
    ],
  },
  {
    label: 'المستندات',
    items: [
      { label: 'الوارد', icon: Inbox, path: '/documents/inbox', roles: ['admin', 'chief', 'manager'] },
      { label: 'الصادر', icon: Send, path: '/documents/sent',   roles: ['admin', 'chief', 'manager'] },
      { label: 'مستند جديد', icon: Plus, path: '/documents/new', roles: ['admin', 'chief', 'manager'] },
      { label: 'كل المستندات',    icon: Files,          path: '/admin/documents', roles: ['admin'] },
      { label: 'قوالب المستندات', icon: LayoutTemplate, path: '/admin/templates', roles: ['admin'] },
    ],
  },
  {
    label: 'الحضور',
    items: [
      { label: 'الحضور والانصراف', icon: Fingerprint,   path: '/admin/attendance',         show: (auth) => auth.canViewAttendance },
      { label: 'التقرير اليومي',    icon: ClipboardList, path: '/admin/attendance/report',  show: (auth) => auth.canViewAttendance },
      { label: 'التقرير الشهري',    icon: CalendarRange, path: '/admin/attendance/monthly', show: (auth) => auth.canViewAttendance },
    ],
  },
  {
    label: 'الإجازات',
    items: [
      { label: 'إدارة الإجازات', icon: CalendarCheck, path: '/admin/leave',          roles: ['admin', 'manager', 'chief', 'employee'] },
      { label: 'سجل الإجازات',   icon: CalendarRange, path: '/admin/leave-register', show: (auth) => auth.canViewLeaveRegister },
      { label: 'أرصدة الإجازات', icon: WalletCards,   path: '/admin/leave-balances', show: (auth) => auth.canViewAttendance },
      { label: 'أنواع الإجازات', icon: Tags,          path: '/admin/leave-types',    roles: ['admin'] },
    ],
  },
  {
    label: 'المؤسسة',
    items: [
      { label: 'الأشخاص والصلاحيات', icon: Users,     path: '/admin/users',       roles: ['admin'] },
      { label: 'الإدارات',           icon: Building2, path: '/admin/departments', roles: ['admin'] },
      { label: 'الأقسام',            icon: Layers,    path: '/admin/sections',    roles: ['admin'] },
    ],
  },
  {
    label: 'النظام',
    items: [
      { label: 'إشعار عام',   icon: Megaphone, path: '/admin/broadcast', roles: ['admin'] },
      { label: 'سجل التدقيق', icon: History,   path: '/admin/audit',     roles: ['admin', 'chief'] },
      { label: 'الإعدادات',   icon: Settings,  path: '/admin/settings',  roles: ['admin'] },
    ],
  },
]

function NavItem({ item, badge, onNavigate }) {
  const Icon = item.icon
  const badgeValue = badge ?? item.badge
  return (
    <NavLink
      to={item.path}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'sb-item flex items-center gap-2.5 px-3 py-[9px] rounded-[4px] mx-2 my-px',
          'text-[13px] no-underline transition-colors duration-150',
          isActive
            ? 'is-active bg-white/[0.10] text-white font-bold'
            : 'text-white/75 font-medium hover:text-white hover:bg-white/[0.06]',
        ].join(' ')
      }
    >
      {/* Sunaa signature 01: an 8px bronze block marks the active item */}
      <span className="sb-block" aria-hidden="true" />
      <Icon size={16} strokeWidth={1.8} className="shrink-0 opacity-85" />
      <span className="flex-1 min-w-0">{item.label}</span>
      {badgeValue != null && (
        <span className="text-[12px] font-semibold bg-[var(--c-accent-on-dark)] text-[var(--c-text)] rounded-[2px] px-1.5 leading-[17px] [font-family:var(--font-mono)]">
          {badgeValue}
        </span>
      )}
    </NavLink>
  )
}

const ROLE_LABELS = { admin: 'مدير النظام', chief: 'الرئيس الأعلى', manager: 'مدير', employee: 'موظف' }

export default function Sidebar({ isOpen, onNavigate }) {
  const auth = useAuth()
  const { user, logout } = auth

  const [inboxPendingCount, setInboxPendingCount] = useState(0)

  const fetchInboxCount = useCallback(() => {
    if (!['admin', 'chief', 'manager'].includes(user?.role)) return
    api.get('/documents', { params: { type: 'inbox', status: 'pending' } })
      .then(res => setInboxPendingCount(res.data?.documents?.total ?? 0))
      .catch(() => {})
  }, [user?.role])

  useEffect(() => { fetchInboxCount() }, [fetchInboxCount])

  useEffect(() => {
    window.addEventListener('topbar:refresh', fetchInboxCount)
    return () => window.removeEventListener('topbar:refresh', fetchInboxCount)
  }, [fetchInboxCount])

  function canSee(item) {
    if (item.show) return item.show(auth)
    if (item.roles) return item.roles.includes(user?.role)
    return true
  }

  const initials = (user?.name ?? 'م').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
  return (
    /* direction:ltr on the outer element moves the scrollbar to the right edge */
    <aside className={`adm-sidebar ${isOpen ? 'is-open' : ''}`}
      style={{ background: 'var(--c-primary)' }}
    >
      {/* direction:rtl on inner wrapper keeps content right-to-left */}
      <div style={{ direction: 'rtl', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

        {/* Logo */}
        <div style={{
          padding: '16px 16px 14px',
          borderBottom: '3px solid var(--c-accent)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <img
            src="/assets/sunaa-mark-on-dark.png"
            alt="صنع للإنشاءات"
            style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
              صنع للإنشاءات
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, letterSpacing: '0.4px', marginTop: 3 }}>
              SUNAA CONSTRUCTION
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 0' }}>
          {NAV.map((section) => {
            const visibleItems = section.items.filter(canSee)
            if (visibleItems.length === 0) return null
            return (
              <div key={section.label} style={{ marginBottom: 4 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.4px',
                  color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase',
                  padding: '10px 20px 5px',
                }}>
                  {section.label}
                </div>
                {visibleItems.map((item) => (
                  <NavItem
                    key={item.path} item={item} onNavigate={onNavigate}
                    badge={item.path === '/documents/inbox' ? (inboxPendingCount > 0 ? inboxPendingCount : null) : undefined}
                  />
                ))}
              </div>
            )
          })}
        </nav>

        {/* User footer */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 4,
            background: 'var(--c-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 12.5, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name ?? '—'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 }}>
              {ROLE_LABELS[user?.role] ?? 'مستخدم'}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer', padding: 4, borderRadius: 3,
              display: 'flex', alignItems: 'center',
            }}
            title="تسجيل الخروج"
          >
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>

      </div>
    </aside>
  )
}
