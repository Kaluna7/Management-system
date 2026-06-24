export type DepartmentRole = 'buyers' | 'finance'

export type AuthSource = 'demo' | 'google' | 'password'

export interface AuthUser {
  id: string
  name: string
  role: DepartmentRole
  departmentLabel: string
  source?: AuthSource
  /** Preset avatar id "01"–"15". */
  avatarPreset?: string | null
  /** Custom photo stored on server (demo uses profileImageDataUrl). */
  hasProfileImage?: boolean
  /** Demo-only: data URL for uploaded photo. */
  profileImageDataUrl?: string
  /** Bumps when custom photo changes (cache bust for blob fetch). */
  profileImageVersion?: number
}

export type PendingGoogleSession = {
  token: string
  name: string
  email?: string
}
