import type { BuyerRecord } from '../types/workflow'

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export type ArchiveFileKind = 'stamped-paper' | 'formula-form' | 'agreement'

function filePathForKind(recordId: string, kind: ArchiveFileKind) {
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

export function defaultDownloadFileName(record: BuyerRecord, kind: ArchiveFileKind): string {
  const base = safeFileSegment(record.vendorCode || record.id, 'record')
  if (kind === 'stamped-paper') {
    return safeFileSegment(record.stampedPaperFileName ?? '', `${base}_stamped_paper.pdf`) || `${base}_stamped_paper.pdf`
  }
  if (kind === 'formula-form') {
    const n = record.invoice?.formulaFormFileName
    return safeFileSegment(n ?? '', `${base}_formula_form.pdf`) || `${base}_formula_form.pdf`
  }
  return safeFileSegment(record.agreementFileName ?? '', `${base}_agreement.pdf`) || `${base}_agreement.pdf`
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
}): Promise<void> {
  const { recordId, kind, authToken, fallbackFileName } = opts
  const headers: Record<string, string> = {}
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  const res = await fetch(filePathForKind(recordId, kind), { method: 'GET', headers })
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
          `Berkas perjanjian: ${record.agreementFileName ?? '-'}`,
          `Formula form: ${record.invoice?.formulaFormFileName ?? '-'}`,
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
          `Agreement file: ${record.agreementFileName ?? '-'}`,
          `Formula form: ${record.invoice?.formulaFormFileName ?? '-'}`,
          '',
          'Connect to the API to download original binary files.',
        ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const base = safeFileSegment(record.vendorCode || record.id, 'record')
  triggerBlobDownload(blob, `${base}_published_summary.txt`)
}
