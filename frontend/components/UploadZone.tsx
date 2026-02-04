"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  file?: File | null
}

// All supported GIS file extensions
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

export default function UploadZone({ onFileSelect, file }: UploadZoneProps) {
  const [dragError, setDragError] = useState<string | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setDragError(null)
      if (rejectedFiles.length > 0) {
        setDragError("Invalid file type. Please upload a supported file.")
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
        border-2 border-dashed rounded-2xl p-10 md:p-16 cursor-pointer transition-all duration-200
        ${isDragActive && !isDragReject ? "border-brand-500 bg-brand-50 scale-[1.02]" : ""}
        ${isDragReject ? "border-red-500 bg-red-50" : ""}
        ${!isDragActive && !file ? "border-slate-300 hover:border-brand-400 bg-white shadow-sm hover:shadow-md" : ""}
        ${file ? "border-green-500 bg-green-50" : ""}
      `}
    >
      <input {...getInputProps()} />

      <div className="text-center">
        {file ? (
          <>
            <div className="text-5xl mb-4">✅</div>
            <p className="text-lg font-semibold text-slate-800">{file.name}</p>
            <p className="text-sm text-slate-500 mt-1">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <p className="text-sm text-brand-600 mt-3">Drop a new file to replace</p>
          </>
        ) : isDragActive ? (
          <>
            <div className="text-5xl mb-4">📥</div>
            <p className="text-xl text-brand-600 font-medium">Drop your file here...</p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">📂</div>
            <p className="text-xl text-slate-700 mb-3 font-medium">
              Drop your file here, or click to browse
            </p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              GeoJSON, Shapefile (.zip), KML, KMZ, GPX, GeoPackage, CSV, DXF, and more
            </p>
          </>
        )}

        {dragError && <p className="text-sm text-red-600 mt-4">{dragError}</p>}
      </div>
    </div>
  )
}
