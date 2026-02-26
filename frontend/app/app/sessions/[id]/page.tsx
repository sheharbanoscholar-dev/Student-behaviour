'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionsApi, Session } from '@/lib/api/sessions'
import { analyticsApi, SessionSummary, SessionMetric, StudentInteraction } from '@/lib/api/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EngagementChart } from '@/components/charts/engagement-chart'
import { BehaviorChart } from '@/components/charts/behavior-chart'
import { Play, Square, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LiveSessionWebSocket, WebSocketMessage } from '@/lib/websocket'
import { authApi } from '@/lib/api/auth'
import { formatSessionStatus } from '@/lib/utils'

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const sessionId = parseInt(params.id as string)
  const [liveMetrics, setLiveMetrics] = useState<SessionMetric[]>([])
  const [ws, setWs] = useState<LiveSessionWebSocket | null>(null)

  const isProcessing = (s: Session) =>
    s.status === 'processing' || s.status === 'pending_processing'

  // Frontend usage: Poll GET /api/v1/sessions/:id. Response includes metadata: { processing_progress?: number }.
  // processing_progress is 0–100 (or undefined). When status is completed or failed, backend sends 100.
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId),
    refetchInterval: (query) => {
      const s = query.state.data as Session | undefined
      return s && isProcessing(s) ? 3000 : false
    },
  })

  const rawProgress =
    session?.metadata && typeof (session.metadata as { processing_progress?: number }).processing_progress === 'number'
      ? (session.metadata as { processing_progress: number }).processing_progress
      : undefined
  const processingProgress =
    rawProgress !== undefined
      ? Math.min(100, Math.max(0, rawProgress))
      : session?.status === 'completed' || session?.status === 'failed'
        ? 100
        : session && isProcessing(session)
          ? 0
          : null

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['session-summary', sessionId],
    queryFn: () => analyticsApi.getSummary(sessionId),
    enabled: !!session && session.status === 'completed',
  })

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['session-metrics', sessionId],
    queryFn: () => analyticsApi.getMetrics(sessionId),
    enabled: !!session && session.status === 'completed',
  })

  const { data: keyMoments } = useQuery({
    queryKey: ['key-moments', sessionId],
    queryFn: () => analyticsApi.getKeyMoments(sessionId),
    enabled: !!session,
  })

  const { data: sessionStudents = [] } = useQuery({
    queryKey: ['session-students', sessionId],
    queryFn: () => analyticsApi.getDashboardStudents({ session_id: sessionId, limit: 100 }),
    enabled: !!session && session.status === 'completed',
  })

  const startLiveMutation = useMutation({
    mutationFn: () => sessionsApi.startLive(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    },
  })

  const stopLiveMutation = useMutation({
    mutationFn: () => sessionsApi.stopLive(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      if (ws) {
        ws.disconnect()
        setWs(null)
      }
    },
  })

  // WebSocket connection for live sessions
  useEffect(() => {
    if (session?.session_type === 'live' && session.status === 'active' && session.is_active) {
      const token = localStorage.getItem('token')
      if (token && !ws) {
        try {
          const websocket = new LiveSessionWebSocket(sessionId, token, (message: WebSocketMessage) => {
            if (message.type === 'minute_metric') {
              setLiveMetrics((prev) => {
                // Avoid duplicates
                const exists = prev.some((m) => m.minute_index === message.data.minute_index)
                if (exists) return prev
                return [...prev, message.data]
              })
            } else if (message.type === 'key_moment') {
              // Refresh key moments when new one arrives
              queryClient.invalidateQueries({ queryKey: ['key-moments', sessionId] })
            }
          })
          websocket.connect()
          setWs(websocket)
        } catch (error) {
          console.error('WebSocket connection error:', error)
        }

        return () => {
          if (ws) {
            ws.disconnect()
            setWs(null)
          }
        }
      }
    } else if (ws) {
      // Disconnect if session is no longer active
      ws.disconnect()
      setWs(null)
    }
  }, [session, sessionId, queryClient, ws])

  const handleStartLive = () => {
    startLiveMutation.mutate()
  }

  const handleStopLive = () => {
    stopLiveMutation.mutate()
  }

  const displayMetrics = session?.session_type === 'live' && session.is_active
    ? liveMetrics
    : metrics || []

  const chartData = summary?.timeline || displayMetrics.map((m, idx) => ({
    minute: idx,
    engagement_score: m.engagement_score,
    attentive_ratio: m.attentive_ratio,
    inactive_ratio: m.inactive_ratio,
    mobile_use_ratio: m.mobile_use_ratio,
  }))

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="space-y-6">
        <p>Session not found</p>
        <Link href="/app/sessions">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sessions
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/app/sessions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{session.title}</h1>
            <p className="text-muted-foreground">{session.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.is_active && <Badge variant="default" className="bg-green-500">LIVE</Badge>}
          <Badge variant="secondary">
            {formatSessionStatus(session.status)}
          </Badge>
          {session.session_type === 'live' && (
            <>
              {session.status === 'active' && session.is_active ? (
                <Button variant="destructive" onClick={handleStopLive} disabled={stopLiveMutation.isPending}>
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button onClick={handleStartLive} disabled={startLiveMutation.isPending}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Live
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Engagement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.avg_engagement_score.toFixed(1)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Minutes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_minutes}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Key Moments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_key_moments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Engagement Drops</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.engagement_drops_count}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Engagement Score Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <EngagementChart data={chartData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Behavior Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <BehaviorChart data={chartData} />
            </CardContent>
          </Card>

          {/* Session interaction: overall class engagement + per-student */}
          <Card>
            <CardHeader>
              <CardTitle>Session interaction</CardTitle>
              <p className="text-sm text-muted-foreground">
                Overall class engagement and per-student interaction for this session.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Overall class engagement</p>
                  <p className="text-3xl font-bold">
                    {(summary.avg_engagement_score * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Class is {(summary.avg_engagement_score >= 0.6 ? 'engaging' : summary.avg_engagement_score >= 0.4 ? 'moderately engaging' : 'low engagement')} in this session.
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Per-student interaction</p>
                {sessionStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No per-student data for this session yet.</p>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">Student</th>
                          <th className="text-right p-3 font-medium">Engagement</th>
                          <th className="text-right p-3 font-medium">Active</th>
                          <th className="text-right p-3 font-medium">Inactive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionStudents.map((row: StudentInteraction, idx: number) => (
                          <tr key={`${row.student_name}-${idx}`} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{row.student_name}</td>
                            <td className="p-3 text-right">{(row.engagement_score * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right">{(row.active_ratio * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right">{(row.inactive_ratio * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {keyMoments && keyMoments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Key Moments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {keyMoments.map((moment) => (
                <div key={moment.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold capitalize">{moment.moment_type.replace('_', ' ')}</h3>
                      <p className="text-sm text-muted-foreground">
                        Minute {moment.minute_index} • {moment.severity} severity
                      </p>
                    </div>
                    <Badge variant={moment.severity === 'high' ? 'destructive' : 'secondary'}>
                      {moment.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!summary && session.status !== 'completed' && (
        <Card>
          <CardContent className="py-8">
            <div className="mx-auto max-w-md space-y-4 text-center">
              <p className="text-muted-foreground">
                {session.status === 'failed'
                  ? 'Processing failed'
                  : isProcessing(session)
                    ? 'Processing video...'
                    : 'Session not yet processed'}
              </p>
              {(isProcessing(session) || session.status === 'failed') && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {processingProgress != null
                        ? `${processingProgress}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={
                        processingProgress != null
                          ? 'h-full rounded-full bg-primary transition-[width] duration-500'
                          : 'h-full w-full animate-pulse rounded-full bg-primary/60'
                      }
                      style={
                        processingProgress != null
                          ? { width: `${processingProgress}%` }
                          : undefined
                      }
                    />
                  </div>
                  {processingProgress == null && (
                    <p className="text-xs text-muted-foreground">
                      This may take a few minutes. This page will update automatically.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

