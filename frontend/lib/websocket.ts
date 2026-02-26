export type WebSocketMessageType = 'minute_metric' | 'key_moment' | 'status' | 'ping'

export interface WebSocketMessage {
  type: WebSocketMessageType
  session_id: number
  data?: any
  status?: string
}

export class LiveSessionWebSocket {
  private ws: WebSocket | null = null
  private sessionId: number
  private token: string
  private onMessage: (message: WebSocketMessage) => void
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  constructor(
    sessionId: number,
    token: string,
    onMessage: (message: WebSocketMessage) => void
  ) {
    this.sessionId = sessionId
    this.token = token
    this.onMessage = onMessage
  }

  connect(): void {
    // Use window location for WebSocket URL in browser
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = process.env.NEXT_PUBLIC_WS_URL?.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '') || 
                 window.location.hostname + ':8000'
    const url = `${protocol}//${host}/ws/live/${this.sessionId}?token=${this.token}`

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
        this.ws?.send(JSON.stringify({ action: 'subscribe', session_id: this.sessionId }))
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          this.onMessage(message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.reconnect()
      }
    } catch (error) {
      console.error('Error creating WebSocket:', error)
      this.reconnect()
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        this.connect()
      }, 1000 * this.reconnectAttempts)
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.send(JSON.stringify({ action: 'unsubscribe', session_id: this.sessionId }))
      this.ws.close()
      this.ws = null
    }
  }

  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }
}

