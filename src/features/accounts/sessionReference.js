// This selector cannot authenticate a request without its matching HttpOnly cookie.
const PREFIX = 'sam-session:'
export const validSessionId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
export const sessionReference = id => validSessionId(id) ? `${PREFIX}${id}` : ''
export const sessionIdFrom = reference => typeof reference === 'string' && reference.startsWith(PREFIX) && validSessionId(reference.slice(PREFIX.length)) ? reference.slice(PREFIX.length) : ''
