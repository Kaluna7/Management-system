const STORAGE_PREFIX = 'finly-portal-notif-read'

function storageKey(userKey: string) {
  return `${STORAGE_PREFIX}:${userKey}`
}

export function loadReadNotificationIds(userKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userKey))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function saveReadNotificationIds(userKey: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(userKey), JSON.stringify([...ids]))
  } catch {
    /* ignore quota */
  }
}
