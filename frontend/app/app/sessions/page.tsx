'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi, SessionStatus } from '@/lib/api/sessions'
import { apiClient } from '@/lib/api/client'
import Link from 'next/link'
import { Video, Plus } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { formatSessionStatus, formatSessionType } from '@/lib/utils'
import { useState } from 'react'
import { Select } from '@/components/ui/select'

interface Classroom {
  id: number
  name: string
}

export default function SessionsPage() {
  const user = authApi.getCurrentUser()
  const [status, setStatus] = useState<SessionStatus | undefined>()
  const [classroomId, setClassroomId] = useState<number | ''>('')

  const { data: classrooms = [] } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => {
      const res = await apiClient.get<Classroom[]>('/classrooms')
      return res.data
    },
  })

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', status, classroomId],
    queryFn: () =>
      sessionsApi.list({
        status,
        limit: 50,
        ...(classroomId !== '' && { classroom_id: Number(classroomId) }),
      }),
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

      <div className="flex flex-wrap gap-4">
        <Select
          value={status || ''}
          onChange={(e) => setStatus(e.target.value as SessionStatus | undefined)}
        >
          <option value="">All Statuses</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
        </Select>
        <Select
          value={classroomId === '' ? '' : String(classroomId)}
          onChange={(e) => setClassroomId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">All Classes</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
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
                            <Badge variant="default" className="bg-green-500">LIVE</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatSessionType(session.session_type)} • {formatSessionStatus(session.status)}
                          {(session.classroom_id != null || session.classroom) && (
                            <> • Class: {session.classroom?.name ?? `#${session.classroom_id}`}</>
                          )}
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

