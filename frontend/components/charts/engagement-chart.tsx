'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface EngagementChartProps {
  data: Array<{
    minute: number
    engagement_score: number
    attentive_ratio: number
    inactive_ratio: number
    mobile_use_ratio: number
  }>
}

export function EngagementChart({ data }: EngagementChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="minute" label={{ value: 'Minute', position: 'insideBottom', offset: -5 }} />
        <YAxis label={{ value: 'Score', angle: -90, position: 'insideLeft' }} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="engagement_score"
          stroke="#8884d8"
          name="Engagement Score"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

