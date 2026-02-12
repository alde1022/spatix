"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/contexts/AuthContext"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"

type Tab = "maps" | "datasets" | "activity" | "settings"

interface MapItem {
  id: string
  title: string
  views: number
  public: boolean
  created_at: string
  url: string
}

interface DatasetItem {
  id: string
  title: string
  category: string
  feature_count: number
  query_count: number
  used_in_maps: number
  created_at: string
}

interface ContributionItem {
  action: string
  resource_type: string | null
  resource_id: string | null
  points_awarded: number
  created_at: string
}

interface PointsSummary {
  total_points: number
  datasets_uploaded: number
  maps_created: number
  data_queries_served: number
  total_map_views: number
}

const ACTION_LABELS: Record<string, string> = {
  map_create: "Created a map",
  map_create_with_layers: "Created a map with datasets",
  dataset_upload: "Uploaded a dataset",
  dataset_query: "Dataset queried",
  dataset_used_in_map: "Dataset used in a map",
  map_views_milestone_100: "Map reached 100 views",
  map_views_milestone_1000: "Map reached 1,000 views",
}
// Inner component that uses useSearchParams
function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: authUser, isLoggedIn, isInitialized, logout, refresh } = useAuth()
  const initialTab = (searchParams.get("tab") as Tab) || "maps"
  const [tab, setTab] = useState<Tab>(initialTab)
  const [loading, setLoading] = useState(true)

  // Maps state
  const [maps, setMaps] = useState<MapItem[]>([])
  const [mapsLoading, setMapsLoading] = useState(false)
  const [mapStats, setMapStats] = useState({ total_maps: 0, total_views: 0 })

  // Datasets state
  const [datasets, setDatasets] = useState<DatasetItem[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)

  // Activity state
  const [contributions, setContributions] = useState<ContributionItem[]>([])
  const [points, setPoints] = useState<PointsSummary>({ total_points: 0, datasets_uploaded: 0, maps_created: 0, data_queries_served: 0, total_map_views: 0 })
  const [activityLoading, setActivityLoading] = useState(false)

  // Track whether we've already triggered a logout redirect to prevent cascading 401 handlers
  const logoutTriggered = useRef(false)

  // Redirect to login if not authenticated (only after AuthContext has finished initializing)
  useEffect(() => {
    if (!isInitialized) return // still loading — don't redirect yet
    if (authUser) {
      setLoading(false)
    } else {
      router.push("/login?redirect=/dashboard")
    }
  }, [isInitialized, authUser, router])

  /**
   * Fetch wrapper that ensures a valid token before requests, retries with refresh on 401.
   * Uses a ref so effects don't re-fire when the auth user/token changes.
   */
  const authFetchRef = useRef<(url: string, opts?: RequestInit) => Promise<Response>>(null!)
  authFetchRef.current = async (url: string, opts?: RequestInit) => {
    // Pre-check: if token is expired client-side, refresh BEFORE making the request
    let token = authUser?.token || null
    if (token) {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          if (payload?.exp && Date.now() / 1000 > payload.exp - 60) {
            // Token expires within 60 seconds or is already expired — refresh first
            const refreshed = await refresh()
            if (refreshed) {
              token = refreshed.token
            } else if (!logoutTriggered.current) {
              logoutTriggered.current = true
              logout()
              router.push("/login?redirect=/dashboard")
              return new Response(null, { status: 401 })
            } else {
              return new Response(null, { status: 401 })
            }
          }
        }
      } catch { /* proceed with existing token */ }
    }

    const headers: Record<string, string> = { ...opts?.headers as Record<string, string> }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(url, { ...opts, headers })

    if (res.status === 401) {
      // Prevent cascading logout from multiple concurrent 401 responses
      if (logoutTriggered.current) return res

      // Token rejected — try refreshing via Firebase before giving up
      const refreshed = await refresh()
      if (refreshed) {
        const retryRes = await fetch(url, { ...opts, headers: { ...opts?.headers as Record<string, string>, Authorization: `Bearer ${refreshed.token}` } })
        if (retryRes.status !== 401) return retryRes
      }

      // Only logout/redirect once even if multiple requests fail
      if (!logoutTriggered.current) {
        logoutTriggered.current = true
        logout()
        router.push("/login?redirect=/dashboard")
      }
    }
    return res
  }

  // Stable wrapper that delegates to the ref — safe to use in effect deps
  const authFetch = useCallback((url: string, opts?: RequestInit) => {
    return authFetchRef.current(url, opts)
  }, [])

  // Once user is confirmed, eagerly load points summary for the stats row
  useEffect(() => {
    if (!authUser) return
    authFetch(`${API_URL}/api/contributions/me`)
      .then(r => r.ok ? r.json() : { points: null })
      .then(data => {
        if (data?.points) setPoints(data.points)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.email])

  // Fetch maps
  useEffect(() => {
    if (!authUser || tab !== "maps") return
    setMapsLoading(true)
    Promise.all([
      authFetch(`${API_URL}/api/maps/me`).then(r => r.ok ? r.json() : { maps: [] }),
      authFetch(`${API_URL}/api/maps/stats`).then(r => r.ok ? r.json() : { total_maps: 0, total_views: 0 }),
    ]).then(([mapsData, stats]) => {
      setMaps(mapsData.maps || [])
      setMapStats(stats)
    }).finally(() => setMapsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.email, tab])

  // Fetch datasets
  useEffect(() => {
    if (!authUser || tab !== "datasets") return
    setDatasetsLoading(true)
    authFetch(`${API_URL}/api/datasets/me`)
      .then(r => r.ok ? r.json() : { datasets: [] })
      .then(data => setDatasets(data.datasets || []))
      .finally(() => setDatasetsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.email, tab])

  // Fetch activity
  useEffect(() => {
    if (!authUser || tab !== "activity") return
    setActivityLoading(true)
    authFetch(`${API_URL}/api/contributions/me`)
      .then(r => r.ok ? r.json() : { contributions: [], points: {} })
      .then(data => {
        setContributions(data.contributions || [])
        setPoints(data.points || { total_points: 0, datasets_uploaded: 0, maps_created: 0, data_queries_served: 0, total_map_views: 0 })
      })
      .finally(() => setActivityLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.email, tab])

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  const handleDeleteMap = async (mapId: string) => {
    if (!confirm("Delete this map? This cannot be undone.")) return
    const res = await authFetch(`${API_URL}/api/map/${mapId}`, { method: "DELETE" })
    if (res.ok) setMaps(prev => prev.filter(m => m.id !== mapId))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "maps", label: "Maps" },
    { id: "datasets", label: "Datasets" },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-600 rounded-full flex items-center justify-center text-white text-xl font-medium">
              {authUser?.email[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
              <p className="text-sm text-slate-500">{authUser?.email}</p>
            </div>
          </div>
          <Link href="/maps" className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">
            Create Map
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 border border-slate-200 w-fit">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "maps" && (
          <div>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-2xl font-bold text-slate-900">{mapStats.total_maps}</p>
                <p className="text-xs text-slate-500 mt-1">Total Maps</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-2xl font-bold text-slate-900">{mapStats.total_views?.toLocaleString() || 0}</p>
                <p className="text-xs text-slate-500 mt-1">Total Views</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-2xl font-bold text-slate-900">{points.total_points}</p>
                <p className="text-xs text-slate-500 mt-1">Points</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-2xl font-bold text-slate-900">{points.datasets_uploaded}</p>
                <p className="text-xs text-slate-500 mt-1">Datasets</p>
              </div>
            </div>

            {mapsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-4 border-brand-600 border-t-transparent rounded-full" />
              </div>
            ) : maps.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500 mb-4">No maps yet</p>
                <Link href="/maps" className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">
                  Create your first map
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Views</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Created</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maps.map(m => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link href={`/m/${m.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                            {m.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{m.views.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{new Date(m.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteMap(m.id)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "datasets" && (
          <div>
            {datasetsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-4 border-brand-600 border-t-transparent rounded-full" />
              </div>
            ) : datasets.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500 mb-2">No datasets uploaded yet</p>
                <p className="text-xs text-slate-400">Upload datasets via the API to earn points and share with the community</p>
              </div>
            ) : (
              <div className="space-y-3">
                {datasets.map(ds => (
                  <div key={ds.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-slate-900">{ds.title}</h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-full">{ds.category}</span>
                          <span>{ds.feature_count.toLocaleString()} features</span>
                          <span>{ds.query_count} queries</span>
                          <span>Used in {ds.used_in_maps} maps</span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(ds.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div>
            {/* Points summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-brand-600">{points.total_points}</p>
                <p className="text-xs text-slate-500 mt-1">Total Points</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-xl font-bold text-slate-900">{points.maps_created}</p>
                <p className="text-xs text-slate-500 mt-1">Maps</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-xl font-bold text-slate-900">{points.datasets_uploaded}</p>
                <p className="text-xs text-slate-500 mt-1">Datasets</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-xl font-bold text-slate-900">{points.data_queries_served}</p>
                <p className="text-xs text-slate-500 mt-1">Queries Served</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-xl font-bold text-slate-900">{(points.total_map_views ?? 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">Map Views</p>
              </div>
            </div>

            {activityLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-4 border-brand-600 border-t-transparent rounded-full" />
              </div>
            ) : contributions.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500">No activity yet. Create maps and upload datasets to earn points!</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {contributions.map((c, i) => (
                  <div key={i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-slate-50" : ""}`}>
                    <div>
                      <p className="text-sm text-slate-900">{ACTION_LABELS[c.action] || c.action}</p>
                      {c.resource_id && (
                        <p className="text-xs text-slate-400 mt-0.5">{c.resource_type}: {c.resource_id}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-brand-600">+{c.points_awarded}</span>
                      <p className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile</h2>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center text-white text-2xl font-medium">
                  {authUser?.email[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{authUser?.email}</p>
                  <p className="text-sm text-slate-500">Free plan</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Links</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/developers" className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors">
                  <span className="text-lg">📚</span>
                  <span className="text-sm font-medium text-slate-700">API Docs</span>
                </Link>
                <Link href="/maps" className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors">
                  <span className="text-lg">✨</span>
                  <span className="text-sm font-medium text-slate-700">Map Studio</span>
                </Link>
                <Link href="/leaderboard" className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors">
                  <span className="text-lg">🏆</span>
                  <span className="text-sm font-medium text-slate-700">Leaderboard</span>
                </Link>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Session</h2>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// Loading fallback for Suspense
function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#1a1d24]">
      <Navbar />
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-12 h-12 rounded-full border-4 border-[#6b5ce7] border-t-transparent animate-spin" />
      </div>
    </div>
  )
}

// Main page with Suspense boundary for useSearchParams
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  )
}
