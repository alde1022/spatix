"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Navbar from "@/components/Navbar"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"

interface PointsData {
  display_name: string
  total_points: number
  datasets_uploaded: number
  maps_created: number
  data_queries_served: number
  total_map_views: number
  member_since: string
}

export default function UserProfilePage() {
  const params = useParams()
  const userId = params.id as string
  const [profile, setProfile] = useState<PointsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/points/user/${encodeURIComponent(userId)}`)
      .then(r => {
        if (!r.ok) throw new Error("User not found")
        return r.json()
      })
      .then(data => setProfile(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <p className="text-slate-500">{error || "User not found"}</p>
          <Link href="/" className="text-brand-600 hover:underline text-sm mt-4 inline-block">Go home</Link>
        </div>
      </div>
    )
  }

  const displayName = profile.display_name || userId

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Profile header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center text-white text-2xl font-medium">
              {displayName[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{displayName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs font-medium">User</span>
                {profile.member_since && (
                  <span className="text-xs text-slate-400">Member since {new Date(profile.member_since).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{profile.total_points}</p>
            <p className="text-xs text-slate-500 mt-1">Points</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xl font-bold text-slate-900">{profile.maps_created}</p>
            <p className="text-xs text-slate-500 mt-1">Maps</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xl font-bold text-slate-900">{profile.datasets_uploaded}</p>
            <p className="text-xs text-slate-500 mt-1">Datasets</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xl font-bold text-slate-900">{profile.data_queries_served}</p>
            <p className="text-xs text-slate-500 mt-1">Queries Served</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xl font-bold text-slate-900">{profile.total_map_views.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">Map Views</p>
          </div>
        </div>

        {/* Tier badge */}
        {profile.total_points >= 100 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{profile.total_points >= 500 ? "🥇" : "🥈"}</span>
              <div>
                <p className="font-medium text-slate-900">
                  {profile.total_points >= 500 ? "Gold Contributor" : "Silver Contributor"}
                </p>
                <p className="text-xs text-slate-500">
                  {profile.total_points >= 500 ? "3x" : "2x"} points multiplier earned through contributions
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
