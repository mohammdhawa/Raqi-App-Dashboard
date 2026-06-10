import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import {
  FileText, Search, ChevronDown, Building2, Layers,
  Clock, CheckCircle2, XCircle, Archive, FileEdit, Calendar, LayoutTemplate,
  Eye, X, ExternalLink, Loader2, FileX, Trash2, AlertCircle,
} from 'lucide-react'

const FILE_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_META = {
  pending:  { label: 'قيد الاعتماد', icon: Clock,        color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)' },
  approved: { label: 'معتمد',        icon: CheckCircle2, color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  rejected: { label: 'مرفوض',        icon: XCircle,      color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)' },
  draft:    { label: 'مسودة',        icon: FileEdit,     color: 'var(--c-text-2)',   bg: 'var(--c-surface-2)' },
  archived: { label: 'مؤرشف',        icon: Archive,      color: 'var(--c-text-3)',   bg: 'var(--c-surface)' },
}

const STATUS_OPTIONS = [
  { value: 'pending',  label: 'قيد الاعتماد' },
  { value: 'approved', label: 'معتمد' },
  { value: 'rejected', label: 'مرفوض' },
]

const TABLE_COLS = ['المستند', 'الحالة', 'القالب', 'الإدارة / القسم', 'مقدّم الطلب', 'التاريخ', 'إجراءات']

const chevronStyle = {
  position: 'absolute', left: 10, color: 'var(--c-text-3)', pointerEvents: 'none',
}

function selectStyle(value) {
  return {
    height: 38, paddingRight: 10, paddingLeft: 32, borderRadius: 10,
    background: '#fff', border: '1px solid var(--c-border)',
    fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
    color: value ? 'var(--c-text)' : 'var(--c-text-2)',
    cursor: 'pointer', direction: 'rtl', minWidth: 130, outline: 'none',
    appearance: 'none', WebkitAppearance: 'none',
  }
}

const dateInputStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)',
  background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)',
  color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const meta = STATUS_META[status]
  if (!meta) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  const Icon = meta.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700, color: meta.color,
      background: meta.bg, border: `1px solid ${meta.color}22`,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={12} />
      {meta.label}
    </span>
  )
}

// ── Submitter initials tag ────────────────────────────────────────────────────

function InitialsTag({ name }) {
  const initials = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--c-primary), #1C3A5E)',
      color: '#fff', fontWeight: 800, fontSize: 11.5,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials}
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)', borderRadius: 7 }
  return (
    <tr>
      {[[170, 38], [90, 26], [120, 16], [110, 16], [120, 16], [70, 16], [32, 32]].map(([w, h], i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: h, width: w, animationDelay: `${i * 0.08}s`, borderRadius: i === 6 ? 9 : 7 }} />
        </td>
      ))}
    </tr>
  )
}

// ── Row action button ─────────────────────────────────────────────────────────

function RowBtn({ children, onClick, title, danger }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32, borderRadius: 9,
        border: `1px solid ${danger ? (hov ? '#F4C9C6' : 'var(--c-border)') : (hov ? 'var(--c-primary)' : 'var(--c-border)')}`,
        background: danger ? (hov ? 'var(--c-rejected-bg)' : '#fff') : (hov ? 'var(--c-primary)' : '#fff'),
        color: danger ? (hov ? 'var(--c-rejected)' : 'var(--c-text-2)') : (hov ? '#fff' : 'var(--c-text-2)'),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all .14s',
      }}
    >
      {children}
    </button>
  )
}

// ── Document row (separated to avoid hook-in-loop) ────────────────────────────

function DocumentRow({ doc, last, onPreview, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      {/* Title + reference number */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{doc.title || '—'}</div>
        <div style={{
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 11, color: 'var(--c-text-3)', marginTop: 2,
        }}>
          {doc.reference_number ?? '—'}
        </div>
      </td>

      {/* Status */}
      <td style={{ padding: '12px 16px' }}>
        <StatusBadge status={doc.status} />
      </td>

      {/* Template */}
      <td style={{ padding: '12px 16px' }}>
        {doc.template ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
            <LayoutTemplate size={12} style={{ color: 'var(--c-text-3)' }} />
            {doc.template.name}
          </div>
        ) : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>مستند مرفوع</span>}
      </td>

      {/* Department / section */}
      <td style={{ padding: '12px 16px' }}>
        {doc.department ? (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
              <Building2 size={11} style={{ color: 'var(--c-text-3)' }} />
              {doc.department.name}
            </div>
            {doc.section && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 3 }}>
                <Layers size={10} />
                {doc.section.name}
              </div>
            )}
          </>
        ) : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>

      {/* Submitted by */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <InitialsTag name={doc.submitted_by?.name} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
            {doc.submitted_by?.name ?? '—'}
          </span>
        </div>
      </td>

      {/* Date */}
      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatDate(doc.created_at)}
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RowBtn title="معاينة المستند" onClick={() => onPreview(doc)}>
            <Eye size={15} />
          </RowBtn>
          <RowBtn title="حذف المستند" danger onClick={() => onDelete(doc)}>
            <Trash2 size={14} />
          </RowBtn>
        </div>
      </td>
    </tr>
  )
}

// ── Pagination button ─────────────────────────────────────────────────────────

function PagBtn({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        border: active ? 'none' : '1px solid var(--c-border)',
        background: active ? 'var(--c-primary)' : '#fff',
        color: active ? '#fff' : disabled ? 'var(--c-text-3)' : 'var(--c-text-2)',
        fontFamily: 'var(--font-sans)', fontWeight: active ? 700 : 400,
        fontSize: active ? 12.5 : 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ doc, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setError('')
    setDeleting(true)
    try {
      await api.delete(`/admin/documents/${doc.id}`)
      onConfirm()
    } catch (e) {
      setError(e.response?.data?.message ?? 'تعذّر حذف المستند.')
      setDeleting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(20,32,50,0.48)',
      backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 440, background: '#fff', borderRadius: 18,
        boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
      }}>
        <div style={{ padding: '26px 26px 22px', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
          }}>
            <Trash2 size={26} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--c-text)' }}>
            حذف المستند
          </h3>
          <p style={{ margin: '0 auto', maxWidth: 340, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            هل أنت متأكد من حذف <strong>{doc.title || 'هذا المستند'}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          {error && (
            <div style={{
              marginTop: 12, padding: '9px 14px', borderRadius: 10,
              background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
              fontSize: 12.5, display: 'inline-block',
            }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 10 }}>
          <button
            onClick={handleDelete} disabled={deleting}
            style={{
              flex: 1, height: 44, borderRadius: 12, border: 0,
              background: 'var(--c-rejected)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 700,
              cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? '...' : 'حذف نهائياً'}
          </button>
          <button
            onClick={onClose} disabled={deleting}
            style={{
              flex: 1, height: 44, borderRadius: 12,
              border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
              fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 700,
              cursor: deleting ? 'default' : 'pointer',
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PDF preview modal ─────────────────────────────────────────────────────────

function PdfPreviewModal({ doc, onClose }) {
  const [loading, setLoading] = useState(true)
  const [fileUrl, setFileUrl] = useState(null)
  const [failed, setFailed]   = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    setFileUrl(null)
    api.get(`/documents/${doc.id}`)
      .then(res => {
        if (!active) return
        const d = res.data?.document
        const path = d?.stamped_file_path || d?.file_path
        if (path) setFileUrl(`${FILE_BASE}/storage/${path}`)
        else setFailed(true)
      })
      .catch(() => { if (active) setFailed(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [doc.id])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(20,32,50,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(880px, 100%)', height: 'min(88vh, 1080px)',
          background: '#fff', borderRadius: 16, overflow: 'hidden',
          boxShadow: 'var(--sh-card-lg)', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {doc.title || '—'}
            </div>
            <div style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 11, color: 'var(--c-text-3)', marginTop: 2,
            }}>
              {doc.reference_number ?? '—'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {fileUrl && (
              <a
                href={fileUrl} target="_blank" rel="noopener noreferrer" title="فتح في تبويب جديد"
                style={{
                  width: 34, height: 34, borderRadius: 9,
                  border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
                }}
              >
                <ExternalLink size={15} />
              </a>
            )}
            <button
              onClick={onClose} title="إغلاق"
              style={{
                width: 34, height: 34, borderRadius: 9,
                border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, background: 'var(--c-surface)', position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <Loader2 size={26} className="animate-spin" style={{ color: 'var(--c-text-3)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>جارٍ تحميل الملف...</span>
            </div>
          )}
          {!loading && failed && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <FileX size={28} style={{ color: 'var(--c-text-3)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-2)' }}>
                تعذّر العثور على ملف لهذا المستند
              </span>
            </div>
          )}
          {!loading && !failed && fileUrl && (
            <iframe
              src={fileUrl}
              title={doc.title || 'معاينة المستند'}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const toast = useToast()
  const [documents, setDocuments] = useState([])
  const [departments, setDepts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [lastPage, setLastPage]   = useState(1)
  const [total, setTotal]         = useState(0)

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')

  const [previewDoc, setPreviewDoc] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [filterError, setFilterError] = useState('')
  const reqIdRef = useRef(0)

  // ── API ────────────────────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async (targetPage) => {
    if (dateFrom && dateTo && dateTo < dateFrom) {
      ++reqIdRef.current
      setDocuments([])
      setTotal(0)
      setLastPage(1)
      setLoading(false)
      setFilterError('يجب أن يكون تاريخ الانتهاء بعد تاريخ البداية أو مساوياً له.')
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setFilterError('')
    try {
      const params = { page: targetPage }
      if (search)       params.search        = search
      if (statusFilter) params.status        = statusFilter
      if (deptFilter)   params.department_id = deptFilter
      if (dateFrom)     params.date_from     = dateFrom
      if (dateTo)       params.date_to       = dateTo
      const res = await api.get('/admin/documents', { params })
      if (reqId !== reqIdRef.current) return
      const pag = res.data.documents
      const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
      setDocuments(list)
      setLastPage(pag?.last_page ?? 1)
      setTotal(pag?.total ?? list.length)
    } catch (e) {
      if (reqId !== reqIdRef.current) return
      if (e.response?.status === 422) {
        const data = e.response.data
        const errors = data?.errors
        const msg = errors && typeof errors === 'object'
          ? Object.values(errors).flat().join(' — ')
          : (data?.message || 'البيانات المدخلة غير صحيحة.')
        setFilterError(msg)
      }
      setDocuments([])
      setTotal(0)
    } finally {
      if (reqId !== reqIdRef.current) return
      setLoading(false)
    }
  }, [search, statusFilter, deptFilter, dateFrom, dateTo])

  const fetchDepts = useCallback(async () => {
    try {
      const res = await api.get('/admin/departments')
      const raw = res.data.departments
      setDepts(raw?.data ?? (Array.isArray(raw) ? raw : []))
    } catch { /* leave empty */ }
  }, [])

  useEffect(() => {
    setPage(1)
    fetchDocuments(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, deptFilter, dateFrom, dateTo])

  useEffect(() => { fetchDocuments(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDepts() }, [fetchDepts])

  // Topbar refresh button
  useEffect(() => {
    const handler = () => { fetchDocuments(page); fetchDepts() }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchDocuments, fetchDepts, page])

  const handleDeleted = () => {
    toast.success('تم حذف المستند بنجاح')
    setDeleteTarget(null)
    fetchDocuments(page)
  }

  const hasFilters = Boolean(search || statusFilter || deptFilter || dateFrom || dateTo)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1240, margin: '0 auto' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          كل المستندات
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          عرض شامل لكل المستندات المسجّلة في النظام، مع إمكانية التصفية حسب الحالة والإدارة والتاريخ والبحث.
        </p>
      </div>

      {/* ── Main card ────────────────────────────────────────────────────────── */}
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
            <FileText size={17} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>قائمة المستندات</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
              background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
            }}>
              {total} مستنداً
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Status filter */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select value={statusFilter} onChange={e => setStatus(e.target.value)} style={selectStyle(statusFilter)}>
              <option value="">الحالة: الكل</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>

          {/* Department filter */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={selectStyle(deptFilter)}>
              <option value="">الإدارة: الكل</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>

          {/* Date range */}
          {(() => {
            const dateInvalid = Boolean(dateFrom && dateTo && dateTo < dateFrom)
            const invalidStyle = dateInvalid ? { borderColor: 'var(--c-rejected)' } : {}
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={13} style={{ color: dateInvalid ? 'var(--c-rejected)' : 'var(--c-text-3)', flexShrink: 0 }} />
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...dateInputStyle, ...invalidStyle }} />
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...dateInputStyle, ...invalidStyle }} />
              </div>
            )
          })()}

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 10, padding: '0 12px', height: 38, minWidth: 220,
          }}>
            <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالعنوان أو الرقم المرجعي..."
              maxLength={255}
              style={{
                flex: 1, border: 0, outline: 0, background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
              }}
            />
          </div>
        </div>

        {/* Filter validation / 422 error banner */}
        {filterError && (
          <div style={{
            padding: '10px 20px', borderBottom: '1px solid var(--c-border)',
            background: 'var(--c-rejected-bg)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={14} style={{ color: 'var(--c-rejected)', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-rejected)', lineHeight: 1.5 }}>
              {filterError}
            </span>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {TABLE_COLS.map(col => (
                  <th key={col} style={{
                    padding: '11px 16px', textAlign: 'right',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)',
                    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} />)
                : documents.map((doc, idx) => (
                  <DocumentRow
                    key={doc.id} doc={doc} last={idx === documents.length - 1}
                    onPreview={setPreviewDoc} onDelete={setDeleteTarget}
                  />
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!loading && documents.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <FileText size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {hasFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد مستندات مسجّلة بعد'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {lastPage > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <PagBtn disabled={page <= 1}       onClick={() => setPage(p => p - 1)}>‹</PagBtn>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(p => (
              <PagBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PagBtn>
            ))}
            <PagBtn disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>›</PagBtn>
          </div>
        )}
      </div>

      {previewDoc && <PdfPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      {deleteTarget && (
        <DeleteModal
          doc={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleted}
        />
      )}
    </div>
  )
}
