'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { Plus, X, Trash2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { AxiosError } from 'axios'

interface Mapping {
  id: number
  classroom_id: number
  subject_id: number
  teacher_id: number
  teacher?: { id: number; full_name: string; email?: string }
}

interface Classroom {
  id: number
  name: string
  description?: string
  capacity?: number
}

interface Subject {
  id: number
  name: string
  code?: string
  description?: string
}

interface Teacher {
  id: number
  email: string
  full_name: string
  role: string
  is_active: boolean
}

interface MappingCreate {
  classroom_id: number
  subject_id: number
  teacher_id: number
}

export default function AdminMappingsPage() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState<MappingCreate>({
    classroom_id: 0,
    subject_id: 0,
    teacher_id: 0,
  })
  const [editingMapping, setEditingMapping] = useState<Mapping | null>(null)
  const [editFormData, setEditFormData] = useState<MappingCreate>({
    classroom_id: 0,
    subject_id: 0,
    teacher_id: 0,
  })
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: mappings, isLoading } = useQuery({
    queryKey: ['mappings'],
    queryFn: async () => {
      const response = await apiClient.get<Mapping[]>('/mappings')
      return response.data
    },
  })

  const { data: classrooms } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => {
      const response = await apiClient.get<Classroom[]>('/classrooms')
      return response.data
    },
  })

  const { data: subjects } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      const response = await apiClient.get<Subject[]>('/subjects')
      return response.data
    },
  })

  const { data: teachers } = useQuery({
    queryKey: ['teachers'],
    queryFn: async () => {
      const response = await apiClient.get<Teacher[]>('/users/teachers')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: MappingCreate) => {
      const response = await apiClient.post<Mapping>('/mappings', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappings'] })
      setShowCreateForm(false)
      setFormData({
        classroom_id: 0,
        subject_id: 0,
        teacher_id: 0,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: MappingCreate }) => {
      const response = await apiClient.patch<Mapping>(`/mappings/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappings'] })
      setEditingMapping(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/mappings/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappings'] })
      setDeletingId(null)
      setDeleteError(null)
    },
    onError: (err: AxiosError<{ detail?: string }>) => {
      setDeletingId(null)
      setDeleteError(err.response?.data?.detail ?? err.message ?? 'Failed to delete mapping')
    },
  })

  const handleDeleteClick = (m: Mapping) => {
    setDeleteError(null)
    const confirmed = window.confirm(
      `Are you sure you want to delete this mapping? This action cannot be undone.`
    )
    if (confirmed) {
      setDeletingId(m.id)
      deleteMutation.mutate(m.id)
    }
  }

  const handleEditClick = (m: Mapping) => {
    setEditingMapping(m)
    setEditFormData({
      classroom_id: m.classroom_id,
      subject_id: m.subject_id,
      teacher_id: m.teacher_id,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.classroom_id && formData.subject_id && formData.teacher_id) {
      createMutation.mutate(formData)
    }
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingMapping && editFormData.classroom_id && editFormData.subject_id && editFormData.teacher_id) {
      updateMutation.mutate({ id: editingMapping.id, data: editFormData })
    }
  }

  const getClassroomName = (id: number) => {
    return classrooms?.find(c => c.id === id)?.name || `Classroom ${id}`
  }

  const getSubjectName = (id: number) => {
    return subjects?.find(s => s.id === id)?.name || `Subject ${id}`
  }

  const getTeacherName = (mapping: Mapping) => {
    if (mapping.teacher?.full_name) return mapping.teacher.full_name
    return teachers?.find(t => t.id === mapping.teacher_id)?.full_name || `Teacher ${mapping.teacher_id}`
  }

  return (
    <RoleGuard allowedRoles={['admin', 'management']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Classroom-Subject Mappings</h1>
            <p className="text-muted-foreground">Manage classroom-subject relationships</p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Mapping
          </Button>
        </div>

        {showCreateForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create New Mapping</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateForm(false)
                    setFormData({
                      classroom_id: 0,
                      subject_id: 0,
                      teacher_id: 0,
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
                  <Label htmlFor="classroom_id">Classroom</Label>
                  <Select
                    id="classroom_id"
                    value={formData.classroom_id || ''}
                    onChange={(e) => setFormData({ ...formData, classroom_id: Number(e.target.value) })}
                    required
                  >
                    <option value="">Select a classroom</option>
                    {classrooms?.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject_id">Subject</Label>
                  <Select
                    id="subject_id"
                    value={formData.subject_id || ''}
                    onChange={(e) => setFormData({ ...formData, subject_id: Number(e.target.value) })}
                    required
                  >
                    <option value="">Select a subject</option>
                    {subjects?.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name} {subject.code && `(${subject.code})`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teacher_id">Teacher</Label>
                  <Select
                    id="teacher_id"
                    value={formData.teacher_id || ''}
                    onChange={(e) => setFormData({ ...formData, teacher_id: Number(e.target.value) })}
                    required
                  >
                    <option value="">Select a teacher</option>
                    {teachers?.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name} ({teacher.email})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending || !formData.classroom_id || !formData.subject_id || !formData.teacher_id}>
                    {createMutation.isPending ? 'Creating...' : 'Create Mapping'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false)
                      setFormData({
                        classroom_id: 0,
                        subject_id: 0,
                        teacher_id: 0,
                      })
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {createMutation.isError && (
                  <div className="text-sm text-destructive">
                    {(createMutation.error as AxiosError<{ detail?: string }>)?.response?.data?.detail ??
                      'Failed to create mapping. Please check the form and try again.'}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {editingMapping && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit Mapping</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setEditingMapping(null); updateMutation.reset() }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_classroom_id">Classroom</Label>
                  <Select
                    id="edit_classroom_id"
                    value={editFormData.classroom_id || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, classroom_id: Number(e.target.value) })}
                    required
                  >
                    <option value="">Select a classroom</option>
                    {classrooms?.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_subject_id">Subject</Label>
                  <Select
                    id="edit_subject_id"
                    value={editFormData.subject_id || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, subject_id: Number(e.target.value) })}
                    required
                  >
                    <option value="">Select a subject</option>
                    {subjects?.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name} {subject.code && `(${subject.code})`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_teacher_id">Teacher</Label>
                  <Select
                    id="edit_teacher_id"
                    value={editFormData.teacher_id || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, teacher_id: Number(e.target.value) })}
                    required
                  >
                    <option value="">Select a teacher</option>
                    {teachers?.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name} ({teacher.email})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={updateMutation.isPending || !editFormData.classroom_id || !editFormData.subject_id || !editFormData.teacher_id}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditingMapping(null)}>
                    Cancel
                  </Button>
                </div>
                {updateMutation.isError && (
                  <div className="text-sm text-destructive">Failed to update mapping. Please try again.</div>
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
                    <div key={mapping.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-semibold">
                          {getClassroomName(mapping.classroom_id)} → {getSubjectName(mapping.subject_id)} • {getTeacherName(mapping)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Classroom ID: {mapping.classroom_id} • Subject ID: {mapping.subject_id} • Teacher: {getTeacherName(mapping)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(mapping)}
                          disabled={!!editingMapping}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(mapping)}
                          disabled={deletingId !== null}
                          title="Delete"
                        >
                          {deletingId === mapping.id ? (
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

