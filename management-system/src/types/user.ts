export type DepartmentRole = 'buyers' | 'finance'

export type AuthSource = 'demo' | 'google' | 'password'

export interface AuthUser {
  id: string
  name: string
  role: DepartmentRole
  departmentLabel: string
  source?: AuthSource
}

export type PendingGoogleSession = {
  token: string
  name: string
  email?: string
}
