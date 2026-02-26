'use client'

import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useMutation, useQuery } from '@tanstack/react-query'
import { sessionsApi, SessionCreate } from '@/lib/api/sessions'
import { apiClient } from '@/lib/api/client'
import { authApi } from '@/lib/api/auth'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

interface Mapping {
  id: number
  classroom_id: number
  subject_id: number
  teacher_id: number
  classroom?: { id: number; name: string }
  subject?: { id: number; name: string }
  teacher?: { id: number; full_name: string; email?: string }
}

export default function NewSessionPage() {
  const router = useRouter()
  const user = authApi.getCurrentUser()
  const [selectedMappingId, setSelectedMappingId] = useState<number | ''>('')
  const [formData, setFormData] = useState<SessionCreate>({
    title: '',
    description: '',
    session_type: 'recorded',
    stream_source: '',
    stream_url: '',
  })
  const [file, setFile] = useState<File | null>(null)

  const { data: mappings = [] } = useQuery({
    queryKey: ['mappings'],
    queryFn: async () => {
      const res = await apiClient.get<Mapping[]>('/mappings')
      return res.data
    },
  })

  const mappingsForUser = useMemo(() => {
    if (!user) return []
    if (user.role === 'teacher') {
      return mappings.filter((m) => m.teacher_id === user.id)
    }
    return mappings
  }, [mappings, user])

  const selectedMapping = selectedMappingId
    ? mappingsForUser.find((m) => m.id === Number(selectedMappingId))
    : null

  const createMutation = useMutation({
    mutationFn: async (
      data:
        | SessionCreate
        | { file: File; title: string; description?: string; mapping_id?: number }
    ) => {
      if ('file' in data) {
        return sessionsApi.upload(
          data.file,
          data.title,
          data.description,
          undefined,
          undefined,
          data.mapping_id
        )
      } else {
        return sessionsApi.create(data as SessionCreate)
      }
    },
    onSuccess: (session) => {
      router.push(`/app/sessions/${session.id}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMapping || !file) return
    createMutation.mutate({
      file,
      title: formData.title,
      description: formData.description,
      mapping_id: selectedMapping.id,
    })
  }

  const canSubmit = !!selectedMapping && !!file && formData.title.trim()

  return (
    <RoleGuard allowedRoles={['teacher', 'admin', 'management']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">New Session</h1>
          <p className="text-muted-foreground">Create a new recorded session. Select mapping is required.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Session</CardTitle>
            <CardDescription>Choose mapping (class–subject–teacher), then upload a recorded video</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mapping-recorded">Class – Subject – Teacher (required)</Label>
                <Select
                  id="mapping-recorded"
                  value={selectedMappingId}
                  onChange={(e) => setSelectedMappingId(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                >
                  <option value="">Select mapping</option>
                  {mappingsForUser.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.classroom?.name ?? `Class ${m.classroom_id}`} – {m.subject?.name ?? `Subject ${m.subject_id}`}
                      {m.teacher?.full_name && ` (${m.teacher.full_name})`}
                    </option>
                  ))}
                </Select>
                {user?.role === 'teacher' && mappingsForUser.length === 0 && (
                  <p className="text-sm text-muted-foreground">No classes assigned. Ask admin to add a mapping.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Video File</Label>
                <Input
                  id="file"
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
              {createMutation.isError && (
                <div className="rounded-md bg-destructive/10 text-destructive text-sm p-3">
                  {(() => {
                    const err = createMutation.error as { response?: { data?: { detail?: string | string[] } } } | null
                    const detail = err?.response?.data?.detail
                    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.join(' ') : null
                    return msg || 'Upload failed.'
                  })()}
                </div>
              )}
              <Button type="submit" disabled={createMutation.isPending || !canSubmit}>
                {createMutation.isPending ? 'Uploading...' : 'Upload & Process'}
              </Button>
              {!selectedMapping && (file || formData.title) && (
                <p className="text-sm text-destructive">Please select a class–subject–teacher mapping.</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  )
}
