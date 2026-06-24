import type { DepartmentRole } from '../types/user'
import type { BuyerRecord } from '../types/workflow'
import { hasPendingBuyerEditRequest } from './recordBuyerEdit'
import {
  filterFinanceOverviewRecords,
  filterFinanceTaskRecords,
} from './financeRecordScope'
import {
  buildPeriodExpiryReminders,
  type ExpiryReminderUrgency,
  type PeriodExpiryReminder,
} from './periodExpiryReminders'

export type PortalNotificationKind = 'period_expiry' | 'stamp_upload' | 'buyer_edit_request'

export type PortalNotificationItem =
  | {
      kind: 'period_expiry'
      record: BuyerRecord
      daysLeft: number
      urgency: ExpiryReminderUrgency
    }
  | {
      kind: 'stamp_upload'
      record: BuyerRecord
    }
  | {
      kind: 'buyer_edit_request'
      record: BuyerRecord
    }

export function portalNotificationKey(item: PortalNotificationItem): string {
  if (item.kind === 'stamp_upload') return `stamp:${item.record.id}`
  if (item.kind === 'buyer_edit_request') return `edit-req:${item.record.id}`
  return `expiry:${item.record.id}`
}

export function buildPortalNotifications(
  records: BuyerRecord[],
  role: DepartmentRole,
): PortalNotificationItem[] {
  if (role === 'buyers') {
    return buildPeriodExpiryReminders(records).map(
      (r): PortalNotificationItem => ({
        kind: 'period_expiry',
        record: r.record,
        daysLeft: r.daysLeft,
        urgency: r.urgency,
      }),
    )
  }

  const items: PortalNotificationItem[] = []

  for (const record of filterFinanceTaskRecords(records)) {
    if (hasPendingBuyerEditRequest(record)) {
      items.push({ kind: 'buyer_edit_request', record })
    } else {
      items.push({ kind: 'stamp_upload', record })
    }
  }

  const expiryPool = filterFinanceOverviewRecords(records)
  for (const r of buildPeriodExpiryReminders(expiryPool)) {
    items.push({
      kind: 'period_expiry',
      record: r.record,
      daysLeft: r.daysLeft,
      urgency: r.urgency,
    })
  }

  return items
}

export function isExpiryReminder(item: PortalNotificationItem): item is PeriodExpiryReminder & {
  kind: 'period_expiry'
} {
  return item.kind === 'period_expiry'
}
