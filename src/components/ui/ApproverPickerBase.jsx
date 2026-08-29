// The ordered approver picker, shared by the document workflow and the leave
// request's approval chain.
//
// Purely presentational: the caller owns the feed — which endpoint, how it is
// searched, who is excluded — and hands in `managers`. This renders the search
// box, the roster and the selected list, and reports the resulting ORDER back
// through `onChange`. When `ordered` is set, array order is decision order and
// the rows are drag-reorderable; otherwise the selection is a plain set.

import { useMemo, useState } from 'react'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Search, X, GripVertical, Check, UserCheck, ChevronLeft } from 'lucide-react'
import InitialsAvatar from './InitialsAvatar'

// Second line of a roster row / chip: where the person sits, falling back to
// their email when the payload carries no department.
function metaLine(manager) {
  const place = [manager?.department?.name, manager?.section?.name].filter(Boolean).join(' · ')
  return place || manager?.email || ''
}

const orderBadgeStyle = {
  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
  background: 'var(--c-primary)', color: '#fff',
  fontSize: 11, fontWeight: 800,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontVariantNumeric: 'tabular-nums',
}

// ── Manager list row ─────────────────────────────────────────────────────────

function ManagerRow({ manager, selected, disabled, badge, onToggle }) {
  const [hov, setHov] = useState(false)
  const meta = metaLine(manager)
  return (
    <button
      type="button" disabled={disabled}
      onClick={() => onToggle(manager)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 10px', borderRadius: 10, border: 'none',
        background: selected ? 'var(--c-accent-tint)' : hov && !disabled ? 'var(--c-surface-2)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        textAlign: 'right', fontFamily: 'var(--font-sans)',
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
          {meta}
        </div>
      </div>
      {badge?.(manager)}
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

// ── Selected chip body (shared by both modes) ────────────────────────────────

function ChipBody({ manager, fallbackId, badge, caption, error, onRemove }) {
  return (
    <>
      <InitialsAvatar name={manager?.name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>
          {manager?.name ?? `#${fallbackId}`}
        </div>
        {caption && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-primary)', marginTop: 2 }}>
            {caption}
          </div>
        )}
        {!caption && metaLine(manager) && (
          <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{metaLine(manager)}</div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: 'var(--c-rejected)', marginTop: 3, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>
      {badge?.(manager)}
      <button
        type="button" onClick={() => onRemove(fallbackId)}
        style={{ border: 'none', background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}
      >
        <X size={14} />
      </button>
    </>
  )
}

// ── Selected chip (static order — parallel mode) ─────────────────────────────

function ApproverChip({ manager, fallbackId, badge, error, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      background: '#fff', borderRadius: 10, marginBottom: 8,
      border: `1px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
    }}>
      <ChipBody manager={manager} fallbackId={fallbackId} badge={badge} error={error} onRemove={onRemove} />
    </div>
  )
}

// ── Selected chip (draggable — sequential mode) ──────────────────────────────

function SortableApproverChip({ id, manager, index, badge, caption, error, onRemove }) {
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
        border: `1px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
        borderRadius: 10, marginBottom: 8,
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
      <span style={orderBadgeStyle}>{index + 1}</span>
      <ChipBody
        manager={manager} fallbackId={id} badge={badge}
        caption={caption} error={error} onRemove={onRemove}
      />
    </div>
  )
}

// ── Sequence summary ─────────────────────────────────────────────────────────

/**
 * "1 ← 2 ← 3" — the selection read back as the decision sequence it is, so the
 * order is legible without counting chips. RTL puts step 1 on the right and
 * each arrow points at whoever is asked next.
 */
function SequenceSummary({ value, known }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '8px 11px', borderRadius: 9, marginBottom: 10,
      background: 'var(--c-surface-2)',
    }}>
      {value.map((id, i) => (
        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <ChevronLeft size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
          <span style={{ ...orderBadgeStyle, width: 18, height: 18, fontSize: 10 }}>{i + 1}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)' }}>
            {known[id]?.name ?? `#${id}`}
          </span>
        </span>
      ))}
    </div>
  )
}

// ── Picker ────────────────────────────────────────────────────────────────────

/**
 * `value` is an ordered array of user ids; `onChange` receives the next array.
 *
 * - `managers` / `loading` — the roster to choose from, already filtered by the
 *   caller (search, role, self-exclusion).
 * - `search` / `onSearchChange` — the controlled query box.
 * - `ordered` — drag-reorderable, numbered rows; array order is decision order.
 * - `showSequence` — adds the "1 ← 2 ← 3" summary and the first/last captions,
 *   for a flow where the order is a rule rather than a convenience.
 * - `max` — client-side cap, UX only; the server is still the authority.
 * - `badge(manager)` — optional trailing tag (a role pill, say).
 * - `stepError(index)` — message for the approver at that position, so a
 *   server-side `approver_ids.N` error lands on row N.
 * - `children` — footer note under the list.
 */
export default function ApproverPickerBase({
  value, onChange,
  managers = [], loading = false,
  search, onSearchChange,
  searchPlaceholder = 'ابحث بالاسم أو البريد…',
  emptyText = 'لا يوجد مسؤولون مطابقون',
  noneSelectedText = 'لم يتم اختيار أي معتمد بعد',
  selectedLabel = 'المعتمدون المختارون',
  ordered = true,
  showSequence = false,
  max = null,
  badge,
  stepError,
  children,
}) {
  // Full objects for the selected ids, so a chip survives the roster changing
  // under it (a search narrowing the list, a refetch). Filled from the roster
  // on every render and from the row that was clicked, never through an effect.
  const [picked, setPicked] = useState({})
  const known = useMemo(() => {
    const map = { ...picked }
    for (const m of managers) map[m.id] = m
    return map
  }, [managers, picked])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const atMax = max != null && value.length >= max

  function toggle(manager) {
    if (value.includes(manager.id)) {
      onChange(value.filter(id => id !== manager.id))
    } else {
      if (atMax) return
      setPicked(m => ({ ...m, [manager.id]: manager }))
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

  const caption = i => {
    if (!showSequence || value.length < 2) return null
    if (i === 0) return 'يقرر أولاً'
    if (i === value.length - 1) return 'القرار النهائي'
    return null
  }

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} style={{
          position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--c-text-3)', pointerEvents: 'none',
        }} />
        <input
          value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
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
            {emptyText}
          </div>
        )}
        {!loading && managers.map(m => {
          const selected = value.includes(m.id)
          return (
            <ManagerRow
              key={m.id} manager={m} selected={selected}
              disabled={!selected && atMax} badge={badge} onToggle={toggle}
            />
          )
        })}
      </div>

      <div style={{
        fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <UserCheck size={14} />
        {selectedLabel} ({value.length}{max != null ? ` / ${max}` : ''})
        {ordered && value.length > 1 && (
          <span style={{ fontWeight: 400, color: 'var(--c-text-3)', fontSize: 11.5 }}>— اسحب لإعادة الترتيب</span>
        )}
      </div>

      {value.length === 0 && (
        <div style={{
          padding: '18px 12px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5,
          border: '1px dashed var(--c-border)', borderRadius: 10, marginBottom: 10,
        }}>
          {noneSelectedText}
        </div>
      )}

      {showSequence && value.length > 1 && <SequenceSummary value={value} known={known} />}

      {value.length > 0 && ordered && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value} strategy={verticalListSortingStrategy}>
            {value.map((id, i) => (
              <SortableApproverChip
                key={id} id={id} index={i} manager={known[id]} badge={badge}
                caption={caption(i)} error={stepError?.(i)} onRemove={remove}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {value.length > 0 && !ordered && value.map((id, i) => (
        <ApproverChip
          key={id} manager={known[id]} fallbackId={id} badge={badge}
          error={stepError?.(i)} onRemove={remove}
        />
      ))}

      {children}
    </div>
  )
}
