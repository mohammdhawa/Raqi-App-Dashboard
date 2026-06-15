import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Search, X, GripVertical, Check, UserCheck, Info } from 'lucide-react'
import api from '../../services/api'
import { InitialsAvatar } from './shared'

// ── Manager list row ─────────────────────────────────────────────────────────

function ManagerRow({ manager, selected, onToggle }) {
  const [hov, setHov] = useState(false)
  const meta = [manager.department?.name, manager.section?.name].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={() => onToggle(manager)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 10px', borderRadius: 10, border: 'none',
        background: selected ? 'var(--c-accent-tint)' : hov ? 'var(--c-surface-2)' : 'transparent',
        cursor: 'pointer', textAlign: 'right', fontFamily: 'var(--font-sans)',
        transition: 'background .14s',
      }}
    >
      <InitialsAvatar name={manager.name} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--c-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {manager.name}
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--c-text-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {meta || manager.email}
        </div>
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
        border: `1.5px solid ${selected ? 'var(--c-primary)' : 'var(--c-border)'}`,
        background: selected ? 'var(--c-primary)' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        transition: 'all .14s',
      }}>
        {selected && <Check size={13} />}
      </div>
    </button>
  )
}

// ── Selected chip (static order — parallel mode) ─────────────────────────────

function ApproverChip({ manager, fallbackId, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      background: '#fff', border: '1px solid var(--c-border)', borderRadius: 10, marginBottom: 8,
    }}>
      <InitialsAvatar name={manager?.name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>
          {manager?.name ?? `#${fallbackId}`}
        </div>
        {manager?.department?.name && (
          <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{manager.department.name}</div>
        )}
      </div>
      <button
        type="button" onClick={() => onRemove(fallbackId)}
        style={{ border: 'none', background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── Selected chip (draggable — sequential mode) ──────────────────────────────

function SortableApproverChip({ id, manager, index, onRemove }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        background: isDragging ? 'var(--c-surface)' : '#fff',
        border: '1px solid var(--c-border)', borderRadius: 10, marginBottom: 8,
        boxShadow: isDragging ? 'var(--sh-card-lg)' : 'none',
      }}
    >
      <button
        type="button" {...attributes} {...listeners}
        style={{
          width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'grab', border: 'none', background: 'transparent',
          color: 'var(--c-text-3)', borderRadius: 6, flexShrink: 0, padding: 0,
        }}
      >
        <GripVertical size={14} />
      </button>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: 'var(--c-primary)', color: '#fff',
        fontSize: 11, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {index + 1}
      </span>
      <InitialsAvatar name={manager?.name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>
          {manager?.name ?? `#${id}`}
        </div>
        {manager?.department?.name && (
          <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{manager.department.name}</div>
        )}
      </div>
      <button
        type="button" onClick={() => onRemove(id)}
        style={{ border: 'none', background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── Picker ────────────────────────────────────────────────────────────────────

/**
 * Approver picker for document submission.
 * `value` is an ordered array of manager ids (`approver_ids`); the chief is
 * appended automatically by the server and is excluded from this picker.
 */
export default function ApproverPicker({ value, onChange, workflowMode }) {
  const [search, setSearch] = useState('')
  const [managers, setManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMap, setSelectedMap] = useState({})

  useEffect(() => {
    let active = true
    setLoading(true)
    const t = setTimeout(() => {
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
  }, [search])

  // Cache full manager objects for selected ids so chips survive search changes
  useEffect(() => {
    if (!managers.length) return
    setSelectedMap(prev => {
      let changed = false
      const next = { ...prev }
      for (const m of managers) {
        if (value.includes(m.id) && !next[m.id]) { next[m.id] = m; changed = true }
      }
      return changed ? next : prev
    })
  }, [managers, value])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function toggle(manager) {
    if (value.includes(manager.id)) {
      onChange(value.filter(id => id !== manager.id))
    } else {
      setSelectedMap(m => ({ ...m, [manager.id]: manager }))
      onChange([...value, manager.id])
    }
  }

  function remove(id) {
    onChange(value.filter(v => v !== id))
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oi = value.indexOf(active.id)
    const ni = value.indexOf(over.id)
    if (oi === -1 || ni === -1) return
    onChange(arrayMove(value, oi, ni))
  }

  const ordered = workflowMode === 'sequential'

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} style={{
          position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--c-text-3)', pointerEvents: 'none',
        }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث عن مدير بالاسم أو البريد..."
          style={{
            width: '100%', height: 40, boxSizing: 'border-box',
            paddingInlineStart: 36, paddingInlineEnd: 12,
            borderRadius: 10, border: '1px solid var(--c-border)',
            fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none',
          }}
        />
      </div>

      <div style={{
        maxHeight: 220, overflowY: 'auto', border: '1px solid var(--c-border)',
        borderRadius: 10, padding: 6, marginBottom: 14, background: 'var(--c-surface)',
      }}>
        {loading && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5 }}>
            ...جارِ التحميل
          </div>
        )}
        {!loading && managers.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5 }}>
            لا يوجد مدراء مطابقون
          </div>
        )}
        {!loading && managers.map(m => (
          <ManagerRow key={m.id} manager={m} selected={value.includes(m.id)} onToggle={toggle} />
        ))}
      </div>

      <div style={{
        fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <UserCheck size={14} />
        المعتمدون المختارون ({value.length})
        {ordered && value.length > 1 && (
          <span style={{ fontWeight: 400, color: 'var(--c-text-3)', fontSize: 11.5 }}>— اسحب لإعادة الترتيب</span>
        )}
      </div>

      {value.length === 0 && (
        <div style={{
          padding: '18px 12px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5,
          border: '1px dashed var(--c-border)', borderRadius: 10, marginBottom: 10,
        }}>
          لم يتم اختيار أي معتمد بعد
        </div>
      )}

      {value.length > 0 && ordered && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value} strategy={verticalListSortingStrategy}>
            {value.map((id, i) => (
              <SortableApproverChip key={id} id={id} index={i} manager={selectedMap[id]} onRemove={remove} />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {value.length > 0 && !ordered && value.map((id) => (
        <ApproverChip key={id} manager={selectedMap[id]} fallbackId={id} onRemove={remove} />
      ))}

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px',
        borderRadius: 9, background: 'var(--c-accent-soft)', color: 'var(--c-text-2)',
        fontSize: 11.5, lineHeight: 1.6,
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--c-accent)' }} />
        سيتم إضافة الرئيس الأعلى تلقائيًا كآخر معتمد على المستند.
      </div>
    </div>
  )
}
