import type { InvoiceEditingMap, InvoiceEditingEntry } from '../context/RealtimeContext'

/** Another user is working on this record (not the current user). */
export function recordWorkingByOther(
  recordId: string,
  currentUserId: string | undefined,
  map: InvoiceEditingMap,
): InvoiceEditingEntry | null {
  const entry = map[recordId]
  if (!entry) return null
  if (currentUserId && entry.userId === currentUserId) return null
  return entry
}
