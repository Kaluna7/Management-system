const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

/** Socket.IO server URL (same host as REST API unless overridden). */
export function socketServerUrl(): string {
  const custom = import.meta.env.VITE_SOCKET_URL as string | undefined
  if (custom?.trim()) return custom.trim()
  return API_BASE_URL
}
