import React from 'react';

const AVATAR_COLORS = [
  'from-violet-500 to-purple-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-500',
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface UserAvatarProps {
  user: { name: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function UserAvatar({ user, size = 'sm', className = '' }: UserAvatarProps) {
  const gradient = getAvatarGradient(user.name);
  const initial = user.name.charAt(0).toUpperCase();
  
  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white flex-shrink-0 shadow-sm ${className}`}>
      {initial}
    </div>
  );
}
