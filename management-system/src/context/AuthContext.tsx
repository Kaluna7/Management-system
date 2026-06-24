import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthUser, AuthSource, DepartmentRole, PendingGoogleSession } from '../types/user'
import { useLanguage } from './LanguageContext'

const STORAGE_AUTH = 'management-system-auth'
const STORAGE_PENDING = 'management-system-google-pending'
const STORAGE_ONBOARDING_VERIFIED = 'management-system-onboarding-verified'
const STORAGE_ROLE_CODE = 'management-system-role-code'
const STORAGE_SIGNUP_USERNAME = 'management-system-signup-username'
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
const DEMO_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true'

function isPortalRole(role: string | null | undefined): role is DepartmentRole {
  return role === 'buyers' || role === 'finance'
}

type ApiPortalUser = {
  id: string
  name: string
  role: string
  departmentLabel?: string | null
  avatarPreset?: string | null
  hasProfileImage?: boolean
}

function authUserFromApi(
  api: ApiPortalUser,
  source: AuthSource,
  previous?: AuthUser | null,
): AuthUser {
  const hasImage = Boolean(api.hasProfileImage)
  return {
    id: api.id,
    name: api.name,
    role: api.role as DepartmentRole,
    departmentLabel: api.departmentLabel ?? previous?.departmentLabel ?? '',
    source,
    avatarPreset: api.avatarPreset ?? null,
    hasProfileImage: hasImage,
    profileImageDataUrl: hasImage ? undefined : previous?.profileImageDataUrl,
    profileImageVersion: hasImage
      ? (previous?.profileImageVersion ?? 0) + 1
      : previous?.profileImageVersion,
  }
}

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024

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
  sendEmailSignupCode: (
    email: string,
    username: string,
    password: string,
    options?: { force?: boolean },
  ) => Promise<
    { ok: true; sentTo?: string; codeUnchanged?: boolean } | { ok: false; message: string; retryAfter?: number }
  >
  verifyEmailSignup: (
    email: string,
    verificationCode: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  updateRoleVerificationEmail: (
    email: string,
  ) => Promise<
    { ok: true; sentTo?: string; email?: string } | { ok: false; message: string; retryAfter?: number }
  >
  logout: () => void
  updateProfile: (input: { displayName: string }) => Promise<{ ok: true } | { ok: false; message: string }>
  changePassword: (input: {
    currentPassword: string
    newPassword: string
  }) => Promise<{ ok: true } | { ok: false; message: string }>
  deleteAccount: (currentPassword: string) => Promise<{ ok: true } | { ok: false; message: string }>
  requestPasswordResetCode: (options?: { force?: boolean }) => Promise<
    { ok: true; sentTo?: string; codeUnchanged?: boolean } | { ok: false; message: string; retryAfter?: number }
  >
  verifyPasswordResetCode: (verificationCode: string) => Promise<{ ok: true } | { ok: false; message: string }>
  completePasswordReset: (newPassword: string) => Promise<{ ok: true } | { ok: false; message: string }>
  fetchPasswordResetCooldown: () => Promise<{ retryAfterSeconds: number }>
  updateProfileAvatar: (
    avatarPreset: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  uploadProfilePhoto: (file: File) => Promise<{ ok: true } | { ok: false; message: string }>
  removeProfilePhoto: () => Promise<{ ok: true } | { ok: false; message: string }>
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

export function isOnboardingVerifySkipped(): boolean {
  return sessionStorage.getItem(STORAGE_ONBOARDING_VERIFIED) === '1'
}

export function storePendingRoleCode(code: string) {
  sessionStorage.setItem(STORAGE_ROLE_CODE, code)
}

export function loadPendingRoleCode(): string | null {
  const raw = sessionStorage.getItem(STORAGE_ROLE_CODE)
  return raw && /^\d{6}$/.test(raw) ? raw : null
}

export function loadSignupUsername(): string | null {
  const raw = sessionStorage.getItem(STORAGE_SIGNUP_USERNAME)?.trim().toLowerCase() ?? ''
  return /^[a-z0-9_]{3,32}$/.test(raw) ? raw : null
}

export function clearOnboardingSessionExtras() {
  sessionStorage.removeItem(STORAGE_ONBOARDING_VERIFIED)
  sessionStorage.removeItem(STORAGE_ROLE_CODE)
  sessionStorage.removeItem(STORAGE_SIGNUP_USERNAME)
}

function loadAuthSession(): { user: AuthUser | null; token: string | null } {
  try {
    const raw = sessionStorage.getItem(STORAGE_AUTH)
    if (!raw) return { user: null, token: null }
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && 'user' in parsed) {
      const wrap = parsed as { user: AuthUser; token?: string | null }
      const u = wrap.user
      if (u?.id && u?.role && isPortalRole(u.role)) {
        if (u.source === 'demo' && !DEMO_LOGIN_ENABLED) {
          sessionStorage.removeItem(STORAGE_AUTH)
          return { user: null, token: null }
        }
        return { user: { ...u, source: u.source ?? 'google' }, token: wrap.token ?? null }
      }
    }
    const u = parsed as AuthUser
    if (u?.id && u?.role && isPortalRole(u.role)) {
      if ((u as AuthUser).source === 'demo') {
        if (!DEMO_LOGIN_ENABLED) {
          sessionStorage.removeItem(STORAGE_AUTH)
          return { user: null, token: null }
        }
        return { user: { ...u, source: 'demo' }, token: null }
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
        if (res.ok && data.token && data.user?.role && isPortalRole(data.user.role)) {
          sessionStorage.removeItem(STORAGE_PENDING)
          setPendingGoogle(null)
          const next = authUserFromApi(
            { ...data.user, role: data.user.role },
            'password',
          )
          persistSession(next, data.token)
          return { ok: true as const }
        }
        if (!res.ok) {
          return {
            ok: false as const,
            message:
              typeof data.message === 'string' && data.message.trim()
                ? data.message.trim()
                : t('authInvalidCredentials'),
          }
        }
      } catch {
        return { ok: false as const, message: t('authApiUnreachable') }
      }

      if (DEMO_LOGIN_ENABLED) {
        const entry = demoAccounts[key]
        if (entry && entry.password === password) {
          sessionStorage.removeItem(STORAGE_PENDING)
          setPendingGoogle(null)
          const next: AuthUser = { ...entry.user, source: 'demo' }
          sessionStorage.setItem(STORAGE_AUTH, JSON.stringify({ user: next }))
          setAuthToken(null)
          setUser(next)
          return { ok: true as const }
        }
      }

      return { ok: false as const, message: t('authInvalidCredentials') }
    },
    [persistSession, t],
  )

  useEffect(() => {
    const { token, user: cachedUser } = loadAuthSession()
    if (!token) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/session`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (res.status === 401 || res.status === 404) {
          sessionStorage.removeItem(STORAGE_AUTH)
          setUser(null)
          setAuthToken(null)
          return
        }
        if (!res.ok) return

        const data = (await res.json()) as {
          needsRole?: boolean
          user?: {
            id: string
            name: string
            email?: string
            role: string | null
            departmentLabel?: string | null
          }
        }
        if (!data.user?.id) return

        if (data.needsRole || !isPortalRole(data.user.role)) {
          const pending: PendingGoogleSession = {
            token,
            name: data.user.name,
            email: data.user.email,
          }
          sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(pending))
          sessionStorage.removeItem(STORAGE_AUTH)
          setPendingGoogle(pending)
          setUser(null)
          setAuthToken(null)
          return
        }

        const next = authUserFromApi(
          { ...data.user, role: data.user.role },
          cachedUser?.source === 'password' ? 'password' : 'google',
          cachedUser,
        )
        persistSession(next, token)
        setPendingGoogle(null)
      } catch {
        /* keep cached session when API is temporarily unreachable */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [persistSession])

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
        const next = authUserFromApi({ ...data.user, role: data.user.role }, 'google')
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
        const next = authUserFromApi({ ...data.user, role: data.user.role }, 'password')
        sessionStorage.removeItem(STORAGE_PENDING)
        persistSession(next, data.token)
        setPendingGoogle(null)
        clearOnboardingSessionExtras()
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

  const sendEmailSignupCode = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      options?: { force?: boolean },
    ): Promise<
      | { ok: true; sentTo?: string; codeUnchanged?: boolean }
      | { ok: false; message: string; retryAfter?: number }
    > => {
      const normalized = email.trim().toLowerCase()
      const usernameKey = username.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, message: t('signupEmailInvalid') }
      }
      if (!/^[a-z0-9_]{3,32}$/.test(usernameKey)) {
        return { ok: false, message: t('selectRoleUsernameInvalid') }
      }
      if (password.length < 8) {
        return { ok: false, message: t('selectRolePasswordHint') }
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/email-signup/send-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalized,
            username: usernameKey,
            password,
            force: options?.force === true,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          retryAfter?: number
          sentTo?: string
          codeUnchanged?: boolean
          username?: string
        }
        if (!res.ok) {
          const retryAfter =
            typeof data.retryAfter === 'number' && data.retryAfter > 0
              ? Math.ceil(data.retryAfter)
              : parseRetryAfterSeconds(data.message)
          let message = data.message || t('roleVerificationSendFailed')
          if (res.status === 409) {
            if (/username/i.test(message)) message = t('selectRoleUsernameTaken')
            else if (/google/i.test(message)) message = t('signupEmailUseGoogle')
            else message = t('signupEmailExists')
          }
          return {
            ok: false,
            message,
            ...(retryAfter != null ? { retryAfter } : {}),
          }
        }
        const savedUsername =
          typeof data.username === 'string' && data.username.trim()
            ? data.username.trim().toLowerCase()
            : usernameKey
        sessionStorage.setItem(STORAGE_SIGNUP_USERNAME, savedUsername)
        return {
          ok: true,
          ...(typeof data.sentTo === 'string' ? { sentTo: data.sentTo } : {}),
          ...(data.codeUnchanged === true ? { codeUnchanged: true } : {}),
        }
      } catch {
        return { ok: false, message: t('roleVerificationSendFailed') }
      }
    },
    [t],
  )

  const verifyEmailSignup = useCallback(
    async (
      email: string,
      verificationCode: string,
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const normalized = email.trim().toLowerCase()
      const code = verificationCode.replace(/\D/g, '').slice(0, 6)
      if (!/^\d{6}$/.test(code)) {
        return { ok: false, message: t('roleVerificationInvalidCode') }
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/email-signup/verify-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalized, verificationCode: code }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          token?: string
          user?: { id: string; name: string; email?: string; role: string | null }
        }
        if (!res.ok || !data.token || !data.user?.id) {
          return {
            ok: false,
            message: data.message || t('roleVerificationInvalidCode'),
          }
        }
        const pending: PendingGoogleSession = {
          token: data.token,
          name: data.user.name,
          email: data.user.email ?? normalized,
        }
        sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(pending))
        sessionStorage.setItem(STORAGE_ONBOARDING_VERIFIED, '1')
        storePendingRoleCode(code)
        sessionStorage.removeItem(STORAGE_AUTH)
        setPendingGoogle(pending)
        setUser(null)
        setAuthToken(null)
        return { ok: true }
      } catch {
        return { ok: false, message: t('roleVerificationSendFailed') }
      }
    },
    [t],
  )

  const updateRoleVerificationEmail = useCallback(
    async (
      email: string,
    ): Promise<
      { ok: true; sentTo?: string; email?: string } | { ok: false; message: string; retryAfter?: number }
    > => {
      const pending = pendingGoogle ?? loadPendingGoogleSession()
      if (!pending?.token) {
        return { ok: false, message: t('roleSaveError') }
      }
      const normalized = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, message: t('signupEmailInvalid') }
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/role/email`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pending.token}`,
          },
          body: JSON.stringify({ email: normalized }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          retryAfter?: number
          sentTo?: string
          email?: string
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
        const nextPending: PendingGoogleSession = {
          ...pending,
          email: data.email ?? normalized,
        }
        sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(nextPending))
        setPendingGoogle(nextPending)
        return {
          ok: true,
          sentTo: data.sentTo,
          email: data.email ?? normalized,
        }
      } catch {
        return { ok: false, message: t('roleVerificationSendFailed') }
      }
    },
    [pendingGoogle, t],
  )

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!authToken) throw new Error('Not authenticated')
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          ...(init?.headers as Record<string, string> | undefined),
        },
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        retryAfter?: number
        sentTo?: string
        codeUnchanged?: boolean
        user?: ApiPortalUser
      }
      return { res, data }
    },
    [authToken],
  )

  const fetchPasswordResetCooldown = useCallback(async () => {
    if (!authToken) return { retryAfterSeconds: 0 }
    try {
      const { res, data } = await authFetch('/api/auth/password-reset/send-cooldown')
      if (!res.ok) return { retryAfterSeconds: 0 }
      const retryAfterSeconds =
        typeof (data as { retryAfterSeconds?: number }).retryAfterSeconds === 'number'
          ? (data as { retryAfterSeconds: number }).retryAfterSeconds
          : 0
      return { retryAfterSeconds }
    } catch {
      return { retryAfterSeconds: 0 }
    }
  }, [authToken, authFetch])

  const requestPasswordResetCode = useCallback(
    async (
      options?: { force?: boolean },
    ): Promise<
      | { ok: true; sentTo?: string; codeUnchanged?: boolean }
      | { ok: false; message: string; retryAfter?: number }
    > => {
      if (!authToken) return { ok: false, message: t('accountPasswordChangeFailed') }
      try {
        const { res, data } = await authFetch('/api/auth/password-reset/send-code', {
          method: 'POST',
          body: JSON.stringify({ force: options?.force === true }),
        })
        if (!res.ok) {
          return {
            ok: false,
            message: data.message || t('roleVerificationSendFailed'),
            retryAfter: typeof data.retryAfter === 'number' ? data.retryAfter : undefined,
          }
        }
        return { ok: true, sentTo: data.sentTo, codeUnchanged: data.codeUnchanged }
      } catch {
        return { ok: false, message: t('roleVerificationSendFailed') }
      }
    },
    [authToken, authFetch, t],
  )

  const verifyPasswordResetCode = useCallback(
    async (verificationCode: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!authToken) return { ok: false, message: t('roleVerificationInvalidCode') }
      try {
        const { res, data } = await authFetch('/api/auth/password-reset/verify-code', {
          method: 'POST',
          body: JSON.stringify({ verificationCode }),
        })
        if (!res.ok) {
          return { ok: false, message: data.message || t('roleVerificationInvalidCode') }
        }
        return { ok: true }
      } catch {
        return { ok: false, message: t('roleVerificationSendFailed') }
      }
    },
    [authToken, authFetch, t],
  )

  const completePasswordReset = useCallback(
    async (newPassword: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!authToken || !user) return { ok: false, message: t('accountPasswordChangeFailed') }
      if (newPassword.length < 8) return { ok: false, message: t('accountPasswordTooShort') }
      try {
        const { res, data } = await authFetch('/api/auth/password-reset/confirm', {
          method: 'POST',
          body: JSON.stringify({ newPassword }),
        })
        if (!res.ok) {
          return { ok: false, message: data.message || t('accountPasswordChangeFailed') }
        }
        if (data.user?.role && isPortalRole(data.user.role)) {
          const next = authUserFromApi(data.user, user.source ?? 'google', user)
          persistSession(next, authToken)
        }
        return { ok: true }
      } catch {
        return { ok: false, message: t('accountPasswordChangeFailed') }
      }
    },
    [authToken, user, authFetch, persistSession, t],
  )

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_AUTH)
    sessionStorage.removeItem(STORAGE_PENDING)
    clearOnboardingSessionExtras()
    setUser(null)
    setAuthToken(null)
    setPendingGoogle(null)
  }, [])

  const updateProfile = useCallback(
    async (input: {
      displayName: string
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const displayName = input.displayName.trim()
      if (!displayName) {
        return { ok: false, message: t('profileSaveFailed') }
      }

      if (!user) {
        return { ok: false, message: t('profileSaveFailed') }
      }

      if (!authToken || user.source === 'demo') {
        const next: AuthUser = {
          ...user,
          name: displayName,
        }
        persistSession(next, authToken)
        return { ok: true }
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ displayName }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          user?: ApiPortalUser
        }
        if (!res.ok || !data.user?.role || !isPortalRole(data.user.role)) {
          return {
            ok: false,
            message:
              typeof data.message === 'string' && data.message.trim()
                ? data.message.trim()
                : t('profileSaveFailed'),
          }
        }
        const next = authUserFromApi(data.user, user.source ?? 'google', user)
        persistSession(next, authToken)
        return { ok: true }
      } catch {
        return { ok: false, message: t('profileSaveFailed') }
      }
    },
    [user, authToken, persistSession, t],
  )

  const changePassword = useCallback(
    async (input: {
      currentPassword: string
      newPassword: string
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!user) return { ok: false, message: t('accountPasswordChangeFailed') }
      if (input.newPassword.length < 8) {
        return { ok: false, message: t('accountPasswordTooShort') }
      }
      if (!authToken || user.source === 'demo') {
        return { ok: false, message: t('accountDemoNoSettings') }
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        if (!res.ok) {
          return {
            ok: false,
            message:
              typeof data.message === 'string' && data.message.trim()
                ? data.message.trim()
                : t('accountPasswordChangeFailed'),
          }
        }
        return { ok: true }
      } catch {
        return { ok: false, message: t('accountPasswordChangeFailed') }
      }
    },
    [user, authToken, t],
  )

  const deleteAccount = useCallback(
    async (currentPassword: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!user) return { ok: false, message: t('accountDeleteFailed') }
      if (!authToken || user.source === 'demo') {
        logout()
        return { ok: true }
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/account`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ currentPassword }),
        })
        if (res.status === 204) {
          logout()
          return { ok: true }
        }
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        return {
          ok: false,
          message:
            typeof data.message === 'string' && data.message.trim()
              ? data.message.trim()
              : t('accountDeleteFailed'),
        }
      } catch {
        return { ok: false, message: t('accountDeleteFailed') }
      }
    },
    [user, authToken, logout, t],
  )

  const updateProfileAvatar = useCallback(
    async (avatarPreset: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!user) return { ok: false, message: t('profileSaveFailed') }
      const preset = avatarPreset.padStart(2, '0')

      if (!authToken || user.source === 'demo') {
        const next: AuthUser = {
          ...user,
          avatarPreset: preset,
          hasProfileImage: false,
          profileImageDataUrl: undefined,
        }
        persistSession(next, authToken)
        return { ok: true }
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ avatarPreset: preset }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          user?: ApiPortalUser
        }
        if (!res.ok || !data.user?.role || !isPortalRole(data.user.role)) {
          return {
            ok: false,
            message:
              typeof data.message === 'string' && data.message.trim()
                ? data.message.trim()
                : t('profileSaveFailed'),
          }
        }
        const next = authUserFromApi(data.user, user.source ?? 'google', user)
        persistSession(
          { ...next, profileImageDataUrl: undefined, profileImageVersion: (user.profileImageVersion ?? 0) + 1 },
          authToken,
        )
        return { ok: true }
      } catch {
        return { ok: false, message: t('profileSaveFailed') }
      }
    },
    [user, authToken, persistSession, t],
  )

  const uploadProfilePhoto = useCallback(
    async (file: File): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!user) return { ok: false, message: t('profileUploadFailed') }
      if (!file.type.startsWith('image/')) {
        return { ok: false, message: t('profileUploadFailed') }
      }
      if (file.size > MAX_PROFILE_PHOTO_BYTES) {
        return { ok: false, message: t('profilePhotoTooLarge') }
      }

      if (!authToken || user.source === 'demo') {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('read failed'))
            reader.readAsDataURL(file)
          })
          const next: AuthUser = {
            ...user,
            avatarPreset: null,
            hasProfileImage: true,
            profileImageDataUrl: dataUrl,
            profileImageVersion: (user.profileImageVersion ?? 0) + 1,
          }
          persistSession(next, authToken)
          return { ok: true }
        } catch {
          return { ok: false, message: t('profileUploadFailed') }
        }
      }

      try {
        const body = new FormData()
        body.append('photo', file)
        const res = await fetch(`${API_BASE_URL}/api/auth/profile/photo`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body,
        })
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          user?: ApiPortalUser
        }
        if (!res.ok || !data.user?.role || !isPortalRole(data.user.role)) {
          return {
            ok: false,
            message:
              typeof data.message === 'string' && data.message.trim()
                ? data.message.trim()
                : t('profileUploadFailed'),
          }
        }
        const next = authUserFromApi(data.user, user.source ?? 'google', user)
        persistSession(
          { ...next, profileImageDataUrl: undefined, profileImageVersion: (user.profileImageVersion ?? 0) + 1 },
          authToken,
        )
        return { ok: true }
      } catch {
        return { ok: false, message: t('profileUploadFailed') }
      }
    },
    [user, authToken, persistSession, t],
  )

  const removeProfilePhoto = useCallback(async (): Promise<
    { ok: true } | { ok: false; message: string }
  > => {
    if (!user) return { ok: false, message: t('profileSaveFailed') }

    if (!authToken || user.source === 'demo') {
      const next: AuthUser = {
        ...user,
        hasProfileImage: false,
        profileImageDataUrl: undefined,
        profileImageVersion: (user.profileImageVersion ?? 0) + 1,
      }
      persistSession(next, authToken)
      return { ok: true }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/profile/photo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        user?: ApiPortalUser
      }
      if (!res.ok || !data.user?.role || !isPortalRole(data.user.role)) {
        return {
          ok: false,
          message:
            typeof data.message === 'string' && data.message.trim()
              ? data.message.trim()
              : t('profileSaveFailed'),
        }
      }
      const next = authUserFromApi(data.user, user.source ?? 'google', user)
      persistSession(
        { ...next, profileImageDataUrl: undefined, profileImageVersion: (user.profileImageVersion ?? 0) + 1 },
        authToken,
      )
      return { ok: true }
    } catch {
      return { ok: false, message: t('profileSaveFailed') }
    }
  }, [user, authToken, persistSession, t])

  const value = useMemo(
    () => ({
      user,
      authToken,
      pendingGoogle,
      login,
      loginWithGoogleCredential,
      requestRoleVerificationCode,
      verifyRoleVerificationCode,
      sendEmailSignupCode,
      verifyEmailSignup,
      updateRoleVerificationEmail,
      completeRoleSelection,
      logout,
      updateProfile,
      changePassword,
      deleteAccount,
      requestPasswordResetCode,
      verifyPasswordResetCode,
      completePasswordReset,
      fetchPasswordResetCooldown,
      updateProfileAvatar,
      uploadProfilePhoto,
      removeProfilePhoto,
    }),
    [
      user,
      authToken,
      pendingGoogle,
      login,
      loginWithGoogleCredential,
      requestRoleVerificationCode,
      verifyRoleVerificationCode,
      sendEmailSignupCode,
      verifyEmailSignup,
      updateRoleVerificationEmail,
      completeRoleSelection,
      logout,
      updateProfile,
      changePassword,
      deleteAccount,
      requestPasswordResetCode,
      verifyPasswordResetCode,
      completePasswordReset,
      fetchPasswordResetCooldown,
      updateProfileAvatar,
      uploadProfilePhoto,
      removeProfilePhoto,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
