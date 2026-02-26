'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { Plus } from 'lucide-react'

interface Classroom {
  id: number
  name: string
  description?: string
  capacity?: number
}

export default function AdminClassroomsPage() {
  const { data: classrooms, isLoading } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => {
      const response = await apiClient.get<Classroom[]>('/classrooms')
      return response.data
    },
  })

  return (
    <RoleGuard allowedRoles={['admin', 'management']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Classrooms</h1>
            <p className="text-muted-foreground">Manage classrooms</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Classroom
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Classrooms</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {classrooms?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No classrooms found</p>
                ) : (
                  classrooms?.map((classroom) => (
                    <div
                      key={classroom.id}
                      className="p-4 border rounded-lg"
                    >
                      <h3 className="font-semibold">{classroom.name}</h3>
                      {classroom.description && (
                        <p className="text-sm text-muted-foreground">{classroom.description}</p>
                      )}
                      {classroom.capacity && (
                        <p className="text-sm text-muted-foreground">Capacity: {classroom.capacity}</p>
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

