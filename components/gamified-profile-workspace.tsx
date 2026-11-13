'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Award, Camera, Check, Crown, KeyRound, Lock, Mail, Phone, ShieldCheck, Sparkles, Star, Trophy, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BadgeDisplay } from '@/components/gamification/badge-display'

type Badge = { id: string; name: string; description: string; color: string; image_url?: string | null; image_path?: string | null; granted_at: string; expires_at?: string | null; is_temporary?: boolean }
type Profile = { fullName: string; nickname: string; email: string; avatarUrl: string; role: string; phone: string; whatsappEnabled: boolean; points: number; level: number; nextLevelXp?: number; currentLevelXp?: number; levelName?: string; hasNextMilestone?: boolean; progress?: number; badges: Badge[] }

export function GamifiedProfileWorkspace({ initialName = '' }: { initialName?: string }) {
  const [profile, setProfile] = useState<Profile>({ fullName: initialName, nickname: '', email: '', avatarUrl: '', role: 'Membro', phone: '', whatsappEnabled: false, points: 0, level: 1, badges: [] })
  const [name, setName] = useState(initialName)
  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [contactMessage, setContactMessage] = useState('')
  const [contactError, setContactError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    void fetch('/api/workspace/profile').then(async (response) => {
      if (!response.ok) return
      const data = await response.json() as Profile
      setProfile(data); setName(data.fullName); setNickname(data.nickname); setAvatarUrl(data.avatarUrl); setPhone(data.phone ?? ''); setWhatsappEnabled(Boolean(data.whatsappEnabled))
    })
  }, [])

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(''); setError(false)
    try {
      const response = await fetch('/api/workspace/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: name, nickname, avatarUrl }) })
      const result = await response.json() as { error?: string; profile?: Partial<Profile> }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível salvar o perfil.')
      setProfile((current) => ({ ...current, fullName: name.trim(), nickname: nickname.trim(), avatarUrl: avatarUrl.trim() })); setMessage('Perfil atualizado com sucesso.')
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar o perfil.') } finally { setSaving(false) }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault(); setSavingContact(true); setContactMessage(''); setContactError(false)
    try {
      const response = await fetch('/api/workspace/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, whatsappEnabled }) })
      const result = await response.json() as { error?: string; phone?: string | null; whatsappEnabled?: boolean }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível salvar os dados de contato.')
      setPhone(result.phone ?? '')
      setWhatsappEnabled(Boolean(result.whatsappEnabled))
      setProfile((current) => ({ ...current, phone: result.phone ?? '', whatsappEnabled: Boolean(result.whatsappEnabled) }))
      setContactMessage('Contato atualizado com sucesso.')
    } catch (cause) { setContactError(true); setContactMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar os dados de contato.') } finally { setSavingContact(false) }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setSavingPassword(true); setMessage(''); setError(false)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    if (updateError) { setError(true); setMessage(updateError.message) } else { setPassword(''); setMessage('Senha atualizada com sucesso.') }
    setSavingPassword(false)
  }

  const initials = (profile.nickname || profile.fullName || 'U').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const currentLevelXp = profile.currentLevelXp ?? 0
  const nextLevelXp = profile.nextLevelXp ?? Math.max(currentLevelXp + 1, profile.points + 1)
  const progress = profile.progress ?? Math.min(100, Math.max(0, Math.round((profile.points - currentLevelXp) / Math.max(1, nextLevelXp - currentLevelXp) * 100)))
  return <div className="mt-6 space-y-5">
    <section className="relative overflow-hidden rounded-2xl border border-violet-300/20 bg-[radial-gradient(circle_at_80%_0%,rgba(124,92,246,.28),transparent_35%),linear-gradient(135deg,#17172a,#10151f)] p-5 sm:p-7">
      <div className="absolute -right-16 -top-16 size-48 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4"><div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-2xl font-bold text-white shadow-2xl">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="Foto de perfil" className="size-full object-cover" /> : initials}<span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-cyan-300 text-[#071016]"><Sparkles className="size-3" /></span></div><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">Seu espaço de identidade</p><h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">{profile.nickname || profile.fullName || 'Meu perfil'}</h1><p className="mt-1 text-sm text-slate-400">{profile.role} · nível {profile.level} · último marco: {profile.levelName ?? 'Conquistado'}</p></div></div>
        <div className="min-w-52 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between text-xs"><span className="text-slate-400">Progresso do nível</span><span className="font-semibold text-cyan-300">{profile.points} XP</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">{profile.hasNextMilestone === false ? `Último marco: ${profile.levelName ?? 'Conquistado'}` : `${Math.max(0, nextLevelXp - profile.points)} XP para o próximo nível`}</p></div>
      </div>
    </section>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-2xl border border-white/[.08] bg-[#11161e] p-5 sm:p-6"><div className="flex items-center gap-3"><UserRound className="size-5 text-cyan-300" /><div><h2 className="font-semibold text-white">Identidade</h2><p className="text-xs text-slate-500">Como você aparece dentro do workspace.</p></div></div><form onSubmit={saveProfile} className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-400">Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/60" /></label><label className="text-xs text-slate-400">Apelido<input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} placeholder="Como quer ser chamado" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/60" /></label><label className="text-xs text-slate-400 sm:col-span-2">URL da foto de perfil<div className="relative"><Camera className="absolute left-3 top-3 size-4 text-slate-500" /><input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} type="url" placeholder="https://..." className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-300/60" /></div></label><div className="flex items-center gap-3 sm:col-span-2"><button disabled={saving} className="rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-[#071016] disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar identidade'}</button><span className="flex items-center gap-2 text-xs text-slate-500"><Mail className="size-3.5" />{profile.email || 'Carregando e-mail...'}</span></div></form></section>
      <section className="rounded-2xl border border-white/[.08] bg-[#11161e] p-5 sm:p-6"><div className="flex items-center gap-3"><Trophy className="size-5 text-amber-300" /><div><h2 className="font-semibold text-white">Emblemas conquistados</h2><p className="text-xs text-slate-500">Reconhecimentos concedidos pela administração.</p></div></div><div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-5">{profile.badges.length === 0 ? <div className="col-span-3 px-4 py-6 text-center text-xs text-slate-500">Ainda não há emblemas concedidos para você.</div> : profile.badges.map((badge) => <BadgeDisplay key={badge.id} name={badge.name} description={badge.description} color={badge.color} imageUrl={badge.image_url} size="md" />)}</div></section>
    </div>
    <section className="rounded-2xl border border-white/[.08] bg-[#11161e] p-5 sm:p-6"><div className="flex items-center gap-3"><Phone className="size-5 text-emerald-300" /><div><h2 className="font-semibold text-white">Contato com clientes</h2><p className="text-xs text-slate-500">Configure o telefone que aparecerá no diretório público de contatos.</p></div></div><form onSubmit={saveContact} className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label htmlFor="profile-phone" className="text-xs text-slate-400">Telefone internacional<input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+55 11 91234-5678" aria-describedby="profile-phone-help" required={whatsappEnabled} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm text-white outline-none focus:border-emerald-300/60" /><span id="profile-phone-help" className="mt-2 block text-[11px] text-slate-500">Use o código do país. Exemplo: +55 11 91234-5678.</span></label><label htmlFor="profile-whatsapp" className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-4 text-sm text-slate-300"><input id="profile-whatsapp" type="checkbox" checked={whatsappEnabled} onChange={(event) => setWhatsappEnabled(event.target.checked)} className="size-4 accent-emerald-400" />Este número tem WhatsApp</label><div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button disabled={savingContact} className="rounded-xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-[#071016] disabled:opacity-60">{savingContact ? 'Salvando...' : 'Salvar contato'}</button>{contactMessage && <p role={contactError ? 'alert' : 'status'} className={contactError ? 'text-sm text-rose-300' : 'text-sm text-emerald-300'}>{contactMessage}</p>}</div></form></section>
    <section className="rounded-2xl border border-white/[.08] bg-[#11161e] p-5 sm:p-6"><div className="flex items-center gap-3"><KeyRound className="size-5 text-violet-300" /><div><h2 className="font-semibold text-white">Segurança da conta</h2><p className="text-xs text-slate-500">Atualize sua senha quando quiser.</p></div></div><form onSubmit={changePassword} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-xs text-slate-400">Nova senha<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm text-white outline-none focus:border-violet-300/60" /></label><button disabled={savingPassword} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-400/10 px-4 py-3 text-sm font-semibold text-violet-200 disabled:opacity-60"><Lock className="size-4" />{savingPassword ? 'Atualizando...' : 'Atualizar senha'}</button></form></section>
    {message && <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-rose-300' : 'text-sm text-emerald-300'}>{message}</p>}
  </div>
}
