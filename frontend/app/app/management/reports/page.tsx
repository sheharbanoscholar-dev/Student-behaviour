'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi } from '@/lib/api/sessions'
import { Skeleton } from '@/components/ui/skeleton'
import { exportApi } from '@/lib/api/export'
import { Download, Video } from 'lucide-react'
import Link from 'next/link'
import { formatSessionStatus, formatSessionType } from '@/lib/utils'

export default function ManagementReportsPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', 'all'],
    queryFn: () => sessionsApi.list({ limit: 100 }),
  })

  const handleExport = async (sessionId: number) => {
    try {
      await exportApi.downloadSessionCSV(sessionId)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Failed to export CSV')
    }
  }

  return (
    <RoleGuard allowedRoles={['management', 'admin']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Export session analytics as CSV</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Sessions Available for Export
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
                  <p className="text-center text-muted-foreground py-8">No sessions available</p>
                ) : (
                  sessions?.items
                    .filter((s) => s.status === 'completed')
                    .map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <Link
                            href={`/app/sessions/${session.id}`}
                            className="font-semibold hover:underline"
                          >
                            {session.title}
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            {formatSessionType(session.session_type)} • {formatSessionStatus(session.status)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExport(session.id)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
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

