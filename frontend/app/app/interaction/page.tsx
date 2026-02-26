'use client'

import { useState } from 'react'
import { RoleGuard } from '@/components/layout/role-guard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useQuery } from '@tanstack/react-query'
import {
  analyticsApi,
  SubjectInteraction,
  TeacherInteraction,
  StudentInteraction,
} from '@/lib/api/analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { BookOpen, User, GraduationCap } from 'lucide-react'

function SubjectWiseTab() {
  const { data: subjects = [], isLoading, error } = useQuery({
    queryKey: ['analytics', 'subjects'],
    queryFn: () => analyticsApi.getDashboardSubjects({ limit: 50 }),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="text-sm text-destructive py-4">
        Failed to load subject-wise data. Ensure sessions have a mapping (class–subject–teacher) and are processed.
      </p>
    )
  }
  if (subjects.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No subject-wise interaction yet. Upload videos with a mapping selected and wait for processing.
      </p>
    )
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Subject</th>
            <th className="text-right p-3 font-medium">Sessions</th>
            <th className="text-right p-3 font-medium">Total min</th>
            <th className="text-right p-3 font-medium">Engagement</th>
            <th className="text-right p-3 font-medium">Active ratio</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((row: SubjectInteraction) => (
            <tr key={row.subject_id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="p-3 font-medium">{row.subject_name}</td>
              <td className="p-3 text-right">{row.sessions_count}</td>
              <td className="p-3 text-right">{row.total_minutes.toFixed(1)}</td>
              <td className="p-3 text-right">{(row.avg_engagement_score * 100).toFixed(1)}%</td>
              <td className="p-3 text-right">{(row.avg_active_ratio * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeacherWiseTab() {
  const { data: teachers = [], isLoading, error } = useQuery({
    queryKey: ['analytics', 'teachers'],
    queryFn: () => analyticsApi.getDashboardTeachers({ limit: 50 }),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="text-sm text-destructive py-4">
        Failed to load teacher-wise data.
      </p>
    )
  }
  if (teachers.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No teacher-wise interaction yet. Sessions must have a mapping and be processed.
      </p>
    )
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Teacher</th>
            <th className="text-right p-3 font-medium">Sessions</th>
            <th className="text-right p-3 font-medium">Total min</th>
            <th className="text-right p-3 font-medium">Engagement</th>
            <th className="text-right p-3 font-medium">Active ratio</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((row: TeacherInteraction) => (
            <tr key={row.teacher_id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="p-3 font-medium">{row.teacher_name}</td>
              <td className="p-3 text-right">{row.sessions_count}</td>
              <td className="p-3 text-right">{row.total_minutes.toFixed(1)}</td>
              <td className="p-3 text-right">{(row.avg_engagement_score * 100).toFixed(1)}%</td>
              <td className="p-3 text-right">{(row.avg_active_ratio * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StudentWiseTab() {
  const { data: students = [], isLoading, error } = useQuery({
    queryKey: ['analytics', 'students'],
    queryFn: () => analyticsApi.getDashboardStudents({ limit: 100 }),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="text-sm text-destructive py-4">
        Failed to load student-wise data.
      </p>
    )
  }
  if (students.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No per-student interaction yet. Processed sessions with behavior logs will appear here.
      </p>
    )
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Student</th>
            <th className="text-right p-3 font-medium">Duration (sec)</th>
            <th className="text-right p-3 font-medium">Engagement</th>
            <th className="text-right p-3 font-medium">Active</th>
            <th className="text-right p-3 font-medium">Inactive</th>
          </tr>
        </thead>
        <tbody>
          {students.map((row: StudentInteraction, idx: number) => (
            <tr key={`${row.student_name}-${row.session_id ?? idx}`} className="border-b last:border-0 hover:bg-muted/30">
              <td className="p-3 font-medium">{row.student_name}</td>
              <td className="p-3 text-right">{row.total_duration_sec.toFixed(0)}</td>
              <td className="p-3 text-right">{(row.engagement_score * 100).toFixed(1)}%</td>
              <td className="p-3 text-right">{(row.active_ratio * 100).toFixed(1)}%</td>
              <td className="p-3 text-right">{(row.inactive_ratio * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function InteractionPage() {
  const [tab, setTab] = useState('subject')

  return (
    <RoleGuard allowedRoles={['admin', 'management', 'teacher']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Interaction</h1>
          <p className="text-muted-foreground">
            View engagement and behavior by subject, teacher, or per student (from processed sessions with mapping).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Interaction by view</CardTitle>
            <CardDescription>
              Select mapping when uploading a video; after processing you can see subject-wise, teacher-wise, and per-student interaction here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="subject" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Subject-wise
                </TabsTrigger>
                <TabsTrigger value="teacher" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Teacher-wise
                </TabsTrigger>
                <TabsTrigger value="student" className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  Student-wise
                </TabsTrigger>
              </TabsList>
              <TabsContent value="subject" className="mt-4">
                <SubjectWiseTab />
              </TabsContent>
              <TabsContent value="teacher" className="mt-4">
                <TeacherWiseTab />
              </TabsContent>
              <TabsContent value="student" className="mt-4">
                <StudentWiseTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  )
}
