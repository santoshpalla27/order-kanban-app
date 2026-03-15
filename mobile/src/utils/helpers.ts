import { ProductStatus } from '../types'

export const STATUS_LABELS: Record<string, string> = {
  yet_to_start: 'Yet to Start',
  working:      'Working',
  review:       'Review',
  done:         'Done',
}

export const STATUS_BG: Record<string, string> = {
  yet_to_start: '#FFFDE7',
  working:      '#E3F2FD',
  review:       '#FFF3E0',
  done:         '#E8F5E9',
}

export const STATUS_HDR: Record<string, string> = {
  yet_to_start: '#F9A825',
  working:      '#1E88E5',
  review:       '#FB8C00',
  done:         '#43A047',
}

export const STATUS_TEXT: Record<string, string> = {
  yet_to_start: '#F57F17',
  working:      '#1565C0',
  review:       '#E65100',
  done:         '#2E7D32',
}

export const ALL_STATUSES: ProductStatus[] = [
  'yet_to_start', 'working', 'review', 'done',
]

export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replace(/_/g, ' ')
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}
