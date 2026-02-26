import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Human-readable session status (e.g. pending_processing → "Pending processing") */
export function formatSessionStatus(status: string | undefined): string {
  if (!status) return '—'
  const map: Record<string, string> = {
    draft: 'Draft',
    pending_processing: 'Pending processing',
    processing: 'Processing',
    ready: 'Ready',
    live: 'Live',
    active: 'Active',
    ended: 'Ended',
    completed: 'Completed',
    failed: 'Failed',
  }
  return map[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Human-readable session type */
export function formatSessionType(sessionType: string | undefined): string {
  if (!sessionType) return '—'
  return sessionType === 'live' ? 'Live' : sessionType === 'recorded' ? 'Recorded' : sessionType
}

