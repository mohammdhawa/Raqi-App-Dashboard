import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Inbox, Send, FileText, Archive,
  Users, Building2, Layers, LayoutTemplate, History,
  Settings, LogOut,
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
      { label: 'الوارد',    icon: Inbox,    path: '/documents/inbox',   badge: 4 },
      { label: 'الصادر',   icon: Send,     path: '/documents/sent' },
      { label: 'المسودات', icon: FileText,  path: '/documents/drafts',  badge: 2 },
      { label: 'الأرشيف',  icon: Archive,  path: '/documents/archive' },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { label: 'الأشخاص والصلاحيات', icon: Users,           path: '/admin/users' },
      { label: 'الإدارات',           icon: Building2,       path: '/admin/departments' },
      { label: 'الأقسام',            icon: Layers,          path: '/admin/sections' },
      { label: 'قوالب المستندات',    icon: LayoutTemplate,  path: '/admin/templates' },
      { label: 'سجل التدقيق',        icon: History,         path: '/admin/audit' },
      { label: 'الإعدادات',          icon: Settings,        path: '/admin/settings' },
    ],
  },
]

function NavItem({ item, onNavigate }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
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
      {item.badge != null && (
        <span className="text-[10px] font-extrabold bg-[#C8A36B] text-[#2A2010] rounded-full px-1.5 leading-[17px]">
          {item.badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar({ isOpen, onNavigate }) {
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
          {NAV.map((section) => (
            <div key={section.label} style={{ marginBottom: 4 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 800, letterSpacing: '1.2px',
                color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase',
                padding: '10px 20px 5px',
              }}>
                {section.label}
              </div>
              {section.items.map((item) => (
                <NavItem key={item.path} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
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
            أ
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 12.5, lineHeight: 1.25 }}>
              أحمد العتيبي
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10.5, marginTop: 2 }}>
              مدير العمليات
            </div>
          </div>
          <button
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
