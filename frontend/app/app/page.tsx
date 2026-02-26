'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api/auth'

export default function AppPage() {
  const router = useRouter()

  useEffect(() => {
    const id = setTimeout(() => {
      const user = authApi.getCurrentUser()
      if (!user) {
        router.push('/login')
      } else if (user.role === 'admin') {
        router.push('/app/admin/dashboard')
      } else if (user.role === 'management') {
        router.push('/app/management/dashboard')
      } else {
        router.push('/app/teacher/dashboard')
      }
    }, 0)
    return () => clearTimeout(id)
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="text-lg">Redirecting...</div>
      </div>
    </div>
  )
}

