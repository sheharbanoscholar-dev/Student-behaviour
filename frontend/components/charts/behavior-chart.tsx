'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface BehaviorChartProps {
  data: Array<{
    minute: number
    attentive_ratio: number
    inactive_ratio: number
    mobile_use_ratio?: number
  }>
}

/** Behavior Analysis: Attentive vs Inactive only (inactive includes mobile use, sleeping, looking away). */
export function BehaviorChart({ data }: BehaviorChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="minute" label={{ value: 'Minute', position: 'insideBottom', offset: -5 }} />
        <YAxis label={{ value: 'Ratio', angle: -90, position: 'insideLeft' }} />
        <Tooltip />
        <Legend />
        <Area
          type="monotone"
          dataKey="attentive_ratio"
          stackId="1"
          stroke="#10b981"
          fill="#10b981"
          name="Attentive"
        />
        <Area
          type="monotone"
          dataKey="inactive_ratio"
          stackId="1"
          stroke="#ef4444"
          fill="#ef4444"
          name="Inactive"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

