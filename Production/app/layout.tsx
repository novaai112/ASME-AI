import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { NovaAuthGate } from "@/components/auth/nova-auth-gate"
import "katex/dist/katex.min.css"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ASME Interpreter",
  description: "Research ASME BPVC Section VIII with cited sources, document uploads, and AI-assisted engineering analysis.",
  icons: {
    icon: "/favicon.jpg",
    apple: "/favicon.jpg",
  },
}

export const viewport: Viewport = {
  themeColor: "#fafaf9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <NovaAuthGate>{children}</NovaAuthGate>
      </body>
    </html>
  )
}
