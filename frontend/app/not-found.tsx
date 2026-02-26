import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">404 - Page Not Found</h2>
        <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
        <Link href="/login">
          <Button>Go to Login</Button>
        </Link>
      </div>
    </div>
  )
}

