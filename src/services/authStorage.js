// Where the browser keeps the session.
//
// "تذكرني" decides the storage area, which is the only thing a client can
// decide here: the Sanctum token itself is minted with a fixed 30-day expiry
// by the backend either way (AuthController::createPlatformToken). Ticked →
// localStorage, so the session survives closing the browser. Unticked →
// sessionStorage, so it dies with the tab.
//
// Reads look in both areas, because a session written under one setting must
// keep working until it is explicitly replaced or cleared.

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const REMEMBER_KEY = 'auth_remember'

// Storage throws in some privacy modes; a failed write must never break login.
function safeGet(store, key) {
  try { return store.getItem(key) } catch { return null }
}

function safeSet(store, key, value) {
  try { store.setItem(key, value) } catch { /* private mode / quota */ }
}

function safeRemove(store, key) {
  try { store.removeItem(key) } catch { /* ignore */ }
}

export function readToken() {
  return safeGet(localStorage, TOKEN_KEY) ?? safeGet(sessionStorage, TOKEN_KEY)
}

export function readUser() {
  const raw = safeGet(localStorage, USER_KEY) ?? safeGet(sessionStorage, USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** The remembered state of the checkbox — defaults to on, which is how the dashboard behaved before it was wired up. */
export function readRemember() {
  return safeGet(localStorage, REMEMBER_KEY) !== '0'
}

export function persistSession({ token, user, remember }) {
  clearSession()
  safeSet(localStorage, REMEMBER_KEY, remember ? '1' : '0')
  const store = remember ? localStorage : sessionStorage
  if (token) safeSet(store, TOKEN_KEY, token)
  if (user) safeSet(store, USER_KEY, JSON.stringify(user))
}

/** Replaces the cached user (e.g. after GET /me) without moving the session. */
export function persistUser(user) {
  const store = readRemember() ? localStorage : sessionStorage
  if (user) safeSet(store, USER_KEY, JSON.stringify(user))
}

/** Wipes both areas. The remembered checkbox state deliberately survives. */
export function clearSession() {
  for (const store of [localStorage, sessionStorage]) {
    safeRemove(store, TOKEN_KEY)
    safeRemove(store, USER_KEY)
  }
}
