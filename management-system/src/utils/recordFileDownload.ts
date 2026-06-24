import type { BuyerRecord } from '../types/workflow'
import { agreementFileNamesFromRecord } from './agreementFiles'
import { formulaFormFileNamesFromInvoice } from './formulaFormFiles'

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export type ArchiveFileKind = 'stamped-paper' | 'formula-form' | 'agreement'

function filePathForKind(recordId: string, kind: ArchiveFileKind, fileIndex = 0) {
  if ((kind === 'formula-form' || kind === 'agreement') && fileIndex > 0) {
    return `${API_BASE_URL}/api/records/${encodeURIComponent(recordId)}/files/${kind}/${fileIndex}`
  }
  return `${API_BASE_URL}/api/records/${encodeURIComponent(recordId)}/files/${kind}`
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i.exec(header)
  if (!m?.[1]) return null
  try {
    return decodeURIComponent(m[1].trim())
  } catch {
    return m[1].trim()
  }
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function safeFileSegment(name: string, fallback: string) {
  const trimmed = name.trim()
  if (!trimmed) return fallback
  return trimmed.replace(/[/\\?%*:|"<>]/g, '_')
}

export function defaultDownloadFileName(
  record: BuyerRecord,
  kind: ArchiveFileKind,
  fileIndex = 0,
): string {
  const base = safeFileSegment(record.vendorCode || record.id, 'record')
  if (kind === 'stamped-paper') {
    return safeFileSegment(record.stampedPaperFileName ?? '', `${base}_stamped_paper.pdf`) || `${base}_stamped_paper.pdf`
  }
  if (kind === 'formula-form') {
    const names = formulaFormFileNamesFromInvoice(record.invoice)
    const n = names[fileIndex] ?? names[0]
    const suffix = names.length > 1 ? `_additional_${fileIndex + 1}` : '_formula_form'
    return safeFileSegment(n ?? '', `${base}${suffix}.pdf`) || `${base}${suffix}.pdf`
  }
  const agreementNames = agreementFileNamesFromRecord(record)
  const an = agreementNames[fileIndex] ?? agreementNames[0]
  const agreementSuffix = agreementNames.length > 1 ? `_agreement_${fileIndex + 1}` : '_agreement'
  return safeFileSegment(an ?? '', `${base}${agreementSuffix}.pdf`) || `${base}${agreementSuffix}.pdf`
}

/**
 * GET binary from API (Bearer). Backend convention: `/api/records/:id/files/:kind`
 * where `kind` is `stamped-paper` | `formula-form` | `agreement`.
 */
export async function downloadRecordFileFromApi(opts: {
  recordId: string
  kind: ArchiveFileKind
  authToken: string | null
  fallbackFileName: string
  fileIndex?: number
}): Promise<void> {
  const { recordId, kind, authToken, fallbackFileName, fileIndex = 0 } = opts
  const headers: Record<string, string> = {}
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  const res = await fetch(filePathForKind(recordId, kind, fileIndex), { method: 'GET', headers })
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`)
  }
  const cd = res.headers.get('Content-Disposition')
  const fromHeader = parseFilenameFromContentDisposition(cd)
  const blob = await res.blob()
  const name = fromHeader || fallbackFileName
  triggerBlobDownload(blob, name)
}

/** Offline / no server file: downloadable text summary of a published record. */
export function downloadPublishedRecordTextSummary(record: BuyerRecord, locale: 'en' | 'id') {
  const lines =
    locale === 'id'
      ? [
          'RINGKASAN DATA TERBIT (OFFLINE / TANPA SERVER FILE)',
          `ID: ${record.id}`,
          `Vendor: ${record.vendorName} (${record.vendorCode})`,
          `Jumlah: ${record.amount}`,
          `Diarsipkan: ${record.archivedAt ?? '-'}`,
          `Diterbitkan: ${record.publishedAt ?? '-'}`,
          `Berkas kertas bermaterai: ${record.stampedPaperFileName ?? '-'}`,
          `Berkas perjanjian: ${agreementFileNamesFromRecord(record).join(', ') || '-'}`,
          `Additional document: ${formulaFormFileNamesFromInvoice(record.invoice).join(', ') || '-'}`,
          '',
          'Unggah ulang dari API untuk unduh berkas biner asli.',
        ]
      : [
          'PUBLISHED RECORD SUMMARY (OFFLINE / NO SERVER FILE)',
          `ID: ${record.id}`,
          `Vendor: ${record.vendorName} (${record.vendorCode})`,
          `Amount: ${record.amount}`,
          `Archived: ${record.archivedAt ?? '-'}`,
          `Published: ${record.publishedAt ?? '-'}`,
          `Stamped paper file: ${record.stampedPaperFileName ?? '-'}`,
          `Agreement file: ${agreementFileNamesFromRecord(record).join(', ') || '-'}`,
          `Additional document: ${formulaFormFileNamesFromInvoice(record.invoice).join(', ') || '-'}`,
          '',
          'Connect to the API to download original binary files.',
        ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const base = safeFileSegment(record.vendorCode || record.id, 'record')
  triggerBlobDownload(blob, `${base}_published_summary.txt`)
}
