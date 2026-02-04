"use client"

import Link from "next/link"

export default function DevelopersPage() {
  return (
    <div className="bg-gradient-to-b from-slate-50 to-white min-h-screen">
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
            <Link href="/pricing" className="px-6 py-3 border border-slate-500 rounded-lg hover:border-white transition-colors font-medium">
              Get API Key
            </Link>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <ul className="flex gap-6 py-4 text-sm overflow-x-auto">
            <li><a href="#quickstart" className="text-slate-600 hover:text-brand-600">Quick Start</a></li>
            <li><a href="#authentication" className="text-slate-600 hover:text-brand-600">Authentication</a></li>
            <li><a href="#create-map" className="text-slate-600 hover:text-brand-600">Create Map</a></li>
            <li><a href="#get-map" className="text-slate-600 hover:text-brand-600">Get Map</a></li>
            <li><a href="#data-formats" className="text-slate-600 hover:text-brand-600">Data Formats</a></li>
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
            <pre className="text-sm"><code>{`curl -X POST https://api.spatix.io/map \\
  -H "Content-Type: application/json" \\
  -d '{
    "data": {"type": "Point", "coordinates": [-122.4194, 37.7749]},
    "title": "San Francisco"
  }'`}</code></pre>
          </div>
          <p className="text-slate-600 mt-4">
            Response:
          </p>
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
            <div className="bg-slate-50 p-4 rounded-lg">
              <code className="text-sm font-mono">X-API-Key: mc_xxxxxxxxxxxxx</code>
            </div>
          </div>
          <div className="mt-4 p-4 bg-brand-50 border border-brand-200 rounded-xl">
            <p className="text-brand-800 text-sm">
              <strong>Base URL:</strong> <code className="bg-brand-100 px-2 py-1 rounded">https://api.spatix.io</code>
            </p>
          </div>
        </section>

        {/* Create Map */}
        <section id="create-map" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Create Map</h2>
          
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded text-sm font-mono font-bold">POST</span>
              <code className="text-lg">/map</code>
            </div>
            <p className="text-slate-600 mb-6">Create an interactive map from geographic data.</p>
            
            <h4 className="font-semibold mb-3">Request Body</h4>
            <table className="w-full text-sm mb-6">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold">Field</th>
                  <th className="text-left py-2 px-3 font-semibold">Type</th>
                  <th className="text-left py-2 px-3 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="py-2 px-3 font-mono text-brand-600">data*</td>
                  <td className="py-2 px-3 text-slate-600">object | array | string</td>
                  <td className="py-2 px-3 text-slate-600">GeoJSON, coordinates, or WKT</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 px-3 font-mono">title</td>
                  <td className="py-2 px-3 text-slate-600">string</td>
                  <td className="py-2 px-3 text-slate-600">Map title</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 px-3 font-mono">description</td>
                  <td className="py-2 px-3 text-slate-600">string</td>
                  <td className="py-2 px-3 text-slate-600">Map description</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 px-3 font-mono">style</td>
                  <td className="py-2 px-3 text-slate-600">string</td>
                  <td className="py-2 px-3 text-slate-600">"light" | "dark" | "satellite" | "auto"</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 px-3 font-mono">markers</td>
                  <td className="py-2 px-3 text-slate-600">array</td>
                  <td className="py-2 px-3 text-slate-600">Array of {`{lat, lng, label?, color?}`}</td>
                </tr>
              </tbody>
            </table>

            <h4 className="font-semibold mb-3">Response</h4>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm"><code>{`{
  "success": true,
  "id": "abc123",
  "url": "https://spatix.io/m/abc123",
  "embed": "<iframe src='...' width='600' height='400'></iframe>",
  "preview_url": "https://spatix.io/api/map/abc123/preview.png"
}`}</code></pre>
            </div>
          </div>
        </section>

        {/* Get Map */}
        <section id="get-map" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Get Map</h2>
          
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm font-mono font-bold">GET</span>
              <code className="text-lg">/map/{`{id}`}</code>
            </div>
            <p className="text-slate-600 mb-4">Retrieve map data by ID.</p>
            
            <h4 className="font-semibold mb-3">Response</h4>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm"><code>{`{
  "id": "abc123",
  "title": "My Map",
  "description": "A cool map",
  "config": { ... },
  "created_at": "2025-02-04T12:00:00Z",
  "views": 42
}`}</code></pre>
            </div>
          </div>
        </section>

        {/* Data Formats */}
        <section id="data-formats" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Supported Data Formats</h2>
          <p className="text-slate-600 mb-6">
            The <code className="bg-slate-100 px-2 py-1 rounded text-sm">data</code> field accepts multiple formats.
            We auto-detect and normalize to GeoJSON.
          </p>
          
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="font-semibold mb-3">GeoJSON</h4>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`// FeatureCollection
{ "type": "FeatureCollection", "features": [...] }

// Single Feature
{ "type": "Feature", "geometry": {...}, "properties": {...} }

// Raw Geometry
{ "type": "Point", "coordinates": [-122, 37] }`}</code></pre>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="font-semibold mb-3">Coordinate Arrays</h4>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`// Single point
[-122.4194, 37.7749]

// Line or polygon
[[-122.4, 37.7], [-122.5, 37.8], [-122.3, 37.9]]`}</code></pre>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="font-semibold mb-3">WKT Strings</h4>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`"POINT(-122.4194 37.7749)"
"LINESTRING(-122 37, -118 34)"
"POLYGON((-122 37, -122 38, -121 38, -121 37, -122 37))"`}</code></pre>
              </div>
            </div>
          </div>
        </section>

        {/* Examples */}
        <section id="examples" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Code Examples</h2>
          
          {/* Python */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3">Python</h3>
            <div className="bg-slate-900 text-slate-100 p-6 rounded-xl overflow-x-auto">
              <pre className="text-sm"><code>{`import requests

response = requests.post(
    "https://api.spatix.io/map",
    json={
        "data": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-122.4194, 37.7749]},
                    "properties": {"name": "San Francisco"}
                }
            ]
        },
        "title": "My Map",
        "style": "dark"
    }
)

print(response.json()["url"])  # https://spatix.io/m/abc123`}</code></pre>
            </div>
          </div>

          {/* JavaScript */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3">JavaScript</h3>
            <div className="bg-slate-900 text-slate-100 p-6 rounded-xl overflow-x-auto">
              <pre className="text-sm"><code>{`const response = await fetch("https://api.spatix.io/map", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    data: [[-122.4, 37.7], [-118.2, 34.0]],  // LA to SF line
    title: "California Route",
    markers: [
      { lat: 37.7749, lng: -122.4194, label: "San Francisco" },
      { lat: 34.0522, lng: -118.2437, label: "Los Angeles" }
    ]
  })
});

const { url } = await response.json();
console.log(url);  // https://spatix.io/m/abc123`}</code></pre>
            </div>
          </div>

          {/* AI Agent Example */}
          <div>
            <h3 className="font-semibold mb-3">OpenAI Function Calling</h3>
            <div className="bg-slate-900 text-slate-100 p-6 rounded-xl overflow-x-auto">
              <pre className="text-sm"><code>{`{
  "name": "create_map",
  "description": "Create an interactive map from geographic data",
  "parameters": {
    "type": "object",
    "properties": {
      "data": {
        "description": "GeoJSON, coordinates, or WKT string"
      },
      "title": { "type": "string" },
      "style": { "enum": ["light", "dark", "satellite"] },
      "markers": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lng": { "type": "number" },
            "label": { "type": "string" }
          }
        }
      }
    },
    "required": ["data"]
  }
}`}</code></pre>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-brand-600 text-white rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to build?</h2>
          <p className="text-brand-100 mb-6">Start creating maps with our API in minutes.</p>
          <Link 
            href="/pricing"
            className="inline-block px-8 py-3 bg-white text-brand-600 rounded-lg font-medium hover:bg-brand-50 transition-colors"
          >
            Get API Key →
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-12 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>© 2025 Spatix. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/developers" className="hover:text-slate-700">API</Link>
            <Link href="/pricing" className="hover:text-slate-700">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
