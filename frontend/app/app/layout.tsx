'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { authApi } from '@/lib/api/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState(authApi.getCurrentUser())
  const [loading, setLoading] = useState(true)
  const redirectIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const timer = setTimeout(() => {
      let currentUser = authApi.getCurrentUser()
      const token = localStorage.getItem('token')

      if (token && !currentUser) {
        try {
          const userStr = localStorage.getItem('user')
          if (userStr) currentUser = JSON.parse(userStr)
        } catch {}
      }

      setUser(currentUser ?? null)
      setLoading(false)

      if (!token || !currentUser) {
        redirectIdRef.current = setTimeout(() => router.replace('/login'), 0)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      if (redirectIdRef.current) {
        clearTimeout(redirectIdRef.current)
        redirectIdRef.current = null
      }
    }
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Redirecting to login...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={user.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

