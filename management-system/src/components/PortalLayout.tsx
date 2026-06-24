import { useEffect, useId, useState, type ReactNode } from 'react'
import { Archive, ClipboardCheck, History, LayoutDashboard, Menu, X, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import finlyLogo from '../assets/logo.png'
import { LanguageToggle } from './LanguageToggle'
import { PortalNotifications } from './PortalNotifications'
import { ProfileMenu } from './ProfileMenu'
import type { StringKey } from '../i18n/strings'

export type PortalNavIcon = 'overview' | 'task' | 'archive' | 'history'

export type PortalNavItem = {
  to: string
  labelKey: StringKey
  end?: boolean
  icon: PortalNavIcon
  /** Sidebar / mobile nav count badge (e.g. pending Task items). */
  badgeCount?: number
}

function NavCountBadge({ count, size = 'sm' }: { count: number; size?: 'sm' | 'sidebar' }) {
  if (count <= 0) return null
  const label = count > 99 ? '99+' : String(count)
  if (size === 'sidebar') {
    return (
      <span
        className="absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold leading-none text-white shadow-sm ring-1 ring-white"
        aria-hidden
      >
        {label}
      </span>
    )
  }
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white">
      {label}
    </span>
  )
}

type Props = {
  userName: string
  userDepartment: string
  userInitial: string
  roleLabelKey: StringKey
  navItems: PortalNavItem[]
  t: (key: StringKey) => string
  onNotificationRecordSelect?: (recordId: string, kind?: 'stamp_upload' | 'period_expiry') => void
  children: ReactNode
}

function NavIcon({ kind, className = 'h-6 w-6' }: { kind: PortalNavIcon; className?: string }) {
  const icons: Record<PortalNavIcon, LucideIcon> = {
    overview: LayoutDashboard,
    task: ClipboardCheck,
    archive: Archive,
    history: History,
  }
  const Icon = icons[kind]
  return <Icon className={`${className} shrink-0`} aria-hidden strokeWidth={1.75} />
}

function MobileDrawerNavLink({
  item,
  t,
  onNavigate,
}: {
  item: PortalNavItem
  t: (key: StringKey) => string
  onNavigate: () => void
}) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className="block">
      {({ isActive }) => (
        <span
          className={[
            'flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition-colors',
            isActive ? 'portal-nav-active' : 'portal-nav-idle',
          ].join(' ')}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <NavIcon kind={item.icon} className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">{t(item.labelKey)}</span>
          <NavCountBadge count={item.badgeCount ?? 0} />
        </span>
      )}
    </NavLink>
  )
}

export function PortalLayout({
  userName,
  userDepartment,
  userInitial,
  roleLabelKey,
  navItems,
  t,
  onNotificationRecordSelect,
  children,
}: Props) {
  const mobileNavId = useId()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const closeMobileNav = () => setMobileNavOpen(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileNav()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileNavOpen])

  const portalTopbarHeight = 'h-[4.25rem]'

  const hamburgerBtnClass =
    'portal-surface portal-border inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-app-muted shadow-sm transition hover:border-primary/30 hover:text-primary md:hidden'

  return (
    <div className="portal-shell">
      <aside
        className="group/sidebar portal-surface portal-border fixed inset-y-0 left-0 z-40 hidden w-[4.5rem] flex-col overflow-hidden border-r shadow-sm transition-[width] duration-300 ease-out hover:w-60 hover:shadow-xl md:flex"
        aria-label={t('menuNavigation')}
      >
        <div className="portal-border flex h-[4.25rem] shrink-0 items-center border-b px-3">
          <img
            src={finlyLogo}
            alt=""
            className="h-10 w-10 shrink-0 object-contain"
            width={40}
            height={40}
          />
          <span className="finly-brand ml-3 whitespace-nowrap text-xl font-bold tracking-tight">
            Finly
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto py-3">
          {navItems.map((item) => (
            <div key={item.to} className="px-2">
              <NavLink to={item.to} end={item.end} title={t(item.labelKey)} className="block">
                {({ isActive }) => (
                  <span
                    className={[
                      'sidebar-nav-item relative flex items-center rounded-lg py-3 text-base font-medium transition-colors duration-200',
                      isActive ? 'portal-nav-active' : 'portal-nav-idle',
                    ].join(' ')}
                  >
                    {isActive ? (
                      <span
                        className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-primary opacity-0 transition-opacity group-hover/sidebar:opacity-100"
                        aria-hidden
                      />
                    ) : null}
                    <span className="sidebar-nav-icon relative flex h-10 w-10 shrink-0 items-center justify-center">
                      <NavIcon kind={item.icon} className="h-7 w-7" />
                      <NavCountBadge count={item.badgeCount ?? 0} size="sidebar" />
                    </span>
                    <span className="sidebar-nav-label overflow-hidden whitespace-nowrap">
                      {t(item.labelKey)}
                    </span>
                  </span>
                )}
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>

      {mobileNavOpen ? (
        <div
          className="portal-overlay fixed inset-0 z-[45] md:hidden"
          role="presentation"
          aria-hidden
          onMouseDown={closeMobileNav}
        />
      ) : null}

      <aside
        id={mobileNavId}
        className={[
          'portal-surface portal-border fixed inset-y-0 left-0 z-[46] flex w-[min(20rem,92vw)] flex-col border-r shadow-2xl transition-transform duration-300 ease-out md:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        ].join(' ')}
        aria-label={t('menuNavigation')}
        aria-hidden={!mobileNavOpen}
      >
        <div className="portal-border flex h-[4.25rem] shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <img src={finlyLogo} alt="" className="h-9 w-9 shrink-0 object-contain" width={36} height={36} />
            <span className="finly-brand truncate text-lg font-bold tracking-tight">Finly</span>
          </div>
          <button
            type="button"
            onClick={closeMobileNav}
            className={hamburgerBtnClass}
            aria-label={t('menuClose')}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="portal-border shrink-0 border-b px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            {t('dashboardLabel')}
          </p>
          <p className="portal-heading mt-1 truncate text-base font-semibold">{userDepartment}</p>
          <p className="portal-muted mt-0.5 truncate text-xs">
            {userName} · {t(roleLabelKey)}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <MobileDrawerNavLink key={item.to} item={item} t={t} onNavigate={closeMobileNav} />
          ))}
        </nav>

        <div className="portal-border shrink-0 space-y-3 border-t p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            {t('menuTools')}
          </p>
          <div className="flex items-center justify-between gap-3 rounded-xl px-1 py-0.5">
            <span className="portal-body text-sm">{t('notificationsLabel')}</span>
            <PortalNotifications
              onRecordSelect={(recordId, kind) => {
                closeMobileNav()
                onNotificationRecordSelect?.(recordId, kind)
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl px-1 py-0.5">
            <span className="portal-body text-sm">
              {t('languageSelector')}
            </span>
            <LanguageToggle className="portal-input !w-auto max-w-[9rem] py-2 text-xs font-semibold" />
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-[4.5rem]">
        <header
          className={`portal-surface portal-border sticky top-0 z-30 flex ${portalTopbarHeight} shrink-0 items-center border-b px-3 shadow-sm sm:px-5 lg:px-6`}
        >
          <div className="flex w-full items-center justify-between gap-2 md:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                className={hamburgerBtnClass}
                aria-expanded={mobileNavOpen}
                aria-controls={mobileNavId}
                aria-label={mobileNavOpen ? t('menuClose') : t('menuOpen')}
              >
                {mobileNavOpen ? (
                  <X className="h-4 w-4" aria-hidden />
                ) : (
                  <Menu className="h-4 w-4" aria-hidden />
                )}
              </button>
              <img src={finlyLogo} alt="" className="h-8 w-8 shrink-0 object-contain" width={32} height={32} />
              <span className="finly-brand truncate text-sm font-bold tracking-tight">Finly</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <PortalNotifications compact onRecordSelect={onNotificationRecordSelect} />
              <ProfileMenu compact userName={userName} userInitial={userInitial} />
            </div>
          </div>

          <div className="hidden w-full items-center justify-between gap-3 md:flex">
            <div className="min-w-0 flex-1 overflow-hidden leading-none">
              <h1 className="portal-heading truncate text-sm font-semibold leading-none">
                {userDepartment}
              </h1>
              <p className="portal-muted mt-1 truncate text-[10px] leading-none">
                {t('dashboardLabel')} · {userName} · {t(roleLabelKey)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <LanguageToggle className="portal-input !h-8 !w-auto !py-0 !text-[10px] font-semibold leading-none" />
              <PortalNotifications compact onRecordSelect={onNotificationRecordSelect} />
              <ProfileMenu compact userName={userName} userInitial={userInitial} />
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
