'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [showMenu, setShowMenu] = useState(false)

  const handleLogout = () => {
    logout()
    setShowMenu(false)
    router.push('/')
  }

  const isActive = (path: string) => pathname === path

  return (
    <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-xl">🗺️</span>
        </div>
        <span className="font-bold text-xl text-slate-900">Spatix</span>
      </Link>

      <div className="flex items-center gap-6">
        <Link
          href="/maps"
          className={`text-sm font-medium transition-colors ${isActive('/maps') ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Maps
        </Link>
        <Link
          href="/developers"
          className={`text-sm font-medium transition-colors ${isActive('/developers') ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Developers
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
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900 truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/dashboard"
                    onClick={() => setShowMenu(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard?tab=maps"
                    onClick={() => setShowMenu(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    My Maps
                  </Link>
                  <Link
                    href="/developers"
                    onClick={() => setShowMenu(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    API Docs
                  </Link>
                  <hr className="my-2 border-slate-100" />
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Log out
                  </button>
                </div>
              </>
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
