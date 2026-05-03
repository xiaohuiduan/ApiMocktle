import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '@/api-client'

export interface SessionUser {
  id: string
  username: string
}

interface RememberSession {
  sessionId: string
  expiresAt: number
}

interface AuthContextData {
  user: SessionUser | null
  sessionId: string
  loading: boolean
  login: (username: string, password: string, opts?: { rememberPassword?: boolean, rememberDays?: number }) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextData>({
  user: null,
  sessionId: '',
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  changePassword: async () => {},
})

const SESSION_KEY = 'session_id'
const REMEMBER_SESSION_KEY = 'remember_session'
const SAVED_CREDENTIALS_KEY = 'saved_credentials'

function getStoredSessionId(): string {
  try { return sessionStorage.getItem(SESSION_KEY) ?? '' } catch { return '' }
}

function storeSessionId(id: string) {
  try { sessionStorage.setItem(SESSION_KEY, id) } catch { /* ignore */ }
}

function clearSessionId() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

function getRememberedSession(): RememberSession | null {
  try {
    const raw = localStorage.getItem(REMEMBER_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RememberSession
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(REMEMBER_SESSION_KEY)
      return null
    }
    return parsed
  } catch { return null }
}

function saveRememberedSession(sessionId: string, days: number) {
  try {
    const expiresAt = days === -1 ? Number.MAX_SAFE_INTEGER : Date.now() + days * 86400000
    localStorage.setItem(REMEMBER_SESSION_KEY, JSON.stringify({ sessionId, expiresAt }))
  } catch { /* ignore */ }
}

function clearRememberedSession() {
  try { localStorage.removeItem(REMEMBER_SESSION_KEY) } catch { /* ignore */ }
}

export function getSavedCredentials(): { username: string, password: string } | null {
  try {
    const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveCredentials(username: string, password: string) {
  try { localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify({ username, password })) } catch { /* ignore */ }
}

function clearSavedCredentials() {
  try { localStorage.removeItem(SAVED_CREDENTIALS_KEY) } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [sessionId, setSessionId] = useState(getStoredSessionId)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    let sid = getStoredSessionId()

    // sessionStorage 无 session → 检查 localStorage 记住登录
    if (!sid) {
      const remembered = getRememberedSession()
      if (remembered) {
        sid = remembered.sessionId
        storeSessionId(sid)
        setSessionId(sid)
      }
    }

    if (!sid) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const u = await api<SessionUser | null>('get_current_user', { sessionId: sid })
      if (u) {
        setUser(u)
        setSessionId(sid)
      } else {
        setUser(null)
        clearSessionId()
        clearRememberedSession()
        setSessionId('')
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  const login = useCallback(async (
    username: string,
    password: string,
    opts?: { rememberPassword?: boolean, rememberDays?: number },
  ) => {
    const result = await api<{ user: SessionUser; session_id: string }>('login', {
      payload: { username, password },
    })
    setUser(result.user)
    setSessionId(result.session_id)
    storeSessionId(result.session_id)

    if (opts?.rememberPassword) {
      saveCredentials(username, password)
    } else {
      clearSavedCredentials()
    }

    if (opts?.rememberDays !== undefined && opts.rememberDays !== 0) {
      saveRememberedSession(result.session_id, opts.rememberDays)
    } else {
      clearRememberedSession()
    }
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    const result = await api<{ user: SessionUser; session_id: string }>('register', {
      payload: { username, password },
    })
    setUser(result.user)
    setSessionId(result.session_id)
    storeSessionId(result.session_id)
  }, [])

  const logout = useCallback(async () => {
    const sid = getStoredSessionId()
    if (sid) {
      await api('logout', { sessionId: sid }).catch(() => {})
    }
    setUser(null)
    setSessionId('')
    clearSessionId()
    clearRememberedSession()
    clearSavedCredentials()
  }, [])

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await api('change_password', {
      sessionId: getStoredSessionId(),
      payload: { oldPassword, newPassword },
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, sessionId, loading, login, register, logout, refreshUser, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
