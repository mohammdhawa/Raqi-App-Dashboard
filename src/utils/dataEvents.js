// Cross-page invalidation, in the same window-event style the topbar already
// uses (`topbar:refresh`).
//
// It exists for one backend behaviour: PATCH /admin/sections/{section} moves
// every member of the section to the new department along with it and reports
// the count as `moved_users`. That silently rewrites `users.department_id` for
// people the caller never named, so anything derived from a department — a
// user listing, a department→sections dropdown, an attendance filter — is
// stale the moment a move lands.

export const SECTIONS_CHANGED = 'raqi:sections-changed'

/** Announce that sections (and possibly their members' departments) changed. */
export function emitSectionsChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent(SECTIONS_CHANGED, { detail }))
}

/** Subscribe; returns the unsubscribe function, for use from an effect. */
export function onSectionsChanged(handler) {
  window.addEventListener(SECTIONS_CHANGED, handler)
  return () => window.removeEventListener(SECTIONS_CHANGED, handler)
}
