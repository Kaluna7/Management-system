import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuyerRecord } from '../types/workflow'

const STORAGE_KEY = 'finly-publish-celebrated'

function loadCelebrated(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x) => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function saveCelebrated(ids: Set<string>) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

export type PublishSuccessState = {
  recordId: string
  vendorName: string
}

export function recordAwaitingPublish(record: Pick<BuyerRecord, 'status'>) {
  return record.status !== 'history'
}

export function useRecordPublishCelebration(records: BuyerRecord[]) {
  const [success, setSuccess] = useState<PublishSuccessState | null>(null)
  const prevStatusRef = useRef<Record<string, BuyerRecord['status']>>({})
  const celebratedRef = useRef<Set<string>>(loadCelebrated())

  const celebrate = useCallback((recordId: string, vendorName: string) => {
    if (celebratedRef.current.has(recordId)) return
    celebratedRef.current.add(recordId)
    saveCelebrated(celebratedRef.current)
    setSuccess({ recordId, vendorName })
  }, [])

  const dismissSuccess = useCallback(() => setSuccess(null), [])

  useEffect(() => {
    for (const record of records) {
      const prev = prevStatusRef.current[record.id]
      if (
        record.status === 'history' &&
        prev &&
        prev !== 'history' &&
        !celebratedRef.current.has(record.id)
      ) {
        celebrate(record.id, record.vendorName)
      }
      prevStatusRef.current[record.id] = record.status
    }
  }, [records, celebrate])

  return { success, dismissSuccess, celebrate, recordAwaitingPublish }
}
