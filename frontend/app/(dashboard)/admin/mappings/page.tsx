'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { Plus } from 'lucide-react'

interface Mapping {
  id: number
  classroom_id: number
  subject_id: number
}

export default function AdminMappingsPage() {
  const { data: mappings, isLoading } = useQuery({
    queryKey: ['mappings'],
    queryFn: async () => {
      const response = await apiClient.get<Mapping[]>('/mappings')
      return response.data
    },
  })

  return (
    <RoleGuard allowedRoles={['admin', 'management']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Classroom-Subject Mappings</h1>
            <p className="text-muted-foreground">Manage classroom-subject relationships</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Mapping
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Mappings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {mappings?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No mappings found</p>
                ) : (
                  mappings?.map((mapping) => (
                    <div key={mapping.id} className="p-4 border rounded-lg">
                      <p className="text-sm">
                        Classroom ID: {mapping.classroom_id} → Subject ID: {mapping.subject_id}
                      </p>
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

