import type { BuyerRecord } from '../types/workflow'

export const AGREEMENT_MAX = 5

export function agreementFileNamesFromRecord(
  record?: Pick<BuyerRecord, 'agreementFileName' | 'agreementFileNames'> | {
    agreementFileName?: string
    agreementFileNames?: string[]
  } | null,
): string[] {
  if (!record) return []
  const names = record.agreementFileNames
  if (Array.isArray(names) && names.length > 0) {
    return names.map((n) => String(n).trim()).filter(Boolean)
  }
  const single = record.agreementFileName?.trim()
  return single ? [single] : []
}

export function agreementFileNamesForSave(
  existingNames: string[],
  keptOriginalIndices: number[],
  newFileNames: string[],
): string[] {
  const kept = keptOriginalIndices.map((i) => existingNames[i]?.trim() ?? '').filter(Boolean)
  return [...kept, ...newFileNames.map((n) => n.trim()).filter(Boolean)]
}
