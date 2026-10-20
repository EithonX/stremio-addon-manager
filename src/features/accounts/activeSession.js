const STORAGE_KEY = 'sam_active_session'

// A tab keeps only a routing selector. The HttpOnly cookie is still required to
// use it. An empty selector explicitly pauses resume while switching accounts.
export function readActiveSession() {
  try { return sessionStorage.getItem(STORAGE_KEY) }
  catch { return null }
}
export function selectActiveSession(id) {
  try { sessionStorage.setItem(STORAGE_KEY, id) }
  catch { /* The server's active cookie still supports a single-account resume. */ }
}
