import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('MMM D, YYYY');
}

export function formatDateTime(dateStr: string): string {
  return dayjs(dateStr).format('MMM D, YYYY h:mm A');
}

export function formatTime(dateStr: string): string {
  return dayjs(dateStr).format('h:mm A');
}

export function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(dateStr);
}

export function formatDateSep(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return formatDate(dateStr);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AVATAR_COLORS = [
  ['#EC4899', '#F43F5E'],
  ['#F97316', '#EAB308'],
  ['#10B981', '#14B8A6'],
  ['#06B6D4', '#3B82F6'],
  ['#8B5CF6', '#A855F7'],
  ['#E879F9', '#EC4899'],
  ['#84CC16', '#22C55E'],
  ['#EF4444', '#F97316'],
];

export function getAvatarColors(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const pair = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return [pair[0], pair[1]];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Strip @[Name] mention tokens to plain text */
export function stripMentions(message: string): string {
  return message.replace(/@\[([^\]]+)\]/g, '@$1');
}
