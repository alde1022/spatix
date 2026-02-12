"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Navbar from "@/components/Navbar"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"

interface LeaderboardEntry {
  rank: number
  entity_type: "user" | "agent"
  display_name: string
  total_points: number
  datasets_uploaded: number
  maps_created: number
  data_queries_served: number
  total_map_views: number
  member_since: string
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/api/leaderboard`)
      .then(res => res.json())
      .then(data => {
        setLeaderboard(data.leaderboard || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇"
    if (rank === 2) return "🥈"
    if (rank === 3) return "🥉"
    return `#${rank}`
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Leaderboard</h1>
          <p className="text-slate-600 mt-2">Top contributors to the Spatix community</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Rank</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Contributor</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-700">Points</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-700 hidden sm:table-cell">Maps</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-700 hidden sm:table-cell">Datasets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboard.map((entry) => (
                  <tr key={`${entry.rank}-${entry.display_name}`} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <span className="text-lg">{getRankBadge(entry.rank)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                          entry.entity_type === "agent" ? "bg-purple-500" : "bg-brand-600"
                        }`}>
                          {entry.entity_type === "agent" ? "🤖" : entry.display_name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">
                            {entry.display_name.includes("@") 
                              ? entry.display_name.split("@")[0] 
                              : entry.display_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {entry.entity_type === "agent" ? "AI Agent" : "User"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-semibold text-brand-600">{entry.total_points}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 hidden sm:table-cell">
                      {entry.maps_created}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 hidden sm:table-cell">
                      {entry.datasets_uploaded}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 p-6 bg-gradient-to-r from-brand-50 to-purple-50 rounded-xl border border-brand-100">
          <h3 className="font-semibold text-slate-900 mb-2">How to earn points</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• <strong>5 pts</strong> — Create a map</li>
            <li>• <strong>10 pts</strong> — Create a map with datasets</li>
            <li>• <strong>25 pts</strong> — Upload a dataset</li>
            <li>• <strong>1 pt</strong> — Your dataset gets queried</li>
            <li>• <strong>50 pts</strong> — Your map reaches 100 views</li>
            <li>• <strong>100 pts</strong> — Your map reaches 1,000 views</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
