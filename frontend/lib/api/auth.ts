import { apiClient } from './client'

export interface LoginRequest {
  email: string
  password: string
}

export interface User {
  id: number
  email: string
  full_name: string
  role: 'admin' | 'management' | 'teacher'
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data)
    if (response.data.access_token) {
      // Store token and user immediately
      localStorage.setItem('token', response.data.access_token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      // Guard: don't treat 401 as logout for a few seconds after login (avoids race)
      try {
        sessionStorage.setItem('loginTime', String(Date.now()))
      } catch {}
      
      // Verify storage
      const storedToken = localStorage.getItem('token')
      const storedUser = localStorage.getItem('user')
      console.log('[Auth] Token stored:', {
        hasToken: !!storedToken,
        tokenLength: storedToken?.length,
        hasUser: !!storedUser,
        user: storedUser ? JSON.parse(storedUser) : null
      })
      
      // Force next request to use new token by clearing any cached config
      if (apiClient.defaults.headers) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
      }
    }
    return response.data
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout')
    } catch (error) {
      // Ignore errors on logout
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      try { sessionStorage.removeItem('loginTime') } catch {}
    }
  },

  getCurrentUser: (): User | null => {
    if (typeof window === 'undefined') {
      return null
    }
    try {
      const userStr = localStorage.getItem('user')
      return userStr ? JSON.parse(userStr) : null
    } catch {
      return null
    }
  },
}

