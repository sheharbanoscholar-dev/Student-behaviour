'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { Plus, X, Trash2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { AxiosError } from 'axios'

interface Classroom {
  id: number
  name: string
  description?: string
  capacity?: number
}

interface ClassroomCreate {
  name: string
  description?: string
  capacity?: number
}

export default function AdminClassroomsPage() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState<ClassroomCreate>({
    name: '',
    description: '',
    capacity: undefined,
  })
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null)
  const [editFormData, setEditFormData] = useState<ClassroomCreate>({
    name: '',
    description: '',
    capacity: undefined,
  })
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: classrooms, isLoading } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => {
      const response = await apiClient.get<Classroom[]>('/classrooms')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: ClassroomCreate) => {
      const response = await apiClient.post<Classroom>('/classrooms', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] })
      setShowCreateForm(false)
      setFormData({
        name: '',
        description: '',
        capacity: undefined,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ClassroomCreate }) => {
      const body = {
        name: data.name,
        description: data.description || null,
        capacity: data.capacity ?? null,
      }
      const response = await apiClient.patch<Classroom>(`/classrooms/${id}`, body)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] })
      setEditingClassroom(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/classrooms/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] })
      setDeletingId(null)
      setDeleteError(null)
    },
    onError: (err: AxiosError<{ detail?: string }>) => {
      setDeletingId(null)
      setDeleteError(err.response?.data?.detail ?? err.message ?? 'Failed to delete classroom')
    },
  })

  const handleDeleteClick = (c: Classroom) => {
    setDeleteError(null)
    const confirmed = window.confirm(
      `Are you sure you want to delete "${c.name}"? This action cannot be undone.`
    )
    if (confirmed) {
      setDeletingId(c.id)
      deleteMutation.mutate(c.id)
    }
  }

  const handleEditClick = (c: Classroom) => {
    setEditingClassroom(c)
    setEditFormData({
      name: c.name,
      description: c.description ?? '',
      capacity: c.capacity,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitData: ClassroomCreate = {
      name: formData.name,
      description: formData.description || undefined,
      capacity: formData.capacity ? Number(formData.capacity) : undefined,
    }
    createMutation.mutate(submitData)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingClassroom) {
      const submitData: ClassroomCreate = {
        name: editFormData.name,
        description: editFormData.description || undefined,
        capacity: editFormData.capacity ? Number(editFormData.capacity) : undefined,
      }
      updateMutation.mutate({ id: editingClassroom.id, data: submitData })
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'management']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Classrooms</h1>
            <p className="text-muted-foreground">Manage classrooms</p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Classroom
          </Button>
        </div>

        {showCreateForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create New Classroom</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateForm(false)
                    setFormData({
                      name: '',
                      description: '',
                      capacity: undefined,
                    })
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Classroom Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Room 101"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Classroom description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity (Optional)</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min="1"
                    value={formData.capacity || ''}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="e.g., 30"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Classroom'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false)
                      setFormData({
                        name: '',
                        description: '',
                        capacity: undefined,
                      })
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {createMutation.isError && (
                  <div className="text-sm text-destructive">
                    Failed to create classroom. Please check the form and try again.
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {editingClassroom && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit Classroom</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setEditingClassroom(null); updateMutation.reset() }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_name">Classroom Name</Label>
                  <Input
                    id="edit_name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    required
                    placeholder="e.g., Room 101"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_description">Description (Optional)</Label>
                  <Input
                    id="edit_description"
                    value={editFormData.description ?? ''}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    placeholder="Classroom description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_capacity">Capacity (Optional)</Label>
                  <Input
                    id="edit_capacity"
                    type="number"
                    min="1"
                    value={editFormData.capacity ?? ''}
                    onChange={(e) => setEditFormData({ ...editFormData, capacity: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="e.g., 30"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditingClassroom(null)}>
                    Cancel
                  </Button>
                </div>
                {updateMutation.isError && (
                  <div className="text-sm text-destructive">Failed to update classroom. Please try again.</div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {deleteError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {deleteError}
          </div>
        )}

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
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <h3 className="font-semibold">{classroom.name}</h3>
                        {classroom.description && (
                          <p className="text-sm text-muted-foreground">{classroom.description}</p>
                        )}
                        {classroom.capacity != null && (
                          <p className="text-sm text-muted-foreground">Capacity: {classroom.capacity}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(classroom)}
                          disabled={!!editingClassroom}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(classroom)}
                          disabled={deletingId !== null}
                          title="Delete"
                        >
                          {deletingId === classroom.id ? (
                            <span className="text-xs">...</span>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
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

