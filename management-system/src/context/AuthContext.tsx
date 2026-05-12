import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthUser, AuthSource, DepartmentRole, PendingGoogleSession } from '../types/user'
import { useLanguage } from './LanguageContext'

const STORAGE_AUTH = 'management-system-auth'
const STORAGE_PENDING = 'management-system-google-pending'
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

type GoogleAuthJson = {
  message?: string
  token?: string
  needsRole?: boolean
  user?: { id: string; name: string; email?: string; role: string | null; departmentLabel: string | null }
}

/** Parse "Please wait 58s ..." when API omits retryAfter. */
function parseRetryAfterSeconds(message: string | undefined): number | undefined {
  if (!message) return undefined
  const m = /wait\s+(\d+)\s*s/i.exec(message)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function parseGoogleAuthBody(raw: string): GoogleAuthJson {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed) as GoogleAuthJson
  } catch {
    return { message: trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed }
  }
}

type AuthState = AuthUser | null

type LoginGoogleResult =
  | { ok: true; needsRole: boolean }
  | { ok: false; message: string }

type CompleteRoleResult = { ok: true } | { ok: false; message: string }

type AuthContextValue = {
  user: AuthState
  /** Bearer JWT after Google login (optional for demo password login). */
  authToken: string | null
  /** Google sign-in succeeded but role not chosen yet (stored in sessionStorage). */
  pendingGoogle: PendingGoogleSession | null
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  loginWithGoogleCredential: (credential: string) => Promise<LoginGoogleResult>
  /**
   * Backend emails a 6-digit code. Use `force: true` for Resend (new code).
   * Default / page load does not rotate an already-valid pending code.
   */
  requestRoleVerificationCode: (options?: { force?: boolean }) => Promise<
    { ok: true; sentTo?: string; codeUnchanged?: boolean } | { ok: false; message: string; retryAfter?: number }
  >
  completeRoleSelection: (
    role: DepartmentRole,
    verificationCode: string,
    username: string,
    password: string,
  ) => Promise<CompleteRoleResult>
  /** Server validates the emailed code before advancing onboarding wizard past step 1. */
  verifyRoleVerificationCode: (verificationCode: string) => Promise<{ ok: true } | { ok: false; message: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const demoAccounts: Record<
  string,
  { password: string; user: Omit<AuthUser, 'role' | 'source'> & { role: DepartmentRole } }
> = {
  buyers: {
    password: 'buyers123',
    user: {
      id: 'u-buyers-1',
      name: 'Alex Morgan',
      role: 'buyers',
      departmentLabel: 'Buyers Department',
    },
  },
  finance: {
    password: 'finance123',
    user: {
      id: 'u-finance-1',
      name: 'Jordan Lee',
      role: 'finance',
      departmentLabel: 'Finance Department',
    },
  },
}

export function loadPendingGoogleSession(): PendingGoogleSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PENDING)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingGoogleSession
    if (parsed?.token && typeof parsed.token === 'string') {
      return {
        token: parsed.token,
        name: typeof parsed.name === 'string' ? parsed.name : 'User',
        email: typeof parsed.email === 'string' ? parsed.email : undefined,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function loadAuthSession(): { user: AuthUser | null; token: string | null } {
  try {
    const raw = sessionStorage.getItem(STORAGE_AUTH)
    if (!raw) return { user: null, token: null }
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && 'user' in parsed) {
      const wrap = parsed as { user: AuthUser; token?: string | null }
      const u = wrap.user
      if (u?.id && u?.role && (u.role === 'buyers' || u.role === 'finance')) {
        return { user: { ...u, source: u.source ?? 'google' }, token: wrap.token ?? null }
      }
    }
    const u = parsed as AuthUser
    if (u?.id && u?.role && (u.role === 'buyers' || u.role === 'finance')) {
      return {
        user: { ...u, source: (u as AuthUser).source ?? 'demo' },
        token: null,
      }
    }
  } catch {
    /* ignore */
  }
  return { user: null, token: null }
}

function loadInitialState(): {
  user: AuthUser | null
  token: string | null
  pending: PendingGoogleSession | null
} {
  const { user, token } = loadAuthSession()
  const pending = loadPendingGoogleSession()
  if (user?.role) {
    if (pending) sessionStorage.removeItem(STORAGE_PENDING)
    return { user, token, pending: null }
  }
  if (pending?.token) {
    return { user: null, token: null, pending }
  }
  return { user: null, token: null, pending: null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage()
  const initial = loadInitialState()
  const [user, setUser] = useState<AuthState>(initial.user)
  const [authToken, setAuthToken] = useState<string | null>(initial.token)
  const [pendingGoogle, setPendingGoogle] = useState<PendingGoogleSession | null>(initial.pending)

  const persistSession = useCallback((nextUser: AuthUser, token: string | null) => {
    const payload =
      token != null && token !== ''
        ? { user: { ...nextUser, source: 'google' as AuthSource }, token }
        : { user: { ...nextUser, source: nextUser.source ?? ('demo' as AuthSource) } }
    sessionStorage.setItem(STORAGE_AUTH, JSON.stringify(payload))
    setAuthToken(token ?? null)
    setUser(nextUser)
  }, [])

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const key = username.trim().toLowerCase()
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: key, password }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          token?: string
          user?: {
            id: string
            name: string
            email?: string
            role: string
            departmentLabel?: string | null
          }
        }
        if (
          res.ok &&
          data.token &&
          data.user?.role &&
          (data.user.role === 'buyers' || data.user.role === 'finance')
        ) {
          sessionStorage.removeItem(STORAGE_PENDING)
          setPendingGoogle(null)
          const next: AuthUser = {
            id: data.user.id,
            name: data.user.name,
            role: data.user.role,
            departmentLabel: data.user.departmentLabel ?? '',
            source: 'password',
          }
          persistSession(next, data.token)
          return { ok: true as const }
        }
      } catch {
        /* fall through to demo */
      }

      const entry = demoAccounts[key]
      if (!entry || entry.password !== password) {
        return { ok: false as const, message: t('authInvalidCredentials') }
      }
      sessionStorage.removeItem(STORAGE_PENDING)
      setPendingGoogle(null)
      const next: AuthUser = { ...entry.user, source: 'demo' }
      sessionStorage.setItem(STORAGE_AUTH, JSON.stringify({ user: next }))
      setAuthToken(null)
      setUser(next)
      return { ok: true as const }
    },
    [persistSession, t],
  )

  const loginWithGoogleCredential = useCallback(
    async (credential: string): Promise<LoginGoogleResult> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        })
        const raw = await res.text()
        const data = parseGoogleAuthBody(raw)
        const serverMsg = typeof data.message === 'string' ? data.message.trim() : ''

        if (!res.ok) {
          return {
            ok: false,
            message:
              serverMsg ||
              `${t('googleSignInFailed')} (HTTP ${res.status}). API: ${API_BASE_URL}`,
          }
        }
        if (!data.token || !data.user?.id) {
          return {
            ok: false,
            message: serverMsg || `${t('googleSignInNoToken')} API: ${API_BASE_URL}`,
          }
        }
        if (data.needsRole || !data.user.role || (data.user.role !== 'buyers' && data.user.role !== 'finance')) {
          const pending: PendingGoogleSession = {
            token: data.token,
            name: data.user.name,
            email: data.user.email,
          }
          sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(pending))
          sessionStorage.removeItem(STORAGE_AUTH)
          setPendingGoogle(pending)
          setUser(null)
          setAuthToken(null)
          return { ok: true, needsRole: true }
        }
        const next: AuthUser = {
          id: data.user.id,
          name: data.user.name,
          role: data.user.role,
          departmentLabel: data.user.departmentLabel ?? '',
          source: 'google',
        }
        sessionStorage.removeItem(STORAGE_PENDING)
        persistSession(next, data.token)
        setPendingGoogle(null)
        return { ok: true, needsRole: false }
      } catch (e) {
        const hint =
          e instanceof TypeError && String(e.message).toLowerCase().includes('fetch')
            ? t('googleSignInCouldNotReach')
            : e instanceof Error
              ? e.message
              : String(e)
        return {
          ok: false,
          message: `${hint} — ${API_BASE_URL}`,
        }
      }
    },
    [persistSession, t],
  )

  const requestRoleVerificationCode = useCallback(async (
    options?: { force?: boolean },
  ): Promise<
    | { ok: true; sentTo?: string; codeUnchanged?: boolean }
    | { ok: false; message: string; retryAfter?: number }
  > => {
    const pending = pendingGoogle ?? loadPendingGoogleSession()
    if (!pending?.token) {
      return { ok: false, message: t('roleSaveError') }
    }
    const force = options?.force === true
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/role/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pending.token}`,
        },
        body: JSON.stringify({ force, ...(force ? { resend: true } : {}) }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        retryAfter?: number
        sentTo?: string
        codeUnchanged?: boolean
      }
      if (!res.ok) {
        const retryAfter =
          typeof data.retryAfter === 'number' && data.retryAfter > 0
            ? Math.ceil(data.retryAfter)
            : parseRetryAfterSeconds(data.message)
        return {
          ok: false,
          message: data.message || t('roleVerificationSendFailed'),
          ...(retryAfter != null ? { retryAfter } : {}),
        }
      }
      return {
        ok: true,
        ...(typeof data.sentTo === 'string' ? { sentTo: data.sentTo } : {}),
        ...(data.codeUnchanged === true ? { codeUnchanged: true } : {}),
      }
    } catch {
      return { ok: false, message: t('roleVerificationSendFailed') }
    }
  }, [pendingGoogle, t])

  const completeRoleSelection = useCallback(
    async (
      role: DepartmentRole,
      verificationCode: string,
      username: string,
      password: string,
    ): Promise<CompleteRoleResult> => {
      const pending = pendingGoogle ?? loadPendingGoogleSession()
      if (!pending?.token) {
        return { ok: false, message: t('roleSaveError') }
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/role`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pending.token}`,
          },
          body: JSON.stringify({ role, verificationCode, username, password }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          token?: string
          user?: {
            id: string
            name: string
            role: string
            departmentLabel?: string | null
          }
        }
        if (!res.ok || !data.token || !data.user?.role) {
          if (res.status === 409) {
            return { ok: false, message: t('selectRoleUsernameTaken') }
          }
          return { ok: false, message: data.message || t('roleSaveError') }
        }
        if (data.user.role !== 'buyers' && data.user.role !== 'finance') {
          return { ok: false, message: t('roleSaveError') }
        }
        const next: AuthUser = {
          id: data.user.id,
          name: data.user.name,
          role: data.user.role,
          departmentLabel: data.user.departmentLabel ?? '',
          source: 'password',
        }
        sessionStorage.removeItem(STORAGE_PENDING)
        persistSession(next, data.token)
        setPendingGoogle(null)
        return { ok: true }
      } catch {
        return { ok: false, message: t('roleSaveError') }
      }
    },
    [persistSession, t],
  )

  const verifyRoleVerificationCode = useCallback(
    async (
      verificationCode: string,
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const pending = pendingGoogle ?? loadPendingGoogleSession()
      if (!pending?.token) {
        return { ok: false, message: t('roleSaveError') }
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/role/verify-code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pending.token}`,
          },
          body: JSON.stringify({ verificationCode }),
        })
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        if (!res.ok) {
          return {
            ok: false,
            message: data.message || t('roleVerificationInvalidCode'),
          }
        }
        return { ok: true }
      } catch {
        return { ok: false, message: t('roleVerificationSendFailed') }
      }
    },
    [pendingGoogle, t],
  )

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_AUTH)
    sessionStorage.removeItem(STORAGE_PENDING)
    setUser(null)
    setAuthToken(null)
    setPendingGoogle(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      authToken,
      pendingGoogle,
      login,
      loginWithGoogleCredential,
      requestRoleVerificationCode,
      verifyRoleVerificationCode,
      completeRoleSelection,
      logout,
    }),
    [
      user,
      authToken,
      pendingGoogle,
      login,
      loginWithGoogleCredential,
      requestRoleVerificationCode,
      verifyRoleVerificationCode,
      completeRoleSelection,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
