const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export function profilePhotoApiUrl(): string {
  return `${API_BASE_URL}/api/auth/profile/photo`
}

export async function fetchProfilePhotoBlob(authToken: string): Promise<Blob | null> {
  const res = await fetch(profilePhotoApiUrl(), {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load profile photo')
  return res.blob()
}
