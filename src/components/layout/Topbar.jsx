import { useState, useEffect } from 'react'
import { useLocation, useMatch } from 'react-router-dom'
import { Bell, RefreshCw, Search, Menu, Check, Eye } from 'lucide-react'
import Button from '../ui/Button'

const PAGE_META = {
  '/dashboard':         { name: 'لوحة المعلومات',     section: 'الرئيسية' },
  '/documents/inbox':   { name: 'الوارد',             section: 'المستندات' },
  '/documents/sent':    { name: 'الصادر',             section: 'المستندات' },
  '/documents/drafts':  { name: 'المسودات',           section: 'المستندات' },
  '/documents/archive': { name: 'الأرشيف',            section: 'المستندات' },
  '/admin/users':       { name: 'الأشخاص والصلاحيات', section: 'الإدارة' },
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

export default function Topbar({ onMenuToggle }) {
  const { pathname } = useLocation()
  const builderMatch = useMatch('/admin/templates/:id/edit')
  const isBuilder = !!builderMatch

  const [builderName, setBuilderName] = useState('')

  useEffect(() => {
    if (!isBuilder) setBuilderName('')
  }, [isBuilder])

  useEffect(() => {
    const h = e => setBuilderName(e.detail?.name ?? '')
    window.addEventListener('topbar:builder-name', h)
    return () => window.removeEventListener('topbar:builder-name', h)
  }, [])

  const meta = PAGE_META[pathname] ?? { name: '', section: 'الرئيسية' }
  const actionLabel = isBuilder ? null : ACTION_LABELS[pathname]

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

      {/* Search — centered */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 10, padding: '0 12px', height: 36,
            width: '100%', maxWidth: 320,
          }}
        >
          <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="ابحث في المستندات والمعتمدين..."
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent', fontFamily: 'var(--font-sans)',
              fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
            }}
          />
        </div>
      </div>

      {/* Actions — last in DOM = leftmost in RTL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isBuilder ? (
          <>
            <Button
              variant="ghost"
              style={{ height: 34, fontSize: 12.5 }}
              className="hidden sm:inline-flex"
            >
              <Eye size={14} />
              معاينة
            </Button>
            <Button
              variant="primary"
              style={{ height: 34, fontSize: 12.5 }}
              className="hidden sm:inline-flex"
              onClick={() => window.dispatchEvent(new CustomEvent('topbar:builder-save'))}
            >
              حفظ القالب
              <Check size={14} />
            </Button>
          </>
        ) : (
          <>
            <IconBtn><RefreshCw size={15} strokeWidth={1.8} /></IconBtn>

            <div style={{ position: 'relative' }}>
              <IconBtn>
                <Bell size={15} strokeWidth={1.8} />
              </IconBtn>
              <span style={{
                position: 'absolute', top: 5, right: 5,
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--c-rejected)', border: '1.5px solid #fff',
              }} />
            </div>

            {actionLabel && (
              <Button
                variant="primary" style={{ height: 34, fontSize: 12.5 }}
                className="hidden sm:inline-flex"
                onClick={() => window.dispatchEvent(new CustomEvent('topbar:action'))}
              >
                {actionLabel}
              </Button>
            )}
          </>
        )}

        {/* Hamburger — mobile only */}
        <IconBtn className="lg:hidden" onClick={onMenuToggle} aria-label="القائمة">
          <Menu size={17} strokeWidth={1.8} />
        </IconBtn>
      </div>
    </header>
  )
}
