const API_BASE = '/api'

async function parseJsonResponse(response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Server returned invalid JSON.')
  }
}

function getApiErrorMessage(data, fallback) {
  return data?.error?.message || fallback
}

export async function postStremioApi(endpoint, payload) {
  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, `Request failed with HTTP ${response.status}.`))
  }

  return data
}

export function loginToStremio(email, password) {
  return postStremioApi('login', { email, password })
}

export function getAddonCollection(authKey) {
  return postStremioApi('addonCollectionGet', {
    type: 'AddonCollectionGet',
    authKey,
    update: true,
  })
}

export function setAddonCollection(authKey, addons) {
  return postStremioApi('addonCollectionSet', {
    type: 'AddonCollectionSet',
    authKey,
    addons,
  })
}

export async function fetchAddonManifest(manifestUrl) {
  const response = await fetch(`${API_BASE}/manifest?url=${encodeURIComponent(manifestUrl)}`, {
    headers: { accept: 'application/json' },
  })
  const data = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, `Manifest fetch failed with HTTP ${response.status}.`))
  }

  return data
}
