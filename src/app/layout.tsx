import type { Metadata, Viewport } from 'next'
import './globals.css'
import { COMMAND_IDENTITY } from '@/lib/command-product'

export const metadata: Metadata = {
  title: {
    default: COMMAND_IDENTITY.name,
    template: `%s · ${COMMAND_IDENTITY.name}`,
  },
  description: COMMAND_IDENTITY.description,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0d1117',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface-0 text-neutral-200 antialiased">
        {children}
      </body>
    </html>
  )
}
