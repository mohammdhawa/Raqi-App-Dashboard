import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../services/api'

// Resolve the sections of the selected department for the attendance filters.
// Prefer sections nested in the department payload (permission-free for any
// attendance viewer); otherwise fall back to /admin/sections (admins only).
// Returns [] when no department is selected. Kept in its own (component-free)
// module so the filter component file only exports components (react-refresh).
export function useDeptSections(departmentId, departments, { canFetch = false } = {}) {
  const [sections, setSections] = useState([])
  const reqRef = useRef(0)

  useEffect(() => {
    const reqId = ++reqRef.current
    if (!departmentId) { setSections([]); return }

    const dept = departments.find(d => String(d.id) === String(departmentId))
    const nested = dept?.sections
    if (Array.isArray(nested)) { setSections(nested); return }

    if (!canFetch) { setSections([]); return }
    api.get('/admin/sections', { params: { department_id: departmentId, per_page: 100 } })
      .then(res => {
        if (reqId !== reqRef.current) return
        const pag = res.data?.sections
        setSections(pag?.data ?? (Array.isArray(pag) ? pag : []))
      })
      .catch(() => { if (reqId === reqRef.current) setSections([]) })
  }, [departmentId, departments, canFetch])

  return sections
}

// Multi-department variant for the department_ids/section_ids filters: the
// union (deduped by id) of the sections of every selected department. Same
// sourcing rules as useDeptSections — nested payload first, /admin/sections
// fallback per department for admins only.
export function useDeptsSections(departmentIds, departments, { canFetch = false } = {}) {
  const [fetched, setFetched] = useState({}) // deptId -> sections[]
  const reqRef = useRef(0)

  useEffect(() => {
    if (!canFetch) return
    const reqId = ++reqRef.current
    const missing = departmentIds.filter(id => {
      const dept = departments.find(d => String(d.id) === String(id))
      return !Array.isArray(dept?.sections) && !fetched[id]
    })
    if (!missing.length) return
    Promise.all(missing.map(id =>
      api.get('/admin/sections', { params: { department_id: id, per_page: 100 } })
        .then(res => {
          const pag = res.data?.sections
          return [id, pag?.data ?? (Array.isArray(pag) ? pag : [])]
        })
        .catch(() => [id, []])
    )).then(entries => {
      if (reqId !== reqRef.current) return
      setFetched(prev => ({ ...prev, ...Object.fromEntries(entries) }))
    })
  }, [departmentIds, departments, canFetch, fetched])

  return useMemo(() => {
    const seen = new Set()
    const out = []
    for (const id of departmentIds) {
      const dept = departments.find(d => String(d.id) === String(id))
      const list = Array.isArray(dept?.sections) ? dept.sections : (fetched[id] ?? [])
      for (const s of list) {
        if (!seen.has(s.id)) { seen.add(s.id); out.push(s) }
      }
    }
    return out
  }, [departmentIds, departments, fetched])
}
