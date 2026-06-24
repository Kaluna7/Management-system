import { useEffect, useMemo, useState } from 'react'

export const RECORD_LIST_PAGE_SIZE = 10

export function useListPagination<T>(items: T[], resetKey: string) {
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(items.length / RECORD_LIST_PAGE_SIZE) || 1)

  useEffect(() => {
    setPage(0)
  }, [resetKey])

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1))
  }, [totalPages])

  const safePage = Math.min(page, totalPages - 1)

  const pageItems = useMemo(
    () =>
      items.slice(
        safePage * RECORD_LIST_PAGE_SIZE,
        safePage * RECORD_LIST_PAGE_SIZE + RECORD_LIST_PAGE_SIZE,
      ),
    [items, safePage],
  )

  return {
    pageItems,
    page: safePage,
    totalPages,
    totalItems: items.length,
    pageSize: RECORD_LIST_PAGE_SIZE,
    setPage,
    showPagination: items.length > RECORD_LIST_PAGE_SIZE,
  }
}
