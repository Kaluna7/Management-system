import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildVendorLookup,
  getVendorByCode as lookupVendor,
  getVendorNameByCode as lookupVendorName,
  type VendorOption,
} from '../data/vendors'
import { apiRequest } from '../utils/apiClient'

export function useVendors() {
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void apiRequest<VendorOption[]>('/api/vendors')
      .then((list) => {
        if (!cancelled) setVendors(list)
      })
      .catch((e) => {
        if (!cancelled) {
          setVendors([])
          setError(e instanceof Error ? e.message : 'Failed to load vendors')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const lookup = useMemo(() => buildVendorLookup(vendors), [vendors])

  const getVendorByCode = useCallback(
    (code: string) => lookupVendor(vendors, code),
    [vendors],
  )
  const getVendorNameByCode = useCallback(
    (code: string) => lookupVendorName(vendors, code),
    [vendors],
  )

  const createVendor = useCallback(async (code: string, name: string) => {
    const created = await apiRequest<VendorOption>('/api/vendors', {
      method: 'POST',
      body: JSON.stringify({ code, name }),
    })
    setVendors((prev) =>
      [...prev, created].sort((a, b) => a.code.localeCompare(b.code, undefined, { sensitivity: 'base' })),
    )
    return created
  }, [])

  const deleteVendor = useCallback(async (code: string) => {
    await apiRequest<{ ok: boolean; code: string }>(
      `/api/vendors/${encodeURIComponent(code)}`,
      { method: 'DELETE' },
    )
    setVendors((prev) => prev.filter((v) => v.code !== code))
    return code
  }, [])

  return {
    vendors,
    loading,
    error,
    lookup,
    getVendorByCode,
    getVendorNameByCode,
    createVendor,
    deleteVendor,
  }
}
