// Helpers for the attendance/leave query API: single-field sorting params and
// the XLSX export (format=xlsx) download. Component-free module (react-refresh)
// — the matching UI controls live in components/attendance/controls.jsx.

import api from '../services/api'

// sort = { field, dir } | null → the sort_by/sort_direction pair the API
// expects. null sends nothing so each endpoint keeps its documented default
// order (pages must look identical until the user touches a sort control).
export function sortParams(sort) {
  return sort ? { sort_by: sort.field, sort_direction: sort.dir } : {}
}

// Same shape used by the pages' local readApiError helpers: prefer field
// validation errors, then the business-rule top-level message.
export function readApiError(err, fallback = 'تعذّر تحميل البيانات، حاول مرة أخرى') {
  const data = err?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('، ')
  if (data?.message) return data.message
  return fallback
}

// attachment; filename="attendance-records_generated-20260705-103000.xlsx"
// (also tolerates the RFC 5987 filename*=UTF-8'' variant).
function filenameFromDisposition(disposition, fallback) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '')
  if (!match) return fallback
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

// Download the current view as an Excel file: same endpoint, same filters and
// sorting, with format=xlsx appended. Goes through axios because the API needs
// the Authorization bearer header — a plain <a href> would get a 401. Exports
// return the complete filtered result, so page/per_page must not be sent.
export async function downloadXlsx(url, params = {}, fallbackName = 'attendance-export.xlsx') {
  try {
    const res = await api.get(url, {
      params: { ...params, format: 'xlsx' },
      responseType: 'blob',
    })
    const name = filenameFromDisposition(res.headers?.['content-disposition'], fallbackName)
    const href = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = href
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  } catch (err) {
    // With responseType: 'blob' an error body (422/403 JSON) arrives as a Blob;
    // decode it so callers can surface the API's Arabic message as usual.
    const blob = err?.response?.data
    if (blob instanceof Blob && blob.type?.includes('json')) {
      try { err.response.data = JSON.parse(await blob.text()) } catch { /* keep the blob */ }
    }
    throw err
  }
}
