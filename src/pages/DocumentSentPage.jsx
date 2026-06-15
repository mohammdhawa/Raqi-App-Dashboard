import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import { Send, Eye, Trash2, ChevronDown, Search } from 'lucide-react'
import {
  formatDate, StatusBadge, STATUS_OPTIONS, OriginTag, getCurrentActors,
  RowBtn, PagBtn, SkeletonRow, selectStyle, chevronStyle, extractErrorMessage,
} from '../components/documents/shared'

const TABLE_COLS = ['المستند', 'الحالة', 'النوع', 'بانتظار', 'التاريخ', 'إجراءات']

// ── Pending actors cell ───────────────────────────────────────────────────────

function ActorsCell({ doc }) {
  const actors = getCurrentActors(doc)
  if (actors.length === 0) {
    return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  }
  const names = actors.map(a => a.user?.name).filter(Boolean)
  const label = names.length === actors.length
    ? names.join('، ')
    : `${actors.length} من المعتمدين`
  return <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>{label}</span>
}

// ── Document row ──────────────────────────────────────────────────────────────

function SentRow({ doc, last, onView, onDelete }) {
  const [hov, setHov] = useState(false)
  const canDelete = (doc.workflows ?? []).every(w => !w.signed_at)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{doc.title || '—'}</div>
        <div style={{
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 11, color: 'var(--c-text-3)', marginTop: 2,
        }}>
          {doc.document_number ?? '—'}
        </div>
      </td>

      <td style={{ padding: '12px 16px' }}>
        <StatusBadge status={doc.status} />
      </td>

      <td style={{ padding: '12px 16px' }}>
        <OriginTag doc={doc} />
      </td>

      <td style={{ padding: '12px 16px' }}>
        <ActorsCell doc={doc} />
      </td>

      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatDate(doc.created_at)}
        </span>
      </td>

      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RowBtn title="عرض المستند" onClick={() => onView(doc)}>
            <Eye size={15} />
          </RowBtn>
          {canDelete && (
            <RowBtn title="سحب المستند" danger onClick={() => onDelete(doc)}>
              <Trash2 size={14} />
            </RowBtn>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Withdraw (delete) confirmation modal ─────────────────────────────────────

function WithdrawModal({ doc, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setError('')
    setDeleting(true)
    try {
      await api.delete(`/documents/${doc.id}`)
      onConfirm()
    } catch (e) {
      setError(extractErrorMessage(e, 'تعذّر سحب المستند.'))
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
            سحب المستند
          </h3>
          <p style={{ margin: '0 auto', maxWidth: 340, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            هل أنت متأكد من سحب <strong>{doc.title || 'هذا المستند'}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
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
            {deleting ? '...' : 'سحب المستند'}
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentSentPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [documents, setDocuments] = useState([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [lastPage, setLastPage]   = useState(1)
  const [total, setTotal]         = useState(0)

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const reqIdRef = useRef(0)

  const fetchDocuments = useCallback(async (targetPage) => {
    const reqId = ++reqIdRef.current
    setLoading(true)
    try {
      const params = { type: 'sent', page: targetPage }
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/documents', { params })
      if (reqId !== reqIdRef.current) return
      const pag = res.data.documents
      const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
      setDocuments(list)
      setLastPage(pag?.last_page ?? 1)
      setTotal(pag?.total ?? list.length)
    } catch {
      if (reqId !== reqIdRef.current) return
      setDocuments([])
      setTotal(0)
    } finally {
      if (reqId !== reqIdRef.current) return
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    setPage(1)
    fetchDocuments(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => { fetchDocuments(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => fetchDocuments(page)
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchDocuments, page])

  const handleDeleted = () => {
    toast.success('تم سحب المستند بنجاح')
    setDeleteTarget(null)
    fetchDocuments(page)
  }

  const filtered = search.trim()
    ? documents.filter(d => (d.title ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    : documents

  const hasFilters = Boolean(statusFilter || search)

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1240, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          الصادر
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          المستندات التي قمت بإرسالها لاعتمادها، وحالة كل منها.
        </p>
      </div>

      {/* Main card */}
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
            <Send size={17} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>الصادر</span>
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
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle(statusFilter)}>
              <option value="">الحالة: الكل</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>

          {/* Title search (current page) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 10, padding: '0 12px', height: 38, minWidth: 220,
          }}>
            <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بعنوان المستند..."
              maxLength={255}
              style={{
                flex: 1, border: 0, outline: 0, background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
              }}
            />
          </div>
        </div>

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
                ? [0, 1, 2, 3, 4].map(i => (
                  <SkeletonRow key={i} widths={[[170, 38], [90, 26], [120, 16], [110, 16], [70, 16], [64, 32]]} />
                ))
                : filtered.map((doc, idx) => (
                  <SentRow
                    key={doc.id} doc={doc} last={idx === filtered.length - 1}
                    onView={d => navigate(`/documents/${d.id}`)}
                    onDelete={setDeleteTarget}
                  />
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <Send size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {hasFilters ? 'لا توجد نتائج مطابقة' : 'لم تقم بإرسال أي مستندات بعد'}
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

      {deleteTarget && (
        <WithdrawModal
          doc={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleted}
        />
      )}
    </div>
  )
}
