'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi } from '@/lib/api/sessions'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { Video } from 'lucide-react'
import { formatSessionStatus, formatSessionType } from '@/lib/utils'

export default function ManagementDashboardPage() {
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.list({ limit: 10 }),
    retry: false,
    refetchOnWindowFocus: false,
    throwOnError: false,
  })

  return (
    <RoleGuard allowedRoles={['management', 'admin']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Management Dashboard</h1>
          <p className="text-muted-foreground">Overview of all sessions and analytics</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Recent Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <div className="text-center text-sm text-destructive py-8">
                Failed to load sessions. Check if backend is running.
              </div>
            ) : (
              <div className="space-y-2">
                {sessions?.items.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No sessions yet</p>
                ) : (
                  sessions?.items.map((session) => (
                    <Link
                      key={session.id}
                      href={`/app/sessions/${session.id}`}
                      className="block p-4 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{session.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatSessionType(session.session_type)} • {formatSessionStatus(session.status)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  )
}

