import { lazy } from 'react'

const RELOADED = 'chunk-reloaded'

/**
 * React.lazy for a route, with one recovery step.
 *
 * Page chunks have hashed filenames, so a tab left open across a deploy asks
 * for files the server no longer has, and the import rejects. One reload
 * fetches the new index and its new chunk names. The session flag stops a
 * loop when the failure is something a reload cannot fix (offline, say); in
 * that case the error is rethrown.
 */
export default function lazyPage(load) {
  return lazy(async () => {
    try {
      const mod = await load()
      try { sessionStorage.removeItem(RELOADED) } catch { /* storage blocked */ }
      return mod
    } catch (err) {
      let already = true
      try {
        already = sessionStorage.getItem(RELOADED) === '1'
        if (!already) sessionStorage.setItem(RELOADED, '1')
      } catch { /* storage blocked: do not risk a reload loop */ }
      if (already) throw err
      window.location.reload()
      return new Promise(() => {}) // hold the fallback until the reload lands
    }
  })
}
