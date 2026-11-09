'use client'

import Image from 'next/image'

export type UserAvatarData = {
  fullName?: string | null
  nickname?: string | null
  avatarUrl?: string | null
}

function initialsFor(user: UserAvatarData) {
  const label = user.nickname?.trim() || user.fullName?.trim() || 'Usuário'
  return label.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'
}

export function UserAvatar({ user, size = 'md', className = '', alt }: { user: UserAvatarData; size?: 'sm' | 'md' | 'lg'; className?: string; alt?: string }) {
  const sizes = { sm: 'size-7 text-[10px]', md: 'size-9 text-xs', lg: 'size-16 text-lg' }
  const imageSize = { sm: 28, md: 36, lg: 64 }
  const avatarUrl = user.avatarUrl?.trim()
  return (
    <span className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-blue-400/30 to-cyan-300/20 font-semibold text-slate-100 ring-1 ring-white/10 ${sizes[size]} ${className}`}>
      {avatarUrl ? <Image src={avatarUrl} alt={alt ?? `Foto de ${user.nickname || user.fullName || 'usuário'}`} width={imageSize[size]} height={imageSize[size]} className="size-full object-cover" unoptimized /> : initialsFor(user)}
    </span>
  )
}
