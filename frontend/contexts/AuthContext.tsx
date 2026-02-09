'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    const email = localStorage.getItem('spatix_email')
    const token = localStorage.getItem('spatix_token')
    if (email && token) {
      setUser({ email, token })
    }
  }, [])

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
