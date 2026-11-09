'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => { if (data.session) onAuthenticated() })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => { if (session) onAuthenticated() })
    return () => listener.subscription.unsubscribe()
  }, [onAuthenticated])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const supabase = createClient()
    if (recoveryMode) {
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
      if (error) setMessage('Não foi possível enviar o link de recuperação. Confira o e-mail informado.')
      else { setRecoverySent(true); setMessage('Enviamos um link de recuperação para seu e-mail.') }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) setMessage(error.message.toLowerCase().includes('email not confirmed') ? 'Confirme seu e-mail antes de entrar.' : 'E-mail ou senha inválidos. Use “Esqueci minha senha” para criar uma nova senha.')
    }
    setLoading(false)
  }

  return <main className="grid min-h-screen place-items-center bg-[#080b10] px-4 py-8 text-slate-100"><form onSubmit={submit} className="auth-card w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#11161e] p-7 shadow-2xl sm:p-9"><div className="mb-7 text-center"><Image src="/codexa-logo.png" alt="Codexa" width={240} height={240} priority className="mx-auto mb-5 size-52 object-contain sm:size-60" /><h1 className="text-2xl font-semibold text-white">{recoveryMode ? 'Recuperar acesso' : 'Entrar no workspace'}</h1><p className="mt-2 text-sm text-slate-500">{recoveryMode ? 'Enviaremos um link para você definir uma nova senha.' : 'Use seu e-mail e senha para acessar os registros.'}</p></div><label className="mb-3 block text-xs font-medium text-slate-300">E-mail<div className="auth-email-field mt-1 flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3"><Mail className="size-4 text-slate-400" /><input className="auth-input w-full bg-transparent py-3 text-sm text-white outline-none" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></label>{!recoveryMode && <label className="block text-xs font-medium text-slate-300">Senha<div className="auth-email-field mt-1 flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3"><LockKeyhole className="size-4 shrink-0 text-slate-400" /><input className="auth-input min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none" required minLength={6} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="rounded p-1 text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>}{!recoveryMode && <p className="mt-2 text-right"><button type="button" onClick={() => { setRecoveryMode(true); setMessage(''); setRecoverySent(false) }} className="text-xs text-cyan-300 hover:text-cyan-200">Esqueci minha senha</button></p>}{message && <p role="status" className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">{message}</p>}<button type="submit" disabled={loading || (recoveryMode && recoverySent)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}{recoveryMode ? 'Enviar link de recuperação' : 'Entrar'}</button>{recoveryMode && <button type="button" onClick={() => { setRecoveryMode(false); setMessage(''); setRecoverySent(false) }} className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300">Voltar para o login</button>}</form></main>
}
