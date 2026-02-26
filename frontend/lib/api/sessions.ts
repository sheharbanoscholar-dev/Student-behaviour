import { apiClient } from './client'

export type SessionType = 'live' | 'recorded'
export type SessionStatus =
  | 'pending'
  | 'pending_processing'
  | 'processing'
  | 'active'
  | 'ready'
  | 'draft'
  | 'live'
  | 'ended'
  | 'completed'
  | 'failed'

export interface Session {
  id: number
  teacher_id: number
  title: string
  description?: string
  session_type: SessionType
  stream_source?: string
  stream_url?: string
  video_path?: string
  is_active: boolean
  status: SessionStatus
  classroom_id?: number | null
  subject_id?: number | null
  mapping_id?: number | null
  started_at?: string
  ended_at?: string
  duration_seconds: number
  metadata?: Record<string, any>
  created_at?: string
  updated_at?: string
  classroom?: { id: number; name: string }
  subject?: { id: number; name: string }
  mapping?: { id: number; classroom_id: number; subject_id: number; teacher_id: number }
}

export interface SessionCreate {
  title: string
  description?: string
  session_type?: SessionType
  stream_source?: string
  stream_url?: string
  classroom_id?: number
  subject_id?: number
  mapping_id?: number
}

export interface SessionListResponse {
  items: Session[]
  total: number
  page: number
  limit: number
}

export const sessionsApi = {
  list: async (params?: {
    session_type?: SessionType
    status?: SessionStatus
    page?: number
    limit?: number
    classroom_id?: number
    teacher_id?: number
  }): Promise<SessionListResponse> => {
    const response = await apiClient.get<SessionListResponse>('/sessions', { params })
    return response.data
  },

  get: async (id: number, params?: { reingest?: boolean }): Promise<Session> => {
    const response = await apiClient.get<Session>(`/sessions/${id}`, {
      params: params?.reingest ? { reingest: '1' } : undefined,
    })
    return response.data
  },

  /** Re-import behavior data from CSV (admin/management only). Then refresh session and summary. */
  reingestFromCsv: async (id: number): Promise<Session> => {
    const response = await apiClient.get<Session>(`/sessions/${id}`, { params: { reingest: '1' } })
    return response.data
  },

  create: async (data: SessionCreate): Promise<Session> => {
    const body = {
      ...data,
      session_type: data.session_type ?? 'recorded',
      ...(data.classroom_id != null && { classroom_id: data.classroom_id }),
      ...(data.subject_id != null && { subject_id: data.subject_id }),
      ...(data.mapping_id != null && { mapping_id: data.mapping_id }),
    }
    const response = await apiClient.post<Session>('/sessions', body)
    return response.data
  },

  upload: async (file: File, title: string, description?: string, classroomId?: number, subjectId?: number, mappingId?: number): Promise<Session> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', title)
    if (description) formData.append('description', description)
    if (classroomId != null) formData.append('classroom_id', String(classroomId))
    if (subjectId != null) formData.append('subject_id', String(subjectId))
    if (mappingId != null) formData.append('mapping_id', String(mappingId))

    // Omit Content-Type so Axios/browser sets multipart/form-data with boundary (required for server to parse file)
    const response = await apiClient.post<Session>('/sessions/upload', formData, {
      headers: { 'Content-Type': undefined } as Record<string, string>,
    })
    return response.data
  },

  update: async (id: number, data: Partial<SessionCreate>): Promise<Session> => {
    const response = await apiClient.patch<Session>(`/sessions/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/sessions/${id}`)
  },

  startLive: async (id: number): Promise<Session> => {
    const response = await apiClient.post<Session>(`/sessions/${id}/start-live`)
    return response.data
  },

  stopLive: async (id: number): Promise<Session> => {
    const response = await apiClient.post<Session>(`/sessions/${id}/stop-live`)
    return response.data
  },
}

