import React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '../providers/query-provider'
import { ThemeProvider } from '../providers/theme-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'VibeKit Telemetry Dashboard',
  description: 'Real-time monitoring and analytics for VibeKit telemetry data',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <QueryProvider>
            <div className="min-h-screen bg-background">
              {children}
            </div>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
} 