import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import {
  LayoutTemplate, Search, Pencil, Trash2, Copy, CheckCircle2,
} from 'lucide-react'
import Button from '../components/ui/Button'

// ── Primitives ────────────────────────────────────────────────────────────────

function RowBtn({ children, danger, onClick, title }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32, borderRadius: 9,
        border: `1px solid ${danger && hov ? '#F4C9C6' : 'var(--c-border)'}`,
        background: danger && hov ? 'var(--c-rejected-bg)' : '#fff',
        color: danger && hov ? 'var(--c-rejected)' : 'var(--c-text-2)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all .14s',
      }}
    >
      {children}
    </button>
  )
}

// ── Type pill ─────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  'عقد':         { bg: 'var(--c-primary-light)', color: 'var(--c-primary)' },
  'مالي':        { bg: 'rgba(30,143,94,0.1)',    color: '#1E8F5E' },
  'مذكرة':       { bg: 'var(--c-surface-2)',     color: 'var(--c-text-2)' },
  'مشتريات':     { bg: 'rgba(200,163,107,0.18)', color: '#7A5E2A' },
  'موارد بشرية': { bg: 'rgba(139,92,246,0.1)',   color: '#7C3AED' },
}

function TypePill({ type }) {
  const c = TYPE_COLORS[type] ?? { bg: 'var(--c-surface-2)', color: 'var(--c-text-2)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 10px', borderRadius: 8,
      fontSize: 12, fontWeight: 700,
      background: c.bg, color: c.color,
      whiteSpace: 'nowrap', maxWidth: '100%',
      overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {type}
    </span>
  )
}

// ── Template glyph ────────────────────────────────────────────────────────────

function TplGlyph({ active }) {
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 13, flexShrink: 0,
      background: active ? 'var(--c-primary-light)' : 'var(--c-surface)',
      border: `1.5px solid ${active ? 'rgba(34,65,103,0.15)' : 'var(--c-border)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: active ? 1 : 0.5,
    }}>
      <LayoutTemplate size={20} style={{ color: active ? 'var(--c-primary)' : 'var(--c-text-3)' }} />
    </div>
  )
}

// ── Template row ──────────────────────────────────────────────────────────────

function TplRow({ tpl, last, onEdit, onDuplicate, onDelete }) {
  const [hov, setHov] = useState(false)
  const active = tpl.is_active

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onEdit}
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.018)' : 'transparent',
        cursor: 'pointer', transition: 'background .1s',
      }}
    >
      <TplGlyph active={active} />

      {/* Name + slug */}
      <div style={{ flex: '0 0 200px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 3 }}>
          {tpl.name}
        </div>
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: 'var(--c-text-3)' }}>
          {tpl.slug}
        </div>
      </div>

      {/* Type */}
      <div style={{ flex: '0 0 140px', minWidth: 0, overflow: 'hidden' }}>
        <TypePill type={tpl.type} />
      </div>

      {/* Fields count */}
      <div style={{ flex: '0 0 80px', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1 }}>
          {tpl.fields_schema?.length ?? 0}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', fontWeight: 600, marginTop: 2 }}>حقل</div>
      </div>

      {/* Documents count */}
      <div style={{ flex: '0 0 80px', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1 }}>
          {tpl.documents_count ?? 0}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', fontWeight: 600, marginTop: 2 }}>مرتبط</div>
      </div>

      {/* Version */}
      <div style={{ flex: '0 0 64px' }}>
        <span style={{
          fontFamily: "'Courier New', monospace",
          fontSize: 11.5, fontWeight: 700, color: 'var(--c-primary)',
          background: 'var(--c-primary-light)', borderRadius: 7,
          padding: '3px 9px', display: 'inline-block',
        }}>
          v{tpl.version ?? 1}
        </span>
      </div>

      {/* Status */}
      <div style={{ flex: '0 0 80px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 700,
          color: active ? 'var(--c-approved)' : 'var(--c-text-3)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: active ? 'var(--c-approved)' : 'var(--c-text-3)',
            boxShadow: active
              ? '0 0 0 3px var(--c-approved-bg)'
              : '0 0 0 3px var(--c-surface-2)',
          }} />
          {active ? 'فعّال' : 'معطّل'}
        </span>
      </div>

      {/* Actions */}
      <div
        style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}
        onClick={e => e.stopPropagation()}
      >
        <RowBtn onClick={onEdit} title="تعديل القالب"><Pencil size={14} /></RowBtn>
        <RowBtn onClick={onDuplicate} title="نسخ القالب"><Copy size={14} /></RowBtn>
        <RowBtn danger onClick={onDelete} title="حذف القالب"><Trash2 size={14} /></RowBtn>
      </div>
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow({ last }) {
  const pulse = {
    animation: 'pulse 1.5s ease-in-out infinite',
    background: 'var(--c-surface-2)', borderRadius: 7,
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
      borderBottom: last ? 'none' : '1px solid var(--c-border)',
    }}>
      <div style={{ ...pulse, width: 48, height: 48, borderRadius: 13 }} />
      <div style={{ flex: '0 0 200px' }}>
        <div style={{ ...pulse, height: 14, width: 140, marginBottom: 8 }} />
        <div style={{ ...pulse, height: 11, width: 90 }} />
      </div>
      {[80, 60, 60, 50, 70].map((w, i) => (
        <div key={i} style={{ flex: '0 0 80px' }}>
          <div style={{ ...pulse, height: 14, width: w, animationDelay: `${i * 0.08}s` }} />
        </div>
      ))}
      <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...pulse, width: 32, height: 32, borderRadius: 9, animationDelay: `${i * 0.06}s` }} />
        ))}
      </div>
    </div>
  )
}

// ── Delete modal ──────────────────────────────────────────────────────────────

function DeleteModal({ tpl, onClose, onDeleted }) {
  const [deleting, setDel] = useState(false)

  const handleDelete = async () => {
    setDel(true)
    try {
      const res = await api.delete(`/admin/document-templates/${tpl.id}`)
      const wasDeactivated = (res.data?.message ?? '').toLowerCase().includes('deactivated')
      onDeleted(wasDeactivated)
    } catch { /* noop */ } finally { setDel(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(20,32,50,0.48)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: 'min(440px, calc(100vw - 32px))', background: '#fff', borderRadius: 18,
        overflow: 'hidden', boxShadow: 'var(--sh-card-lg)',
      }}>
        <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
          }}>
            <Trash2 size={26} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>
            حذف القالب؟
          </h3>
          <p style={{ margin: '0 auto 16px', maxWidth: 340, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            إذا كان القالب مرتبطاً بمستندات، سيتم تعطيله بدلاً من حذفه نهائياً للحفاظ على تلك المستندات.
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 999,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)',
          }}>
            <LayoutTemplate size={12} />
            {tpl.name}
          </div>
        </div>
        <div style={{
          display: 'flex', gap: 10, padding: '14px 20px',
          borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)',
        }}>
          <Button variant="danger" style={{ flex: 1, height: 44 }} onClick={handleDelete}>
            {deleting ? '...' : <><Trash2 size={14} style={{ marginLeft: 6 }} /> حذف</>}
          </Button>
          <Button variant="ghost" style={{ flex: 1, height: 44 }} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Table header columns ──────────────────────────────────────────────────────

const COLS = [
  { label: 'القالب',    flex: '0 0 200px' },
  { label: 'النوع',     flex: '0 0 140px' },
  { label: 'الحقول',   flex: '0 0 80px', center: true },
  { label: 'المستندات', flex: '0 0 80px', center: true },
  { label: 'النسخة',   flex: '0 0 64px' },
  { label: 'الحالة',   flex: '0 0 80px' },
]

const FILTER_TABS = [
  { key: 'all',      label: 'الكل' },
  { key: 'active',   label: 'فعّال' },
  { key: 'inactive', label: 'معطّل' },
]

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('all')
  const [total, setTotal]         = useState(0)
  const [deleteTarget, setDel]    = useState(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      const res = await api.get('/document-templates', { params })
      const raw  = res.data.templates
      let list = raw?.data ?? (Array.isArray(raw) ? raw : [])
      if (filter === 'active')   list = list.filter(t => t.is_active)
      if (filter === 'inactive') list = list.filter(t => !t.is_active)
      setTemplates(list)
      setTotal(raw?.total ?? list.length)
    } catch { setTemplates([]) } finally { setLoading(false) }
  }, [search, filter])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  // Topbar "+ قالب جديد" button → dedicated create page
  useEffect(() => {
    const h = () => navigate('/admin/templates/new')
    window.addEventListener('topbar:action', h)
    return () => window.removeEventListener('topbar:action', h)
  }, [navigate])

  // Topbar refresh button
  useEffect(() => {
    window.addEventListener('topbar:refresh', fetchTemplates)
    return () => window.removeEventListener('topbar:refresh', fetchTemplates)
  }, [fetchTemplates])

  const activeCount = templates.filter(t => t.is_active).length

  const handleDuplicate = async tpl => {
    try {
      const payload = {
        name:          `${tpl.name} (نسخة)`,
        slug:          `${tpl.slug}-copy-${Date.now()}`,
        type:          tpl.type,
        layout_key:    tpl.layout_key,
        description:   tpl.description,
        is_active:     false,
        fields_schema: tpl.fields_schema?.length
          ? tpl.fields_schema
          : [{ key: 'field_1', label: 'حقل جديد', type: 'text', required: false }],
      }
      await api.post('/admin/document-templates', payload)
      toast.success('تم تكرار القالب بنجاح')
      fetchTemplates()
    } catch { toast.error('تعذّر تكرار القالب') }
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1180, margin: '0 auto' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          قوالب المستندات
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          نماذج الحقول التي يُبنى عليها كل نوع مستند قبل إطلاقه في سير الاعتماد.
        </p>

        {/* Metric strip */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { Icon: CheckCircle2, value: activeCount, label: 'فعّالة', iconBg: 'var(--c-approved-bg)', iconColor: 'var(--c-approved)' },
            { Icon: LayoutTemplate, value: total,     label: 'قوالب',  iconBg: 'var(--c-surface)',     iconColor: 'var(--c-primary)' },
          ].map(({ Icon, value, label, iconBg, iconColor }) => (
            <div key={label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              background: '#fff', border: '1px solid var(--c-border)',
              borderRadius: 12, padding: '9px 14px',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: iconBg, color: iconColor,
              }}>
                <Icon size={15} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.3, lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)', fontWeight: 600, marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main card ── */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <LayoutTemplate size={17} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>القوالب</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
              background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
            }}>
              {total} قوالب
            </span>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: 'flex', gap: 4,
            background: 'var(--c-surface)', borderRadius: 10, padding: 4,
          }}>
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  height: 30, padding: '0 12px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontSize: 12.5, fontWeight: 700, transition: 'all .14s',
                  background: filter === tab.key ? '#fff' : 'transparent',
                  color: filter === tab.key ? 'var(--c-text)' : 'var(--c-text-2)',
                  boxShadow: filter === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 10, padding: '0 12px', height: 38, minWidth: 200,
          }}>
            <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث في القوالب..."
              style={{
                flex: 1, border: 0, outline: 0, background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 12.5,
                color: 'var(--c-text)', textAlign: 'right',
              }}
            />
          </div>
        </div>

        {/* Column headers + rows — horizontally scrollable below the row's natural min width */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 860 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px',
              background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)',
            }}>
              <div style={{ flex: '0 0 48px' }} />
              {COLS.map(col => (
                <div
                  key={col.label}
                  style={{
                    flex: col.flex,
                    fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)',
                    textAlign: col.center ? 'center' : 'right',
                  }}
                >
                  {col.label}
                </div>
              ))}
              <div style={{ marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)' }}>
                إجراءات
              </div>
            </div>

            {loading
              ? [0, 1, 2, 3].map(i => <SkeletonRow key={i} last={i === 3} />)
              : templates.map((tpl, idx) => (
                <TplRow
                  key={tpl.id}
                  tpl={tpl}
                  last={idx === templates.length - 1}
                  onEdit={() => navigate(`/admin/templates/${tpl.id}/edit`)}
                  onDuplicate={() => handleDuplicate(tpl)}
                  onDelete={() => setDel(tpl)}
                />
              ))
            }
          </div>
        </div>

        {/* Empty state */}
        {!loading && templates.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <LayoutTemplate size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {search ? 'لا توجد نتائج مطابقة' : 'لا توجد قوالب بعد'}
            </p>
          </div>
        )}
      </div>

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          tpl={deleteTarget}
          onClose={() => setDel(null)}
          onDeleted={wasDeactivated => { toast.success(wasDeactivated ? 'تم تعطيل القالب (مرتبط بمستندات)' : 'تم حذف القالب بنجاح'); setDel(null); fetchTemplates() }}
        />
      )}
    </div>
  )
}
