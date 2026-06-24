const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export function recordFileUrl(
  recordId: string,
  kind: 'agreement' | 'formula-form' | 'stamped-paper',
  index = 0,
) {
  if ((kind === 'formula-form' || kind === 'agreement') && index > 0) {
    return `${API_BASE_URL}/api/records/${encodeURIComponent(recordId)}/files/${kind}/${index}`
  }
  return `${API_BASE_URL}/api/records/${encodeURIComponent(recordId)}/files/${kind}`
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { authToken?: string | null } = {},
): Promise<T> {
  const { authToken, ...rest } = init
  const headers: Record<string, string> = {}
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  if (rest.body && !(rest.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (rest.headers) {
    const h = rest.headers
    if (h instanceof Headers) {
      h.forEach((value, key) => {
        headers[key] = value
      })
    } else if (typeof h === 'object') {
      Object.assign(headers, h as Record<string, string>)
    }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers })
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}))
    const msg =
      errBody && typeof errBody === 'object' && 'message' in errBody
        ? String((errBody as { message?: string }).message)
        : `Request failed: ${response.status}`
    throw new Error(msg)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
