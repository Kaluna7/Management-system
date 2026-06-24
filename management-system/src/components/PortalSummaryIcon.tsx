import { Bell, ClipboardList, FileText } from 'lucide-react'
import type { StringKey } from '../i18n/strings'

export type PortalSummaryIconKind = 'records' | 'reminder'

type Props = {
  kind: PortalSummaryIconKind
  role: 'buyers' | 'finance'
  className?: string
}

export function summaryIconKind(labelKey: StringKey): PortalSummaryIconKind {
  return labelKey === 'summaryReminder' ? 'reminder' : 'records'
}

/** Summary stat icons — buyer data vs finance queue vs deadline reminder. */
export function PortalSummaryIcon({ kind, role, className = 'h-7 w-7' }: Props) {
  const cls = `${className} shrink-0`
  if (kind === 'reminder') {
    return <Bell className={cls} aria-hidden strokeWidth={1.75} />
  }
  if (role === 'finance') {
    return <ClipboardList className={cls} aria-hidden strokeWidth={1.75} />
  }
  return <FileText className={cls} aria-hidden strokeWidth={1.75} />
}
