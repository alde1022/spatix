"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import UploadZone from "@/components/UploadZone"

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false })

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"

// Example maps to inspire users
const exampleMaps = [
  { 
    id: "demo-coffee", 
    title: "Coffee Shops in SF",
    description: "Points from CSV",
    thumbnail: "☕",
    color: "bg-amber-100"
  },
  { 
    id: "demo-trails", 
    title: "Hiking Trails",
    description: "Lines from GPX",
    thumbnail: "🥾",
    color: "bg-green-100"
  },
  { 
    id: "demo-zones", 
    title: "School Districts",
    description: "Polygons from Shapefile",
    thumbnail: "🏫",
    color: "bg-blue-100"
  },
]

interface UploadError extends Error {
  details?: string | null
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [geojson, setGeojson] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [showCanvas, setShowCanvas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)
    setErrorDetails(null)
    setLoading(true)

    try {
      if (selectedFile.size > 50 * 1024 * 1024) {
        throw new Error("File too large. Maximum size is 50MB.")
      }

      const formData = new FormData()
      formData.append("file", selectedFile)

      const response = await fetch(`${API_URL}/analyze?include_preview=true`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        let errorMessage = "Failed to process file"
        let details: string | null = null
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorData.message || errorMessage
          details = errorData.hint || null
        } catch {
          errorMessage = "Server error (" + response.status + "): " + response.statusText
        }
        const err: UploadError = new Error(errorMessage)
        err.details = details
        throw err
      }

      const data = await response.json()
      
      if (data.preview_geojson) {
        setGeojson(data.preview_geojson)
        setShowCanvas(true)
      } else if (data.error) {
        throw new Error(data.error)
      } else {
        throw new Error("Could not generate map preview.")
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("Connection failed")
        setErrorDetails("Could not connect to the server.")
      } else if (err instanceof Error) {
        setError(err.message)
        setErrorDetails((err as UploadError).details || null)
      } else {
        setError("An unexpected error occurred")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (config: any) => {
    setSaving(true)
    try {
      const response = await fetch(`${API_URL}/api/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: config.geojson,
          title: file?.name.replace(/\.[^/.]+$/, "") || "My Map",
          style: config.basemap,
        }),
      })
      if (!response.ok) throw new Error("Failed to save")
      const data = await response.json()
      setSavedUrl(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save map")
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setShowCanvas(false)
    setGeojson(null)
    setFile(null)
    setSavedUrl(null)
    setError(null)
  }

  if (showCanvas && geojson) {
    return (
      <>
        <MapCanvas geojson={geojson} onSave={handleSave} onClose={handleClose} saving={saving} />
        {savedUrl && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-2xl shadow-2xl p-6 max-w-md border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">✓</span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-slate-900">Map saved!</h3>
                <p className="text-slate-500 text-sm mb-3">Share it with anyone</p>
                <div className="flex gap-2">
                  <input type="text" value={savedUrl} readOnly className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono text-slate-700" />
                  <button onClick={() => navigator.clipboard.writeText(savedUrl)} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">Copy</button>
                </div>
                <a href={savedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 text-sm font-medium mt-3">
                  Open map <span>→</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-violet-50 -z-10" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-100/50 to-transparent -z-10" />
        
        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-full text-sm font-medium mb-6">
                <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse"></span>
                The fastest way to map data
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-[1.1] tracking-tight">
                Beautiful maps<br />
                <span className="text-brand-600">in seconds</span>
              </h1>
              
              <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-lg">
                Drop your data, style it beautifully, share anywhere. No GIS expertise needed. 
                Perfect for teams, developers, and AI agents.
              </p>
              
              <div className="flex flex-wrap gap-4 mb-8">
                <a href="#upload" className="px-6 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 font-medium shadow-lg shadow-brand-600/25 transition-all hover:shadow-xl hover:shadow-brand-600/30">
                  Create a map — it's free
                </a>
                <Link href="/developers" className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl hover:border-slate-400 hover:bg-slate-50 font-medium transition-all">
                  View API docs
                </Link>
              </div>
              
              <div className="flex items-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  No signup required
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  15+ file formats
                </div>
              </div>
            </div>
            
            {/* Right: Visual */}
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                {/* Fake browser chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 border-b border-slate-200">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white rounded-lg px-3 py-1.5 text-xs text-slate-500 font-mono">
                      spatix.io/m/demo
                    </div>
                  </div>
                </div>
                {/* Map preview placeholder */}
                <div className="aspect-[4/3] bg-gradient-to-br from-blue-100 via-green-50 to-blue-50 relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-6xl mb-4">🗺️</div>
                      <p className="text-slate-500 text-sm">Interactive map preview</p>
                    </div>
                  </div>
                  {/* Fake map points */}
                  <div className="absolute top-1/4 left-1/3 w-4 h-4 bg-brand-500 rounded-full shadow-lg animate-pulse"></div>
                  <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-brand-500 rounded-full shadow-lg animate-pulse delay-100"></div>
                  <div className="absolute bottom-1/3 right-1/4 w-4 h-4 bg-brand-500 rounded-full shadow-lg animate-pulse delay-200"></div>
                </div>
              </div>
              
              {/* Floating badges */}
              <div className="absolute -left-4 top-1/4 bg-white rounded-xl shadow-lg px-4 py-3 border border-slate-200">
                <div className="text-xs text-slate-500 mb-1">Processing time</div>
                <div className="text-lg font-bold text-slate-900">~2 seconds</div>
              </div>
              <div className="absolute -right-4 bottom-1/4 bg-white rounded-xl shadow-lg px-4 py-3 border border-slate-200">
                <div className="text-xs text-slate-500 mb-1">Formats supported</div>
                <div className="text-lg font-bold text-slate-900">15+ types</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section id="upload" className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Drop your file to get started</h2>
            <p className="text-slate-600">GeoJSON, Shapefile, KML, GPX, CSV with coordinates, and more</p>
          </div>
          
          <UploadZone onFileSelect={handleFileSelect} file={file} />
          
          {loading && (
            <div className="mt-6 flex items-center justify-center gap-3 text-slate-600">
              <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              Analyzing your data...
            </div>
          )}
          
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-red-500 text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-red-700 font-medium">{error}</p>
                  {errorDetails && <p className="text-red-600 text-sm mt-1">{errorDetails}</p>}
                  <button onClick={() => { setError(null); setFile(null); }} className="mt-3 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200">
                    Try another file
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Example Maps */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">See what's possible</h2>
            <p className="text-slate-600">Every file type becomes a beautiful, shareable map</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {exampleMaps.map((map) => (
              <div key={map.id} className="group cursor-pointer">
                <div className={`${map.color} rounded-2xl p-8 mb-4 aspect-[4/3] flex items-center justify-center transition-transform group-hover:scale-[1.02]`}>
                  <span className="text-6xl">{map.thumbnail}</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{map.title}</h3>
                <p className="text-sm text-slate-500">{map.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Why teams choose Spatix</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Simpler than Kepler, more powerful than basic tools. Built for speed.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Instant processing</h3>
              <p className="text-slate-400 text-sm">Most files render in under 2 seconds. No waiting, no loading bars.</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-violet-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🤖</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">AI-native API</h3>
              <p className="text-slate-400 text-sm">One POST request creates a shareable map. Perfect for agents and automation.</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🎨</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Beautiful defaults</h3>
              <p className="text-slate-400 text-sm">Smart color palettes and styles that make your data look great immediately.</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">📂</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Any format</h3>
              <p className="text-slate-400 text-sm">GeoJSON, Shapefile, KML, GPX, GML, DXF, CSV, and more. We handle the conversion.</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-rose-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🔗</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Shareable URLs</h3>
              <p className="text-slate-400 text-sm">Every map gets a unique URL. Embed anywhere with iframes.</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-cyan-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🌐</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Multiple basemaps</h3>
              <p className="text-slate-400 text-sm">Street, satellite, terrain, dark mode. Switch with one click.</p>
            </div>
          </div>
        </div>
      </section>

      {/* API Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-100 text-violet-700 rounded-full text-sm font-medium mb-4">
                For developers
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Build with our API</h2>
              <p className="text-slate-600 mb-6">
                Create maps programmatically. Perfect for AI agents, data pipelines, and custom integrations.
                One API call = shareable map.
              </p>
              <Link href="/developers" className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium">
                Read the docs <span>→</span>
              </Link>
            </div>
            
            <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-4">
                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">POST</span>
                <span>/api/map</span>
              </div>
              <pre className="text-sm text-slate-300 overflow-x-auto"><code>{`{
  "data": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.4, 37.8]
      },
      "properties": { "name": "SF" }
    }]
  },
  "title": "My Map"
}`}</code></pre>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="text-xs text-slate-500 mb-2">Response</div>
                <code className="text-green-400 text-sm">{"{"} "url": "https://spatix.io/m/abc123" {"}"}</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-brand-600">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to map your data?</h2>
          <p className="text-brand-100 mb-8 text-lg">Start free. No credit card required.</p>
          <a href="#upload" className="inline-block px-8 py-4 bg-white text-brand-600 rounded-xl font-semibold hover:bg-brand-50 transition-colors shadow-lg">
            Create your first map
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-12 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <span className="text-white">🗺️</span>
              </div>
              <span className="font-bold text-slate-900">Spatix</span>
            </div>
            <div className="flex items-center gap-8 text-sm text-slate-500">
              <Link href="/developers" className="hover:text-slate-700">API</Link>
              <Link href="/pricing" className="hover:text-slate-700">Pricing</Link>
              <Link href="/login" className="hover:text-slate-700">Log in</Link>
            </div>
            <p className="text-sm text-slate-400">© 2026 Spatix</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
