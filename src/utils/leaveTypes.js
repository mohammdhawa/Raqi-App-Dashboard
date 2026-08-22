// The HR-managed leave/excuse vocabulary: the picker feed
// (GET /attendance/leave-types, any authenticated user) and the admin CRUD
// behind it (/admin/leave-types, admin only).
//
// The feed arrives in creation order and is rendered as-is — there is no
// sort_order and nothing re-sorts it. Insertion order already puts the seeded
// vocabulary in the order HR should see it and lands each new type at the end.
//
// The point of a type is `deducts_balance` — whether taking it costs an annual
// balance day. A leave request *snapshots* that flag when it is filed, so this
// module never answers "did this request cost balance"; read `deducts_balance`
// off the request row (utils/leave → deductsBalance) instead.
//
// Component-free module (react-refresh) — the picker lives in
// components/leave/LeaveTypeSelect.jsx.

import { useEffect, useState } from 'react'
import api from '../services/api'

export const LEAVE_TYPES_CHANGED = 'raqi:leave-types-changed'

/** Announce that the vocabulary changed, so every cached picker feed re-fetches. */
export function emitLeaveTypesChanged() {
  cache.clear()
  window.dispatchEvent(new CustomEvent(LEAVE_TYPES_CHANGED))
}

/** Subscribe; returns the unsubscribe function, for use from an effect. */
export function onLeaveTypesChanged(handler) {
  window.addEventListener(LEAVE_TYPES_CHANGED, handler)
  return () => window.removeEventListener(LEAVE_TYPES_CHANGED, handler)
}

// ── Feed ─────────────────────────────────────────────────────────────────────

// One in-flight/settled promise per distinct filter set. The vocabulary changes
// only through the admin screen, which clears this via emitLeaveTypesChanged.
const cache = new Map()

function queryOf({ forForm, active, deductsBalance } = {}) {
  const params = {}
  if (forForm) params.for = forForm
  // Omitted `active` means active-only server-side, which is what every picker
  // wants; the admin screen passes it explicitly to reach retired types.
  if (active != null) params.active = active ? 1 : 0
  if (deductsBalance != null) params.deducts_balance = deductsBalance ? 1 : 0
  return params
}

/**
 * `GET /attendance/leave-types`, cached per filter set.
 *
 * @param {{forForm?: 'requests'|'excuses', active?: boolean, deductsBalance?: boolean}} options
 */
export function fetchLeaveTypes(options = {}) {
  const params = queryOf(options)
  const key = JSON.stringify(params)
  if (cache.has(key)) return cache.get(key)

  const request = api.get('/attendance/leave-types', { params })
    .then(res => res.data?.leave_types ?? [])
    // A failed fetch must not be cached, or the picker would stay empty until
    // an admin mutation happens to clear it.
    .catch(err => { cache.delete(key); throw err })

  cache.set(key, request)
  return request
}

/**
 * The types offered on one form. `forForm` is required by contract, never the
 * unfiltered list: a type may be recorded by HR but not requestable by an
 * employee (an official mission), and offering it on the wrong form only earns
 * a 422.
 *
 * @param {'requests'|'excuses'} forForm
 */
export function useLeaveTypes(forForm, { active } = {}) {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => onLeaveTypesChanged(() => setVersion(v => v + 1)), [])

  useEffect(() => {
    let alive = true
    // Data fetching intentionally starts when the form (or the vocabulary)
    // changes — same pattern as useDeptSections and the listing pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(false)
    fetchLeaveTypes({ forForm, active })
      .then(list => { if (alive) { setTypes(list); setLoading(false) } })
      .catch(() => { if (alive) { setTypes([]); setError(true); setLoading(false) } })
    return () => { alive = false }
  }, [forForm, active, version])

  return { types, loading, error }
}

// ── Admin CRUD (403 for non-admins) ──────────────────────────────────────────

/** The writable fields, in the order the form presents them. */
export function leaveTypePayload(form) {
  return {
    code:            form.code.trim(),
    name_ar:         form.name_ar.trim(),
    name_en:         form.name_en.trim() === '' ? null : form.name_en.trim(),
    deducts_balance: Boolean(form.deducts_balance),
    for_requests:    Boolean(form.for_requests),
    for_excuses:     Boolean(form.for_excuses),
    requires_reason: Boolean(form.requires_reason),
    is_active:       Boolean(form.is_active),
  }
}

export async function createLeaveType(form) {
  const res = await api.post('/admin/leave-types', leaveTypePayload(form))
  emitLeaveTypesChanged()
  return res.data
}

/**
 * `code` is deliberately never sent on update.
 *
 * It is the stable identifier the listing filters travel by, and the backend
 * expands a submitted term to the type's *current* code and names
 * (LeaveRequest::ofTypes). Legacy rows stored the raw code as free text, so
 * renaming `annual` to `annual_leave` would leave every historical
 * `leave_type = 'annual'` row unmatched by its own type's filter. The endpoint
 * still allows the rename; the UI does not offer it.
 */
export async function updateLeaveType(id, form) {
  const payload = leaveTypePayload(form)
  delete payload.code
  const res = await api.patch(`/admin/leave-types/${id}`, payload)
  emitLeaveTypesChanged()
  return res.data
}

/**
 * DELETE is not always a delete: a type already used by a leave request is
 * **deactivated** instead, so historical rows keep pointing at it. The two
 * outcomes are told apart by whether the response carries the type back.
 *
 * @returns {{retired: boolean, leaveType: object|null, message: string}}
 */
export async function deleteLeaveType(id) {
  const res = await api.delete(`/admin/leave-types/${id}`)
  emitLeaveTypesChanged()
  const leaveType = res.data?.leave_type ?? null
  return { retired: Boolean(leaveType), leaveType, message: res.data?.message ?? '' }
}
