import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { VendorOption } from '../data/vendors'

export type VendorSearchSelectLabels = {
  loading: string
  empty: string
  searchPlaceholder: string
  noResults: string
  /** e.g. "736 vendors" — use {count} placeholder */
  listCount: string
}

export type VendorSearchSelectProps = {
  vendors: VendorOption[]
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  loading?: boolean
  /** Hidden input for native form submit */
  name?: string
  inputClassName?: string
  labels: VendorSearchSelectLabels
}

function formatOption(v: VendorOption) {
  return `${v.code} — ${v.name}`
}

function matchesQuery(v: VendorOption, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return v.code.toLowerCase().includes(needle) || v.name.toLowerCase().includes(needle)
}

export function VendorSearchSelect({
  vendors,
  value,
  onChange,
  disabled = false,
  loading = false,
  name,
  inputClassName = 'w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100',
  labels,
}: VendorSearchSelectProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => vendors.find((v) => v.code === value), [vendors, value])

  const filtered = useMemo(() => {
    if (loading || vendors.length === 0) return []
    return vendors.filter((v) => matchesQuery(v, query))
  }, [vendors, query, loading])

  const inputValue = open ? query : selected ? formatOption(selected) : query
  const listCountLabel = labels.listCount.replace('{count}', String(filtered.length))

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const isDisabled = disabled || loading || vendors.length === 0

  return (
    <div ref={rootRef} className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        disabled={isDisabled}
        placeholder={
          loading ? labels.loading : vendors.length === 0 ? labels.empty : labels.searchPlaceholder
        }
        value={inputValue}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) onChange('')
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        className={inputClassName}
      />
      {open && !isDisabled ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <p className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            {listCountLabel}
          </p>
          <ul id={listId} role="listbox" className="max-h-80 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">{labels.noResults}</li>
            ) : (
              filtered.map((v) => (
                <li key={v.code} role="option" aria-selected={v.code === value}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                      v.code === value ? 'bg-slate-50 font-medium' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(v.code)
                      setQuery('')
                      setOpen(false)
                    }}
                  >
                    {formatOption(v)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
