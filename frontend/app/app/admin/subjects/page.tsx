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

interface Subject {
  id: number
  name: string
  code?: string
  description?: string
}

interface SubjectCreate {
  name: string
  code?: string
  description?: string
}

export default function AdminSubjectsPage() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState<SubjectCreate>({
    name: '',
    code: '',
    description: '',
  })
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [editFormData, setEditFormData] = useState<SubjectCreate>({
    name: '',
    code: '',
    description: '',
  })
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      const response = await apiClient.get<Subject[]>('/subjects')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: SubjectCreate) => {
      const response = await apiClient.post<Subject>('/subjects', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setShowCreateForm(false)
      setFormData({
        name: '',
        code: '',
        description: '',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: SubjectCreate }) => {
      const body = { name: data.name, description: data.description ?? null }
      const response = await apiClient.patch<Subject>(`/subjects/${id}`, body)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setEditingSubject(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/subjects/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setDeletingId(null)
      setDeleteError(null)
    },
    onError: (err: AxiosError<{ detail?: string }>) => {
      setDeletingId(null)
      setDeleteError(err.response?.data?.detail ?? err.message ?? 'Failed to delete subject')
    },
  })

  const handleDeleteClick = (s: Subject) => {
    setDeleteError(null)
    const confirmed = window.confirm(
      `Are you sure you want to delete "${s.name}"? This action cannot be undone.`
    )
    if (confirmed) {
      setDeletingId(s.id)
      deleteMutation.mutate(s.id)
    }
  }

  const handleEditClick = (s: Subject) => {
    setEditingSubject(s)
    setEditFormData({
      name: s.name,
      code: s.code ?? '',
      description: s.description ?? '',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitData: SubjectCreate = {
      name: formData.name,
      code: formData.code || undefined,
      description: formData.description || undefined,
    }
    createMutation.mutate(submitData)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingSubject) {
      updateMutation.mutate({
        id: editingSubject.id,
        data: {
          name: editFormData.name,
          code: editFormData.code || undefined,
          description: editFormData.description || undefined,
        },
      })
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'management']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Subjects</h1>
            <p className="text-muted-foreground">Manage subjects</p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Subject
          </Button>
        </div>

        {showCreateForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create New Subject</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateForm(false)
                    setFormData({
                      name: '',
                      code: '',
                      description: '',
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
                  <Label htmlFor="name">Subject Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Mathematics"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Subject Code (Optional)</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g., MATH101"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Subject description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Subject'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false)
                      setFormData({
                        name: '',
                        code: '',
                        description: '',
                      })
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {createMutation.isError && (
                  <div className="text-sm text-destructive">
                    Failed to create subject. Please check the form and try again.
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {editingSubject && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit Subject</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setEditingSubject(null); updateMutation.reset() }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_name">Subject Name</Label>
                  <Input
                    id="edit_name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    required
                    placeholder="e.g., Mathematics"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_description">Description (Optional)</Label>
                  <Input
                    id="edit_description"
                    value={editFormData.description ?? ''}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    placeholder="Subject description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditingSubject(null)}>
                    Cancel
                  </Button>
                </div>
                {updateMutation.isError && (
                  <div className="text-sm text-destructive">Failed to update subject. Please try again.</div>
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
                    <div key={subject.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-semibold">{subject.name}</h3>
                        {subject.code && (
                          <p className="text-sm text-muted-foreground">Code: {subject.code}</p>
                        )}
                        {subject.description && (
                          <p className="text-sm text-muted-foreground">{subject.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(subject)}
                          disabled={!!editingSubject}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(subject)}
                          disabled={deletingId !== null}
                          title="Delete"
                        >
                          {deletingId === subject.id ? (
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

