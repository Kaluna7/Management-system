const BELOW_20 = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const

const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'] as const

function chunkToWords(n: number): string {
  if (n === 0) return ''
  if (n < 20) return BELOW_20[n]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const r = n % 10
    return r === 0 ? TENS[t] : `${TENS[t]} ${BELOW_20[r]}`
  }
  const h = Math.floor(n / 100)
  const rest = n % 100
  const head = `${BELOW_20[h]} hundred`
  if (rest === 0) return head
  return `${head} ${chunkToWords(rest)}`
}

function numberToWordsEn(n: number): string {
  if (!Number.isFinite(n) || n < 0) return 'zero'
  if (n === 0) return 'zero'

  let remaining = Math.floor(n)
  const parts: string[] = []
  let scale = 0

  while (remaining > 0) {
    const chunk = remaining % 1000
    if (chunk > 0) {
      const words = chunkToWords(chunk)
      const scaleWord = SCALES[scale]
      parts.unshift(scaleWord ? `${words} ${scaleWord}` : words)
    }
    remaining = Math.floor(remaining / 1000)
    scale += 1
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** English amount in words for invoice footer (sample: "... rupiah"). */
export function amountInWordsEnRupiah(amount: number): string {
  const words = numberToWordsEn(Math.round(Number.isFinite(amount) ? amount : 0))
  return `${words} rupiah`
}
