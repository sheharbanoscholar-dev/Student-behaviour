'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api/auth'

interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles: ('admin' | 'management' | 'teacher')[]
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const router = useRouter()
  const [user, setUser] = useState(authApi.getCurrentUser())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    setMounted(true)
    const currentUser = authApi.getCurrentUser()
    setUser(currentUser ?? null)

    // Defer redirect to avoid setState-during-render / SEGMENT MISMATCH
    const id = setTimeout(() => {
      if (!currentUser) {
        router.replace('/login')
        return
      }
      if (!allowedRoles.includes(currentUser.role)) {
        if (currentUser.role === 'admin') {
          router.replace('/app/admin/dashboard')
        } else if (currentUser.role === 'management') {
          router.replace('/app/management/dashboard')
        } else {
          router.replace('/app/teacher/dashboard')
        }
      }
    }, 0)
    return () => clearTimeout(id)
  }, [allowedRoles, router])

  if (!mounted || !user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

