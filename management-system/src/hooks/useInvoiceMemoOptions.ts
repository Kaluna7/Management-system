import { useCallback, useEffect, useState } from 'react'
import type { InvoiceMemoOption } from '../types/invoiceMemo'
import { apiRequest } from '../utils/apiClient'

export type InvoiceOptionsRole = 'buyers' | 'finance'

export function useInvoiceMemoOptions(forRole: InvoiceOptionsRole = 'finance') {
  const [options, setOptions] = useState<InvoiceMemoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return apiRequest<InvoiceMemoOption[]>(
      `/api/invoice-memo-options?forRole=${encodeURIComponent(forRole)}`,
    )
      .then((rows) =>
        setOptions(
          rows.map((r) => ({
            id: r.id,
            label: r.label,
            template: r.template === 'rebate_bonus_tier' ? 'rebate_bonus_tier' : 'custom',
          })),
        ),
      )
      .catch((e) => {
        setOptions([])
        setError(e instanceof Error ? e.message : 'Failed to load memo options')
      })
      .finally(() => setLoading(false))
  }, [forRole])

  useEffect(() => {
    void reload()
  }, [reload])

  const addOption = useCallback(async (label: string) => {
    const created = await apiRequest<InvoiceMemoOption>('/api/invoice-memo-options', {
      method: 'POST',
      body: JSON.stringify({ label, forRole }),
    })
    const normalized: InvoiceMemoOption = {
      id: created.id,
      label: created.label,
      template: created.template === 'rebate_bonus_tier' ? 'rebate_bonus_tier' : 'custom',
    }
    setOptions((prev) => {
      if (prev.some((o) => o.id === normalized.id)) return prev
      return [...prev, normalized].sort((a, b) => {
        if (a.template === 'rebate_bonus_tier') return -1
        if (b.template === 'rebate_bonus_tier') return 1
        return a.label.localeCompare(b.label)
      })
    })
    return normalized
  }, [forRole])

  return { options, loading, error, reload, addOption }
}
