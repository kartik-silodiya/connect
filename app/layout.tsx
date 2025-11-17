import './globals.css'
import { ReactNode } from 'react'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'SocialConnect - Connect with Everyone',
  description: 'A comprehensive social media platform built with Next.js and Supabase',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}