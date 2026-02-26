'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { Plus } from 'lucide-react'

interface Subject {
  id: number
  name: string
  code?: string
  description?: string
}

export default function AdminSubjectsPage() {
  const { data: subjects, isLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      const response = await apiClient.get<Subject[]>('/subjects')
      return response.data
    },
  })

  return (
    <RoleGuard allowedRoles={['admin', 'management']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Subjects</h1>
            <p className="text-muted-foreground">Manage subjects</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Subject
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Subjects</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {subjects?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No subjects found</p>
                ) : (
                  subjects?.map((subject) => (
                    <div key={subject.id} className="p-4 border rounded-lg">
                      <h3 className="font-semibold">{subject.name}</h3>
                      {subject.code && (
                        <p className="text-sm text-muted-foreground">Code: {subject.code}</p>
                      )}
                      {subject.description && (
                        <p className="text-sm text-muted-foreground">{subject.description}</p>
                      )}
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

