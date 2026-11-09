'use client'

import { useMemo, useState } from 'react'
import { Loader2, Mail, LifeBuoy, CheckCircle2 } from 'lucide-react'

type Sector = { id: string; name: string }
type Employee = { id: string; name: string; sector: string }

const sectors: Sector[] = [
  { id: 'comercial', name: 'Comercial' },
  { id: 'suporte', name: 'Suporte Técnico' },
  { id: 'financeiro', name: 'Financeiro' },
  { id: 'operacoes', name: 'Operações' },
]

export function PublicContact() {
  const [kind, setKind] = useState<'message' | 'support'>('message')
  const [sector, setSector] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const selectedSector = useMemo(() => sectors.find((item) => item.id === sector)?.name ?? '', [sector])

  async function loadEmployees(value: string) {
    setSector(value)
    setEmployees([])
    if (!value) return
    const response = await fetch(`/api/public/contact?sector=${encodeURIComponent(sectors.find((item) => item.id === value)?.name ?? '')}`)
    if (response.ok) setEmployees((await response.json()).employees ?? [])
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setError('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    form.set('kind', kind)
    form.set('sector', selectedSector)
    try {
      const response = await fetch('/api/public/contact', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível enviar agora.')
      setStatus('success')
      formElement.reset()
      setSector('')
      setEmployees([])
    } catch (submitError) {
      setStatus('error')
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível enviar agora.')
    }
  }

  return <section id="contato" className="scroll-mt-20 border-t border-white/[0.08] py-16 sm:py-24"><div className="mx-auto max-w-5xl"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Fale com a Codexa</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Uma conversa clara começa com o canal certo.</h2><p className="mt-5 text-sm leading-6 text-slate-400">Envie uma mensagem comercial ou abra uma solicitação de suporte. Cada fluxo segue para a equipe responsável.</p></div><div className="mt-10 grid gap-8 lg:grid-cols-[0.72fr_1.28fr]"><div className="space-y-3"><button type="button" onClick={() => setKind('message')} className={`w-full rounded-2xl border p-5 text-left transition ${kind === 'message' ? 'border-cyan-300/50 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03]'}`}><Mail className="size-5 text-cyan-300" /><span className="mt-10 block text-sm font-semibold text-white">Enviar mensagem</span><span className="mt-2 block text-xs leading-5 text-slate-400">Fale com um setor ou escolha uma pessoa.</span></button><button type="button" onClick={() => setKind('support')} className={`w-full rounded-2xl border p-5 text-left transition ${kind === 'support' ? 'border-violet-300/50 bg-violet-300/10' : 'border-white/10 bg-white/[0.03]'}`}><LifeBuoy className="size-5 text-violet-300" /><span className="mt-10 block text-sm font-semibold text-white">Solicitar suporte</span><span className="mt-2 block text-xs leading-5 text-slate-400">Registre um problema para triagem da equipe.</span></button></div><form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-300">Nome completo<input required name="name" maxLength={120} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label><label className="text-xs text-slate-300">E-mail<input required type="email" name="email" maxLength={180} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label><label className="text-xs text-slate-300">Empresa <span className="text-slate-500">(opcional)</span><input name="company" maxLength={160} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label>{kind === 'message' ? <label className="text-xs text-slate-300">Setor<select required name="sector_id" value={sector} onChange={(event) => void loadEmployees(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none"><option value="">Escolha um setor</option>{sectors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <label className="text-xs text-slate-300">Categoria<select required name="category" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none"><option value="Técnico">Técnico</option><option value="Operacional">Operacional</option><option value="Financeiro">Financeiro</option></select></label>}</div>{kind === 'message' && <label className="mt-4 block text-xs text-slate-300">Funcionário <span className="text-slate-500">(opcional)</span><select name="employee_id" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none"><option value="">Caixa de entrada do setor</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}<label className="mt-4 block text-xs text-slate-300">Assunto<input required name="subject" maxLength={180} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label><label className="mt-4 block text-xs text-slate-300">{kind === 'message' ? 'Mensagem' : 'Descrição detalhada'}<textarea required name="body" minLength={10} maxLength={5000} rows={5} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label><label className="mt-4 flex items-start gap-2 text-xs text-slate-400"><input required type="checkbox" name="consent" className="mt-0.5 accent-cyan-300" />Concordo com o tratamento dos dados para resposta e atendimento.</label><button disabled={status === 'loading'} className="mt-5 inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#071016] disabled:opacity-60">{status === 'loading' && <Loader2 className="size-4 animate-spin" />}{kind === 'message' ? 'Enviar mensagem' : 'Enviar solicitação'}</button>{status === 'success' && <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />Recebemos sua solicitação e a equipe responsável fará a triagem.</p>}{status === 'error' && <p className="mt-4 text-sm text-rose-300">{error}</p>}</form></div></div></section>
}
