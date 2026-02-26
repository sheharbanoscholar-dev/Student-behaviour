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
import { Play, Square, ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
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
  const wsRef = useRef<LiveSessionWebSocket | null>(null)

  const isProcessing = (s: Session) =>
    s.status === 'processing' || s.status === 'pending_processing'

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const s = await sessionsApi.get(sessionId)
      // Log session response when processing so we can verify metadata.processing_progress from API
      if (s && isProcessing(s)) {
        const progress = (s.metadata as { processing_progress?: number } | undefined)?.processing_progress
        console.log('[Session] poll session', sessionId, 'status=', s.status, 'metadata=', s.metadata, 'processing_progress=', progress)
      }
      return s
    },
    refetchInterval: (query) => {
      const s = query.state.data as Session | undefined
      return s && isProcessing(s) ? 3000 : false
    },
  })

  const behaviorLogCount = typeof (session?.metadata as { behavior_log_count?: number } | undefined)?.behavior_log_count === 'number'
    ? (session!.metadata as { behavior_log_count: number }).behavior_log_count
    : null

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
      if (wsRef.current) {
        wsRef.current.disconnect()
        wsRef.current = null
        setWs(null)
      }
    },
  })

  const reingestMutation = useMutation({
    mutationFn: () => sessionsApi.reingestFromCsv(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['session-summary', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['session-metrics', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['key-moments', sessionId] })
    },
  })

  // When progress hits 100%, refetch soon so we get status=completed and leave "Processing video..." (backend may have just marked completed)
  useEffect(() => {
    if (!session || !isProcessing(session) || processingProgress !== 100) return
    const t = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    }, 600)
    return () => clearTimeout(t)
  }, [session?.id, session?.status, processingProgress, queryClient, sessionId])

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
          wsRef.current = websocket
          setWs(websocket)
        } catch (error) {
          console.error('WebSocket connection error:', error)
        }

        return () => {
          if (wsRef.current) {
            wsRef.current.disconnect()
            wsRef.current = null
            setWs(null)
          }
        }
      }
    } else if (wsRef.current) {
      wsRef.current.disconnect()
      wsRef.current = null
      setWs(null)
    }
  }, [session, sessionId, queryClient])

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
          {session.is_active && <Badge variant="success">LIVE</Badge>}
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

      {session.status === 'completed' && (
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-semibold">Session results</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
              queryClient.invalidateQueries({ queryKey: ['session-summary', sessionId] })
              queryClient.invalidateQueries({ queryKey: ['session-metrics', sessionId] })
              queryClient.invalidateQueries({ queryKey: ['key-moments', sessionId] })
            }}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh results
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={reingestMutation.isPending}
            onClick={() => reingestMutation.mutate()}
            title="Re-import behavior data from the pipeline CSV (admin/management). Use if the dashboard is empty but the CSV has data."
          >
            {reingestMutation.isPending ? 'Importing…' : 'Re-import from CSV'}
          </Button>
        </div>
      )}

      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Engagement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(Number(summary.avg_engagement_score) ?? 0).toFixed(1)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Minutes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_minutes ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Key Moments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_key_moments ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Engagement Drops</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.engagement_drops_count ?? 0}</div>
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

      {session.status === 'completed' && summaryLoading && (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-center">
              Loading session results…
            </p>
          </CardContent>
        </Card>
      )}

      {session.status === 'completed' && !summary && !summaryLoading && (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center mb-3">
              Results could not be loaded. Click <strong>Refresh results</strong> above to try again.
            </p>
            <p className="text-sm text-muted-foreground text-center mb-4">
              If your pipeline CSV has detections but the dashboard is empty, click <strong>Re-import from CSV</strong> above to load them.
            </p>
          </CardContent>
        </Card>
      )}

      {session.status === 'completed' && summary && chartData.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-8">
            <p className="text-center font-medium mb-2">
              {behaviorLogCount === 0
                ? 'Dashboard is empty (0 behaviors in database).'
                : 'No chart data for this session.'}
            </p>
            <p className="text-muted-foreground text-center mb-4">
              Your pipeline CSV has detections but they are not in the database. Click the button below to load <code className="text-sm bg-muted px-1 rounded">behavior_log.csv</code> into the dashboard.
            </p>
            <div className="flex justify-center">
              <Button
                variant="default"
                size="sm"
                disabled={reingestMutation.isPending}
                onClick={() => reingestMutation.mutate()}
              >
                {reingestMutation.isPending ? 'Importing…' : 'Re-import from CSV'}
              </Button>
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
                    ? processingProgress === 100
                      ? 'Finishing up…'
                      : 'Processing video…'
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
                  {processingProgress === 100 && (
                    <p className="text-xs text-muted-foreground">
                      Processing complete. If the page doesn&apos;t update,{' '}
                      <button
                        type="button"
                        className="underline font-medium text-primary hover:no-underline"
                        onClick={() => {
                          queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
                        }}
                      >
                        check status
                      </button>
                      {' '}or refresh the page.
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

