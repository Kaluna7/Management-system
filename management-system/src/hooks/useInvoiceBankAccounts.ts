import { useCallback, useEffect, useState } from 'react'
import type { InvoiceBankAccount, InvoiceBankDetails } from '../types/invoiceBank'
import { apiRequest } from '../utils/apiClient'
import type { InvoiceOptionsRole } from './useInvoiceMemoOptions'

export function useInvoiceBankAccounts(forRole: InvoiceOptionsRole = 'finance') {
  const [accounts, setAccounts] = useState<InvoiceBankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return apiRequest<InvoiceBankAccount[]>(
      `/api/invoice-bank-accounts?forRole=${encodeURIComponent(forRole)}`,
    )
      .then(setAccounts)
      .catch((e) => {
        setAccounts([])
        setError(e instanceof Error ? e.message : 'Failed to load bank accounts')
      })
      .finally(() => setLoading(false))
  }, [forRole])

  useEffect(() => {
    void reload()
  }, [reload])

  const addAccount = useCallback(
    async (details: InvoiceBankDetails) => {
      const created = await apiRequest<InvoiceBankAccount>('/api/invoice-bank-accounts', {
        method: 'POST',
        body: JSON.stringify({ ...details, forRole }),
      })
      setAccounts((prev) => {
        if (prev.some((a) => a.id === created.id)) return prev
        return [...prev, created].sort((a, b) =>
          a.beneficiaryName.localeCompare(b.beneficiaryName),
        )
      })
      return created
    },
    [forRole],
  )

  const removeAccount = useCallback(async (id: string) => {
    await apiRequest<void>(`/api/invoice-bank-accounts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    setAccounts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return { accounts, loading, error, reload, addAccount, removeAccount }
}
