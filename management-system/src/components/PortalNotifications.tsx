import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { ModalCloseButton } from './ModalCloseButton'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useWorkflow } from '../context/WorkflowContext'
import type { StringKey } from '../i18n/strings'
import {
  loadReadNotificationIds,
  saveReadNotificationIds,
} from '../utils/notificationReadState'
import {
  buildPortalNotifications,
  isExpiryReminder,
  portalNotificationKey,
  type PortalNotificationItem,
} from '../utils/portalNotifications'

const PREVIEW_LIMIT = 3

type Props = {
  onRecordSelect?: (recordId: string, kind: PortalNotificationItem['kind']) => void
  compact?: boolean
}

function formatPeriodEnd(isoDate: string, dateLocale: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

type NotificationCardProps = {
  item: PortalNotificationItem
  isUnread: boolean
  message: string
  actionLabel: string
  badgeLabel: string
  newLabel: string
  onSelect: () => void
}

function NotificationCard({
  item,
  isUnread,
  message,
  actionLabel,
  badgeLabel,
  newLabel,
  onSelect,
}: NotificationCardProps) {
  const urgent =
    item.kind === 'stamp_upload' ||
    item.kind === 'buyer_edit_request' ||
    (isExpiryReminder(item) && (item.urgency === 'overdue' || item.urgency === 'today'))

  const badgeClass =
    item.kind === 'stamp_upload'
      ? 'bg-primary-light text-app-text'
      : item.kind === 'buyer_edit_request'
        ? 'bg-finance-light text-app-text'
        : isExpiryReminder(item) && item.urgency === 'overdue'
          ? 'bg-red-100 text-app-text'
          : isExpiryReminder(item) && item.urgency === 'today'
            ? 'bg-reminder-light text-reminder'
            : 'portal-badge-normal'

  const avatarClass =
    item.kind === 'stamp_upload'
      ? 'bg-primary-light text-app-text'
      : item.kind === 'buyer_edit_request'
        ? 'bg-finance-light text-app-text'
        : urgent
          ? 'bg-reminder-light text-reminder'
          : 'bg-primary-light text-app-text'

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`group relative w-full rounded-2xl border px-4 py-3.5 text-left transition ${
          isUnread
            ? 'border-primary/30 bg-primary-light shadow-sm'
            : 'portal-border portal-card-sm border bg-transparent shadow-none'
        } ${urgent ? 'ring-1 ring-finance/30' : ''}`}
      >
        {isUnread ? (
          <span
            className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-primary"
            aria-hidden
          />
        ) : null}
        <div className="flex gap-3 pr-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarClass}`}
            aria-hidden
          >
            {(item.record.vendorName.trim()[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
              >
                {badgeLabel}
              </span>
              {isUnread ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {newLabel}
                </span>
              ) : null}
            </div>
            <p className="portal-heading truncate font-semibold">{item.record.vendorName}</p>
            <p className="portal-muted text-xs">{item.record.vendorCode}</p>
            <p className="mt-2 text-sm leading-relaxed portal-body">
              {message}
            </p>
            <p className="portal-accent mt-2 text-xs font-medium group-hover:underline">
              {actionLabel} →
            </p>
          </div>
        </div>
      </button>
    </li>
  )
}

export function PortalNotifications({ onRecordSelect, compact = false }: Props) {
  const { t, dateLocale } = useLanguage()
  const { user } = useAuth()
  const { records } = useWorkflow()
  const previewPanelId = useId()
  const allPanelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [allOpen, setAllOpen] = useState(false)

  const userKey = user?.id ?? 'guest'
  const role = user?.role ?? 'buyers'

  const notifications = useMemo(
    () => buildPortalNotifications(records, role),
    [records, role],
  )

  const previewNotifications = useMemo(
    () => notifications.slice(0, PREVIEW_LIMIT),
    [notifications],
  )

  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadNotificationIds(userKey))

  useEffect(() => {
    setReadIds(loadReadNotificationIds(userKey))
  }, [userKey])

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.has(portalNotificationKey(item))).length,
    [notifications, readIds],
  )

  const markKeysRead = useCallback(
    (keys: string[]) => {
      if (keys.length === 0) return
      setReadIds((prev) => {
        const next = new Set(prev)
        for (const key of keys) next.add(key)
        saveReadNotificationIds(userKey, next)
        return next
      })
    },
    [userKey],
  )

  const closePreview = useCallback(() => setPreviewOpen(false), [])
  const closeAll = useCallback(() => setAllOpen(false), [])

  const openPreview = useCallback(() => {
    setPreviewOpen(true)
    markKeysRead(previewNotifications.map(portalNotificationKey))
  }, [markKeysRead, previewNotifications])

  const openAll = useCallback(() => {
    setPreviewOpen(false)
    setAllOpen(true)
    markKeysRead(notifications.map(portalNotificationKey))
  }, [markKeysRead, notifications])

  useEffect(() => {
    if (!previewOpen && !allOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (allOpen) closeAll()
        else closePreview()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [previewOpen, allOpen, closePreview, closeAll])

  function interpolate(key: StringKey, vars: Record<string, string | number>) {
    let text = t(key) as string
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
    return text
  }

  function notificationMessage(item: PortalNotificationItem) {
    const vendor = item.record.vendorName
    if (item.kind === 'stamp_upload') {
      return interpolate('notificationStampUpload', { vendor })
    }
    if (item.kind === 'buyer_edit_request') {
      return interpolate('notificationBuyerEditRequest', { vendor })
    }
    const date = formatPeriodEnd(item.record.periodEnd, dateLocale)
    if (item.urgency === 'overdue') {
      return interpolate('notificationPeriodOverdue', { vendor, days: Math.abs(item.daysLeft), date })
    }
    if (item.urgency === 'today') {
      return interpolate('notificationPeriodEndsToday', { vendor, date })
    }
    return interpolate('notificationPeriodEndsInDays', { vendor, days: item.daysLeft, date })
  }

  function badgeLabel(item: PortalNotificationItem) {
    if (item.kind === 'stamp_upload') return t('notificationBadgeStamp')
    if (item.kind === 'buyer_edit_request') return t('notificationBadgeBuyerEdit')
    if (isExpiryReminder(item) && item.urgency === 'overdue') return t('notificationBadgeOverdue')
    if (isExpiryReminder(item) && item.urgency === 'today') return t('notificationBadgeToday')
    return t('notificationBadgeSoon')
  }

  function actionLabel(item: PortalNotificationItem) {
    return item.kind === 'stamp_upload' || item.kind === 'buyer_edit_request'
      ? t('notificationViewTask')
      : t('notificationViewDetail')
  }

  function openNotification(item: PortalNotificationItem, fromAll: boolean) {
    markKeysRead([portalNotificationKey(item)])
    if (fromAll) closeAll()
    else closePreview()
    onRecordSelect?.(item.record.id, item.kind)
  }

  function renderNotificationList(items: PortalNotificationItem[], fromAll: boolean) {
    return (
      <ul className="space-y-3">
        {items.map((item) => {
          const key = portalNotificationKey(item)
          return (
            <NotificationCard
              key={key}
              item={item}
              isUnread={!readIds.has(key)}
              message={notificationMessage(item)}
              actionLabel={actionLabel(item)}
              badgeLabel={badgeLabel(item)}
              newLabel={t('notificationNew')}
              onSelect={() => openNotification(item, fromAll)}
            />
          )
        })}
      </ul>
    )
  }

  const previewPopup =
    previewOpen && typeof document !== 'undefined' ? (
      <div
        className="portal-overlay fixed inset-0 z-[125] overflow-y-auto"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closePreview()
        }}
      >
        <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
          <div
            id={previewPanelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${previewPanelId}-title`}
            className="portal-modal flex max-h-[min(85vh,36rem)] w-full max-w-md min-h-0 flex-col overflow-hidden shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="portal-border flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
              <div>
                <h2 id={`${previewPanelId}-title`} className="portal-heading text-base font-semibold">
                  {t('notificationsPanelTitle')}
                </h2>
                <p className="portal-muted mt-0.5 text-xs">{t('notificationsPanelSubtitle')}</p>
              </div>
              <ModalCloseButton onClick={closePreview} label={t('close')} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {notifications.length === 0 ? (
                <p className="portal-muted rounded-xl border border-dashed border-app-border px-4 py-10 text-center text-sm">
                  {t('notificationsEmpty')}
                </p>
              ) : (
                renderNotificationList(previewNotifications, false)
              )}
            </div>

            {notifications.length > 0 ? (
              <div className="portal-border shrink-0 space-y-2 border-t px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={openAll}
                  className="portal-btn-primary w-full text-sm font-semibold"
                >
                  {t('notificationsViewAll')}
                  {notifications.length > PREVIEW_LIMIT
                    ? ` (${notifications.length})`
                    : ''}
                </button>
                <p className="portal-muted text-center text-[11px]">{t('notificationsTapHint')}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null

  const allPopup =
    allOpen && typeof document !== 'undefined' ? (
      <div
        className="portal-overlay fixed inset-0 z-[125] overflow-y-auto"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeAll()
        }}
      >
        <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
          <div
            id={allPanelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${allPanelId}-title`}
            className="portal-modal flex h-[min(85vh,40rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="portal-border flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
              <div>
                <h2 id={`${allPanelId}-title`} className="portal-heading text-lg font-semibold">
                  {t('notificationsAllTitle')}
                </h2>
                <p className="portal-muted mt-1 text-sm">
                  {interpolate('notificationsAllSubtitle', { count: notifications.length })}
                </p>
              </div>
              <ModalCloseButton onClick={closeAll} label={t('close')} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {notifications.length === 0 ? (
                <p className="portal-muted rounded-xl border border-dashed border-app-border px-4 py-12 text-center text-sm">
                  {t('notificationsEmpty')}
                </p>
              ) : (
                renderNotificationList(notifications, true)
              )}
            </div>

            {notifications.length > 0 ? (
              <div className="portal-border shrink-0 border-t px-5 py-3 text-center sm:px-6">
                <p className="portal-muted text-xs">{t('notificationsTapHint')}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => {
            if (allOpen) {
              closeAll()
              return
            }
            if (previewOpen) closePreview()
            else openPreview()
          }}
        className={`portal-surface portal-border relative inline-flex items-center justify-center rounded-lg border text-app-muted shadow-sm transition hover:border-primary/30 hover:text-primary ${compact ? 'h-8 w-8' : 'h-10 w-10'}`}
          aria-expanded={previewOpen || allOpen}
          aria-haspopup="dialog"
          aria-controls={previewOpen ? previewPanelId : allOpen ? allPanelId : undefined}
          title={t('notificationsLabel')}
        >
          <Bell className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden strokeWidth={1.75} />
          {unreadCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white shadow-md ring-2 ring-white"
              aria-label={interpolate('notificationUnreadBadge', { count: unreadCount })}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>
      </div>
      {previewPopup ? createPortal(previewPopup, document.body) : null}
      {allPopup ? createPortal(allPopup, document.body) : null}
    </>
  )
}
