import { apiClient } from './client'

export interface SessionMetric {
  id: number
  session_id: number
  minute_index: number
  timestamp: string
  total_detections: number
  attentive_count: number
  inactive_count: number
  mobile_use_count: number
  other_behaviors: number
  attentive_ratio: number
  inactive_ratio: number
  mobile_use_ratio: number
  engagement_score: number
  detections?: any[]
  created_at?: string
}

export interface KeyMoment {
  id: number
  session_id: number
  moment_type: 'engagement_drop' | 'mobile_use_spike' | 'high_engagement' | 'attention_shift'
  minute_index: number
  timestamp: string
  severity: 'low' | 'medium' | 'high'
  engagement_score_before?: number
  engagement_score_after?: number
  engagement_score_delta?: number
  mobile_use_ratio?: number
  metadata?: Record<string, any>
  created_at?: string
}

export interface SessionSummary {
  id: number
  session_id: number
  total_minutes: number
  avg_engagement_score: number
  max_engagement_score: number
  min_engagement_score: number
  avg_attentive_ratio: number
  avg_inactive_ratio: number
  avg_mobile_use_ratio: number
  total_key_moments: number
  engagement_drops_count: number
  mobile_use_spikes_count: number
  high_engagement_count: number
  timeline?: Array<{
    minute: number
    engagement_score: number
    attentive_ratio: number
    inactive_ratio: number
    mobile_use_ratio: number
  }>
  processing_completed_at?: string
  created_at?: string
  updated_at?: string
}

export const analyticsApi = {
  getMetrics: async (
    sessionId: number,
    params?: { minute_index?: number; limit?: number }
  ): Promise<SessionMetric[]> => {
    try {
      const response = await apiClient.get<SessionMetric[]>(
        `/analytics/sessions/${sessionId}/metrics`,
        { params }
      )
      return response.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) return []
      throw err
    }
  },

  getSummary: async (sessionId: number): Promise<SessionSummary | null> => {
    try {
      const response = await apiClient.get<SessionSummary>(
        `/analytics/sessions/${sessionId}/summary`
      )
      return response.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) return null
      throw err
    }
  },

  getKeyMoments: async (
    sessionId: number,
    params?: { moment_type?: string; severity?: string }
  ): Promise<KeyMoment[]> => {
    try {
      const response = await apiClient.get<KeyMoment[]>(
        `/analytics/sessions/${sessionId}/key-moments`,
        { params }
      )
      return response.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        return []
      }
      throw err
    }
  },

  /** Subject-wise interaction (aggregate by subject) */
  getDashboardSubjects: async (params?: {
    subject_id?: number
    from_date?: string
    to_date?: string
    limit?: number
  }): Promise<SubjectInteraction[]> => {
    try {
      const response = await apiClient.get<SubjectInteraction[]>('/analytics/dashboard/subjects', { params })
      return response.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) return []
      throw err
    }
  },

  /** Teacher-wise interaction */
  getDashboardTeachers: async (params?: {
    teacher_id?: number
    classroom_id?: number
    from_date?: string
    to_date?: string
    limit?: number
  }): Promise<TeacherInteraction[]> => {
    try {
      const response = await apiClient.get<TeacherInteraction[]>('/analytics/dashboard/teachers', { params })
      return response.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) return []
      throw err
    }
  },

  /** Per-student interaction */
  getDashboardStudents: async (params?: {
    session_id?: number
    classroom_id?: number
    teacher_id?: number
    from_date?: string
    to_date?: string
    limit?: number
  }): Promise<StudentInteraction[]> => {
    try {
      const response = await apiClient.get<StudentInteraction[]>('/analytics/dashboard/students', { params })
      return response.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) return []
      throw err
    }
  },
}

export interface SubjectInteraction {
  subject_id: number
  subject_name: string
  sessions_count: number
  avg_engagement_score: number
  avg_active_ratio: number
  avg_inactive_ratio: number
  total_minutes: number
}

export interface TeacherInteraction {
  teacher_id: number
  teacher_name: string
  sessions_count: number
  avg_engagement_score: number
  avg_active_ratio: number
  avg_inactive_ratio: number
  total_minutes: number
}

export interface StudentInteraction {
  student_name: string
  session_id: number | null
  classroom_id: number | null
  teacher_id: number | null
  active_ratio: number
  inactive_ratio: number
  engagement_score: number
  total_duration_sec: number
  behaviors_breakdown?: Record<string, number>
}

