import { useEffect, useState } from 'react'

function sanitizePercentTyping(raw: string): string {
  let s = raw.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
  }
  return s
}

export function parsePercentValue(raw: string, fallback = 0): number {
  const s = sanitizePercentTyping(raw)
  if (s === '' || s === '.') return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

type PercentInputFieldProps = {
  label: string
  name?: string
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  readOnly?: boolean
}

export function PercentInputField({
  label,
  name,
  value,
  defaultValue = 0,
  onChange,
  readOnly = false,
}: PercentInputFieldProps) {
  const isControlled = value !== undefined
  const [text, setText] = useState(() => String(isControlled ? value : defaultValue))

  useEffect(() => {
    if (isControlled) setText(String(value))
  }, [isControlled, value])

  const numeric = parsePercentValue(text, isControlled ? (value ?? 0) : defaultValue)

  function commit(nextText: string) {
    setText(nextText)
    onChange?.(parsePercentValue(nextText, defaultValue))
  }

  return (
    <label className="space-y-1 text-sm">
      <span>{label}</span>
      <div
        className={`flex w-full items-stretch overflow-hidden rounded-lg border border-slate-300 ${
          readOnly ? 'bg-slate-50' : 'bg-white focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200'
        }`}
      >
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          readOnly={readOnly}
          aria-readonly={readOnly}
          value={text}
          onChange={(e) => !readOnly && commit(sanitizePercentTyping(e.target.value))}
          className={`min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm outline-none ${
            readOnly ? 'cursor-default text-slate-700' : ''
          }`}
        />
        <span className="flex shrink-0 items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
          %
        </span>
      </div>
      {name ? <input type="hidden" name={name} value={numeric} /> : null}
    </label>
  )
}
