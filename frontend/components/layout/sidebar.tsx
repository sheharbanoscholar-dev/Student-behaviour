'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { authApi } from '@/lib/api/auth'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  Link as LinkIcon,
  Video,
  BarChart3,
  LogOut,
  Activity,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  role: 'admin' | 'management' | 'teacher'
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await authApi.logout()
    router.push('/login')
  }

  const adminItems = [
    { href: '/app/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/app/admin/users', label: 'Users', icon: Users },
    { href: '/app/admin/classrooms', label: 'Classrooms', icon: GraduationCap },
    { href: '/app/admin/subjects', label: 'Subjects', icon: BookOpen },
    { href: '/app/admin/mappings', label: 'Mappings', icon: LinkIcon },
    { href: '/app/sessions', label: 'All Sessions', icon: Video },
    { href: '/app/interaction', label: 'Interaction', icon: Activity },
  ]

  const managementItems = [
    { href: '/app/management/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/app/sessions', label: 'Sessions', icon: Video },
    { href: '/app/interaction', label: 'Interaction', icon: Activity },
  ]

  const teacherItems = [
    { href: '/app/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/app/teacher/sessions/new', label: 'New Session', icon: Video },
    { href: '/app/sessions', label: 'My Sessions', icon: Video },
    { href: '/app/interaction', label: 'Interaction', icon: Activity },
  ]

  const items =
    role === 'admin'
      ? adminItems
      : role === 'management'
      ? managementItems
      : teacherItems

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold">Classroom Analytics</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <div key={item.href} className="flex items-center gap-0 rounded-lg transition-colors group">
              <Link
                href={item.href}
                className={cn(
                  'flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
              <Link
                href={item.href}
                className={cn(
                  'rounded p-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'text-primary-foreground/80 hover:bg-primary-foreground/20'
                    : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground'
                )}
                title={`Edit / Manage ${item.label}`}
              >
                <Pencil className="h-4 w-4" />
              </Link>
            </div>
          )
        })}
      </nav>
      <div className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  )
}

