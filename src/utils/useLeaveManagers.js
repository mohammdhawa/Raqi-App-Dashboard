// GET /attendance/leave-managers — the approver feed behind every leave form.
//
// The endpoint lists every manager AND chief company-wide; chiefs must stay
// selectable, they are commonly the final approver on a chain. It pages at 100,
// which covers a typical org in one page, so this fetches once and filters
// client-side, re-issuing `search` only when the first page did not hold
// everyone.

import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'

/**
 * `excludeIds` are dropped from the roster — the caller themselves (the
 * endpoint refuses a request naming its own author) and, on a reassignment,
 * everyone already holding a step. Compared as strings so a numeric id and its
 * string form are the same person.
 *
 * Returns `{ managers, visible, loading, query, setQuery }`: `managers` is the
 * fetched roster, `visible` the same list narrowed by `query`.
 */
export function useLeaveManagers(excludeIds = []) {
  const [query, setQuery] = useState('')
  const [managers, setManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [serverSearchEnabled, setServerSearchEnabled] = useState(false)

  // A stable dependency: the caller rebuilds the array every render, so the
  // effect keys off its contents rather than its identity.
  const excludeKey = excludeIds
    .filter(id => id != null && id !== '')
    .map(String)
    .sort()
    .join(',')

  // Re-fetch with `search` only when the first page didn't hold everyone.
  const serverSearch = serverSearchEnabled ? query : ''
  useEffect(() => {
    let active = true
    const trimmedSearch = serverSearch.trim()
    const excluded = new Set(excludeKey ? excludeKey.split(',') : [])
    const t = setTimeout(() => {
      if (!active) return
      setLoading(true)
      api.get('/attendance/leave-managers', {
        params: { per_page: 100, ...(trimmedSearch ? { search: trimmedSearch } : {}) },
      })
        .then(res => {
          if (!active) return
          const pag = res.data?.managers ?? res.data
          const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
          // Drop the excluded here so an approver the API would reject is never
          // on the menu.
          setManagers(excluded.size ? list.filter(m => !excluded.has(String(m.id))) : list)
          if (!trimmedSearch) {
            setServerSearchEnabled((pag?.total ?? list.length) > list.length)
          }
        })
        .catch(() => { if (active) setManagers([]) })
        .finally(() => { if (active) setLoading(false) })
    }, serverSearch ? 280 : 0)
    return () => { active = false; clearTimeout(t) }
  }, [serverSearch, excludeKey])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || serverSearchEnabled) return managers
    return managers.filter(m =>
      (m.name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q)
    )
  }, [managers, query, serverSearchEnabled])

  return { managers, visible, loading, query, setQuery }
}
