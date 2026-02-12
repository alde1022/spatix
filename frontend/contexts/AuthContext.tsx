'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { auth as firebaseAuth } from '@/lib/firebase'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.spatix.io'

interface AuthUser {
  email: string
  token: string
}

interface AuthContextType {
  user: AuthUser | null
  isLoggedIn: boolean
  login: (email: string, token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggedIn: false,
  login: () => {},
  logout: () => {},
})

/** Decode JWT payload without verifying signature. */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload
  } catch {
    return null
  }
}

/** Returns true if the token expires within the given buffer (seconds). */
function isTokenExpired(token: string, bufferSeconds = 300): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return true
  return Date.now() / 1000 > payload.exp - bufferSeconds
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const refreshing = useRef(false)

  /** Exchange a Firebase ID token for a fresh backend JWT. */
  const refreshBackendToken = useCallback(async (): Promise<AuthUser | null> => {
    if (refreshing.current) return null
    refreshing.current = true
    try {
      const fbUser = firebaseAuth.currentUser
      if (!fbUser) return null

      const firebaseToken = await fbUser.getIdToken()
      const res = await fetch(`${API_URL}/auth/firebase/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: firebaseToken }),
      })

      if (!res.ok) return null

      const data = await res.json()
      const email = data.user.email
      const token = data.token

      localStorage.setItem('spatix_email', email)
      localStorage.setItem('spatix_token', token)
      localStorage.setItem('spatix_session', token)

      const authUser = { email, token }
      setUser(authUser)
      return authUser
    } catch {
      return null
    } finally {
      refreshing.current = false
    }
  }, [])

  // On mount: validate stored token, refresh if expired
  useEffect(() => {
    const email = localStorage.getItem('spatix_email')
    const token = localStorage.getItem('spatix_token')

    if (email && token && !isTokenExpired(token)) {
      setUser({ email, token })
      return
    }

    // Token missing or expired — wait briefly for Firebase to initialize,
    // then try to refresh using the Firebase session.
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        const refreshed = await refreshBackendToken()
        if (!refreshed && email && token) {
          // Firebase exchange failed but we still have some token — clear stale state
          localStorage.removeItem('spatix_email')
          localStorage.removeItem('spatix_token')
          localStorage.removeItem('spatix_session')
          setUser(null)
        }
      } else if (email || token) {
        // No Firebase session — clear stale localStorage
        localStorage.removeItem('spatix_email')
        localStorage.removeItem('spatix_token')
        localStorage.removeItem('spatix_session')
        setUser(null)
      }
      unsubscribe()
    })

    return () => unsubscribe()
  }, [refreshBackendToken])

  // Periodically check token expiry and refresh proactively
  useEffect(() => {
    const interval = setInterval(async () => {
      const token = localStorage.getItem('spatix_token')
      if (token && isTokenExpired(token)) {
        await refreshBackendToken()
      }
    }, 5 * 60 * 1000) // every 5 minutes

    return () => clearInterval(interval)
  }, [refreshBackendToken])

  const login = useCallback((email: string, token: string) => {
    localStorage.setItem('spatix_email', email)
    localStorage.setItem('spatix_token', token)
    localStorage.setItem('spatix_session', token)
    setUser({ email, token })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('spatix_email')
    localStorage.removeItem('spatix_token')
    localStorage.removeItem('spatix_session')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
