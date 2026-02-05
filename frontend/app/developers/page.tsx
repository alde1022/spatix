"use client"

import Link from "next/link"
import Navbar from "@/components/Navbar"

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Navbar />
      {/* Hero */}
      <header className="bg-slate-900 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600/20 text-violet-300 rounded-full text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse"></span>
            AI-Native API
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Spatix API</h1>
          <p className="text-xl text-slate-300 mb-8">
            The simplest way for AI agents and developers to create maps
          </p>
          <div className="flex justify-center gap-4">
            <a href="#quickstart" className="px-6 py-3 bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors font-medium">
              Quick Start
            </a>
            <Link href="/maps" className="px-6 py-3 border border-slate-500 rounded-lg hover:border-white transition-colors font-medium">
              Try It Free
            </Link>
          </div>
        </div>
      </header>

      {/* Sticky Nav */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <ul className="flex gap-6 py-4 text-sm overflow-x-auto">
            <li><a href="#quickstart" className="text-slate-600 hover:text-brand-600">Quick Start</a></li>
            <li><a href="#authentication" className="text-slate-600 hover:text-brand-600">Authentication</a></li>
            <li><a href="#create-map" className="text-slate-600 hover:text-brand-600">Create Map</a></li>
            <li><a href="#get-map" className="text-slate-600 hover:text-brand-600">Get Map</a></li>
            <li><a href="#formats" className="text-slate-600 hover:text-brand-600">Formats</a></li>
            <li><a href="#examples" className="text-slate-600 hover:text-brand-600">Examples</a></li>
          </ul>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Quick Start */}
        <section id="quickstart" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Quick Start</h2>
          <p className="text-slate-600 mb-4">
            Create a map with a single POST request. No complex setup required.
          </p>
          <div className="bg-slate-900 text-slate-100 p-6 rounded-xl overflow-x-auto">
            <pre className="text-sm"><code>{`curl -X POST https://api.spatix.io/api/map \\
  -H "Content-Type: application/json" \\
  -d '{
    "data": {"type": "Point", "coordinates": [-122.4194, 37.7749]},
    "title": "San Francisco"
  }'`}</code></pre>
          </div>
          <p className="text-slate-600 mt-4">Response:</p>
          <div className="bg-slate-900 text-slate-100 p-6 rounded-xl overflow-x-auto mt-2">
            <pre className="text-sm"><code>{`{
  "success": true,
  "id": "abc123",
  "url": "https://spatix.io/m/abc123",
  "embed": "<iframe src='https://spatix.io/m/abc123?embed=1' ...></iframe>"
}`}</code></pre>
          </div>
        </section>

        {/* Authentication */}
        <section id="authentication" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Authentication</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700 mb-4">
              <strong>Free tier:</strong> No authentication required. Rate limited to 60 maps/hour per IP.
            </p>
            <p className="text-slate-700 mb-4">
              <strong>Pro/Team:</strong> Use the <code className="bg-slate-100 px-2 py-1 rounded text-sm">X-API-Key</code> header.
            </p>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm"><code>{`curl -X POST https://api.spatix.io/api/map \\
  -H "X-API-Key: your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"data": {...}}'`}</code></pre>
            </div>
          </div>
        </section>

        {/* Create Map */}
        <section id="create-map" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Create Map</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700 font-mono mb-4">POST /api/map</p>
            <h3 className="font-semibold mb-2">Request Body</h3>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Field</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 font-mono">data</td>
                  <td className="py-2">object</td>
                  <td className="py-2">GeoJSON, coordinates, or geometry</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono">title</td>
                  <td className="py-2">string</td>
                  <td className="py-2">Optional map title</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono">style</td>
                  <td className="py-2">string</td>
                  <td className="py-2">light, dark, satellite, streets</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Get Map */}
        <section id="get-map" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Get Map</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700 font-mono mb-4">GET /api/map/:id</p>
            <p className="text-slate-600 mb-4">Retrieve map data and metadata.</p>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm"><code>{`curl https://api.spatix.io/api/map/abc123`}</code></pre>
            </div>
          </div>
        </section>

        {/* Formats */}
        <section id="formats" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Supported Formats</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Input Formats</h3>
              <ul className="text-slate-600 text-sm space-y-1">
                <li>• GeoJSON (Point, LineString, Polygon, FeatureCollection)</li>
                <li>• Coordinate arrays [[lng, lat], ...]</li>
                <li>• Shapefile (.zip)</li>
                <li>• KML / KMZ</li>
                <li>• GPX</li>
                <li>• CSV (with lat/lng columns)</li>
                <li>• GeoPackage</li>
              </ul>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Output</h3>
              <ul className="text-slate-600 text-sm space-y-1">
                <li>• Shareable URL</li>
                <li>• Embeddable iframe</li>
                <li>• PNG preview image</li>
                <li>• GeoJSON export</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Examples */}
        <section id="examples" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Examples</h2>
          
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Multiple Points</h3>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`{
  "data": [
    [-122.4194, 37.7749],
    [-118.2437, 34.0522],
    [-73.9857, 40.7484]
  ],
  "title": "US Cities"
}`}</code></pre>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">GeoJSON Feature</h3>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`{
  "data": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[-122.5, 37.7], [-122.3, 37.7], [-122.3, 37.9], [-122.5, 37.9], [-122.5, 37.7]]]
    },
    "properties": {"name": "SF Bay Area"}
  }
}`}</code></pre>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>© 2025 Spatix. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/developers" className="hover:text-slate-700">API</Link>
            <Link href="/maps" className="hover:text-slate-700">Maps</Link>
            <a href="https://twitter.com/spatixmaps" className="hover:text-slate-700">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
