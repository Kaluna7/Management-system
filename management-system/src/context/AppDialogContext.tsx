import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertDialog } from '../components/AlertDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useLanguage } from './LanguageContext'

type ConfirmOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type AlertState = {
  message: string
  title?: string
  resolve: () => void
}

type ConfirmState = {
  message: string
  title?: string
  confirmLabel: string
  cancelLabel: string
  destructive: boolean
  resolve: (ok: boolean) => void
}

type AppDialogContextValue = {
  showAlert: (message: string, title?: string) => Promise<void>
  showConfirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null)

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage()
  const [alertState, setAlertState] = useState<AlertState | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const alertBusy = useRef(false)
  const confirmBusy = useRef(false)

  const showAlert = useCallback((message: string, title?: string) => {
    return new Promise<void>((resolve) => {
      if (alertBusy.current) {
        resolve()
        return
      }
      alertBusy.current = true
      setAlertState({ message, title, resolve })
    })
  }, [])

  const showConfirm = useCallback(
    (message: string, options?: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        if (confirmBusy.current) {
          resolve(false)
          return
        }
        confirmBusy.current = true
        setConfirmState({
          message,
          title: options?.title,
          confirmLabel: options?.confirmLabel ?? t('dialogConfirm'),
          cancelLabel: options?.cancelLabel ?? t('cancel'),
          destructive: options?.destructive !== false,
          resolve,
        })
      })
    },
    [t],
  )

  const closeAlert = useCallback(() => {
    setAlertState((prev) => {
      prev?.resolve()
      return null
    })
    alertBusy.current = false
  }, [])

  const resolveConfirm = useCallback((ok: boolean) => {
    setConfirmState((prev) => {
      prev?.resolve(ok)
      return null
    })
    confirmBusy.current = false
  }, [])

  const value = useMemo(
    () => ({
      showAlert,
      showConfirm,
    }),
    [showAlert, showConfirm],
  )

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <AlertDialog
        open={alertState != null}
        message={alertState?.message ?? ''}
        title={alertState?.title}
        okLabel={t('dialogOk')}
        onClose={closeAlert}
      />
      <ConfirmDialog
        open={confirmState != null}
        message={confirmState?.message ?? ''}
        title={confirmState?.title}
        confirmLabel={confirmState?.confirmLabel ?? t('dialogConfirm')}
        cancelLabel={confirmState?.cancelLabel ?? t('cancel')}
        destructive={confirmState?.destructive ?? true}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
    </AppDialogContext.Provider>
  )
}

export function useAppDialog() {
  const ctx = useContext(AppDialogContext)
  if (!ctx) {
    throw new Error('useAppDialog must be used within AppDialogProvider')
  }
  return ctx
}
