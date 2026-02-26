'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { User } from '@/lib/api/auth'
import { Plus, Trash2, X, Pencil } from 'lucide-react'
import { useState } from 'react'
import { AxiosError } from 'axios'

interface UserCreate {
  email: string
  password: string
  full_name: string
  role: 'admin' | 'management' | 'teacher'
  is_active: boolean
}

interface UserUpdate {
  full_name: string
  role: 'admin' | 'management' | 'teacher'
  is_active: boolean
  password?: string
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState<UserCreate>({
    email: '',
    password: '',
    full_name: '',
    role: 'teacher',
    is_active: true,
  })
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editFormData, setEditFormData] = useState<UserUpdate>({
    full_name: '',
    role: 'teacher',
    is_active: true,
    password: '',
  })
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await apiClient.get<User[]>('/users')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: UserCreate) => {
      const response = await apiClient.post<User>('/users', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowCreateForm(false)
      setFormData({
        email: '',
        password: '',
        full_name: '',
        role: 'teacher',
        is_active: true,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UserUpdate }) => {
      const body: Record<string, unknown> = {
        full_name: data.full_name,
        role: data.role,
        is_active: data.is_active,
      }
      if (data.password && data.password.trim()) {
        body.password = data.password
      }
      const response = await apiClient.patch<User>(`/users/${id}`, body)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingUser(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/users/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeletingId(null)
      setDeleteError(null)
    },
    onError: (err: AxiosError<{ detail?: string }>) => {
      setDeletingId(null)
      const message = err.response?.data?.detail ?? err.message ?? 'Failed to delete user'
      setDeleteError(message)
    },
  })

  const handleDeleteClick = (user: User) => {
    setDeleteError(null)
    const confirmed = window.confirm(
      `Are you sure you want to delete "${user.full_name}" (${user.email})? This action cannot be undone.`
    )
    if (confirmed) {
      setDeletingId(user.id)
      deleteMutation.mutate(user.id)
    }
  }

  const handleEditClick = (user: User) => {
    setEditingUser(user)
    setEditFormData({
      full_name: user.full_name ?? '',
      role: user.role,
      is_active: user.is_active ?? true,
      password: '',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: editFormData })
    }
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Users</h1>
            <p className="text-muted-foreground">Manage system users</p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>

        {showCreateForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create New User</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateForm(false)
                    setFormData({
                      email: '',
                      password: '',
                      full_name: '',
                      role: 'teacher',
                      is_active: true,
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
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    placeholder="Enter password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'management' | 'teacher' })}
                    required
                  >
                    <option value="teacher">Teacher</option>
                    <option value="management">Management</option>
                    <option value="admin">Admin</option>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="is_active" className="cursor-pointer">
                    Active
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create User'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false)
                      setFormData({
                        email: '',
                        password: '',
                        full_name: '',
                        role: 'teacher',
                        is_active: true,
                      })
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {createMutation.isError && (
                  <div className="text-sm text-destructive">
                    Failed to create user. Please check the form and try again.
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {editingUser && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Edit User</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditingUser(null)
                    updateMutation.reset()
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">Editing: {editingUser.email}</p>
                <div className="space-y-2">
                  <Label htmlFor="edit_full_name">Full Name</Label>
                  <Input
                    id="edit_full_name"
                    value={editFormData.full_name}
                    onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                    required
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_role">Role</Label>
                  <Select
                    id="edit_role"
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as 'admin' | 'management' | 'teacher' })}
                    required
                  >
                    <option value="teacher">Teacher</option>
                    <option value="management">Management</option>
                    <option value="admin">Admin</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_password">New Password (leave blank to keep current)</Label>
                  <Input
                    id="edit_password"
                    type="password"
                    value={editFormData.password ?? ''}
                    onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit_is_active"
                    checked={editFormData.is_active}
                    onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="edit_is_active" className="cursor-pointer">
                    Active
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingUser(null)}
                  >
                    Cancel
                  </Button>
                </div>
                {updateMutation.isError && (
                  <div className="text-sm text-destructive">
                    Failed to update user. Please try again.
                  </div>
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
            <CardTitle>All Users</CardTitle>
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
                {users?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No users found</p>
                ) : (
                  users?.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <h3 className="font-semibold">{user.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {user.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(user)}
                          disabled={!!editingUser}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(user)}
                          disabled={deletingId !== null}
                          title="Delete"
                        >
                          {deletingId === user.id ? (
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

