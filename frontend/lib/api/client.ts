import axios from 'axios'

// Ensure we always have port 5000 so requests don't go to port 80 (e.g. NEXT_PUBLIC_API_URL=http://127.0.0.1)
const raw = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000').replace(/:$/, '')
const API_URL = /:\d+$/.test(raw) ? raw : `${raw}:5000`

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    // List of endpoints that don't require authentication
    const publicEndpoints = ['/auth/login', '/auth/refresh', '/health']
    const isPublicEndpoint = publicEndpoints.some(endpoint => config.url?.includes(endpoint))
    
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      // Debug: Log token being sent (first 20 chars only) for protected endpoints
      if (!isPublicEndpoint) {
        console.log(`[API] Sending request to ${config.url} with token: ${token.substring(0, 20)}...`)
      }
    } else {
      // Only warn if it's a protected endpoint
      if (!isPublicEndpoint) {
        console.warn(`[API] No token found for request to ${config.url}`)
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[API] Success response from ${response.config.url}: ${response.status}`)
    return response
  },
  (error) => {
    // Log error details (skip noisy 404 for key-moments - frontend treats as empty list)
    if (error.response) {
      const url = error.config?.url ?? ''
      const isKeyMoments404 = url.includes('key-moments') && error.response.status === 404
      const data = error.response.data as { debug_reason?: string; detail?: string; code?: string }
      if (!isKeyMoments404) {
        console.error(`[API] Error response from ${url}:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        })
      }
      if (data?.debug_reason) {
        console.error(`[API] 401 debug_reason from backend: ${data.debug_reason}`)
      }
      if (data?.detail && error.response.status === 500) {
        console.error(`[API] 500 detail from backend:`, data.detail)
      }
    } else {
      console.error('[API] Network error:', error.message)
    }
    
    // Only redirect on 401 if we have a token AND it's not a network error
    if (error.response?.status === 401) {
      const token = localStorage.getItem('token')
      // Don't redirect right after login (avoids race where a request gets 401 before token is fully accepted)
      let justLoggedIn = false
      try {
        const loginTime = sessionStorage.getItem('loginTime')
        if (loginTime) {
          const elapsed = Date.now() - Number(loginTime)
          if (elapsed < 5000) justLoggedIn = true
          if (elapsed > 10000) sessionStorage.removeItem('loginTime')
        }
      } catch {}
      if (justLoggedIn) {
        console.warn('[API] 401 right after login - skipping redirect to avoid false logout')
        return Promise.reject(error)
      }
      // Check if it's a network error (no response) - don't redirect
      if (!error.response) {
        console.error('[API] Network error - backend might be down:', error.message)
        return Promise.reject(error)
      }
      
      // Log 401 details
      console.error('[API] 401 Unauthorized - Token validation failed', {
        hasToken: !!token,
        errorDetail: error.response.data,
        url: error.config?.url
      })
      
      // Only redirect if token exists and we got a proper 401 response
      if (token && error.response.status === 401) {
        console.warn('[API] Token invalid or expired - redirecting to login')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.location.href = '/login'
          }, 100)
        }
      }
    }
    return Promise.reject(error)
  }
)

