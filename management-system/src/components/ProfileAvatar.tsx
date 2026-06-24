import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import type { AuthUser } from '../types/user'
import { CartoonPresetAvatar } from './CartoonPresetAvatar'
import { fetchProfilePhotoBlob } from '../utils/profilePhotoApi'

type Size = 'sm' | 'md' | 'lg'

const sizeClass: Record<Size, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
}

type Props = {
  user: AuthUser | null
  authToken: string | null
  fallbackInitial: string
  size?: Size
  className?: string
  title?: string
}

export function ProfileAvatar({
  user,
  authToken,
  fallbackInitial,
  size = 'md',
  className = '',
  title,
}: Props) {
  const { user: authUser } = useAuth()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const fallbackBgClass = authUser?.role === 'finance' ? 'bg-emerald-600' : 'bg-violet-600'

  const customDataUrl = user?.profileImageDataUrl
  const presetId = user?.avatarPreset
  const showServerPhoto = Boolean(user?.hasProfileImage && authToken && !customDataUrl)

  useEffect(() => {
    if (!showServerPhoto || !authToken) {
      setBlobUrl(null)
      return
    }
    let revoked: string | null = null
    let cancelled = false
    void (async () => {
      try {
        const blob = await fetchProfilePhotoBlob(authToken)
        if (cancelled || !blob) return
        revoked = URL.createObjectURL(blob)
        setBlobUrl(revoked)
      } catch {
        if (!cancelled) setBlobUrl(null)
      }
    })()
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [showServerPhoto, authToken, user?.profileImageVersion])

  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white shadow-sm ${sizeClass[size]} ${className}`

  if (customDataUrl) {
    return (
      <img
        src={customDataUrl}
        alt=""
        title={title}
        className={`${base} object-cover ring-2 ring-white/20`}
      />
    )
  }

  if (blobUrl) {
    return (
      <img
        src={blobUrl}
        alt=""
        title={title}
        className={`${base} object-cover ring-2 ring-white/20`}
      />
    )
  }

  if (presetId) {
    return (
      <CartoonPresetAvatar
        presetId={presetId}
        size={size}
        className={className}
        title={title}
      />
    )
  }

  return (
    <span title={title} className={`${base} ${fallbackBgClass}`}>
      {fallbackInitial}
    </span>
  )
}
