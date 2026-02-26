'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi } from '@/lib/api/sessions'
import { apiClient } from '@/lib/api/client'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { formatSessionStatus, formatSessionType } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Video, Users, BookOpen, GraduationCap } from 'lucide-react'

export default function AdminDashboardPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.list({ limit: 10 }),
  })

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await apiClient.get<unknown[]>('/users', { params: { limit: 500 } })
      return res.data
    },
  })

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      const res = await apiClient.get<unknown[]>('/subjects', { params: { limit: 500 } })
      return res.data
    },
  })

  const { data: classrooms = [], isLoading: classroomsLoading } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => {
      const res = await apiClient.get<unknown[]>('/classrooms', { params: { limit: 500 } })
      return res.data
    },
  })

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of the system</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{sessions?.total || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <Link href="/app/admin/users">
                  <Button variant="link" className="p-0 h-auto">
                    <div className="text-2xl font-bold">{users.length}</div>
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Classrooms</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {classroomsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <Link href="/app/admin/classrooms">
                  <Button variant="link" className="p-0 h-auto">
                    <div className="text-2xl font-bold">{classrooms.length}</div>
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Subjects</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {subjectsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <Link href="/app/admin/subjects">
                  <Button variant="link" className="p-0 h-auto">
                    <div className="text-2xl font-bold">{subjects.length}</div>
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
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

