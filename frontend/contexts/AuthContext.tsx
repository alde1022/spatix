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
  /** Whether the initial auth check (localStorage + Firebase) has completed. */
  isInitialized: boolean
  login: (email: string, token: string) => void
  logout: () => void
  /** Attempt to refresh the backend JWT using the current Firebase session. Returns the new AuthUser or null. */
  refresh: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggedIn: false,
  isInitialized: false,
  login: () => {},
  logout: () => {},
  refresh: async () => null,
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

/** Wait for Firebase auth to report its initial state (resolves with the current user or null). */
function waitForFirebaseUser(): Promise<import('firebase/auth').User | null> {
  // If Firebase already has a user, return immediately
  if (firebaseAuth.currentUser) return Promise.resolve(firebaseAuth.currentUser)
  return new Promise((resolve) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const refreshPromise = useRef<Promise<AuthUser | null> | null>(null)

  /** Exchange a Firebase ID token for a fresh backend JWT. Concurrent calls share the same in-flight request. */
  const refreshBackendToken = useCallback(async (): Promise<AuthUser | null> => {
    // If a refresh is already in progress, wait for it instead of starting a new one
    if (refreshPromise.current) return refreshPromise.current

    const doRefresh = async (): Promise<AuthUser | null> => {
      try {
        // Strategy 1: Try backend /auth/refresh with the existing token (no Firebase needed)
        const existingToken = localStorage.getItem('spatix_token')
        if (existingToken) {
          try {
            const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${existingToken}` },
            })
            if (refreshRes.ok) {
              const data = await refreshRes.json()
              const email = data.user.email
              const token = data.token
              localStorage.setItem('spatix_email', email)
              localStorage.setItem('spatix_token', token)
              localStorage.setItem('spatix_session', token)
              const authUser = { email, token }
              setUser(authUser)
              return authUser
            }
          } catch { /* backend refresh failed, try Firebase */ }
        }

        // Strategy 2: Wait for Firebase to initialize, then exchange Firebase token
        const fbUser = await waitForFirebaseUser()
        if (!fbUser) return null

        const firebaseToken = await fbUser.getIdToken(true)
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
        refreshPromise.current = null
      }
    }

    refreshPromise.current = doRefresh()
    return refreshPromise.current
  }, [])

  // On mount: validate stored token, refresh if expired
  useEffect(() => {
    const email = localStorage.getItem('spatix_email')
    const token = localStorage.getItem('spatix_token')

    if (email && token && !isTokenExpired(token)) {
      setUser({ email, token })
      setIsInitialized(true)
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
      setIsInitialized(true)
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
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isInitialized, login, logout, refresh: refreshBackendToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
