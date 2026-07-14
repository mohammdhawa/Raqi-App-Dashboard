import { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import {
  LayoutDashboard, Inbox, Send, Plus,
  Users, Building2, Layers, LayoutTemplate, History,
  Settings, LogOut, Files, Fingerprint, CalendarCheck, ClipboardList, CalendarRange,
  Megaphone,
} from 'lucide-react'

const NAV = [
  {
    label: 'الرئيسية',
    items: [
      { label: 'لوحة المعلومات', icon: LayoutDashboard, path: '/dashboard' },
    ],
  },
  {
    label: 'المستندات',
    items: [
      { label: 'الوارد', icon: Inbox, path: '/documents/inbox', roles: ['admin', 'chief', 'manager'] },
      { label: 'الصادر', icon: Send, path: '/documents/sent',   roles: ['admin', 'chief', 'manager'] },
      { label: 'مستند جديد', icon: Plus, path: '/documents/new', roles: ['admin', 'chief', 'manager'] },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { label: 'كل المستندات',       icon: Files,           path: '/admin/documents',   roles: ['admin'] },
      { label: 'الأشخاص والصلاحيات', icon: Users,           path: '/admin/users',        roles: ['admin'] },
      { label: 'الحضور والانصراف',   icon: Fingerprint,     path: '/admin/attendance',   show: (auth) => auth.canViewAttendance },
      { label: 'التقرير اليومي',      icon: ClipboardList,   path: '/admin/attendance/report', show: (auth) => auth.canViewAttendance },
      { label: 'التقرير الشهري',      icon: CalendarRange,   path: '/admin/attendance/monthly', show: (auth) => auth.canViewAttendance },
      { label: 'إدارة الإجازات',      icon: CalendarCheck,   path: '/admin/leave',        roles: ['admin', 'manager', 'chief', 'employee'] },
      { label: 'الإدارات',           icon: Building2,       path: '/admin/departments',  roles: ['admin'] },
      { label: 'الأقسام',            icon: Layers,          path: '/admin/sections',     roles: ['admin'] },
      { label: 'قوالب المستندات',    icon: LayoutTemplate,  path: '/admin/templates',    roles: ['admin'] },
      { label: 'إشعار عام',          icon: Megaphone,       path: '/admin/broadcast',    roles: ['admin'] },
      { label: 'سجل التدقيق',        icon: History,         path: '/admin/audit',        roles: ['admin', 'chief'] },
      { label: 'الإعدادات',          icon: Settings,        path: '/admin/settings',     roles: ['admin'] },
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
          'flex items-center gap-2.5 px-3 py-[9px] rounded-[10px] mx-2 my-px',
          'text-[13px] font-semibold no-underline transition-all duration-150 border-l-2',
          isActive
            ? 'bg-white/[0.13] text-white border-[#C8A36B]'
            : 'text-white/70 border-transparent hover:text-white/90 hover:bg-white/[0.08]',
        ].join(' ')
      }
    >
      <Icon size={16} strokeWidth={1.8} className="shrink-0 opacity-85" />
      <span className="flex-1 min-w-0">{item.label}</span>
      {badgeValue != null && (
        <span className="text-[10px] font-extrabold bg-[#C8A36B] text-[#2A2010] rounded-full px-1.5 leading-[17px]">
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
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <img
            src="/assets/logo-symbol-gold.png"
            alt="شركة الراقي"
            style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>
              شركة الراقي
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.8px', marginTop: 2 }}>
              AL-RAQI · APPROVALS
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
                  fontSize: 9.5, fontWeight: 800, letterSpacing: '1.2px',
                  color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase',
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
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--c-accent), #a07840)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 12.5, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name ?? '—'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10.5, marginTop: 2 }}>
              {ROLE_LABELS[user?.role] ?? 'مستخدم'}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer', padding: 4, borderRadius: 6,
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
