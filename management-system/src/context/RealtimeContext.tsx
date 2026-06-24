import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { socketServerUrl } from '../utils/socketUrl'

export type InvoiceEditingEntry = {
  userId: string
  userName: string
  avatarPreset?: string | null
}

export type RecordWorkingPresence = {
  userName: string
  avatarPreset?: string | null
}

export type InvoiceEditingMap = Record<string, InvoiceEditingEntry>

type RealtimeContextValue = {
  socket: Socket | null
  connected: boolean
  invoiceEditing: InvoiceEditingMap
  emitInvoiceEditingStart: (recordId: string, presence: RecordWorkingPresence) => void
  emitInvoiceEditingStop: (recordId: string) => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, authToken } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [invoiceEditing, setInvoiceEditing] = useState<InvoiceEditingMap>({})

  useEffect(() => {
    if (!user) {
      setSocket(null)
      setConnected(false)
      setInvoiceEditing({})
      return
    }

    const instance = io(socketServerUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: authToken ? { token: authToken } : {},
    })

    instance.on('connect', () => setConnected(true))
    instance.on('disconnect', () => setConnected(false))
    instance.on('invoice-editing:sync', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        setInvoiceEditing({})
        return
      }
      setInvoiceEditing(payload as InvoiceEditingMap)
    })

    setSocket(instance)
    return () => {
      instance.removeAllListeners()
      instance.disconnect()
      setSocket(null)
      setConnected(false)
      setInvoiceEditing({})
    }
  }, [user?.id, authToken, user])

  const emitInvoiceEditingStart = useCallback(
    (recordId: string, presence: RecordWorkingPresence) => {
      socket?.emit('invoice-editing:start', {
        recordId,
        userName: presence.userName,
        avatarPreset: presence.avatarPreset ?? null,
      })
    },
    [socket],
  )

  const emitInvoiceEditingStop = useCallback(
    (recordId: string) => {
      socket?.emit('invoice-editing:stop', { recordId })
    },
    [socket],
  )

  const value = useMemo(
    () => ({
      socket,
      connected,
      invoiceEditing,
      emitInvoiceEditingStart,
      emitInvoiceEditingStop,
    }),
    [socket, connected, invoiceEditing, emitInvoiceEditingStart, emitInvoiceEditingStop],
  )

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider')
  return ctx
}
