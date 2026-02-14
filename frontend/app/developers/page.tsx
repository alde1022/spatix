"use client"

import { useState } from "react"
import Link from "next/link"
import Navbar from "@/components/Navbar"

function CodeTabs({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0)
  return (
    <div>
      <div className="flex gap-1 bg-slate-800 rounded-t-xl px-2 pt-2">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
              active === i
                ? "bg-slate-900 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="bg-slate-900 text-slate-100 p-6 rounded-b-xl rounded-tr-xl overflow-x-auto">
        <pre className="text-sm"><code>{tabs[active].code}</code></pre>
      </div>
    </div>
  )
}

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
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#quickstart" className="px-6 py-3 bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors font-medium">
              Quick Start
            </a>
            <a href="#mcp" className="px-6 py-3 border border-violet-500 rounded-lg hover:border-violet-300 transition-colors font-medium">
              MCP Server
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
          <ul className="flex gap-4 md:gap-6 py-4 text-sm overflow-x-auto">
            <li><a href="#quickstart" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">Quick Start</a></li>
            <li><a href="#authentication" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">Auth</a></li>
            <li><a href="#create-map" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">Create Map</a></li>
            <li><a href="#nlp-endpoints" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">NLP Endpoints</a></li>
            <li><a href="#get-map" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">Get Map</a></li>
            <li><a href="#mcp" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">MCP Server</a></li>
            <li><a href="#formats" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">Formats</a></li>
            <li><a href="#examples" className="text-slate-600 hover:text-brand-600 whitespace-nowrap">Examples</a></li>
          </ul>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Quick Start */}
        <section id="quickstart" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Quick Start</h2>
          <p className="text-slate-600 mb-4">
            Create a map with a single API call. No signup, no API key, no complex setup.
          </p>
          <CodeTabs tabs={[
            {
              label: "curl",
              code: `curl -X POST https://api.spatix.io/api/map \\
  -H "Content-Type: application/json" \\
  -d '{
    "data": {"type": "Point", "coordinates": [-122.4194, 37.7749]},
    "title": "San Francisco"
  }'`
            },
            {
              label: "Python",
              code: `import requests

response = requests.post("https://api.spatix.io/api/map", json={
    "data": {"type": "Point", "coordinates": [-122.4194, 37.7749]},
    "title": "San Francisco"
})

result = response.json()
print(result["url"])  # https://spatix.io/m/abc123`
            },
            {
              label: "JavaScript",
              code: `const response = await fetch("https://api.spatix.io/api/map", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    data: { type: "Point", coordinates: [-122.4194, 37.7749] },
    title: "San Francisco"
  })
});

const result = await response.json();
console.log(result.url); // https://spatix.io/m/abc123`
            },
          ]} />
          <p className="text-slate-600 mt-4">Response:</p>
          <div className="bg-slate-900 text-slate-100 p-6 rounded-xl overflow-x-auto mt-2">
            <pre className="text-sm"><code>{`{
  "success": true,
  "id": "abc123",
  "url": "https://spatix.io/m/abc123",
  "embed": "<iframe src='https://spatix.io/m/abc123?embed=1' width='600' height='400'></iframe>",
  "preview_url": "https://spatix.io/m/abc123",
  "delete_token": "tok_..."
}`}</code></pre>
          </div>
        </section>

        {/* Authentication */}
        <section id="authentication" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Authentication</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700 mb-4">
              No authentication required for basic usage. Just send your request and get a map back.
            </p>
            <p className="text-slate-500 text-sm mb-4">
              Rate limited to 100 maps/hour per IP. Authenticated users get higher limits (200 free / 500 pro). Need more? <a href="mailto:hello@spatix.io" className="text-brand-600 hover:underline">Get in touch</a>.
            </p>
            <h3 className="font-semibold mb-2 text-sm">Optional: JWT Authentication</h3>
            <p className="text-slate-600 text-sm mb-3">
              Sign up at <Link href="/signup" className="text-brand-600 hover:underline">spatix.io/signup</Link> and use your JWT token for higher rate limits and map management.
            </p>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm"><code>{`curl -X POST https://api.spatix.io/api/map \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
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
            <p className="text-slate-600 mb-4 text-sm">
              Accepts GeoJSON, coordinate arrays, or raw geometry. Returns a shareable map URL.
            </p>
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
                  <td className="py-2">object | array</td>
                  <td className="py-2">GeoJSON, coordinate array, or geometry object</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono">title</td>
                  <td className="py-2">string</td>
                  <td className="py-2">Optional map title</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono">style</td>
                  <td className="py-2">string</td>
                  <td className="py-2">{`"light" | "dark" | "satellite" | "streets"`}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono">email</td>
                  <td className="py-2">string</td>
                  <td className="py-2">Optional. Links the map to your account for My Maps</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono">layers</td>
                  <td className="py-2">array</td>
                  <td className="py-2">Optional. Array of layer objects for composable multi-layer maps</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* NLP Endpoints */}
        <section id="nlp-endpoints" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">NLP Endpoints</h2>
          <p className="text-slate-600 mb-6">
            Create maps from natural language. Ideal for AI agents that work with text descriptions rather than raw coordinates.
          </p>

          <div className="space-y-6">
            {/* From Text */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-slate-700 font-mono mb-2">POST /api/map/from-text</p>
              <p className="text-slate-600 text-sm mb-4">
                Extracts locations from natural language text, geocodes them, and creates a map.
              </p>
              <CodeTabs tabs={[
                {
                  label: "curl",
                  code: `curl -X POST https://api.spatix.io/api/map/from-text \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "coffee shops near Union Square, San Francisco",
    "title": "Coffee Near Union Square"
  }'`
                },
                {
                  label: "Python",
                  code: `response = requests.post("https://api.spatix.io/api/map/from-text", json={
    "text": "coffee shops near Union Square, San Francisco",
    "title": "Coffee Near Union Square"
})
print(response.json()["url"])`
                },
              ]} />
            </div>

            {/* From Addresses */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-slate-700 font-mono mb-2">POST /api/map/from-addresses</p>
              <p className="text-slate-600 text-sm mb-4">
                Geocodes a list of addresses and creates a map with markers for each.
              </p>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`curl -X POST https://api.spatix.io/api/map/from-addresses \\
  -H "Content-Type: application/json" \\
  -d '{
    "addresses": [
      "1600 Amphitheatre Parkway, Mountain View, CA",
      "1 Apple Park Way, Cupertino, CA",
      "1 Hacker Way, Menlo Park, CA"
    ],
    "title": "Tech HQs",
    "connect_line": true
  }'`}</code></pre>
              </div>
            </div>

            {/* Route */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-slate-700 font-mono mb-2">POST /api/map/route</p>
              <p className="text-slate-600 text-sm mb-4">
                Creates a route map between an origin and destination, with optional waypoints.
              </p>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`curl -X POST https://api.spatix.io/api/map/route \\
  -H "Content-Type: application/json" \\
  -d '{
    "origin": "San Francisco, CA",
    "destination": "Los Angeles, CA",
    "waypoints": ["Santa Cruz, CA", "San Luis Obispo, CA"],
    "title": "California Road Trip"
  }'`}</code></pre>
              </div>
            </div>
          </div>
        </section>

        {/* Get Map */}
        <section id="get-map" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Get Map</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700 font-mono mb-4">GET /api/map/:id</p>
            <p className="text-slate-600 mb-4">Retrieve map data, metadata, and view count.</p>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm"><code>{`curl https://api.spatix.io/api/map/abc123`}</code></pre>
            </div>
          </div>
        </section>

        {/* MCP Server */}
        <section id="mcp" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">MCP Server</h2>
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-6">
            <p className="text-slate-700 mb-4">
              Give any AI agent the ability to create maps. Install the Spatix MCP server and your AI assistant can create, manage, and share maps directly.
            </p>

            <h3 className="font-semibold mb-3">Install</h3>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto mb-6">
              <pre className="text-sm"><code>pip install spatix-mcp</code></pre>
            </div>

            <h3 className="font-semibold mb-3">Claude Desktop Configuration</h3>
            <p className="text-slate-600 text-sm mb-3">
              Add this to your Claude Desktop <code className="bg-white px-1.5 py-0.5 rounded text-violet-700 text-xs">claude_desktop_config.json</code>:
            </p>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto mb-6">
              <pre className="text-sm"><code>{`{
  "mcpServers": {
    "spatix": {
      "command": "uvx",
      "args": ["spatix-mcp"]
    }
  }
}`}</code></pre>
            </div>

            <h3 className="font-semibold mb-3">Available Tools (16)</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-medium text-sm text-violet-700 mb-2">Map Creation</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li><code className="text-xs bg-slate-100 px-1 rounded">create_map</code> — GeoJSON + title</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">create_map_from_description</code> — natural language</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">create_map_from_addresses</code> — address list</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">create_route_map</code> — A-to-B routing</li>
                </ul>
              </div>
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-medium text-sm text-violet-700 mb-2">Geocoding</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li><code className="text-xs bg-slate-100 px-1 rounded">geocode</code> — address to coordinates</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">reverse_geocode</code> — coordinates to address</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">search_places</code> — nearby POI search</li>
                </ul>
              </div>
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-medium text-sm text-violet-700 mb-2">Dataset Management</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li><code className="text-xs bg-slate-100 px-1 rounded">upload_dataset</code> — publish reusable data</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">search_datasets</code> — find public datasets</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">get_dataset</code> — retrieve dataset data</li>
                </ul>
              </div>
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-medium text-sm text-violet-700 mb-2">Community</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li><code className="text-xs bg-slate-100 px-1 rounded">get_leaderboard</code> — top contributors</li>
                  <li><code className="text-xs bg-slate-100 px-1 rounded">get_my_points</code> — your contribution score</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-4">
              Full docs: <a href="https://pypi.org/project/spatix-mcp/" target="_blank" className="text-brand-600 hover:underline">pypi.org/project/spatix-mcp</a>
            </p>
          </div>
        </section>

        {/* Formats */}
        <section id="formats" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Supported Formats</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Input Formats (API)</h3>
              <ul className="text-slate-600 text-sm space-y-1">
                <li>GeoJSON (Point, LineString, Polygon, FeatureCollection)</li>
                <li>Coordinate arrays [[lng, lat], ...]</li>
                <li>Natural language text descriptions</li>
                <li>Address lists</li>
              </ul>
              <h3 className="font-semibold mb-3 mt-4">Input Formats (File Upload)</h3>
              <ul className="text-slate-600 text-sm space-y-1">
                <li>GeoJSON / JSON</li>
                <li>Shapefile (.zip)</li>
                <li>KML / KMZ</li>
                <li>GPX</li>
                <li>CSV (with lat/lng or WKT columns)</li>
                <li>GeoPackage (.gpkg)</li>
                <li>GML</li>
                <li>DXF</li>
                <li>FlatGeobuf (.fgb)</li>
                <li>SQLite / SpatiaLite</li>
              </ul>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Output</h3>
              <ul className="text-slate-600 text-sm space-y-1">
                <li>Shareable URL (spatix.io/m/ID)</li>
                <li>Embeddable iframe</li>
                <li>Embed script tag</li>
                <li>GeoJSON export</li>
              </ul>
              <h3 className="font-semibold mb-3 mt-4">Embed Options</h3>
              <div className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-xs">
                <pre><code>{`<!-- iframe -->
<iframe src="https://spatix.io/m/ID?embed=1"
  width="600" height="400"></iframe>

<!-- script tag -->
<div data-spatix-map="ID"></div>
<script src="https://spatix.io/embed.js"></script>`}</code></pre>
              </div>
            </div>
          </div>
        </section>

        {/* Examples */}
        <section id="examples" className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Examples</h2>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Multiple Points</h3>
              <CodeTabs tabs={[
                {
                  label: "Python",
                  code: `import requests

# Create a map with multiple cities
response = requests.post("https://api.spatix.io/api/map", json={
    "data": [
        [-122.4194, 37.7749],
        [-118.2437, 34.0522],
        [-73.9857, 40.7484]
    ],
    "title": "US Cities"
})

map_url = response.json()["url"]
print(f"Map: {map_url}")`,
                },
                {
                  label: "JavaScript",
                  code: `const res = await fetch("https://api.spatix.io/api/map", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    data: [
      [-122.4194, 37.7749],
      [-118.2437, 34.0522],
      [-73.9857, 40.7484]
    ],
    title: "US Cities"
  })
});

const { url } = await res.json();
console.log("Map:", url);`,
                },
              ]} />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">GeoJSON FeatureCollection</h3>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`{
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [-122.4194, 37.7749] },
        "properties": { "name": "San Francisco", "population": 873965 }
      },
      {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [-118.2437, 34.0522] },
        "properties": { "name": "Los Angeles", "population": 3898747 }
      }
    ]
  },
  "title": "California Cities"
}`}</code></pre>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-3">AI Agent — Claude Tool Use</h3>
              <p className="text-slate-600 text-sm mb-3">
                Use Spatix as a tool in your Claude-powered agent:
              </p>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm"><code>{`tools = [{
    "name": "create_map",
    "description": "Create an interactive web map from GeoJSON data",
    "input_schema": {
        "type": "object",
        "properties": {
            "data": {"type": "object", "description": "GeoJSON data"},
            "title": {"type": "string", "description": "Map title"}
        },
        "required": ["data"]
    }
}]

# In your tool handler:
def handle_create_map(data, title="Map"):
    response = requests.post("https://api.spatix.io/api/map",
        json={"data": data, "title": title})
    return response.json()["url"]`}</code></pre>
              </div>
            </div>
          </div>
        </section>

        {/* API Schema */}
        <section className="mb-16">
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-6 text-center">
            <p className="text-slate-700 mb-2">
              Full OpenAPI schema available at:
            </p>
            <code className="text-brand-600 text-sm">GET https://api.spatix.io/api/map/schema</code>
            <p className="text-slate-500 text-sm mt-3">
              Auto-generated API docs: <a href="https://api.spatix.io/docs" target="_blank" className="text-brand-600 hover:underline">api.spatix.io/docs</a>
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>&copy; 2026 Spatix. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/developers" className="hover:text-slate-700">API</Link>
            <Link href="/maps" className="hover:text-slate-700">Maps</Link>
            <a href="https://pypi.org/project/spatix-mcp/" target="_blank" className="hover:text-slate-700">PyPI</a>
            <a href="https://twitter.com/spatixmaps" className="hover:text-slate-700">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
