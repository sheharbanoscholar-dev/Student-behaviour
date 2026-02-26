'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi, SessionStatus } from '@/lib/api/sessions'
import Link from 'next/link'
import { Video, Plus } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { useState } from 'react'
import { formatSessionStatus, formatSessionType } from '@/lib/utils'
import { Select } from '@/components/ui/select'

export default function SessionsPage() {
  const user = authApi.getCurrentUser()
  const [status, setStatus] = useState<SessionStatus | undefined>()

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', status],
    queryFn: () => sessionsApi.list({ status, limit: 50 }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">View all sessions</p>
        </div>
        {(user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'management') && (
          <Link href="/app/teacher/sessions/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </Link>
        )}
      </div>

      <div className="flex gap-4">
        <Select
          value={status || ''}
          onChange={(e) => setStatus(e.target.value as SessionStatus | undefined)}
        >
          <option value="">All Statuses</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            All Sessions
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
                <p className="text-center text-muted-foreground py-8">No sessions found</p>
              ) : (
                sessions?.items.map((session) => (
                  <Link
                    key={session.id}
                    href={`/app/sessions/${session.id}`}
                    className="block p-4 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{session.title}</h3>
                          {session.is_active && (
                            <Badge variant="success">LIVE</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatSessionType(session.session_type)} • {formatSessionStatus(session.status)}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {formatSessionStatus(session.status)}
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

