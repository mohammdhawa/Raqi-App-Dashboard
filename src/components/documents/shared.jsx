import { useState } from 'react'
import {
  Clock, CheckCircle2, XCircle, LayoutTemplate, Bell, Hourglass, Info,
} from 'lucide-react'
import api from '../../services/api'

// ── Authenticated file access ────────────────────────────────────────────────

/**
 * Fetches a file through the authenticated API client and returns an object
 * URL for it. These endpoints require `auth:sanctum` (and aren't reachable
 * via /storage on the production proxy), so a plain <a href>/<iframe src>
 * pointing at the storage path won't work — this pulls the file as a blob
 * with the Bearer token attached instead. Caller must release the URL with
 * URL.revokeObjectURL once it's no longer needed.
 */
async function fetchFileBlobUrl(path) {
  const res = await api.get(path, { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

/** Object URL for a document's current file (stamped version if decided, otherwise the original). */
export function fetchDocumentFileUrl(documentId) {
  return fetchFileBlobUrl(`/documents/${documentId}/file`)
}

/** Object URL for one of a document's extra attachments. */
export function fetchAttachmentFileUrl(documentId, attachmentId) {
  return fetchFileBlobUrl(`/documents/${documentId}/attachments/${attachmentId}/file`)
}

/** Fetches a document's stamped PDF and opens it in a new tab. */
export async function openStampedPdf(documentId) {
  const url = await fetchFileBlobUrl(`/documents/${documentId}/stamped-pdf`)
  window.open(url, '_blank', 'noopener,noreferrer')
  // Give the new tab time to load before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── Date helpers ───────────────────────────────────────────────────────────────

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Document status badge ────────────────────────────────────────────────────

export const STATUS_META = {
  pending:  { label: 'قيد الاعتماد', icon: Clock,        color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)' },
  approved: { label: 'معتمد',        icon: CheckCircle2, color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  rejected: { label: 'مرفوض',        icon: XCircle,      color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)' },
}

export const STATUS_OPTIONS = [
  { value: 'pending',  label: 'قيد الاعتماد' },
  { value: 'approved', label: 'معتمد' },
  { value: 'rejected', label: 'مرفوض' },
]

export function StatusBadge({ status }) {
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

// ── Origin / template tag ────────────────────────────────────────────────────

export function OriginTag({ doc }) {
  if (doc?.template) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
        <LayoutTemplate size={12} style={{ color: 'var(--c-text-3)' }} />
        {doc.template.name}
      </div>
    )
  }
  return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>مستند مرفوع</span>
}

// ── Initials avatar ───────────────────────────────────────────────────────────

export function InitialsAvatar({ name, size = 30, gradient }) {
  const initials = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: gradient ?? 'linear-gradient(135deg, var(--c-primary), #1C3A5E)',
      color: '#fff', fontWeight: 800, fontSize: size * 0.38,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials}
    </div>
  )
}

// ── Workflow turn-taking helpers ─────────────────────────────────────────────

function isRowTurn(doc, row) {
  if (row.status !== 'pending') return false
  const workflows = doc.workflows ?? []
  if (row.role === 'chief') {
    return workflows.filter(w => w.role === 'manager').every(w => w.status !== 'pending')
  }
  if (doc.workflow_mode === 'parallel') return true
  return workflows
    .filter(w => w.role === 'manager' && w.order != null && row.order != null && w.order < row.order)
    .every(w => w.status !== 'pending')
}

/** Returns the workflow rows whose turn it currently is to act. */
export function getCurrentActors(doc) {
  if (!doc || doc.status !== 'pending') return []
  return (doc.workflows ?? []).filter(w => isRowTurn(doc, w))
}

/** Resolves the current user's relationship to a document's approval workflow. */
export function getApprovalContext(doc, userId) {
  const workflows = doc?.workflows ?? []
  const myRow = workflows.find(w => w.user_id === userId)
  if (!myRow) return { myRow: null, isMyTurn: false, alreadyActed: false }
  const alreadyActed = myRow.status !== 'pending'
  if (alreadyActed || doc.status !== 'pending') {
    return { myRow, isMyTurn: false, alreadyActed }
  }
  return { myRow, isMyTurn: isRowTurn(doc, myRow), alreadyActed: false }
}

function Pill({ icon: Icon, label, color, bg, emphasis }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700, color,
      background: bg, border: `1px solid ${color}22`,
      whiteSpace: 'nowrap',
      ...(emphasis ? { boxShadow: `0 0 0 3px ${color}1a` } : {}),
    }}>
      {Icon && <Icon size={12} />}
      {label}
    </span>
  )
}

/** Small pill describing whether/when the current user needs to act on a document. */
export function TurnBadge({ doc, userId }) {
  const { myRow, isMyTurn, alreadyActed } = getApprovalContext(doc, userId)
  if (!myRow) return null

  if (alreadyActed) {
    return myRow.status === 'approved'
      ? <Pill icon={CheckCircle2} label="موافقتك مسجّلة" color="var(--c-approved)" bg="var(--c-approved-bg)" />
      : <Pill icon={XCircle} label="رفضك مسجّل" color="var(--c-rejected)" bg="var(--c-rejected-bg)" />
  }

  if (doc.status !== 'pending') {
    return <Pill icon={Info} label="انتهى المستند" color="var(--c-text-2)" bg="var(--c-surface-2)" />
  }

  return isMyTurn
    ? <Pill icon={Bell} label="بانتظار اعتمادك الآن" color="var(--c-pending)" bg="var(--c-pending-bg)" emphasis />
    : <Pill icon={Hourglass} label="بانتظار دورك" color="var(--c-text-2)" bg="var(--c-surface-2)" />
}

// ── Toolbar / filter primitives ──────────────────────────────────────────────

export const chevronStyle = {
  position: 'absolute', left: 10, color: 'var(--c-text-3)', pointerEvents: 'none',
}

export function selectStyle(value) {
  return {
    height: 38, paddingRight: 10, paddingLeft: 32, borderRadius: 10,
    background: '#fff', border: '1px solid var(--c-border)',
    fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
    color: value ? 'var(--c-text)' : 'var(--c-text-2)',
    cursor: 'pointer', direction: 'rtl', minWidth: 130, outline: 'none',
    appearance: 'none', WebkitAppearance: 'none',
  }
}

// ── Generic row action button ────────────────────────────────────────────────

export function RowBtn({ children, onClick, title, danger, disabled }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32, borderRadius: 9,
        border: `1px solid ${danger ? (hov ? '#F4C9C6' : 'var(--c-border)') : (hov ? 'var(--c-primary)' : 'var(--c-border)')}`,
        background: danger ? (hov ? 'var(--c-rejected-bg)' : '#fff') : (hov ? 'var(--c-primary)' : '#fff'),
        color: danger ? (hov ? 'var(--c-rejected)' : 'var(--c-text-2)') : (hov ? '#fff' : 'var(--c-text-2)'),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer', transition: 'all .14s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Pagination button ────────────────────────────────────────────────────────

export function PagBtn({ children, active, disabled, onClick }) {
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

// ── Skeleton table row ────────────────────────────────────────────────────────

export function SkeletonRow({ widths }) {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)', borderRadius: 7 }
  return (
    <tr>
      {widths.map(([w, h], i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: h, width: w, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

// ── Error message extraction ─────────────────────────────────────────────────

/** Flattens a Laravel-style error response into a single human-readable string. */
export function extractErrorMessage(e, fallback = 'حدث خطأ. يرجى المحاولة مرة أخرى.') {
  const data = e?.response?.data
  if (data?.errors && typeof data.errors === 'object') {
    return Object.values(data.errors).flat().join(' — ')
  }
  return data?.message ?? fallback
}
