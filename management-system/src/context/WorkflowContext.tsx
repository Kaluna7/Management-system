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
import { useRealtime } from './RealtimeContext'
import type { BuyerInput, BuyerRecord, InvoiceData } from '../types/workflow'
import { apiRequest } from '../utils/apiClient'
import { normalizeMemoTemplate } from '../utils/invoiceMemoDisplay'
import { taxPercentForType } from '../utils/invoiceTax'

const STORAGE_KEY = 'management-system-workflow'
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
  createBuyerData: (
    input: BuyerInput,
    createdBy: string,
    createdByRole: 'buyers' | 'finance',
    agreementUpload: { newFiles: File[] },
  ) => Promise<void>
  updateBuyerData: (
    recordId: string,
    input: BuyerInput,
    agreementUpload?: { newFiles: File[]; keepSlots: number[] } | null,
  ) => Promise<void>
  setInvoiceReceived: (recordId: string, value: boolean) => void
  createInvoice: (
    recordId: string,
    invoice: InvoiceData,
    financeName: string,
    formulaUpload?: { newFiles: File[]; keepSlots: number[] },
  ) => Promise<void>
  uploadStampedPaper: (recordId: string, file: File) => Promise<void>
  publishPaper: (recordId: string) => Promise<void>
  requestBuyerEditPermission: (recordId: string, buyerName: string) => Promise<void>
  resolveBuyerEditRequest: (
    recordId: string,
    decision: 'approve' | 'deny',
    financeName: string,
  ) => Promise<void>
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
          memoTemplate: normalizeMemoTemplate(asString(invoiceRaw.memoTemplate)),
          memoOptionId: asString(invoiceRaw.memoOptionId),
          vatPercent: asNumber(invoiceRaw.vatPercent, 11),
          taxType: (invoiceRaw.taxType === 'Tax art 4(2)'
            ? 'Tax art 4(2)'
            : 'Tax art 23') as InvoiceData['taxType'],
          taxPercent: asNumber(
            invoiceRaw.taxPercent,
            taxPercentForType(
              invoiceRaw.taxType === 'Tax art 4(2)' ? 'Tax art 4(2)' : 'Tax art 23',
            ),
          ),
          bankName: asString(invoiceRaw.bankName ?? invoiceRaw.transferTo, 'Bank Mayapada'),
          transferTo: asString(invoiceRaw.bankName ?? invoiceRaw.transferTo, 'Bank Mayapada'),
          bankBranch: asString(invoiceRaw.bankBranch),
          accountNo: asString(invoiceRaw.accountNo),
          beneficiaryName: asString(invoiceRaw.beneficiaryName),
          formulaFormFileName: asString(invoiceRaw.formulaFormFileName),
          formulaFormFileNames: (() => {
            const fromArray = invoiceRaw.formulaFormFileNames
            if (Array.isArray(fromArray) && fromArray.length > 0) {
              return fromArray.map((n) => asString(n)).filter(Boolean)
            }
            const single = asString(invoiceRaw.formulaFormFileName)
            return single ? [single] : undefined
          })(),
          signer: asString(invoiceRaw.signer),
          signerTitle: asString(invoiceRaw.signerTitle) || undefined,
          pphEmail: asString(invoiceRaw.pphEmail) || undefined,
        }
      : undefined

  return {
    id,
    vendorCode: asString(record.vendorCode),
    vendorName: asString(record.vendorName),
    incomeType: asString(record.incomeType),
    agreementFileName: asString(record.agreementFileName),
    agreementFileNames: (() => {
      const fromArray = record.agreementFileNames
      if (Array.isArray(fromArray) && fromArray.length > 0) {
        return fromArray.map((n) => asString(n)).filter(Boolean)
      }
      const single = asString(record.agreementFileName)
      return single ? [single] : undefined
    })(),
    amount: asNumber(record.amount),
    periodStart: asString(record.periodStart),
    periodEnd: asString(record.periodEnd),
    description: asString(record.description),
    createdBy: asString(record.createdBy),
    createdByAdmin: record.createdByAdmin === true,
    createdByRole: asString(record.createdByRole) || undefined,
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
    buyerEditRequestStatus:
      record.buyerEditRequestStatus === 'pending' ||
      record.buyerEditRequestStatus === 'denied' ||
      record.buyerEditRequestStatus === 'approved'
        ? record.buyerEditRequestStatus
        : undefined,
    buyerEditRequestedAt: asString(record.buyerEditRequestedAt) || undefined,
    buyerEditRequestedBy: asString(record.buyerEditRequestedBy) || undefined,
    buyerEditResolvedAt: asString(record.buyerEditResolvedAt) || undefined,
    buyerEditResolvedBy: asString(record.buyerEditResolvedBy) || undefined,
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

function upsertRecordInList(prev: BuyerRecord[], norm: BuyerRecord): BuyerRecord[] {
  const idx = prev.findIndex((r) => r.id === norm.id)
  if (idx >= 0) {
    const next = [...prev]
    next[idx] = norm
    return next
  }
  return [norm, ...prev]
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { authToken } = useAuth()
  const { socket } = useRealtime()
  const [records, setRecords] = useState<BuyerRecord[]>(() => loadRecords())
  const [isLoading, setIsLoading] = useState(true)
  const [apiConnected, setApiConnected] = useState(false)

  const fetchJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      return apiRequest<T>(path, { ...init, authToken })
    },
    [authToken],
  )

  useEffect(() => {
    let mounted = true
    const loadFromApi = async () => {
      try {
        const raw = await fetchJson<unknown[]>('/api/records')
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
  }, [fetchJson])

  useEffect(() => {
    if (!socket) return

    const applyRemoteRecord = (raw: unknown) => {
      const norm = normalizeRecord(raw)
      if (!norm) return
      setRecords((prev) => {
        const next = upsertRecordInList(prev, norm)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
    }

    socket.on('record:created', applyRemoteRecord)
    socket.on('record:updated', applyRemoteRecord)
    return () => {
      socket.off('record:created', applyRemoteRecord)
      socket.off('record:updated', applyRemoteRecord)
    }
  }, [socket])

  const value = useMemo<WorkflowContextValue>(
    () => ({
      records,
      isLoading,
      apiConnected,
      createBuyerData: async (input, createdBy, createdByRole, agreementUpload) => {
        if (!apiConnected) {
          throw new Error('API offline — start the back-end to save files to storage.')
        }
        const fd = new FormData()
        fd.append('vendorCode', input.vendorCode)
        fd.append('vendorName', input.vendorName)
        fd.append('incomeType', input.incomeType)
        const names = input.agreementFileNames?.length
          ? input.agreementFileNames
          : input.agreementFileName
            ? [input.agreementFileName]
            : agreementUpload.newFiles.map((f) => f.name)
        fd.append('agreementFileName', names[0] ?? '')
        fd.append('amount', String(input.amount))
        fd.append('periodStart', input.periodStart)
        fd.append('periodEnd', input.periodEnd)
        fd.append('description', input.description)
        fd.append('createdBy', createdBy)
        fd.append('createdByRole', createdByRole)
        for (const file of agreementUpload.newFiles) {
          fd.append('agreementFiles', file, file.name)
        }
        const created = await fetchJson<unknown>('/api/records', { method: 'POST', body: fd })
        const norm = normalizeRecord(created)
        if (!norm) throw new Error('Invalid record from server')
        setRecords((prev) => {
          const next = upsertRecordInList(prev, norm)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
      updateBuyerData: async (recordId, input, agreementUpload) => {
        if (!apiConnected) {
          throw new Error('API offline — start the back-end to save changes.')
        }
        const fd = new FormData()
        fd.append('vendorCode', input.vendorCode)
        fd.append('vendorName', input.vendorName)
        fd.append('incomeType', input.incomeType)
        fd.append('amount', String(input.amount))
        fd.append('periodStart', input.periodStart)
        fd.append('periodEnd', input.periodEnd)
        fd.append('description', input.description)
        if (agreementUpload) {
          fd.append('agreementKeepSlots', JSON.stringify(agreementUpload.keepSlots))
          for (const file of agreementUpload.newFiles) {
            fd.append('agreementFiles', file, file.name)
          }
        }
        const updated = await fetchJson<unknown>(`/api/records/${recordId}`, {
          method: 'PATCH',
          body: fd,
        })
        const norm = normalizeRecord(updated)
        if (!norm) throw new Error('Invalid record from server')
        setRecords((prev) => {
          const next = prev.map((record) => (record.id === recordId ? norm : record))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
      setInvoiceReceived: (recordId, invoiceReceived) => {
        const update = async () => {
          if (apiConnected) {
            const updated = await fetchJson<unknown>(`/api/records/${recordId}/invoice-received`, {
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
      createInvoice: async (recordId, invoice, financeName, formulaUpload) => {
        if (!apiConnected) {
          throw new Error('API offline — cannot upload additional document.')
        }
        const fd = new FormData()
        fd.append('invoice', JSON.stringify(invoice))
        fd.append('financeName', financeName)
        if (formulaUpload) {
          fd.append('formulaFormKeepSlots', JSON.stringify(formulaUpload.keepSlots))
          for (const file of formulaUpload.newFiles) {
            fd.append('formulaFormFiles', file, file.name)
          }
        }
        const updated = await fetchJson<unknown>(`/api/records/${recordId}/invoice`, {
          method: 'POST',
          body: fd,
        })
        const norm = normalizeRecord(updated)
        if (!norm) throw new Error('Invalid record from server')
        setRecords((prev) => {
          const next = prev.map((record) => (record.id === recordId ? norm : record))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
      uploadStampedPaper: async (recordId, file) => {
        if (!apiConnected) {
          throw new Error('API offline — cannot upload stamped paper.')
        }
        const fd = new FormData()
        fd.append('file', file, file.name)
        const updated = await fetchJson<unknown>(`/api/records/${recordId}/stamped-paper`, {
          method: 'POST',
          body: fd,
        })
        const norm = normalizeRecord(updated)
        if (!norm) throw new Error('Invalid record from server')
        setRecords((prev) => {
          const next = prev.map((record) => (record.id === recordId ? norm : record))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
      publishPaper: async (recordId) => {
        if (apiConnected) {
          const updated = await fetchJson<unknown>(`/api/records/${recordId}/publish`, {
            method: 'POST',
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
          const now = new Date().toISOString()
          const next = prev.map((record) =>
            record.id === recordId
              ? {
                  ...record,
                  publishedAt: now,
                  archivedAt: record.archivedAt ?? now,
                  status: 'history' as const,
                }
              : record,
          )
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
      requestBuyerEditPermission: async (recordId, buyerName) => {
        if (!apiConnected) {
          throw new Error('API offline — cannot request edit permission.')
        }
        const updated = await fetchJson<unknown>(`/api/records/${recordId}/buyer-edit-request`, {
          method: 'POST',
          body: JSON.stringify({ buyerName }),
        })
        const norm = normalizeRecord(updated)
        if (!norm) throw new Error('Invalid record from server')
        setRecords((prev) => {
          const next = prev.map((record) => (record.id === recordId ? norm : record))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
      resolveBuyerEditRequest: async (recordId, decision, financeName) => {
        if (!apiConnected) {
          throw new Error('API offline — cannot resolve edit request.')
        }
        const updated = await fetchJson<unknown>(`/api/records/${recordId}/buyer-edit-request`, {
          method: 'PATCH',
          body: JSON.stringify({ decision, financeName }),
        })
        const norm = normalizeRecord(updated)
        if (!norm) throw new Error('Invalid record from server')
        setRecords((prev) => {
          const next = prev.map((record) => (record.id === recordId ? norm : record))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          return next
        })
      },
    }),
    [records, isLoading, apiConnected, fetchJson],
  )

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext)
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider')
  return ctx
}
