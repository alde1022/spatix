"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Navbar from "@/components/Navbar"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spatix.io"

interface DatasetMeta {
  id: string
  title: string
  description: string
  category: string
  tags: string[]
  stats: {
    feature_count: number
    file_size_bytes: number
    geometry_types: string[]
  }
  usage: {
    usage_count: number
    download_count: number
    maps_using: number
  }
  schema: { name: string; type: string }[]
  created_at: string
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DatasetMeta | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const loadDatasets = useCallback(async () => {
    setLoading(true)
    try {
      // Try authenticated first, fall back to public listing
      const token = localStorage.getItem("spatix_token")
      const headers: Record<string, string> = {}
      let url = `${API_URL}/api/datasets?limit=50`

      if (token) {
        headers["Authorization"] = `Bearer ${token}`
        url = `${API_URL}/api/datasets/me`
      }

      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        setDatasets(data.datasets || [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDatasets()
  }, [loadDatasets])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Published Datasets</h1>
            <p className="text-slate-400">Every dataset is an instantly queryable API</p>
          </div>
          <Link
            href="/maps"
            className="px-5 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-500 font-medium transition-colors"
          >
            Publish new dataset
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : datasets.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-xl font-semibold text-white mb-2">No datasets yet</h2>
            <p className="text-slate-400 mb-6">Upload a spatial file to publish your first dataset API</p>
            <Link
              href="/maps"
              className="inline-block px-6 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-500 font-medium"
            >
              Upload and publish
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {datasets.map((ds) => (
              <div
                key={ds.id}
                onClick={() => setSelected(selected?.id === ds.id ? null : ds)}
                className={`p-5 rounded-xl border cursor-pointer transition-all ${
                  selected?.id === ds.id
                    ? "bg-slate-800/80 border-violet-500/50"
                    : "bg-slate-800/40 border-slate-700/50 hover:border-slate-600"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-white truncate">{ds.title}</h3>
                      <span className="px-2 py-0.5 text-xs bg-violet-500/20 text-violet-300 rounded-full shrink-0">
                        {ds.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 truncate">{ds.description}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
                    <span>{ds.stats.feature_count.toLocaleString()} features</span>
                    <span>{formatBytes(ds.stats.file_size_bytes)}</span>
                    <span>{ds.usage.usage_count} queries</span>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {selected?.id === ds.id && (
                  <div className="mt-5 pt-5 border-t border-slate-700/50">
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* API endpoints */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-300 mb-3">API Endpoints</h4>
                        <div className="space-y-2">
                          {[
                            { label: "Query", url: `${API_URL}/api/datasets/${ds.id}/query` },
                            { label: "Full data", url: `${API_URL}/api/datasets/${ds.id}/data` },
                            { label: "Metadata", url: `${API_URL}/api/datasets/${ds.id}` },
                            { label: "Preview", url: `${API_URL}/api/datasets/${ds.id}/preview` },
                          ].map((ep) => (
                            <div
                              key={ep.label}
                              className="flex items-center gap-2 group"
                            >
                              <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded font-mono">
                                GET
                              </span>
                              <code className="text-xs text-slate-400 font-mono truncate flex-1">
                                {ep.url}
                              </code>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(ep.url, ep.label)
                                }}
                                className="text-xs text-slate-500 hover:text-white transition-colors"
                              >
                                {copied === ep.label ? "Copied!" : "Copy"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Example queries */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-300 mb-3">Example Queries</h4>
                        <div className="space-y-2">
                          <div className="bg-slate-900 rounded-lg p-3">
                            <div className="text-[10px] text-slate-500 mb-1">Filter by property</div>
                            <code className="text-xs text-slate-300 font-mono break-all">
                              /query?where={ds.schema?.[0]?.name || "name"}:eq:value&limit=10
                            </code>
                          </div>
                          <div className="bg-slate-900 rounded-lg p-3">
                            <div className="text-[10px] text-slate-500 mb-1">Bounding box</div>
                            <code className="text-xs text-slate-300 font-mono break-all">
                              /query?bbox=-122.5,37.7,-122.3,37.9
                            </code>
                          </div>
                          <div className="bg-slate-900 rounded-lg p-3">
                            <div className="text-[10px] text-slate-500 mb-1">cURL</div>
                            <code className="text-xs text-slate-300 font-mono break-all">
                              curl &quot;{API_URL}/api/datasets/{ds.id}/query?limit=5&quot;
                            </code>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Schema */}
                    {ds.schema && ds.schema.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Schema</h4>
                        <div className="flex flex-wrap gap-2">
                          {ds.schema.map((field) => (
                            <span
                              key={field.name}
                              className="px-2 py-1 text-xs bg-slate-900 text-slate-400 rounded-lg font-mono"
                            >
                              {field.name}
                              <span className="text-slate-600 ml-1">{field.type}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex items-center gap-3">
                      <a
                        href={`${SITE_URL}/maps?dataset=${ds.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors"
                      >
                        View on map
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyToClipboard(
                            `curl "${API_URL}/api/datasets/${ds.id}/query?limit=10"`,
                            "curl"
                          )
                        }}
                        className="px-3 py-1.5 text-sm border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                      >
                        {copied === "curl" ? "Copied!" : "Copy cURL"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
