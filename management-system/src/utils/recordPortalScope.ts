import type { BuyerRecord } from '../types/workflow'

export type PortalDepartmentRole = 'buyers' | 'finance'

function effectiveCreatedByRole(record: Pick<BuyerRecord, 'createdByRole' | 'createdByAdmin'>): string {
  if (record.createdByRole) return record.createdByRole
  if (record.createdByAdmin) return ''
  return 'buyers'
}

/** Portal users only see records from their lane — not admin or the other department. */
export function isRecordVisibleOnPortal(
  record: Pick<BuyerRecord, 'createdByRole' | 'createdByAdmin'>,
  viewerRole: PortalDepartmentRole,
): boolean {
  if (record.createdByAdmin) return false
  const created = effectiveCreatedByRole(record)
  if (viewerRole === 'buyers') {
    return created === 'buyers'
  }
  return created === 'buyers'
}

export function filterRecordsForPortal<T extends Pick<BuyerRecord, 'createdByRole' | 'createdByAdmin'>>(
  records: T[],
  viewerRole: PortalDepartmentRole,
): T[] {
  return records.filter((r) => isRecordVisibleOnPortal(r, viewerRole))
}
