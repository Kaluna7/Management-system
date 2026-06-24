import { useMemo } from 'react'
import { createCartoonAvatarDataUri } from '../utils/cartoonAvatar'

type Size = 'sm' | 'md' | 'lg' | 'picker'

const sizePx: Record<Size, number> = {
  sm: 32,
  md: 40,
  lg: 64,
  picker: 44,
}

type Props = {
  presetId: string | null | undefined
  size?: Size
  className?: string
  title?: string
}

export function CartoonPresetAvatar({
  presetId,
  size = 'md',
  className = '',
  title,
}: Props) {
  const px = sizePx[size]
  const src = useMemo(
    () => createCartoonAvatarDataUri(presetId, px),
    [presetId, px],
  )

  if (!src) return null

  const round =
    size === 'picker'
      ? 'h-11 w-11 rounded-full'
      : size === 'sm'
        ? 'h-8 w-8 rounded-full'
        : size === 'lg'
          ? 'h-16 w-16 rounded-full'
          : 'h-10 w-10 rounded-full'

  return (
    <img
      src={src}
      alt=""
      title={title}
      width={px}
      height={px}
      className={`inline-block shrink-0 object-cover shadow-sm ring-1 ring-slate-200/80 ${round} ${className}`}
    />
  )
}
