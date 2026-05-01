import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '@/api-client'

export interface SessionUser {
  id: string
  username: string
}

interface AuthContextData {
  user: SessionUser | null
  sessionId: string
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextData>({
  user: null,
  sessionId: '',
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
})

function getStoredSessionId(): string {
  try {
    return sessionStorage.getItem('session_id') ?? ''
  } catch {
    return ''
  }
}

function storeSessionId(id: string) {
  try {
    sessionStorage.setItem('session_id', id)
  } catch {
    // ignore
  }
}

function clearSessionId() {
  try {
    sessionStorage.removeItem('session_id')
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [sessionId, setSessionId] = useState(getStoredSessionId)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const sid = getStoredSessionId()
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

  const login = useCallback(async (username: string, password: string) => {
    const result = await api<{ user: SessionUser; session_id: string }>('login', {
      payload: { username, password },
    })
    setUser(result.user)
    setSessionId(result.session_id)
    storeSessionId(result.session_id)
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
  }, [])

  return (
    <AuthContext.Provider value={{ user, sessionId, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
