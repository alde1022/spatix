"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import UploadZone from "@/components/UploadZone"

const HeroMap = dynamic(() => import("@/components/HeroMap"), { ssr: false })

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"

// Example maps to inspire users - with sample GeoJSON data
const exampleMaps = [
  { 
    id: "demo-coffee", 
    title: "Coffee Shops in SF",
    description: "Points from CSV",
    thumbnail: "☕",
    color: "bg-amber-100",
    fileType: "CSV",
    sampleFile: `name,lat,lng,rating
Blue Bottle Coffee,37.7823,-122.4086,4.5
Sightglass Coffee,37.7715,-122.4105,4.7
Ritual Coffee,37.7565,-122.4215,4.6
Philz Coffee,37.7642,-122.4335,4.8
Four Barrel Coffee,37.7672,-122.4223,4.4
Equator Coffees,37.7538,-122.4178,4.6
Verve Coffee,37.7821,-122.4052,4.5
Andytown Coffee,37.7559,-122.5070,4.7`,
    geojson: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Blue Bottle Coffee", rating: 4.5 }, geometry: { type: "Point", coordinates: [-122.4086, 37.7823] }},
        { type: "Feature", properties: { name: "Sightglass Coffee", rating: 4.7 }, geometry: { type: "Point", coordinates: [-122.4105, 37.7715] }},
        { type: "Feature", properties: { name: "Ritual Coffee", rating: 4.6 }, geometry: { type: "Point", coordinates: [-122.4215, 37.7565] }},
        { type: "Feature", properties: { name: "Philz Coffee", rating: 4.8 }, geometry: { type: "Point", coordinates: [-122.4335, 37.7642] }},
        { type: "Feature", properties: { name: "Four Barrel Coffee", rating: 4.4 }, geometry: { type: "Point", coordinates: [-122.4223, 37.7672] }},
        { type: "Feature", properties: { name: "Equator Coffees", rating: 4.6 }, geometry: { type: "Point", coordinates: [-122.4178, 37.7538] }},
        { type: "Feature", properties: { name: "Verve Coffee", rating: 4.5 }, geometry: { type: "Point", coordinates: [-122.4052, 37.7821] }},
        { type: "Feature", properties: { name: "Andytown Coffee", rating: 4.7 }, geometry: { type: "Point", coordinates: [-122.5070, 37.7559] }},
      ]
    }
  },
  { 
    id: "demo-trails", 
    title: "Bay Area Trails",
    description: "Lines from GPX",
    thumbnail: "🥾",
    color: "bg-green-100",
    fileType: "GPX",
    sampleFile: `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk><name>Dipsea Trail</name>
    <trkseg>
      <trkpt lat="37.8976" lon="-122.5215"/>
      <trkpt lat="37.9012" lon="-122.5847"/>
    </trkseg>
  </trk>
</gpx>`,
    geojson: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Dipsea Trail", length: "7.4 mi" }, geometry: { type: "LineString", coordinates: [[-122.521, 37.897], [-122.528, 37.899], [-122.535, 37.902], [-122.543, 37.904], [-122.551, 37.905], [-122.558, 37.905], [-122.566, 37.904], [-122.574, 37.902], [-122.582, 37.901], [-122.585, 37.901]] }},
        { type: "Feature", properties: { name: "Tennessee Valley Trail", length: "3.4 mi" }, geometry: { type: "LineString", coordinates: [[-122.534, 37.865], [-122.540, 37.862], [-122.547, 37.858], [-122.553, 37.855], [-122.558, 37.852], [-122.562, 37.851]] }},
        { type: "Feature", properties: { name: "Coastal Trail", length: "5.2 mi" }, geometry: { type: "LineString", coordinates: [[-122.510, 37.831], [-122.515, 37.838], [-122.520, 37.845], [-122.525, 37.851], [-122.530, 37.856], [-122.535, 37.860], [-122.540, 37.862]] }},
        { type: "Feature", properties: { name: "Matt Davis Trail", length: "6.1 mi" }, geometry: { type: "LineString", coordinates: [[-122.598, 37.911], [-122.592, 37.908], [-122.586, 37.906], [-122.580, 37.904], [-122.574, 37.902], [-122.568, 37.900], [-122.562, 37.900]] }},
      ]
    }
  },
  { 
    id: "demo-zones", 
    title: "SF School Districts",
    description: "Polygons from Shapefile",
    thumbnail: "🏫",
    color: "bg-blue-100",
    fileType: "Shapefile",
    sampleFile: `SHAPEFILE: school_districts.zip
Contains: .shp .shx .dbf .prj
Fields: NAME, SCHOOLS, AREA_SQMI
CRS: EPSG:4326 (WGS84)`,
    geojson: {
      type: "FeatureCollection",
      features: [
        { 
          type: "Feature", 
          properties: { name: "Mission / Bernal Heights", schools: 14, area: 2.1 }, 
          geometry: { 
            type: "Polygon", 
            coordinates: [[
              [-122.425, 37.765], [-122.403, 37.765], [-122.400, 37.755],
              [-122.403, 37.740], [-122.418, 37.735], [-122.430, 37.740],
              [-122.432, 37.755], [-122.425, 37.765]
            ]] 
          }
        },
        { 
          type: "Feature", 
          properties: { name: "Sunset / Parkside", schools: 22, area: 4.8 }, 
          geometry: { 
            type: "Polygon", 
            coordinates: [[
              [-122.510, 37.765], [-122.470, 37.765], [-122.465, 37.755],
              [-122.470, 37.735], [-122.495, 37.730], [-122.510, 37.735],
              [-122.515, 37.750], [-122.510, 37.765]
            ]] 
          }
        },
        { 
          type: "Feature", 
          properties: { name: "Richmond / Sea Cliff", schools: 18, area: 3.2 }, 
          geometry: { 
            type: "Polygon", 
            coordinates: [[
              [-122.510, 37.790], [-122.465, 37.790], [-122.458, 37.780],
              [-122.460, 37.772], [-122.485, 37.768], [-122.510, 37.772],
              [-122.515, 37.782], [-122.510, 37.790]
            ]] 
          }
        },
        { 
          type: "Feature", 
          properties: { name: "Marina / Pacific Heights", schools: 8, area: 1.4 }, 
          geometry: { 
            type: "Polygon", 
            coordinates: [[
              [-122.445, 37.805], [-122.415, 37.805], [-122.410, 37.795],
              [-122.418, 37.787], [-122.438, 37.787], [-122.448, 37.793],
              [-122.450, 37.800], [-122.445, 37.805]
            ]] 
          }
        },
        { 
          type: "Feature", 
          properties: { name: "Downtown / SOMA", schools: 6, area: 1.8 }, 
          geometry: { 
            type: "Polygon", 
            coordinates: [[
              [-122.415, 37.790], [-122.390, 37.790], [-122.385, 37.778],
              [-122.392, 37.770], [-122.410, 37.772], [-122.418, 37.780],
              [-122.415, 37.790]
            ]] 
          }
        },
      ]
    }
  },
]

interface UploadError extends Error {
  details?: string | null
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [selectedExample, setSelectedExample] = useState<typeof exampleMaps[0] | null>(null)
  const router = useRouter()

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
        const baseName = selectedFile.name.replace(/\.[^/.]+$/, "")
        localStorage.setItem('spatix_example_data', JSON.stringify({
          geojson: data.preview_geojson,
          name: baseName
        }))
        router.push('/maps')
        return
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

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#0a0e1a]">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/40 via-[#0a0e1a] to-indigo-950/30 -z-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-violet-600/8 rounded-full blur-3xl -z-10" />

        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-500/15 text-violet-300 rounded-full text-sm font-medium mb-6 border border-violet-500/20">
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse"></span>
                Spatial data infrastructure
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
                Publish spatial data.<br />
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Get an API instantly.</span>
              </h1>

              <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-lg">
                Upload your datasets, get production-ready APIs and interactive maps in seconds.
                No ArcGIS contracts. No GIS team required. Built for data providers, developers, and AI agents.
              </p>

              <div className="flex flex-wrap gap-4 mb-8">
                <a href="/maps" className="px-6 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-500 font-medium shadow-lg shadow-violet-600/25 transition-all hover:shadow-xl hover:shadow-violet-500/30">
                  Publish your data — it's free
                </a>
                <Link href="/developers" className="px-6 py-3 border border-white/15 text-slate-300 rounded-xl hover:border-white/30 hover:bg-white/5 font-medium transition-all">
                  View API docs
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  No vendor lock-in
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  15+ formats supported
                </div>
              </div>
            </div>

            {/* Right: Visual */}
            <div className="relative">
              <div className="bg-[#12141f] rounded-2xl shadow-2xl border border-white/10 overflow-hidden ring-1 ring-violet-500/10">
                {/* Fake browser chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-[#1a1d2e] border-b border-white/5">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/70"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/70"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/70"></div>
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white/5 rounded-lg px-3 py-1.5 text-xs text-slate-500 font-mono border border-white/5">
                      spatix.io/m/demo
                    </div>
                  </div>
                </div>
                {/* Live interactive map preview */}
                <div className="aspect-[4/3] relative overflow-hidden" style={{ minHeight: '350px' }}>
                  <HeroMap />
                </div>
              </div>

              {/* Floating badges */}
              <div className="absolute -left-4 top-1/4 bg-[#1a1d2e]/90 backdrop-blur-sm rounded-xl shadow-lg px-4 py-3 border border-white/10">
                <div className="text-xs text-slate-500 mb-1">Data to API</div>
                <div className="text-lg font-bold text-white">~2 seconds</div>
              </div>
              <div className="absolute -right-4 bottom-1/4 bg-[#1a1d2e]/90 backdrop-blur-sm rounded-xl shadow-lg px-4 py-3 border border-white/10">
                <div className="text-xs text-slate-500 mb-1">Ingest formats</div>
                <div className="text-lg font-bold text-white">15+ types</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section id="upload" className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Upload your data, get an API</h2>
            <p className="text-slate-600">GeoJSON, Shapefile, KML, GPX, CSV with coordinates, and more — instantly queryable</p>
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
            <p className="text-slate-600">Every file type becomes a shareable map and queryable API</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {exampleMaps.map((map) => (
              <div 
                key={map.id} 
                className="group cursor-pointer"
                onClick={() => setSelectedExample(map)}
              >
                <div className={`${map.color} rounded-2xl p-8 mb-4 aspect-[4/3] flex items-center justify-center transition-transform group-hover:scale-[1.02] group-hover:shadow-lg`}>
                  <span className="text-6xl group-hover:scale-110 transition-transform">{map.thumbnail}</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-brand-600 transition-colors">{map.title}</h3>
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
            <h2 className="text-3xl font-bold mb-4">Why data teams choose Spatix</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Skip the enterprise GIS contracts. Publish spatial data APIs in minutes, not months.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Instant APIs</h3>
              <p className="text-slate-400 text-sm">Upload any spatial dataset, get a RESTful API endpoint in seconds. No provisioning, no config.</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-violet-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🤖</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Agent-ready</h3>
              <p className="text-slate-400 text-sm">One POST from any AI agent or pipeline. Built for the LLM era — spatial data your agents can actually use.</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🔓</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">No gatekeepers</h3>
              <p className="text-slate-400 text-sm">Skip the ArcGIS contracts and enterprise sales cycles. Publish your data on your terms.</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">📂</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Any format in</h3>
              <p className="text-slate-400 text-sm">GeoJSON, Shapefile, KML, GPX, CSV, and 10+ more. We normalize everything to clean, queryable APIs.</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-rose-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">🔗</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Share & embed</h3>
              <p className="text-slate-400 text-sm">Every dataset gets a shareable URL and embeddable map. Visualize without extra tooling.</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
              <div className="w-12 h-12 bg-cyan-600 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Built to monetize</h3>
              <p className="text-slate-400 text-sm">Metered API access, usage analytics, and billing infrastructure for your spatial data. Coming soon.</p>
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
                Publish and consume spatial data programmatically. Perfect for AI agents, data pipelines,
                and anyone tired of GIS vendor lock-in. One API call = shareable map.
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
          <h2 className="text-3xl font-bold text-white mb-4">Ready to publish your spatial data?</h2>
          <p className="text-brand-100 mb-8 text-lg">Upload, get an API, share a map — completely free.</p>
          <a href="/maps" className="inline-block px-8 py-4 bg-white text-brand-600 rounded-xl font-semibold hover:bg-brand-50 transition-colors shadow-lg">
            Get started free
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
              <Link href="/maps" className="hover:text-slate-700">Maps</Link>
              <Link href="/login" className="hover:text-slate-700">Log in</Link>
            </div>
            <p className="text-sm text-slate-400">© 2026 Spatix</p>
          </div>
        </div>
      </footer>

      {/* Example Preview Modal */}
      {selectedExample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className={`${selectedExample.color} w-14 h-14 rounded-xl flex items-center justify-center`}>
                  <span className="text-3xl">{selectedExample.thumbnail}</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedExample.title}</h3>
                  <p className="text-sm text-slate-500">Source: {selectedExample.fileType} file</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedExample(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Sample File Preview */}
            <div className="p-6 border-b border-slate-100">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Sample {selectedExample.fileType} Input
              </label>
              <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
                <pre className="text-sm text-slate-300 font-mono whitespace-pre">{selectedExample.sampleFile}</pre>
              </div>
            </div>
            
            {/* Actions */}
            <div className="p-6 flex gap-3">
              <button 
                onClick={() => {
                  // Store geojson in localStorage for /maps to pick up
                  localStorage.setItem('spatix_example_data', JSON.stringify({
                    geojson: selectedExample.geojson,
                    name: selectedExample.title
                  }))
                  setSelectedExample(null)
                  router.push('/maps')
                }}
                className="flex-1 py-3 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                View on Map
              </button>
              <button 
                onClick={() => setSelectedExample(null)}
                className="px-6 py-3 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
