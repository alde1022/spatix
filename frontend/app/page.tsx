"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import UploadZone from "@/components/UploadZone"

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false })

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

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
        throw new Error("Could not generate map preview. The file may not contain valid geographic data.")
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("Connection failed")
        setErrorDetails("Could not connect to the server. Please check your internet connection and try again.")
      } else if (err instanceof Error) {
        setError(err.message)
        setErrorDetails((err as UploadError).details || null)
      } else {
        setError("An unexpected error occurred")
        setErrorDetails("Please try again or contact support if the problem persists.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (config: any) => {
    setSaving(true)
    setError(null)
    setErrorDetails(null)
    
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

      if (!response.ok) {
        let errorMessage = "Failed to save map"
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorData.message || errorMessage
        } catch {}
        throw new Error(errorMessage)
      }

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
    setErrorDetails(null)
  }

  const handleRetry = () => {
    setError(null)
    setErrorDetails(null)
    setFile(null)
  }

  if (showCanvas && geojson) {
    return (
      <>
        <MapCanvas geojson={geojson} onSave={handleSave} onClose={handleClose} saving={saving} />
        {savedUrl && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-xl shadow-2xl p-6 max-w-md animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-semibold text-lg mb-2">🎉 Map saved!</h3>
            <p className="text-slate-600 text-sm mb-4">Your map is ready to share</p>
            <div className="flex gap-2">
              <input type="text" value={savedUrl} readOnly className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono" />
              <button onClick={() => navigator.clipboard.writeText(savedUrl)} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">Copy</button>
            </div>
            <a href={savedUrl} target="_blank" rel="noopener noreferrer" className="block text-center text-brand-600 hover:underline text-sm mt-3">Open map →</a>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-100 text-brand-700 rounded-full text-sm font-medium mb-6">
          <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></span>
          Now with AI-native API
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
          Maps in seconds.<br /><span className="text-brand-600">No GIS skills needed.</span>
        </h1>

        <p className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto">
          Drop any file → instant beautiful map → style → share. The simplest way to visualize and share geographic data.
        </p>

        <div className="max-w-2xl mx-auto mb-12">
          <UploadZone onFileSelect={handleFileSelect} file={file} />
          
          {loading && (
            <div className="mt-6 flex items-center justify-center gap-3 text-slate-600">
              <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              Processing your file...
            </div>
          )}
          
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
              <div className="flex items-start gap-3">
                <span className="text-red-500 text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-red-700 font-medium">{error}</p>
                  {errorDetails && <p className="text-red-600 text-sm mt-1">{errorDetails}</p>}
                  <div className="mt-3 flex gap-2">
                    <button onClick={handleRetry} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200">Try another file</button>
                    <a href="/developers#formats" className="px-3 py-1.5 text-red-600 text-sm hover:underline">View supported formats</a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto mt-20">
          <div className="text-center">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-4"><span className="text-2xl">📂</span></div>
            <h3 className="font-semibold text-slate-900 mb-2">Drop any file</h3>
            <p className="text-slate-600 text-sm">GeoJSON, Shapefile, KML, GPX, CSV, and 15+ formats supported</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-4"><span className="text-2xl">🎨</span></div>
            <h3 className="font-semibold text-slate-900 mb-2">Style instantly</h3>
            <p className="text-slate-600 text-sm">Beautiful presets, custom colors, multiple basemaps</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-4"><span className="text-2xl">🔗</span></div>
            <h3 className="font-semibold text-slate-900 mb-2">Share anywhere</h3>
            <p className="text-slate-600 text-sm">Unique URLs, embeddable iframes, social previews</p>
          </div>
        </div>

        <div className="mt-20 p-8 bg-slate-900 rounded-2xl text-left max-w-2xl mx-auto">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0"><span className="text-xl">🤖</span></div>
            <div>
              <h3 className="text-white font-semibold mb-2">AI-native API</h3>
              <p className="text-slate-400 text-sm mb-4">Perfect for AI agents. Create maps with a single POST request.</p>
              <pre className="bg-slate-800 p-4 rounded-lg text-sm text-slate-300 overflow-x-auto">{`POST /api/map
{ "data": [[-122, 37], [-118, 34]], "title": "West Coast" }`}</pre>
              <Link href="/developers" className="inline-block mt-4 text-violet-400 hover:text-violet-300 text-sm font-medium">View API docs →</Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 mt-20 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>© 2025 Spatix. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/developers" className="hover:text-slate-700">API</Link>
            <Link href="/pricing" className="hover:text-slate-700">Pricing</Link>
            <a href="https://twitter.com/spatixmaps" className="hover:text-slate-700">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
