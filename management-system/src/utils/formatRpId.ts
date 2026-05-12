/** Rupiah display (`Rp. 1.212.121`). */
export function formatRpId(value: number) {
  const rounded = Math.round(Number.isFinite(value) ? value : 0)
  const body = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded)
  return `Rp. ${body}`
}
