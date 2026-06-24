import { FiBell, FiClipboard, FiFileText } from 'react-icons/fi'
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
    return <FiBell className={cls} aria-hidden />
  }
  if (role === 'finance') {
    return <FiClipboard className={cls} aria-hidden />
  }
  return <FiFileText className={cls} aria-hidden />
}
