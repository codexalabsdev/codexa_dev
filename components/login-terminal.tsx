'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Maximize2, Minus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signInWithPassword } from '@/lib/supabase/auth'

type TerminalStep = 'email' | 'password' | 'recover-email' | 'recovering' | 'recovered' | 'authenticating' | 'authenticated' | 'ready'
type TerminalLine = { text: string; tone?: 'muted' | 'error' | 'success' | 'accent' }

const bootLines: TerminalLine[] = [
  { text: 'CODEXA TERMINAL [Version 1.0.0]', tone: 'accent' },
  { text: 'Initializing secure authentication environment...', tone: 'muted' },
  { text: 'Authentication service ready.', tone: 'success' },
  { text: 'Please authenticate to continue.', tone: 'muted' },
]

function getAuthMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('email not confirmed')) return 'Authentication failed: Confirm your email before continuing.'
  if (normalized.includes('network') || normalized.includes('fetch')) return 'Connection error: Authentication service unavailable.'
  return 'Authentication failed: Invalid credentials.'
}

export function LoginTerminal() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [step, setStep] = useState<TerminalStep>('email')
  const [email, setEmail] = useState('')
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<TerminalLine[]>(bootLines)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  const touchTimerRef = useRef<number | null>(null)
  openRef.current = open

  function appendLine(line: TerminalLine) {
    setLines((current) => [...current, line])
  }

  function resetForLogin() {
    setStep('email')
    setEmail('')
    setInput('')
    setError('')
    setLines(bootLines)
  }

  function closeTerminal() {
    setOpen(false)
    setExpanded(false)
    setMinimized(false)
    setInput('')
  }

  async function openTerminal(mode: 'login' | 'recovery' = 'login') {
    setOpen(true)
    setMinimized(false)
    setError('')
    try {
      const { data } = await createClient().auth.getSession()
      if (data.session) {
        setStep('authenticating')
        setLines([...bootLines, { text: 'Existing session detected.', tone: 'muted' }, { text: 'Validating authenticated session...', tone: 'muted' }, { text: 'Authentication successful.', tone: 'success' }, { text: 'Loading user workspace...', tone: 'muted' }, { text: 'Access granted.', tone: 'success' }])
        window.setTimeout(() => {
          setStep('authenticated')
          window.setTimeout(() => { window.location.assign('/workspace') }, 650)
        }, 650)
        return
      }
      if (mode === 'recovery') {
        setStep('recover-email')
        setInput('')
        setLines([...bootLines, { text: 'Recovery mode enabled.', tone: 'accent' }, { text: 'Enter your account email to recover access.', tone: 'muted' }])
      } else {
        resetForLogin()
      }
    } catch {
      resetForLogin()
      setError('Connection error: Authentication service unavailable.')
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isQuoteKey = ['Quote', 'Backquote'].includes(event.code) || ["'", '"', '´', 'Dead'].includes(event.key)
      const isTerminalShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && isQuoteKey
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        event.stopPropagation()
        void openTerminal('recovery')
        return
      }
      if (isTerminalShortcut) {
        event.preventDefault()
        event.stopPropagation()
        void openTerminal()
        return
      }
      if (event.key === 'Escape' && openRef.current) {
        event.preventDefault()
        closeTerminal()
      }
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  useEffect(() => {
    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 3 || openRef.current) return
      touchTimerRef.current = window.setTimeout(() => { void openTerminal() }, 700)
    }
    function onTouchEnd() {
      if (touchTimerRef.current !== null) window.clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      onTouchEnd()
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' })
  }, [open, step, lines, error])

  function submitInput() {
    const value = input.trim()
    if (step === 'recover-email') {
      if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError('Invalid email format. Please enter a valid email.')
        setInput('')
        return
      }
      setInput('')
      setError('')
      setStep('recovering')
      appendLine({ text: `recovery.email = ${value.toLowerCase()}`, tone: 'accent' })
      appendLine({ text: 'Generating secure recovery link...', tone: 'muted' })
      void recoverPassword(value.toLowerCase())
      return
    }

    if (step === 'email') {
      if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError('Invalid email format. Please enter a valid email.')
        setInput('')
        return
      }
      setEmail(value.toLowerCase())
      setInput('')
      setError('')
      appendLine({ text: `user.email = ${value.toLowerCase()}`, tone: 'accent' })
      setStep('password')
      return
    }

    if (step !== 'password' || !value) return
    setInput('')
    setError('')
    setStep('authenticating')
    appendLine({ text: 'Authenticating user...', tone: 'muted' })
    appendLine({ text: 'Connecting to Codexa authentication service...', tone: 'muted' })
    void authenticate(value)
  }

  async function recoverPassword(recoveryEmail: string) {
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
      const { error: recoveryError } = await createClient().auth.resetPasswordForEmail(recoveryEmail, { redirectTo })
      if (recoveryError) {
        setStep('recover-email')
        setError('Recovery failed: We could not send the recovery link.')
        return
      }
      setStep('recovered')
      appendLine({ text: 'Recovery link sent successfully.', tone: 'success' })
      appendLine({ text: 'Check your inbox to continue.', tone: 'muted' })
    } catch {
      setStep('recover-email')
      setError('Connection error: Authentication service unavailable.')
    }
  }

  async function authenticate(secret: string) {
    try {
      const { error: authError } = await signInWithPassword(email, secret)
        if (authError) {
        setStep('password')
        setError(getAuthMessage(authError.message))
        return
      }
      setStep('authenticated')
      appendLine({ text: 'Authentication successful.', tone: 'success' })
      appendLine({ text: 'Loading user workspace...', tone: 'muted' })
      appendLine({ text: 'Access granted.', tone: 'success' })
      window.setTimeout(() => { window.location.href = '/workspace' }, 650)
    } catch {
        setStep('password')
      setError('Connection error: Authentication service unavailable.')
    }
  }

  if (!open) return null

  const prompt = step === 'email' ? 'user.email = ' : step === 'password' ? 'user.password = ' : step === 'recover-email' ? 'recovery.email = ' : 'system      = '
  const displayInput = step === 'password' ? '•'.repeat(input.length) : input
  const disabled = ['authenticating', 'authenticated', 'ready', 'recovering', 'recovered'].includes(step)

  return (
    <div className={`fixed inset-x-0 bottom-0 z-[100] flex justify-center px-2 pb-2 sm:px-4 ${expanded ? 'top-0 items-stretch pb-0' : ''}`} role="dialog" aria-modal="true" aria-label="Codexa Terminal">
      <section className={`flex w-full flex-col overflow-hidden border border-[#303744] bg-[#101318] font-mono text-sm text-[#d7dae0] shadow-[0_-18px_70px_rgba(0,0,0,.48)] ${expanded ? 'h-full rounded-none' : 'h-[390px] max-w-5xl rounded-t-lg'}`}>
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-[#303744] bg-[#1b1d23] px-3 text-xs text-[#a8adb8]">
          <div className="flex min-w-0 items-center gap-2">
            <Image src="/codexa-logo.png" alt="" width={20} height={20} className="size-5 object-contain" />
            <span className="tracking-[0.16em] text-[#dfe3eb]">TERMINAL</span>
            <span className="hidden text-[#737a87] sm:inline">— Codexa Authentication</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMinimized((value) => !value)} className="grid size-7 place-items-center rounded text-[#9aa1ad] hover:bg-white/[0.08] hover:text-white" aria-label={minimized ? 'Restaurar terminal' : 'Minimizar terminal'}><Minus className="size-3.5" /></button>
            <button type="button" onClick={() => setExpanded((value) => !value)} className="grid size-7 place-items-center rounded text-[#9aa1ad] hover:bg-white/[0.08] hover:text-white" aria-label={expanded ? 'Restaurar terminal' : 'Expandir terminal'}><Maximize2 className="size-3.5" /></button>
            <button type="button" onClick={closeTerminal} className="grid size-7 place-items-center rounded text-[#9aa1ad] hover:bg-red-500/20 hover:text-red-200" aria-label="Fechar terminal"><X className="size-4" /></button>
          </div>
        </header>
        {!minimized && <>
        <div ref={outputRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[12px] leading-6 sm:px-6 sm:text-[13px]">
          {lines.map((line, index) => <div key={`${line.text}-${index}`} className={line.tone === 'error' ? 'text-[#f87171]' : line.tone === 'success' ? 'text-[#7dd3a8]' : line.tone === 'accent' ? 'text-[#8bd5ff]' : 'text-[#8d95a3]'}>{line.text}</div>)}
          {error && <div className="mt-1 text-[#f87171]">{error}</div>}
          {step === 'ready' && <div className="mt-2 text-[#7dd3a8]">Session is ready. Closing terminal...</div>}
          {!disabled && <div className="mt-1 flex items-center gap-2 text-[#d7dae0]">
            <span className="select-none text-[#8bd5ff]">{prompt}</span>
            <span className="min-w-0 break-all">{displayInput}</span><span className="terminal-cursor" aria-hidden="true" />
          </div>}
          {step === 'authenticating' && <div className="mt-1 text-[#8d95a3]">Authenticating<span className="terminal-dots" aria-hidden="true">...</span></div>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#303744] bg-[#17191f] px-3 py-2 text-[11px] text-[#737a87]"><span>Ctrl+Shift+&apos; para abrir</span><span>Ctrl+R para recuperar senha</span><span className="ml-auto">ESC para fechar</span></div>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (event.key === 'Enter') { event.preventDefault(); submitInput() } }} disabled={disabled} type={step === 'password' ? 'password' : 'text'} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={step === 'password' ? 'Senha do terminal' : 'Entrada do terminal'} tabIndex={open && !minimized ? 0 : -1} className="absolute left-[-10000px] h-px w-px opacity-0" />
        </>}
      </section>
    </div>
  )
}
