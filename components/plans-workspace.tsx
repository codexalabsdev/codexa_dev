'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Plan = { id: string; system_id: string | null; name: string; code: string; description: string | null; price: number; billing_period: string; user_limit: number | null; usage_limits: Record<string, unknown>; available_features: unknown[]; included_module_ids: string[] }
type System = { id: string; name: string }
const inputClass = 'rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-400/60'

export function PlansWorkspace({ permissions }: { permissions: string[] }) {
  const canManage = permissions.includes('*') || permissions.includes('plans:manage')
  const [plans, setPlans] = useState<Plan[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [editing, setEditing] = useState<Plan | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [plansResult, systemsResult] = await Promise.all([
      supabase.from('plans').select('id,system_id,name,code,description,price,billing_period,user_limit,usage_limits,available_features,included_module_ids').order('price'),
      supabase.from('systems').select('id,name').order('name'),
    ])
    if (plansResult.error || systemsResult.error) setError('Não foi possível carregar os planos.')
    setPlans((plansResult.data ?? []) as Plan[])
    setSystems((systemsResult.data ?? []) as System[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage) return
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = { system_id: String(data.system_id || '') || null, name: String(data.name).trim(), code: String(data.code).trim(), description: String(data.description || '').trim() || null, price: Number(data.price || 0), billing_period: String(data.billing_period), user_limit: data.user_limit ? Number(data.user_limit) : null }
    const result = editing ? await createClient().from('plans').update(payload).eq('id', editing.id) : await createClient().from('plans').insert(payload)
    if (result.error) setError('Não foi possível salvar o plano. Verifique o código único e os campos obrigatórios.')
    else { setOpen(false); setEditing(null); setNotice(editing ? 'Plano atualizado.' : 'Plano criado.'); await load() }
  }

  async function remove(plan: Plan) {
    if (!canManage || !window.confirm(`Excluir o plano “${plan.name}”?`)) return
    const { error: removeError } = await createClient().from('plans').delete().eq('id', plan.id)
    if (removeError) setError('Não é possível excluir este plano enquanto ele estiver vinculado a clientes ou licenças.')
    else { setNotice('Plano excluído.'); await load() }
  }
  const systemName = (id: string | null) => systems.find((system) => system.id === id)?.name ?? 'Todos os sistemas'

  return <section className="space-y-6">
    <header><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-violet-400">Produtos comerciais</p><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold text-white">Planos de serviço</h1><p className="mt-1.5 max-w-2xl text-sm text-slate-500">Cadastre ofertas que seus clientes podem contratar, com preço, recorrência e limites definidos.</p></div>{canManage && <button onClick={() => { setEditing(null); setOpen(true); setError('') }} className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900"><Plus className="size-3.5" />Novo plano</button>}</div></header>
    {(error || notice) && <div className={`rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/5 text-rose-200' : 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300'}`}>{error || notice}</div>}
    {loading ? <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-8 text-sm text-slate-500">Carregando planos...</div> : plans.length === 0 ? <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#11161e] p-10 text-center"><p className="text-sm text-slate-300">Nenhum plano cadastrado</p><p className="mt-1 text-xs text-slate-600">Crie o primeiro plano comercial para disponibilizá-lo nas propostas, contratos e licenças.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan) => <article key={plan.id} className="rounded-xl border border-white/[0.08] bg-[#11161e] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.16em] text-violet-400">{systemName(plan.system_id)}</p><h2 className="mt-2 text-lg font-semibold text-white">{plan.name}</h2><p className="mt-1 text-xs text-slate-500">{plan.code}</p></div><div className="flex gap-1">{canManage && <><button onClick={() => { setEditing(plan); setOpen(true) }} aria-label="Editar plano" className="rounded-md p-2 text-slate-500 hover:bg-white/[0.05] hover:text-white"><Pencil className="size-3.5" /></button><button onClick={() => void remove(plan)} aria-label="Excluir plano" className="rounded-md p-2 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"><Trash2 className="size-3.5" /></button></>}</div></div><p className="mt-4 text-sm text-slate-400">{plan.description || 'Sem descrição comercial.'}</p><div className="mt-5 flex items-end justify-between border-t border-white/[0.07] pt-4"><div><span className="text-2xl font-semibold text-white">R$ {Number(plan.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span><span className="ml-1 text-xs text-slate-500">/{plan.billing_period.toLowerCase()}</span></div>{plan.user_limit && <span className="text-xs text-slate-500">Até {plan.user_limit} usuários</span>}</div></article>)}</div>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-white">{editing ? 'Editar plano' : 'Novo plano de serviço'}</h2><p className="mt-1 text-xs text-slate-500">Defina a oferta que será apresentada aos clientes.</p></div><button onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4 text-slate-500" /></button></div><form onSubmit={save} className="grid gap-3 sm:grid-cols-2"><input required name="name" defaultValue={editing?.name ?? ''} placeholder="Nome comercial *" className={`${inputClass} sm:col-span-2`} /><input required name="code" defaultValue={editing?.code ?? ''} placeholder="Código único *" className={inputClass} /><select name="system_id" defaultValue={editing?.system_id ?? ''} className={inputClass}><option value="">Todos os sistemas</option>{systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select><textarea name="description" defaultValue={editing?.description ?? ''} placeholder="Descrição do plano" className={`${inputClass} min-h-20 sm:col-span-2`} /><div className="relative"><span className="pointer-events-none absolute left-3 top-2 text-xs text-slate-500">R$</span><input required min="0" step="0.01" type="number" name="price" defaultValue={editing?.price ?? 0} placeholder="Preço" className={`${inputClass} w-full pl-9`} /></div><select name="billing_period" defaultValue={editing?.billing_period ?? 'Mensal'} className={inputClass}><option>Mensal</option><option>Anual</option><option>Único</option></select><input min="1" type="number" name="user_limit" defaultValue={editing?.user_limit ?? ''} placeholder="Limite de usuários (opcional)" className={inputClass} /><button type="submit" className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white sm:col-span-2">Salvar plano</button></form></div></div>}
  </section>
}
