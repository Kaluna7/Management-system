import type { BuyerRecord } from '../types/workflow'

/** Show reminders when period end is within this many days (inclusive). */
export const EXPIRY_REMINDER_DAYS = 5

export function daysUntilPeriodEnd(endDate: string): number {
  const today = new Date()
  const end = new Date(endDate)
  if (Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY
  const ms = end.getTime() - today.setHours(0, 0, 0, 0)
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function isRecordActiveForExpiryReminder(record: BuyerRecord) {
  return record.status !== 'archived' && record.status !== 'history'
}

export type ExpiryReminderUrgency = 'overdue' | 'today' | 'soon'

export type PeriodExpiryReminder = {
  record: BuyerRecord
  daysLeft: number
  urgency: ExpiryReminderUrgency
}

function urgencyFromDaysLeft(daysLeft: number): ExpiryReminderUrgency | null {
  if (daysLeft < 0) return 'overdue'
  if (daysLeft === 0) return 'today'
  if (daysLeft <= EXPIRY_REMINDER_DAYS) return 'soon'
  return null
}

export function buildPeriodExpiryReminders(records: BuyerRecord[]): PeriodExpiryReminder[] {
  const items: PeriodExpiryReminder[] = []
  for (const record of records) {
    if (!isRecordActiveForExpiryReminder(record)) continue
    const daysLeft = daysUntilPeriodEnd(record.periodEnd)
    const urgency = urgencyFromDaysLeft(daysLeft)
    if (!urgency) continue
    items.push({ record, daysLeft, urgency })
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft)
}

export function countPeriodExpiryReminders(records: BuyerRecord[]): number {
  return buildPeriodExpiryReminders(records).length
}
