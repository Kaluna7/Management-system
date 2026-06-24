export type VendorOption = {
  code: string
  name: string
}

/** Accept legacy codes without hyphen (e.g. V001 → V-001). */
export function normalizeVendorCode(code: string): string {
  const trimmed = code.trim().toUpperCase()
  if (/^V-\d{3}$/.test(trimmed)) return trimmed
  const legacy = /^V(\d{3})$/.exec(trimmed)
  if (legacy) return `V-${legacy[1]}`
  return trimmed
}

export function buildVendorLookup(vendors: VendorOption[]): Map<string, VendorOption> {
  const map = new Map<string, VendorOption>()
  for (const vendor of vendors) {
    map.set(normalizeVendorCode(vendor.code), vendor)
  }
  return map
}

export function getVendorByCode(
  vendors: VendorOption[],
  code: string,
): VendorOption | undefined {
  return buildVendorLookup(vendors).get(normalizeVendorCode(code))
}

export function getVendorNameByCode(vendors: VendorOption[], code: string): string {
  return getVendorByCode(vendors, code)?.name ?? ''
}
