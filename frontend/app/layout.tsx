import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Spatix - Maps in seconds. No GIS skills needed.",
  description: "Drop any file → instant beautiful map → style → share. The easiest way to create and share maps.",
  keywords: ["maps", "GIS", "geojson", "mapping", "visualization", "data visualization"],
  authors: [{ name: "Spatix" }],
  openGraph: {
    title: "Spatix - Maps in seconds",
    description: "Drop any file → instant beautiful map → style → share",
    url: "https://spatix.io",
    siteName: "Spatix",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spatix - Maps in seconds",
    description: "Drop any file → instant beautiful map → style → share",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
