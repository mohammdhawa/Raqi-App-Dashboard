import { useState, useEffect } from 'react'
import { Info } from 'lucide-react'
import api from '../../services/api'
import ApproverPickerBase from '../ui/ApproverPickerBase'

/**
 * Approver picker for document submission.
 * `value` is an ordered array of manager ids (`approver_ids`); the chief is
 * appended automatically by the server and is excluded from this picker.
 *
 * `refreshKey` re-reads GET /managers when the caller bumps it — used after
 * the API rejects an approver, so the list on screen reflects who is still
 * eligible rather than the roster that produced the rejected selection.
 *
 * The list/chip/drag body is shared with the leave module's approval chain
 * (components/ui/ApproverPickerBase); what is document-specific and stays here
 * is the feed: which endpoint, dropping chiefs, and the note explaining why.
 */
export default function ApproverPicker({ value, onChange, workflowMode, refreshKey = 0 }) {
  const [search, setSearch] = useState('')
  const [managers, setManagers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const t = setTimeout(() => {
      if (!active) return
      setLoading(true)
      api.get('/managers', { params: search ? { search } : {} })
        .then(res => {
          if (!active) return
          const raw = res.data.managers ?? res.data.data ?? []
          const list = Array.isArray(raw) ? raw : (raw.data ?? [])
          setManagers(list.filter(m => m.role !== 'chief'))
        })
        .catch(() => { if (active) setManagers([]) })
        .finally(() => { if (active) setLoading(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [search, refreshKey])

  return (
    <ApproverPickerBase
      value={value} onChange={onChange}
      managers={managers} loading={loading}
      search={search} onSearchChange={setSearch}
      searchPlaceholder="ابحث عن مدير بالاسم أو البريد..."
      emptyText="لا يوجد مدراء مطابقون"
      ordered={workflowMode === 'sequential'}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px',
        borderRadius: 9, background: 'var(--c-accent-soft)', color: 'var(--c-text-2)',
        fontSize: 11.5, lineHeight: 1.6,
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--c-accent)' }} />
        سيتم إضافة الرئيس الأعلى تلقائيًا كآخر معتمد على المستند.
      </div>
    </ApproverPickerBase>
  )
}
