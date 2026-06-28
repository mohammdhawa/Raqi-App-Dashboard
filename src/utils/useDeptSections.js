import { useState, useEffect, useRef } from 'react'
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
