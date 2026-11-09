'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type CommercialData = {
  leads: { id: string; name: string; status: string; created_at: string }[]
  clients: { id: string; status: string }[]
  proposals: { id: string; proposal_number: string; title: string; status: string; total: number | string; created_at: string }[]
  contracts: { id: string; contract_number: string; title: string; status: string; contracted_value: number | string; created_at: string }[]
}
type FinancialData = {
  receivables: { description: string; final_amount: number | string; paid_amount: number | string; due_date: string; status: string }[]
  payables: { beneficiary: string; description: string; amount: number | string; paid_amount: number | string; due_date: string; status: string }[]
}

const emptyCommercial: CommercialData = { leads: [], clients: [], proposals: [], contracts: [] }
const emptyFinancial: FinancialData = { receivables: [], payables: [] }
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

async function fetchAllRows<T>(
  fetchPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await fetchPage(start, start + 999)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const contents = [headers, ...rows]
    .map((row) => row.map((value) => {
      const text = String(value)
      const safeText = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
      return `"${safeText.replaceAll('"', '""')}"`
    }).join(';'))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function countByStatus(items: { status: string }[]) {
  return [...new Set(items.map((item) => item.status))].sort().map((status) => ({
    status,
    count: items.filter((item) => item.status === status).length,
  }))
}

export function ReportsWorkspace({ permissions }: { permissions: string[] }) {
  const canViewCommercial = permissions.includes('*') || permissions.includes('reports_commercial:view')
  const canExportCommercial = permissions.includes('*') || permissions.includes('reports_commercial:export')
  const canViewFinancial = permissions.includes('*') || permissions.includes('reports_financial:view')
  const canExportFinancial = permissions.includes('*') || permissions.includes('reports_financial:export')
  const [commercial, setCommercial] = useState<CommercialData>(emptyCommercial)
  const [financial, setFinancial] = useState<FinancialData>(emptyFinancial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()

    const loadCommercial = async () => {
      if (!canViewCommercial) return
      try {
        const [leads, clients, proposals, contracts] = await Promise.all([
          fetchAllRows<CommercialData['leads'][number]>((start, end) => supabase.from('leads').select('id,name,status,created_at').order('created_at', { ascending: false }).order('id').range(start, end)),
          fetchAllRows<CommercialData['clients'][number]>((start, end) => supabase.from('clients').select('id,status').order('id').range(start, end)),
          fetchAllRows<CommercialData['proposals'][number]>((start, end) => supabase.from('proposals').select('id,proposal_number,title,status,total,created_at').order('created_at', { ascending: false }).order('id').range(start, end)),
          fetchAllRows<CommercialData['contracts'][number]>((start, end) => supabase.from('contracts').select('id,contract_number,title,status,contracted_value,created_at').order('created_at', { ascending: false }).order('id').range(start, end)),
        ])
        setCommercial({ leads, clients, proposals, contracts })
      } catch (loadError) {
        const detail = loadError instanceof Error ? loadError.message : 'erro desconhecido'
        setError((current) => current || `Não foi possível carregar o relatório comercial: ${detail}`)
      }
    }
    const loadFinancial = async () => {
      if (!canViewFinancial) return
      try {
        const [receivables, payables] = await Promise.all([
          fetchAllRows<FinancialData['receivables'][number]>((start, end) => supabase.from('accounts_receivable').select('description,final_amount,paid_amount,due_date,status').order('due_date').order('id').range(start, end)),
          fetchAllRows<FinancialData['payables'][number]>((start, end) => supabase.from('accounts_payable').select('beneficiary,description,amount,paid_amount,due_date,status').order('due_date').order('id').range(start, end)),
        ])
        setFinancial({ receivables, payables })
      } catch (loadError) {
        const detail = loadError instanceof Error ? loadError.message : 'erro desconhecido'
        setError((current) => current || `Não foi possível carregar o relatório financeiro: ${detail}`)
      }
    }
    await Promise.all([loadCommercial(), loadFinancial()])
    setLoading(false)
  }, [canViewCommercial, canViewFinancial])

  useEffect(() => { void load() }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const totalReceivable = financial.receivables.reduce((sum, item) => sum + Number(item.final_amount || 0), 0)
  const received = financial.receivables.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0)
  const outstanding = financial.receivables.reduce((sum, item) => sum + Math.max(Number(item.final_amount || 0) - Number(item.paid_amount || 0), 0), 0)
  const overdue = financial.receivables.reduce((sum, item) => sum + (item.status !== 'Pago' && item.due_date < today
    ? Math.max(Number(item.final_amount || 0) - Number(item.paid_amount || 0), 0)
    : 0), 0)
  const totalPayable = financial.payables.reduce((sum, item) => sum + Number(item.amount || 0), 0)

  function exportCommercial() {
    const rows = [
      ...commercial.leads.map((item) => ['Lead', item.name || item.id, '', item.status, item.created_at]),
      ...commercial.proposals.map((item) => ['Proposta', item.proposal_number || item.title, Number(item.total || 0), item.status, item.created_at]),
      ...commercial.contracts.map((item) => ['Contrato', item.contract_number || item.title, Number(item.contracted_value || 0), item.status, item.created_at]),
    ]
    downloadCsv('relatorio-comercial.csv', ['Tipo', 'Registro', 'Valor', 'Status', 'Criado em'], rows)
  }

  function exportFinancial() {
    const rows = [
      ...financial.receivables.map((item) => ['A receber', item.description, Number(item.final_amount || 0), Number(item.paid_amount || 0), item.status, item.due_date]),
      ...financial.payables.map((item) => ['A pagar', `${item.beneficiary} - ${item.description}`, Number(item.amount || 0), Number(item.paid_amount || 0), item.status, item.due_date]),
    ]
    downloadCsv('relatorio-financeiro.csv', ['Tipo', 'Descrição', 'Valor', 'Pago', 'Status', 'Vencimento'], rows)
  }

  return <section className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Indicadores</p><h1 className="text-2xl font-semibold text-white">Relatórios</h1><p className="mt-1.5 text-sm text-slate-500">Visões comerciais e financeiras conforme suas permissões.</p></div>
      <button onClick={() => void load()} disabled={loading} className="flex w-fit items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 disabled:opacity-50"><RefreshCw className="size-3.5" />Atualizar</button>
    </header>
    {error && <p role="alert" className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">{error}</p>}
    {loading ? <div className="flex min-h-40 items-center justify-center rounded-xl border border-white/[0.07] bg-[#11161e] text-sm text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando relatórios...</div> : <>
      {canViewCommercial && <section className="space-y-4 rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-100">Relatório comercial</h2><p className="mt-1 text-xs text-slate-500">Leads, clientes, propostas e contratos visíveis para sua conta.</p></div>{canExportCommercial && <button onClick={exportCommercial} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"><Download className="size-3.5" />Exportar CSV</button>}</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          ['Leads', commercial.leads.length],
          ['Clientes', commercial.clients.length],
          ['Propostas', commercial.proposals.length],
          ['Contratos', commercial.contracts.length],
        ].map(([label, value]) => <article key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p></article>)}</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Propostas por status</h3>{countByStatus(commercial.proposals).length ? countByStatus(commercial.proposals).map((item) => <p key={item.status} className="flex justify-between border-b border-white/[0.05] py-2 text-sm text-slate-300"><span>{item.status}</span><span>{item.count}</span></p>) : <p className="text-sm text-slate-500">Nenhuma proposta encontrada.</p>}</div>
          <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Contratos por status</h3>{countByStatus(commercial.contracts).length ? countByStatus(commercial.contracts).map((item) => <p key={item.status} className="flex justify-between border-b border-white/[0.05] py-2 text-sm text-slate-300"><span>{item.status}</span><span>{item.count}</span></p>) : <p className="text-sm text-slate-500">Nenhum contrato encontrado.</p>}</div>
        </div>
      </section>}
      {canViewFinancial && <section className="space-y-4 rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-100">Relatório financeiro</h2><p className="mt-1 text-xs text-slate-500">Valores consolidados a partir de contas a receber e a pagar.</p></div>{canExportFinancial && <button onClick={exportFinancial} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"><Download className="size-3.5" />Exportar CSV</button>}</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          ['Total a receber', money(totalReceivable)],
          ['Recebido', money(received)],
          ['Em aberto', money(outstanding)],
          ['Em atraso', money(overdue)],
          ['Total a pagar', money(totalPayable)],
        ].map(([label, value]) => <article key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-100">{value}</p></article>)}</div>
      </section>}
      {!canViewCommercial && !canViewFinancial && <p className="rounded-xl border border-white/[0.07] bg-[#11161e] p-6 text-sm text-slate-400">Seu cargo não possui permissão para consultar relatórios.</p>}
    </>}
  </section>
}
