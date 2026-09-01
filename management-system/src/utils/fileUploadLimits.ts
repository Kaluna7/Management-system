/** Match back-end multer limit (30 MB per file). */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

/** Skip in-browser PDF/image preview above this size to avoid freezing the tab. */
export const MAX_INLINE_PREVIEW_BYTES = 8 * 1024 * 1024

export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024)
export const MAX_PREVIEW_MB = MAX_INLINE_PREVIEW_BYTES / (1024 * 1024)

export function isFileTooLargeForUpload(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES
}

export function isFileTooLargeForInlinePreview(file: File): boolean {
  return file.size > MAX_INLINE_PREVIEW_BYTES
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
