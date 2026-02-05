'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.spatix.io'

interface MapItem {
  id: string
  title: string
  created_at: string
  view_count?: number
}

export default function MyMapsPage() {
  const router = useRouter()
  const [maps, setMaps] = useState<MapItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('spatix_token')
    if (!token) {
      router.push('/login?redirect=/account/maps')
      return
    }

    fetchMaps(token)
  }, [router])

  const fetchMaps = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/maps/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (res.status === 401) {
        router.push('/login?redirect=/account/maps')
        return
      }
      
      if (!res.ok) throw new Error('Failed to load maps')
      
      const data = await res.json()
      setMaps(data.maps || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load maps')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (mapId: string) => {
    if (!confirm('Delete this map? This cannot be undone.')) return
    
    const token = localStorage.getItem('spatix_token')
    try {
      const res = await fetch(`${API_URL}/api/map/${mapId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setMaps(maps.filter(m => m.id !== mapId))
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">My Maps</h1>
          <Link
            href="/"
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
          >
            + Create Map
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        ) : maps.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <span className="text-5xl mb-4 block">🗺️</span>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">No maps yet</h2>
            <p className="text-slate-500 mb-6">Upload a file to create your first map</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium"
            >
              Create your first map
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {maps.map((map) => (
              <div
                key={map.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between hover:border-brand-300 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-brand-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">🗺️</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">{map.title || 'Untitled Map'}</h3>
                    <p className="text-sm text-slate-500">
                      Created {new Date(map.created_at).toLocaleDateString()}
                      {map.view_count !== undefined && ` • ${map.view_count} views`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`${API_URL.replace('api.', '')}/m/${map.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  >
                    View
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/m/${map.id}`)}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => handleDelete(map.id)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
