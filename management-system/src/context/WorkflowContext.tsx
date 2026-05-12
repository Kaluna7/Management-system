import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import type { BuyerInput, BuyerRecord, InvoiceData } from '../types/workflow'

const STORAGE_KEY = 'management-system-workflow'
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
const VALID_STATUSES: BuyerRecord['status'][] = [
  'created',
  'invoice_pending',
  'invoice_created',
  'document_generated',
  'archived',
  'history',
]

type WorkflowContextValue = {
  records: BuyerRecord[]
  isLoading: boolean
  apiConnected: boolean
  createBuyerData: (input: BuyerInput, createdBy: string) => void
  setInvoiceReceived: (recordId: string, value: boolean) => void
  createInvoice: (recordId: string, invoice: InvoiceData, financeName: string) => void
  uploadStampedPaper: (recordId: string, fileName: string) => Promise<void>
  publishPaper: (recordId: string) => void
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null)

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return fallback
    const n = Number(trimmed)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeRecord(raw: unknown): BuyerRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<BuyerRecord>
  const id = asString(record.id)
  if (!id) return null

  const nextStatus = VALID_STATUSES.includes(record.status as BuyerRecord['status'])
    ? (record.status as BuyerRecord['status'])
    : 'created'

  const invoiceRaw = record.invoice
  const invoice =
    invoiceRaw && typeof invoiceRaw === 'object'
      ? {
          number: asString(invoiceRaw.number),
          party: asString(invoiceRaw.party),
          attn: asString(invoiceRaw.attn),
          paymentMethod: (invoiceRaw.paymentMethod === 'Reduce the bill'
            ? 'Reduce the bill'
            : 'Transfer') as InvoiceData['paymentMethod'],
          dueDate: asString(invoiceRaw.dueDate),
          memo: asString(invoiceRaw.memo),
          vatPercent: asNumber(invoiceRaw.vatPercent, 11),
          taxType: (invoiceRaw.taxType === 'Tax art 4(2)'
            ? 'Tax art 4(2)'
            : 'Tax art 23') as InvoiceData['taxType'],
          taxPercent: asNumber(invoiceRaw.taxPercent, 2),
          transferTo: asString(invoiceRaw.transferTo, 'Bank Mayapada'),
          bankBranch: asString(invoiceRaw.bankBranch),
          accountNo: asString(invoiceRaw.accountNo),
          beneficiaryName: asString(invoiceRaw.beneficiaryName),
          formulaFormFileName: asString(invoiceRaw.formulaFormFileName),
          signer: asString(invoiceRaw.signer),
        }
      : undefined

  return {
    id,
    vendorCode: asString(record.vendorCode),
    vendorName: asString(record.vendorName),
    incomeType: asString(record.incomeType),
    agreementFileName: asString(record.agreementFileName),
    amount: asNumber(record.amount),
    periodStart: asString(record.periodStart),
    periodEnd: asString(record.periodEnd),
    description: asString(record.description),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    status: nextStatus,
    invoiceReceived: asBoolean(record.invoiceReceived),
    invoice,
    generatedBy: asString(record.generatedBy) || undefined,
    generatedAt: asString(record.generatedAt) || undefined,
    stampedPaperFileName: asString(record.stampedPaperFileName) || undefined,
    archivedAt: asString(record.archivedAt) || undefined,
    publishedAt: asString(record.publishedAt) || undefined,
    buyerDeadlineNotifiedAt: asString(record.buyerDeadlineNotifiedAt) || undefined,
    financeDeadlineNotifiedAt: asString(record.financeDeadlineNotifiedAt) || undefined,
  }
}

function loadRecords(): BuyerRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeRecord(item))
      .filter((record): record is BuyerRecord => record !== null)
  } catch {
    return []
  }
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { authToken } = useAuth()
  const [records, setRecords] = useState<BuyerRecord[]>(() => loadRecords())
  const [isLoading, setIsLoading] = useState(true)
  const [apiConnected, setApiConnected] = useState(false)

  const apiFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      if (init?.headers) {
        const h = init.headers
        if (h instanceof Headers) {
          h.forEach((value, key) => {
            headers[key] = value
          })
        } else if (typeof h === 'object') {
          Object.assign(headers, h as Record<string, string>)
        }
      }
      const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }
      return response.json() as Promise<T>
    },
    [authToken],
  )

  useEffect(() => {
    let mounted = true
    const loadFromApi = async () => {
      try {
        const raw = await apiFetch<unknown[]>('/api/records')
        if (!mounted) return
        setApiConnected(true)
        const data = raw.map((item) => normalizeRecord(item)).filter((r): r is BuyerRecord => r != null)
        setRecords(data)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        if (!mounted) return
        setApiConnected(false)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadFromApi()
    return () => {
      mounted = false
    }
  }, [apiFetch])

  const value = useMemo<WorkflowContextValue>(
    () => ({
      records,
      isLoading,
      apiConnected,
      createBuyerData: (input, createdBy) => {
        const create = async () => {
          if (apiConnected) {
            const created = await apiFetch<unknown>('/api/records', {
              method: 'POST',
              body: JSON.stringify({ ...input, createdBy }),
            })
            const norm = normalizeRecord(created)
            if (!norm) return
            setRecords((prev) => {
              const next = [norm, ...prev]
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
              return next
            })
            return
          }
          const next: BuyerRecord = {
            id: crypto.randomUUID(),
            ...input,
            createdBy,
            createdAt: new Date().toISOString(),
            status: 'created',
            invoiceReceived: false,
          }
          setRecords((prev) => {
            const merged = [next, ...prev]
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
            return merged
          })
        }
        void create()
      },
      setInvoiceReceived: (recordId, invoiceReceived) => {
        const update = async () => {
          if (apiConnected) {
            const updated = await apiFetch<unknown>(`/api/records/${recordId}/invoice-received`, {
              method: 'PATCH',
              body: JSON.stringify({ invoiceReceived }),
            })
            const norm = normalizeRecord(updated)
            if (!norm) return
            setRecords((prev) => {
              const next = prev.map((record) => (record.id === recordId ? norm : record))
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
              return next
            })
            return
          }
          setRecords((prev) => {
            const next = prev.map((record) =>
              record.id === recordId
                ? {
                    ...record,
                    invoiceReceived,
                    status: invoiceReceived ? ('invoice_pending' as const) : ('created' as const),
                  }
                : record,
            )
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            return next
          })
        }
        void update()
      },
      createInvoice: (recordId, invoice, financeName) => {
        const update = async () => {
          if (apiConnected) {
            const updated = await apiFetch<unknown>(`/api/records/${recordId}/invoice`, {
              method: 'POST',
              body: JSON.stringify({ invoice, financeName }),
            })
            const norm = normalizeRecord(updated)
            if (!norm) return
            setRecords((prev) => {
              const next = prev.map((record) => (record.id === recordId ? norm : record))
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
              return next
            })
            return
          }
          setRecords((prev) => {
            const next = prev.map((record) =>
              record.id === recordId
                ? {
                    ...record,
                    invoice,
                    generatedBy: financeName,
                    generatedAt: new Date().toISOString(),
                    status: 'document_generated' as const,
                  }
                : record,
            )
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            return next
          })
        }
        void update()
      },
      uploadStampedPaper: async (recordId, fileName) => {
        if (apiConnected) {
          const updated = await apiFetch<unknown>(`/api/records/${recordId}/stamped-paper`, {
            method: 'POST',
            body: JSON.stringify({ fileName }),
          })
          const norm = normalizeRecord(updated)
          if (!norm) throw new Error('Invalid record from server')
          setRecords((prev) => {
            const next = prev.map((record) => (record.id === recordId ? norm : record))
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            return next
          })
          return
        }
        setRecords((prev) => {
          const next = prev.map((record) =>
            record.id === recordId
              ? {
                  ...record,
                  stampedPaperFileName: fileName,
                  archivedAt: new Date().toISOString(),
                  status: 'archived' as const,
                }
              : record,
          )
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
      publishPaper: (recordId) => {
        const update = async () => {
          if (apiConnected) {
            const updated = await apiFetch<unknown>(`/api/records/${recordId}/publish`, {
              method: 'POST',
            })
            const norm = normalizeRecord(updated)
            if (!norm) return
            setRecords((prev) => {
              const next = prev.map((record) => (record.id === recordId ? norm : record))
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
              return next
            })
            return
          }
          setRecords((prev) => {
            const next = prev.map((record) =>
              record.id === recordId
                ? {
                    ...record,
                    publishedAt: new Date().toISOString(),
                    status: 'history' as const,
                  }
                : record,
            )
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            return next
          })
        }
        void update()
      },
    }),
    [records, isLoading, apiConnected, apiFetch],
  )

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext)
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider')
  return ctx
}
