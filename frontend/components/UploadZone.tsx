"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  file?: File | null
}

const ACCEPT = {
  "application/zip": [".zip"],
  "application/json": [".json", ".geojson"],
  "application/vnd.google-earth.kml+xml": [".kml"],
  "application/vnd.google-earth.kmz": [".kmz"],
  "application/gpx+xml": [".gpx"],
  "application/gml+xml": [".gml"],
  "application/geopackage+sqlite3": [".gpkg"],
  "application/dxf": [".dxf"],
  "text/csv": [".csv"],
  "application/x-sqlite3": [".sqlite", ".db"],
  "application/octet-stream": [".shp", ".tab", ".mif", ".mid", ".fgb", ".topojson"],
}

const formatLabels = [
  { ext: "GeoJSON", color: "bg-blue-100 text-blue-700" },
  { ext: "Shapefile", color: "bg-green-100 text-green-700" },
  { ext: "KML", color: "bg-amber-100 text-amber-700" },
  { ext: "CSV", color: "bg-violet-100 text-violet-700" },
  { ext: "GPX", color: "bg-rose-100 text-rose-700" },
]

export default function UploadZone({ onFileSelect, file }: UploadZoneProps) {
  const [dragError, setDragError] = useState<string | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setDragError(null)
      if (rejectedFiles.length > 0) {
        setDragError("Unsupported file type")
        return
      }
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0])
      }
    },
    [onFileSelect]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    multiple: false,
  })

  return (
    <div
      {...getRootProps()}
      className={`
        relative border-2 border-dashed rounded-2xl p-8 md:p-12 cursor-pointer transition-all duration-200 overflow-hidden
        ${isDragActive && !isDragReject ? "border-brand-500 bg-brand-50 scale-[1.01]" : ""}
        ${isDragReject ? "border-red-400 bg-red-50" : ""}
        ${!isDragActive && !file ? "border-slate-200 hover:border-brand-400 bg-white hover:bg-slate-50" : ""}
        ${file ? "border-green-400 bg-green-50" : ""}
      `}
    >
      <input {...getInputProps()} />

      <div className="text-center relative z-10">
        {file ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-slate-900">{file.name}</p>
            <p className="text-sm text-slate-500 mt-1">
              {(file.size / 1024 / 1024).toFixed(2)} MB • Ready to process
            </p>
            <p className="text-sm text-brand-600 mt-4 font-medium">Drop a new file to replace</p>
          </>
        ) : isDragActive ? (
          <>
            <div className="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-xl text-brand-600 font-semibold">Drop to upload</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-100 transition-colors">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-lg text-slate-900 mb-2 font-semibold">
              Drop your file here
            </p>
            <p className="text-slate-500 mb-6">
              or <span className="text-brand-600 font-medium">browse</span> to upload
            </p>
            
            {/* Format pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {formatLabels.map((f) => (
                <span key={f.ext} className={`px-2.5 py-1 rounded-full text-xs font-medium ${f.color}`}>
                  {f.ext}
                </span>
              ))}
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                +10 more
              </span>
            </div>
          </>
        )}

        {dragError && (
          <div className="mt-4 p-3 bg-red-100 rounded-lg">
            <p className="text-sm text-red-700 font-medium">{dragError}</p>
          </div>
        )}
      </div>
    </div>
  )
}
