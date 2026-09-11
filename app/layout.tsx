import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = { title: 'D.I.M.E.', description: 'Destroya Industries Mining Extension', viewport: 'width=device-width, initial-scale=1, viewport-fit=cover', themeColor: '#05080d' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<Script src="https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js" strategy="beforeInteractive" /></body></html>
}
