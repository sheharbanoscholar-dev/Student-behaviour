'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api/auth'

export default function HomePage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return

    // Defer navigation to next tick to avoid "Cannot update while rendering" / SEGMENT MISMATCH
    const id = setTimeout(() => {
      const user = authApi.getCurrentUser()
      if (!user) {
        router.replace('/login')
      } else if (user.role === 'admin') {
        router.replace('/app/admin/dashboard')
      } else if (user.role === 'management') {
        router.replace('/app/management/dashboard')
      } else {
        router.replace('/app/teacher/dashboard')
      }
    }, 0)
    return () => clearTimeout(id)
  }, [router])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="text-lg font-semibold">Redirecting...</div>
      </div>
    </div>
  )
}

