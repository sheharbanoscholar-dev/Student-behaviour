import { apiClient } from './client'

export const exportApi = {
  downloadSessionCSV: async (sessionId: number): Promise<void> => {
    const response = await apiClient.get(`/export/sessions/${sessionId}/csv`, {
      responseType: 'blob',
    })
    
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `session_${sessionId}_metrics.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}

