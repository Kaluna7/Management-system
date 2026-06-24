import { useCallback, useEffect, useState } from 'react'
import type { InvoiceSigner } from '../types/invoiceSigner'
import { apiRequest } from '../utils/apiClient'
import type { InvoiceOptionsRole } from './useInvoiceMemoOptions'

export function useInvoiceSigners(forRole: InvoiceOptionsRole = 'finance') {
  const [signers, setSigners] = useState<InvoiceSigner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return apiRequest<InvoiceSigner[]>(
      `/api/invoice-signers?forRole=${encodeURIComponent(forRole)}`,
    )
      .then(setSigners)
      .catch((e) => {
        setSigners([])
        setError(e instanceof Error ? e.message : 'Failed to load signers')
      })
      .finally(() => setLoading(false))
  }, [forRole])

  useEffect(() => {
    void reload()
  }, [reload])

  const addSigner = useCallback(
    async (title: string, name: string) => {
      const created = await apiRequest<InvoiceSigner>('/api/invoice-signers', {
        method: 'POST',
        body: JSON.stringify({ title, name, forRole }),
      })
      setSigners((prev) => {
        if (prev.some((s) => s.id === created.id)) return prev
        return [...prev, created].sort((a, b) =>
          a.title === b.title
            ? a.name.localeCompare(b.name)
            : a.title.localeCompare(b.title),
        )
      })
      return created
    },
    [forRole],
  )

  const removeSigner = useCallback(async (id: string) => {
    await apiRequest<void>(`/api/invoice-signers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    setSigners((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const removeSignersByTitle = useCallback(
    async (title: string) => {
      await apiRequest<void>(
        `/api/invoice-signers/by-title?title=${encodeURIComponent(title)}&forRole=${encodeURIComponent(forRole)}`,
        { method: 'DELETE' },
      )
      setSigners((prev) => prev.filter((s) => s.title !== title))
    },
    [forRole],
  )

  return { signers, loading, error, reload, addSigner, removeSigner, removeSignersByTitle }
}
