'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi } from '@/lib/api/sessions'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { Plus, Video } from 'lucide-react'
import { formatSessionStatus, formatSessionType } from '@/lib/utils'

export default function TeacherDashboardPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', 'teacher'],
    queryFn: () => sessionsApi.list({ limit: 10 }),
  })

  return (
    <RoleGuard allowedRoles={['teacher', 'admin', 'management']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
            <p className="text-muted-foreground">Manage your sessions</p>
          </div>
          <Link href="/app/teacher/sessions/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              My Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {sessions?.items.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No sessions yet</p>
                    <Link href="/app/teacher/sessions/new">
                      <Button>Create Your First Session</Button>
                    </Link>
                  </div>
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

