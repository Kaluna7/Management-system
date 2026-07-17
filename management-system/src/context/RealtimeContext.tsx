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
export type BuyerEditingEntry = InvoiceEditingEntry
export type BuyerEditingMap = InvoiceEditingMap

type RealtimeContextValue = {
  socket: Socket | null
  connected: boolean
  invoiceEditing: InvoiceEditingMap
  buyerEditing: BuyerEditingMap
  emitInvoiceEditingStart: (recordId: string, presence: RecordWorkingPresence) => void
  emitInvoiceEditingStop: (recordId: string) => void
  emitBuyerEditingStart: (recordId: string, presence: RecordWorkingPresence) => void
  emitBuyerEditingStop: (recordId: string) => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

function parsePresenceMap(payload: unknown): InvoiceEditingMap {
  if (!payload || typeof payload !== 'object') return {}
  return payload as InvoiceEditingMap
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, authToken } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [invoiceEditing, setInvoiceEditing] = useState<InvoiceEditingMap>({})
  const [buyerEditing, setBuyerEditing] = useState<BuyerEditingMap>({})

  useEffect(() => {
    if (!user) {
      setSocket(null)
      setConnected(false)
      setInvoiceEditing({})
      setBuyerEditing({})
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
      setInvoiceEditing(parsePresenceMap(payload))
    })
    instance.on('buyer-editing:sync', (payload: unknown) => {
      setBuyerEditing(parsePresenceMap(payload))
    })

    setSocket(instance)
    return () => {
      instance.removeAllListeners()
      instance.disconnect()
      setSocket(null)
      setConnected(false)
      setInvoiceEditing({})
      setBuyerEditing({})
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

  const emitBuyerEditingStart = useCallback(
    (recordId: string, presence: RecordWorkingPresence) => {
      socket?.emit('buyer-editing:start', {
        recordId,
        userName: presence.userName,
        avatarPreset: presence.avatarPreset ?? null,
      })
    },
    [socket],
  )

  const emitBuyerEditingStop = useCallback(
    (recordId: string) => {
      socket?.emit('buyer-editing:stop', { recordId })
    },
    [socket],
  )

  const value = useMemo(
    () => ({
      socket,
      connected,
      invoiceEditing,
      buyerEditing,
      emitInvoiceEditingStart,
      emitInvoiceEditingStop,
      emitBuyerEditingStart,
      emitBuyerEditingStop,
    }),
    [
      socket,
      connected,
      invoiceEditing,
      buyerEditing,
      emitInvoiceEditingStart,
      emitInvoiceEditingStop,
      emitBuyerEditingStart,
      emitBuyerEditingStop,
    ],
  )

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider')
  return ctx
}
