'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.spatix.io'

interface UsageStats {
  maps_created: number
  maps_limit: number
  api_calls: number
  api_limit: number
  storage_mb: number
  storage_limit_mb: number
}

interface Plan {
  name: string
  price: number
  interval: string
}

const PLANS = {
  free: { name: 'Free', price: 0, interval: 'forever', maps: 10, api: 100, storage: 50 },
  pro: { name: 'Pro', price: 19, interval: 'month', maps: 500, api: 10000, storage: 5000 },
  team: { name: 'Team', price: 49, interval: 'month', maps: -1, api: 100000, storage: 50000 },
}

export default function AccountPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ email: string; plan?: string } | null>(null)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const email = localStorage.getItem('spatix_email')
    const token = localStorage.getItem('spatix_token')
    
    if (!email || !token) {
      router.push('/login?redirect=/account')
      return
    }
    
    setUser({ email, plan: 'free' }) // Default to free
    fetchUsage(token)
  }, [router])

  const fetchUsage = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/maps/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setUsage({
          maps_created: data.total_maps || 0,
          maps_limit: PLANS.free.maps,
          api_calls: data.api_calls || 0,
          api_limit: PLANS.free.api,
          storage_mb: data.storage_mb || 0,
          storage_limit_mb: PLANS.free.storage,
        })
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err)
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

  const getUsagePercent = (used: number, limit: number) => {
    if (limit === -1) return 0 // Unlimited
    return Math.min(100, Math.round((used / limit) * 100))
  }

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500'
    if (percent >= 70) return 'bg-yellow-500'
    return 'bg-brand-500'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const currentPlan = PLANS[user?.plan as keyof typeof PLANS] || PLANS.free

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">My Account</h1>
        
        <div className="grid gap-6">
          {/* Plan & Usage Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Current Plan</h2>
                  <p className="text-slate-500 text-sm">
                    {currentPlan.name} • {currentPlan.price === 0 ? 'Free forever' : `$${currentPlan.price}/${currentPlan.interval}`}
                  </p>
                </div>
                {currentPlan.name === 'Free' && (
                  <Link
                    href="/maps"
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
                  >
                    Upgrade
                  </Link>
                )}
              </div>
            </div>
            
            {/* Usage Stats */}
            <div className="p-6 space-y-6">
              <h3 className="font-medium text-slate-900">This Month's Usage</h3>
              
              {/* Maps Created */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">Maps Created</span>
                  <span className="font-medium text-slate-900">
                    {usage?.maps_created || 0} / {currentPlan.maps === -1 ? '∞' : currentPlan.maps}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getUsageColor(getUsagePercent(usage?.maps_created || 0, currentPlan.maps))}`}
                    style={{ width: `${getUsagePercent(usage?.maps_created || 0, currentPlan.maps)}%` }}
                  />
                </div>
              </div>
              
              {/* API Calls */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">API Calls</span>
                  <span className="font-medium text-slate-900">
                    {usage?.api_calls || 0} / {currentPlan.api.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getUsageColor(getUsagePercent(usage?.api_calls || 0, currentPlan.api))}`}
                    style={{ width: `${getUsagePercent(usage?.api_calls || 0, currentPlan.api)}%` }}
                  />
                </div>
              </div>
              
              {/* Storage */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">Storage</span>
                  <span className="font-medium text-slate-900">
                    {usage?.storage_mb || 0} MB / {currentPlan.storage >= 1000 ? `${currentPlan.storage / 1000} GB` : `${currentPlan.storage} MB`}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getUsageColor(getUsagePercent(usage?.storage_mb || 0, currentPlan.storage))}`}
                    style={{ width: `${getUsagePercent(usage?.storage_mb || 0, currentPlan.storage)}%` }}
                  />
                </div>
              </div>

              {getUsagePercent(usage?.maps_created || 0, currentPlan.maps) >= 80 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
                  <p className="text-yellow-800">
                    <strong>Running low on maps!</strong> Upgrade to Pro for 500 maps/month.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Profile Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile</h2>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center text-white text-2xl font-medium">
                {user?.email[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-slate-900">{user?.email}</p>
                <p className="text-sm text-slate-500">Member since {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
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
                  <p className="text-sm text-slate-500">{usage?.maps_created || 0} maps</p>
                </div>
              </Link>
              <Link
                href="/developers"
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <span className="text-2xl">🔑</span>
                <div>
                  <p className="font-medium text-slate-900">API Keys</p>
                  <p className="text-sm text-slate-500">Developer access</p>
                </div>
              </Link>
              <Link
                href="/maps"
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <span className="text-2xl">💳</span>
                <div>
                  <p className="font-medium text-slate-900">Billing</p>
                  <p className="text-sm text-slate-500">Plans & payment</p>
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
