'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.spatix.io'

export default function AccountPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ email: string } | null>(null)
  const [mapCount, setMapCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Redirect to the new unified dashboard
    router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    const email = localStorage.getItem('spatix_email')
    const token = localStorage.getItem('spatix_token')

    if (!email || !token) {
      router.push('/login?redirect=/dashboard')
      return
    }

    setUser({ email })
    fetchStats(token)
  }, [router])

  const fetchStats = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/maps/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMapCount(data.total_maps || 0)
      }
    } catch (err) {
      // Stats fetch failed, not critical
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('spatix_email')
    localStorage.removeItem('spatix_token')
    localStorage.removeItem('spatix_session')
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">My Account</h1>
        
        <div className="grid gap-6">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile</h2>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center text-white text-2xl font-medium">
                {user?.email[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-slate-900">{user?.email}</p>
                <p className="text-sm text-slate-500">Spatix is free to use</p>
              </div>
            </div>
          </div>
          
          {/* Quick Links */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Links</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link
                href="/account/maps"
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <span className="text-2xl">🗺️</span>
                <div>
                  <p className="font-medium text-slate-900">My Maps</p>
                  <p className="text-sm text-slate-500">{mapCount} maps</p>
                </div>
              </Link>
              <Link
                href="/developers"
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <span className="text-2xl">📚</span>
                <div>
                  <p className="font-medium text-slate-900">API Docs</p>
                  <p className="text-sm text-slate-500">Developer reference</p>
                </div>
              </Link>
              <Link
                href="/maps"
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <span className="text-2xl">✨</span>
                <div>
                  <p className="font-medium text-slate-900">Create Map</p>
                  <p className="text-sm text-slate-500">Start mapping</p>
                </div>
              </Link>
            </div>
          </div>
          
          {/* Session */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Session</h2>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
            >
              Log out
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
