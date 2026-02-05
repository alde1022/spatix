'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Navbar() {
  const router = useRouter()
  const [user, setUser] = useState<{ email: string } | null>(null)
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    // Check for logged in user
    const email = localStorage.getItem('spatix_email')
    const token = localStorage.getItem('spatix_token')
    if (email && token) {
      setUser({ email })
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('spatix_email')
    localStorage.removeItem('spatix_token')
    localStorage.removeItem('spatix_session')
    setUser(null)
    setShowMenu(false)
    router.push('/')
  }

  return (
    <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-xl">🗺️</span>
        </div>
        <span className="font-bold text-xl text-slate-900">Spatix</span>
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/developers" className="text-slate-600 hover:text-slate-900 text-sm font-medium">
          Developers
        </Link>
        <Link href="/pricing" className="text-slate-600 hover:text-slate-900 text-sm font-medium">
          Pricing
        </Link>
        
        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                {user.email[0].toUpperCase()}
              </div>
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900 truncate">{user.email}</p>
                </div>
                <Link
                  href="/account"
                  onClick={() => setShowMenu(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  My Account
                </Link>
                <Link
                  href="/account/maps"
                  onClick={() => setShowMenu(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  My Maps
                </Link>
                <hr className="my-2 border-slate-100" />
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-slate-600 hover:text-slate-900 text-sm font-medium">
              Log in
            </Link>
            <Link href="/signup" className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
