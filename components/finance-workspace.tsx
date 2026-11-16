'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CircleDollarSign, Download, Eye, Pencil, Plus, RefreshCw, Search, Trash2, TrendingDown, TrendingUp, WalletCards, X } from 'lucide-react'
import { FinanceCashflowChart, FinanceCategoryChart } from '@/components/finance-cashflow-chart'
import { createClient } from '@/lib/supabase/client'
import { ListingControls } from '@/components/listing-controls'
import { EntityAttachments } from '@/components/entity-attachments'

type Receivable = {
  id: string
  description: string
  category: string
  final_amount: number
  paid_amount: number
  due_date: string
  status: string
  original_amount?: number
  created_at?: string
}

type Payable = {
  id: string
  beneficiary: string
  description: string
  amount: number
  paid_amount: number
  due_date: string
  status: string
  created_at?: string
}

type FinanceRecord = Receivable | Payable
type PaymentEvent = { id: string; account_type: 'receivable' | 'payable'; account_id: string; amount: number; payment_date: string; payment_method: string | null; notes: string | null; created_at: string }
type RecurringSchedule = { id: string; description: string; kind: 'receita' | 'despesa'; amount: number; category: string; beneficiary: string | null; frequency: string; anchor_day: number; first_due_date: string; end_date: string | null; status: 'active' | 'paused' | 'ended'; next_due_date: string; last_generated_date: string | null }

type RangeOption = '30d' | '90d' | 'all'
type FinanceTab = 'overview' | 'receivable' | 'payable' | 'recurring' | 'cashflow' | 'budget'

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const inputClass = 'w-full rounded-lg border border-white/10 bg-[#151b24] px-3 py-2 text-sm text-white'

function getRecordTotal(item: Receivable | Payable) {
  return 'amount' in item ? Number(item.amount || 0) : Number(item.final_amount || 0)
}

function isSettledStatus(status: string) {
  return ['pago', 'paga', 'recebido', 'recebida', 'quitado', 'paid', 'received', 'settled'].includes(status.trim().toLocaleLowerCase('pt-BR'))
}

function isCancelledStatus(status: string) {
  return ['cancelado', 'cancelada', 'canceled', 'cancelled'].includes(status.trim().toLocaleLowerCase('pt-BR'))
}

function isRecordSettled(item: Receivable | Payable) {
  const total = getRecordTotal(item)
  return isSettledStatus(item.status) || (total > 0 && Number(item.paid_amount || 0) >= total)
}

function getOpenBalance(item: Receivable | Payable) {
  if (isRecordSettled(item) || isCancelledStatus(item.status)) return 0
  return Math.max(getRecordTotal(item) - Number(item.paid_amount || 0), 0)
}

function isOverdue(item: Receivable | Payable) {
  if (!item.due_date || isRecordSettled(item) || isCancelledStatus(item.status) || getOpenBalance(item) <= 0) return false
  const due = new Date(`${item.due_date.slice(0, 10)}T12:00:00`)
  return due.getTime() < Date.now()
}

function getSettlementStatus(item: Receivable | Payable) {
  return 'beneficiary' in item ? 'Pago' : 'Recebido'
}

function getSettlementLabel(item: Receivable | Payable) {
  return 'beneficiary' in item ? 'Paga' : 'Recebida'
}

function getSelectedStatus(item: Receivable | Payable) {
  if (isRecordSettled(item)) return getSettlementStatus(item)
  if (item.status.trim().toLocaleLowerCase('pt-BR') === 'pendente') return 'Pendente'
  return item.status || 'Pendente'
}

function getStatusLabel(item: Receivable | Payable) {
  if (isCancelledStatus(item.status)) return 'Cancelada'
  if (isRecordSettled(item)) return getSettlementLabel(item)
  if (isOverdue(item)) return 'Atrasada'
  if (Number(item.paid_amount || 0) > 0) return 'beneficiary' in item ? 'Parcialmente paga' : 'Parcialmente recebida'
  return item.status || 'Pendente'
}

function getStatusOptions(item: Receivable | Payable) {
  const options = [
    { value: 'Pendente', label: 'Pendente' },
    { value: getSettlementStatus(item), label: getSettlementLabel(item) },
    { value: 'Cancelado', label: 'Cancelada' },
  ]
  const currentStatus = item.status.trim()
  if (currentStatus && !options.some((option) => option.value.toLocaleLowerCase('pt-BR') === currentStatus.toLocaleLowerCase('pt-BR'))) {
    options.push({ value: currentStatus, label: getStatusLabel(item) })
  }
  return options
}

function localDateInput() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function withinRange(dateValue: string | null | undefined, range: RangeOption) {
  if (!dateValue || range === 'all') return true
  const date = new Date(`${dateValue.slice(0, 10)}T12:00:00`)
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - (range === '30d' ? 30 : 90))
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  return date >= from && date <= to
}

export function FinanceWorkspace({ initialTab = 'overview', permissions = [] }: { initialTab?: FinanceTab; permissions?: string[] }) {
  const [tab, setTab] = useState<FinanceTab>(initialTab)
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([])
  const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([])
  const [paymentTableMissing, setPaymentTableMissing] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: localDateInput(), payment_method: 'Transferência', notes: '' })
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rangeFilter, setRangeFilter] = useState<RangeOption>('30d')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: '', amount: '', due_date: '' })
  const [recurringForm, setRecurringForm] = useState({ description: '', kind: 'despesa' as 'receita' | 'despesa', amount: '', category: 'Operacional', frequency: 'monthly', first_due_date: '', end_date: '' })
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [record, setRecord] = useState<FinanceRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState(false)
  const [saving, setSaving] = useState(false)
  const permissionModule = tab === 'payable' ? 'accounts_payable' : tab === 'recurring' ? 'finance' : 'accounts_receivable'
  const canCreate = permissions.includes('*') || permissions.includes(`${permissionModule}:create`)
  const canUpdate = permissions.includes('*') || permissions.includes(`${permissionModule}:update`)
  const canDelete = permissions.includes('*') || permissions.includes(`${permissionModule}:delete`)

  async function load() {
    setLoading(true)
  const supabase = createClient()
  const { error: generationError } = await supabase.rpc('generate_financial_recurring_cycles', { p_until: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10) })
  if (generationError) setMessage(`Não foi possível gerar recorrências: ${generationError.message}`)
  const [receivableResult, payableResult, recurringResult, paymentResult] = await Promise.all([
      supabase.from('accounts_receivable').select('id,description,category,original_amount,final_amount,paid_amount,due_date,status,created_at,recurring_schedule_id,recurring_cycle_key').order('due_date'),
      supabase.from('accounts_payable').select('id,beneficiary,description,amount,paid_amount,due_date,status,created_at,recurring_schedule_id,recurring_cycle_key').order('due_date'),
      supabase.from('financial_recurring_schedules').select('id,description,kind,amount,category,beneficiary,frequency,anchor_day,first_due_date,end_date,status,next_due_date,last_generated_date').order('next_due_date'),
      supabase.from('finance_payment_events').select('id,account_type,account_id,amount,payment_date,payment_method,notes,created_at').order('payment_date', { ascending: false }),
    ])
    const missingPaymentTable = paymentResult.error?.code === '42P01' || paymentResult.error?.code === 'PGRST205'
    setPaymentTableMissing(Boolean(missingPaymentTable))
    if (paymentResult.error && !missingPaymentTable) setMessage(`Não foi possível carregar o histórico de pagamentos: ${paymentResult.error.message}`)
    if (receivableResult.error || payableResult.error || recurringResult.error) {
      const loadError = receivableResult.error || payableResult.error || recurringResult.error
      setMessage(`Não foi possível carregar lançamentos: ${loadError.message}`)
    }
    setReceivables((receivableResult.data ?? []) as Receivable[])
    setPayables((payableResult.data ?? []) as Payable[])
    setRecurringSchedules((recurringResult.data ?? []) as RecurringSchedule[])
    setPaymentEvents((paymentResult.data ?? []) as PaymentEvent[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selectedPermission = tab === 'payable' ? 'accounts_payable:create' : 'accounts_receivable:create'
    if (!permissions.includes('*') && !permissions.includes(selectedPermission)) return
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0 || !form.description.trim() || !form.due_date) {
      setMessage('Informe descrição, valor positivo e vencimento.')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const table = tab === 'payable' ? 'accounts_payable' : 'accounts_receivable'
    const payload = tab === 'payable'
      ? { beneficiary: 'A definir', description: form.description, amount, paid_amount: 0, due_date: form.due_date, status: 'Pendente' }
      : { description: form.description, original_amount: amount, final_amount: amount, paid_amount: 0, due_date: form.due_date, status: 'Pendente' }
    const { error: insertError } = await supabase.from(table).insert(payload)
    if (insertError) setMessage(`Não foi possível salvar o lançamento: ${insertError.message}`)
    else { setMessage('Lançamento criado.'); setShowForm(false); setForm({ description: '', amount: '', due_date: '' }); await load() }
    setSaving(false)
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!record || !canUpdate || paymentTableMissing) return
    const amount = Number(paymentForm.amount)
    const openBalance = getOpenBalance(record)
    if (!Number.isFinite(amount) || amount <= 0 || amount > openBalance || !paymentForm.payment_date || paymentForm.payment_date > localDateInput()) {
      setMessage('Informe um valor positivo dentro do saldo e uma data de pagamento válida.')
      return
    }
    setSaving(true)
    setMessage('')
    const { error } = await createClient().rpc('record_finance_payment', {
      p_account_type: 'beneficiary' in record ? 'payable' : 'receivable',
      p_account_id: record.id,
      p_amount: amount,
      p_payment_date: paymentForm.payment_date,
      p_payment_method: paymentForm.payment_method,
      p_notes: paymentForm.notes.trim() || null,
    })
    if (error) setMessage(`Não foi possível registrar o pagamento: ${error.message}`)
    else {
      const nextPaid = Number(record.paid_amount || 0) + amount
      const fullySettled = nextPaid >= getRecordTotal(record)
      setRecord({ ...record, paid_amount: nextPaid, status: fullySettled ? getSettlementStatus(record) : ('beneficiary' in record ? 'Parcialmente paga' : 'Parcialmente recebida') } as FinanceRecord)
      setPaymentForm({ amount: '', payment_date: localDateInput(), payment_method: 'Transferência', notes: '' })
      setShowPaymentForm(false)
      setMessage('Pagamento registrado e saldo atualizado.')
      await load()
    }
    setSaving(false)
  }

  async function createRecurring(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if ((!editingRecurringId && !canCreate) || (editingRecurringId && !canUpdate) || !recurringForm.description || !recurringForm.amount || !recurringForm.first_due_date) return
    setSaving(true)
    const client = createClient()
    const { data: authData } = await client.auth.getUser()
    if (!authData.user) { setMessage('Sessão inválida para criar recorrência.'); setSaving(false); return }
    if (recurringForm.end_date && recurringForm.end_date < recurringForm.first_due_date) {
      setMessage('A data final deve ser igual ou posterior ao primeiro vencimento.')
      setSaving(false)
      return
    }
    const firstDue = new Date(`${recurringForm.first_due_date}T12:00:00`)
    const payload = {
      description: recurringForm.description.trim(), kind: recurringForm.kind, amount: Number(recurringForm.amount), category: recurringForm.category.trim() || 'Operacional', frequency: recurringForm.frequency,
      anchor_day: firstDue.getDate(), first_due_date: recurringForm.first_due_date, next_due_date: recurringForm.first_due_date, end_date: recurringForm.end_date || null,
    }
    const { error } = editingRecurringId
      ? await client.from('financial_recurring_schedules').update(payload).eq('id', editingRecurringId)
      : await client.from('financial_recurring_schedules').insert({ ...payload, created_by: authData.user.id, status: 'active' })
    if (error) {
      const isDateConstraint = error.code === '23514' && error.message.includes('financial_recurring_schedules_check')
      setMessage(isDateConstraint ? 'A data final deve ser igual ou posterior ao primeiro vencimento.' : `Não foi possível criar a recorrência: ${error.message}`)
    }
    else { setMessage(editingRecurringId ? 'Recorrência atualizada.' : 'Recorrência criada.'); setEditingRecurringId(null); setRecurringForm({ description: '', kind: 'despesa', amount: '', category: 'Operacional', frequency: 'monthly', first_due_date: '', end_date: '' }); await load() }
    setSaving(false)
  }

  function startRecurringEdit(item: RecurringSchedule) {
    setEditingRecurringId(item.id)
    setRecurringForm({ description: item.description, kind: item.kind, amount: String(item.amount), category: item.category, frequency: item.frequency, first_due_date: item.first_due_date, end_date: item.end_date ?? '' })
    setMessage('Editando recorrência.')
  }

  async function deleteRecurring(item: RecurringSchedule) {
    if (!canDelete || !window.confirm(`Excluir a recorrência “${item.description}”? Os lançamentos já gerados serão preservados.`)) return
  const { data: deletedRows, error } = await createClient().from('financial_recurring_schedules').delete().eq('id', item.id).select('id')
  if (error) setMessage(`Não foi possível excluir a recorrência: ${error.message}`)
  else if (!deletedRows?.length) setMessage('A recorrência não foi excluída. Verifique sua permissão para excluir registros financeiros.')
  else { if (editingRecurringId === item.id) setEditingRecurringId(null); setMessage('Recorrência excluída.'); await load() }
  }

  async function deleteRecord(item: FinanceRecord) {
    if (!canDelete || !window.confirm(`Excluir o lançamento “${'beneficiary' in item ? item.beneficiary : item.description}”? Esta ação não pode ser desfeita.`)) return
    const table = tab === 'payable' ? 'accounts_payable' : 'accounts_receivable'
    const { error: deleteError } = await createClient().from(table).delete().eq('id', item.id)
    if (deleteError) setMessage(`Não foi possível excluir o lançamento: ${deleteError.message}`)
    else { setRecord(null); setEditingRecord(false); setMessage('Lançamento excluído.'); await load() }
  }

  async function updateRecordStatus(item: FinanceRecord, nextStatus: string) {
    if (!canUpdate || !getStatusOptions(item).some((option) => option.value === nextStatus)) return
    const wasSettled = isRecordSettled(item)
    const becomesPending = nextStatus.toLocaleLowerCase('pt-BR') === 'pendente'
    if (wasSettled && becomesPending && !window.confirm('Voltar para pendente vai zerar o valor marcado como pago. Deseja continuar?')) return

    const payload: { status: string; paid_amount?: number } = { status: nextStatus }
    if (isSettledStatus(nextStatus)) payload.paid_amount = getRecordTotal(item)
    else if (wasSettled && becomesPending) payload.paid_amount = 0

    setSaving(true)
    setMessage('')
    const table = 'beneficiary' in item ? 'accounts_payable' : 'accounts_receivable'
    const { data, error } = await createClient().from(table).update(payload).eq('id', item.id).select('id').maybeSingle()
    if (error) setMessage(`Não foi possível alterar o status: ${error.message}`)
    else if (!data) setMessage('O lançamento não foi alterado. Verifique sua permissão para atualizar registros financeiros.')
    else {
      const updatedItem = { ...item, ...payload } as FinanceRecord
      if ('beneficiary' in item) setPayables((current) => current.map((entry) => entry.id === item.id ? updatedItem as Payable : entry))
      else setReceivables((current) => current.map((entry) => entry.id === item.id ? updatedItem as Receivable : entry))
      setRecord((current) => current?.id === item.id ? updatedItem : current)
      setMessage('Status atualizado.')
    }
    setSaving(false)
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!record || !canUpdate) return
    setSaving(true)
    setMessage('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const table = tab === 'payable' ? 'accounts_payable' : 'accounts_receivable'
    const nextStatus = String(data.status || getSelectedStatus(record))
    const amount = record.paid_amount === 0 ? Number(data.amount) : getRecordTotal(record)
    if (!getStatusOptions(record).some((option) => option.value === nextStatus)) {
      setMessage('Selecione um status válido.')
      setSaving(false)
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Informe um valor válido para o lançamento.')
      setSaving(false)
      return
    }
    const wasSettled = isRecordSettled(record)
    const becomesPending = nextStatus.toLocaleLowerCase('pt-BR') === 'pendente'
    if (wasSettled && becomesPending && !window.confirm('Voltar para pendente vai zerar o valor marcado como pago. Deseja continuar?')) {
      setSaving(false)
      return
    }
    const statusPayload: { status: string; paid_amount?: number } = { status: nextStatus }
    if (isSettledStatus(nextStatus)) statusPayload.paid_amount = amount
    else if (wasSettled && becomesPending) statusPayload.paid_amount = 0
    const payload = tab === 'payable'
      ? { beneficiary: data.beneficiary, description: data.description, due_date: data.due_date, ...statusPayload, ...(record.paid_amount === 0 ? { amount: Number(data.amount) } : {}) }
      : { description: data.description, due_date: data.due_date, ...statusPayload, ...(record.paid_amount === 0 ? { final_amount: Number(data.amount), original_amount: Number(data.amount) } : {}) }
    const { error: updateError } = await createClient().from(table).update(payload).eq('id', record.id)
    if (updateError) setMessage(`Não foi possível salvar as alterações: ${updateError.message}`)
    else { setRecord(null); setEditingRecord(false); await load() }
    setSaving(false)
  }

  const filteredReceivables = useMemo(() => receivables.filter((item) => {
    const matchesText = `${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())
    const matchesRange = withinRange(item.due_date, rangeFilter)
    return matchesText && matchesRange
  }), [receivables, query, rangeFilter])

  const filteredPayables = useMemo(() => payables.filter((item) => {
    const matchesText = `${item.description} ${item.beneficiary}`.toLowerCase().includes(query.toLowerCase())
    const matchesRange = withinRange(item.due_date, rangeFilter)
    return matchesText && matchesRange
  }), [payables, query, rangeFilter])

  const visibleFinanceRows = tab === 'payable' ? filteredPayables.slice(page * 10, page * 10 + 10) : filteredReceivables.slice(page * 10, page * 10 + 10)

  const outstandingReceivables = receivables.reduce((sum, item) => sum + getOpenBalance(item), 0)
  const outstandingPayables = payables.reduce((sum, item) => sum + getOpenBalance(item), 0)
  const overdueReceivables = receivables.filter(isOverdue).reduce((sum, item) => sum + getOpenBalance(item), 0)
  const overduePayables = payables.filter(isOverdue).reduce((sum, item) => sum + getOpenBalance(item), 0)
  const netCash = outstandingReceivables - outstandingPayables

  const periodReceivables = paymentEvents.filter((item) => item.account_type === 'receivable' && withinRange(item.payment_date, rangeFilter)).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const periodPayables = paymentEvents.filter((item) => item.account_type === 'payable' && withinRange(item.payment_date, rangeFilter)).reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const topCategories = useMemo(() => {
    const combined = [...filteredReceivables.map((item) => ({ label: item.category || 'Sem categoria', value: getOpenBalance(item) }))]
    const payableBalance = filteredPayables.reduce((sum, item) => sum + getOpenBalance(item), 0)
    if (payableBalance > 0) combined.push({ label: 'Contas a pagar', value: payableBalance })
    const summary = combined.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.label] = (accumulator[item.label] ?? 0) + item.value
      return accumulator
    }, {})
    return Object.entries(summary).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [filteredReceivables, filteredPayables])

  const alerts = useMemo(() => {
    const receivableAlerts = filteredReceivables.filter(isOverdue).slice(0, 3).map((item) => ({
      title: `${item.description} em atraso`,
      detail: `${money(getOpenBalance(item))} · vence em ${new Date(`${item.due_date}T12:00:00`).toLocaleDateString('pt-BR')}`,
      tone: 'amber',
    }))

    const payableAlerts = filteredPayables.filter(isOverdue).slice(0, 3).map((item) => ({
      title: `${item.description} vencida`,
      detail: `${money(getOpenBalance(item))} · vence em ${new Date(`${item.due_date}T12:00:00`).toLocaleDateString('pt-BR')}`,
      tone: 'rose',
    }))

    return [...receivableAlerts, ...payableAlerts].slice(0, 5)
  }, [filteredReceivables, filteredPayables])

  const cashflowSeries = useMemo(() => {
    const monthEntries = new Map<string, { key: string; label: string; inflow: number; outflow: number }>()
    const now = new Date()

    for (let offset = 5; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      monthEntries.set(key, {
        key,
        label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(monthDate),
        inflow: 0,
        outflow: 0,
      })
    }

    paymentEvents.forEach((payment) => {
      const monthDate = new Date(`${payment.payment_date.slice(0, 10)}T12:00:00`)
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      const entry = monthEntries.get(key)
      if (!entry) return
      if (payment.account_type === 'payable') entry.outflow += Number(payment.amount || 0)
      else entry.inflow += Number(payment.amount || 0)
    })

    return Array.from(monthEntries.values())
  }, [paymentEvents])

  const totalInflow = cashflowSeries.reduce((sum, item) => sum + item.inflow, 0)
  const totalOutflow = cashflowSeries.reduce((sum, item) => sum + item.outflow, 0)
  const netCashflow = totalInflow - totalOutflow

  const recurringTotal = recurringSchedules.filter((item) => item.status === 'active').reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const budgetLines = useMemo(() => {
    const lines = [...topCategories.map(([label, value]) => ({
      label,
      actual: value,
      planned: Math.max(value * 1.08, value + 50),
      type: value >= 0 ? 'saldo' : 'gasto',
    }))]

    if (!lines.length) {
      const fallback = [
        { label: 'Disponibilidade líquida', actual: Math.max(netCash, 0), planned: Math.max(netCash, 0), type: 'saldo' },
        { label: 'Compromissos', actual: Math.max(outstandingPayables, 0), planned: Math.max(outstandingPayables * 1.05, 0), type: 'gasto' },
      ]
      return fallback
    }

    return lines.slice(0, 5)
  }, [topCategories, netCash, outstandingPayables])

  const budgetVariance = budgetLines.reduce((sum, item) => sum + (item.planned - item.actual), 0)
  const expectedReceipts = outstandingReceivables * 0.92
  const expectedPayments = outstandingPayables * 1.08
  const reservedCash = Math.max(netCash - expectedPayments * 0.15, 0)

  const tabs = [['overview', 'Visão geral'], ['receivable', 'A receber'], ['payable', 'A pagar'], ['cashflow', 'Fluxo de caixa'], ['recurring', 'Recorrências'], ['budget', 'Orçamento']] as const
  const stats = [
    { label: 'Saldo em aberto', value: money(outstandingReceivables - outstandingPayables), icon: WalletCards, tone: 'text-cyan-400' },
    { label: 'Receitas em aberto', value: money(outstandingReceivables), icon: TrendingUp, tone: 'text-emerald-400' },
    { label: 'Despesas em aberto', value: money(outstandingPayables), icon: TrendingDown, tone: 'text-rose-400' },
    { label: 'Vencimentos em atraso', value: money(overdueReceivables + overduePayables), icon: AlertTriangle, tone: 'text-amber-400' },
  ]

  return <section className="space-y-6" id="finance-workspace">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Financeiro</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Controle financeiro</h1>
        <p className="mt-1 text-sm text-slate-500">Indicadores reais do módulo financeiro com base em contas a receber e pagar cadastradas.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => void load()} className="rounded-lg border border-white/[0.08] p-2.5 text-slate-400 hover:text-white" aria-label="Atualizar"><RefreshCw className="size-4" /></button>
        <button disabled={!canCreate} onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="size-4" />Novo lançamento</button>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#11161e] p-1">
        {tabs.map(([value, label]) => (
          <button key={value} onClick={() => { setTab(value); setRecord(null); setEditingRecord(false) }} className={`whitespace-nowrap rounded-md px-3 py-2 text-xs ${tab === value ? 'bg-blue-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>
      <select value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value as RangeOption)} className={`${inputClass} w-auto min-w-[140px] py-2 text-xs`}>
        <option value="30d">Últimos 30 dias</option>
        <option value="90d">Últimos 90 dias</option>
        <option value="all">Todo o período</option>
      </select>
    </div>

    {message && <p role="status" className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-300">{message}</p>}
    {paymentTableMissing && <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">O histórico detalhado está pendente. Para habilitar registro e datas reais de pagamento, aplique manualmente o arquivo <code>supabase/manual/finance_payment_events.sql</code> no Supabase SQL Editor.</p>}

    {showForm && <form onSubmit={(event) => void createEntry(event)} className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#11161e] p-5 sm:grid-cols-[1fr_160px_170px_auto]"><input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descrição" className={inputClass} /><input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Valor" className={inputClass} /><input required type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className={inputClass} /><button disabled={saving} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button></form>}

    {tab === 'recurring' && (canCreate || canUpdate) && <form onSubmit={(event) => void createRecurring(event)} className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#11161e] p-5 sm:grid-cols-2 lg:grid-cols-4"><input required value={recurringForm.description} onChange={(event) => setRecurringForm({ ...recurringForm, description: event.target.value })} placeholder="Descrição da recorrência" className={inputClass} /><select value={recurringForm.kind} onChange={(event) => setRecurringForm({ ...recurringForm, kind: event.target.value as 'receita' | 'despesa' })} className={inputClass}><option value="despesa">Despesa</option><option value="receita">Receita</option></select><input required min="0.01" step="0.01" type="number" value={recurringForm.amount} onChange={(event) => setRecurringForm({ ...recurringForm, amount: event.target.value })} placeholder="Valor" className={inputClass} /><input value={recurringForm.category} onChange={(event) => setRecurringForm({ ...recurringForm, category: event.target.value })} placeholder="Categoria" className={inputClass} /><select value={recurringForm.frequency} onChange={(event) => setRecurringForm({ ...recurringForm, frequency: event.target.value })} className={inputClass}><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="yearly">Anual</option></select><input required type="date" value={recurringForm.first_due_date} onChange={(event) => setRecurringForm({ ...recurringForm, first_due_date: event.target.value })} className={inputClass} aria-label="Primeiro vencimento" /><input type="date" min={recurringForm.first_due_date || undefined} value={recurringForm.end_date} onChange={(event) => setRecurringForm({ ...recurringForm, end_date: event.target.value })} className={inputClass} aria-label="Data final opcional" /><button disabled={saving} className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:col-span-2 lg:col-span-4">{saving ? 'Salvando...' : editingRecurringId ? 'Salvar alterações' : 'Cadastrar recorrência'}</button></form>}

    {tab === 'overview' && (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, icon: MetricIcon, tone }) => (
            <article key={label} className="rounded-xl border border-white/[0.07] bg-[#11161e] p-4">
              <MetricIcon className={`size-5 ${tone}`} />
              <p className="mt-4 text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold text-white">{value}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-200">Saldo em aberto por categoria</h2>
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Periodo: {rangeFilter === '30d' ? '30 dias' : rangeFilter === '90d' ? '90 dias' : 'completo'}</span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">Receitas registradas</p>
                <p className="mt-2 text-xl font-semibold text-white">{money(periodReceivables)}</p>
              </div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-rose-300">Despesas registradas</p>
                <p className="mt-2 text-xl font-semibold text-white">{money(periodPayables)}</p>
              </div>
            </div>

            <div className="mt-5">
              {topCategories.length === 0 ? <p className="text-xs text-slate-500">Ainda não há saldos em aberto para comparar.</p> : <FinanceCategoryChart data={topCategories.map(([label, amount]) => ({ label, amount }))} />}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
            <h2 className="text-sm font-semibold text-slate-200">Alertas financeiros</h2>
            <div className="mt-4 space-y-3">
              {alerts.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum alerta encontrado no período selecionado.</p>
              ) : alerts.map((alert) => (
                <div key={`${alert.title}-${alert.detail}`} className={`rounded-lg border p-3 ${alert.tone === 'amber' ? 'border-amber-500/20 bg-amber-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                  <p className="text-sm font-medium text-white">{alert.title}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{alert.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    )}

    {tab === 'cashflow' && <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Fluxo de caixa</h2>
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">últimos 6 meses</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">Entradas</p>
            <p className="mt-2 text-xl font-semibold text-white">{money(totalInflow)}</p>
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-rose-300">Saídas</p>
            <p className="mt-2 text-xl font-semibold text-white">{money(totalOutflow)}</p>
          </div>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">Saldo líquido</p>
            <p className="mt-2 text-xl font-semibold text-white">{money(netCashflow)}</p>
          </div>
        </div>

        <div className="mt-5">
          {totalInflow + totalOutflow === 0 && !paymentTableMissing && <p className="mb-3 text-xs text-slate-500">Nenhum pagamento registrado nos últimos seis meses.</p>}
          <FinanceCashflowChart data={cashflowSeries} />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Resumo rápido</h2>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Saldo realizado (6 meses)</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(netCashflow)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Maior saída</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(Math.max(...cashflowSeries.map((item) => item.outflow), 0))}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Maior entrada</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(Math.max(...cashflowSeries.map((item) => item.inflow), 0))}</p>
          </div>
        </div>
      </div>
    </div>}

    {tab === 'recurring' && <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Recorrências detectadas</h2>
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{recurringSchedules.length} padrões</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">Volume recorrente</p>
            <p className="mt-2 text-xl font-semibold text-white">{money(recurringTotal)}</p>
          </div>
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-violet-300">Itens detectados</p>
            <p className="mt-2 text-xl font-semibold text-white">{recurringSchedules.length}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {recurringSchedules.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma recorrência cadastrada.</p>
          ) : recurringSchedules.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{item.description}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{item.kind === 'receita' ? 'Receita recorrente' : 'Despesa recorrente'} · {item.frequency === 'monthly' ? 'Mensal' : item.frequency === 'weekly' ? 'Semanal' : 'Anual'}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${item.kind === 'receita' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                  {item.status === 'active' ? 'Ativa' : item.status === 'paused' ? 'Pausada' : 'Encerrada'}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>Próximo vencimento</span>
                <span>{item.next_due_date ? new Date(`${item.next_due_date}T12:00:00`).toLocaleDateString('pt-BR') : 'N/A'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Último lançamento</span>
                <span>{item.last_generated_date ? new Date(`${item.last_generated_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Ainda não gerado'}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{money(item.amount)}</p>
                <div className="flex gap-2">
                  {canUpdate && <button type="button" onClick={() => startRecurringEdit(item)} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5" aria-label={`Editar ${item.description}`}><Pencil className="size-4" /></button>}
                  {canDelete && <button type="button" onClick={() => void deleteRecurring(item)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300 hover:bg-rose-400/10" aria-label={`Excluir ${item.description}`}><Trash2 className="size-4" /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Sugestão de operação</h2>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Cobrança prevista</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(recurringSchedules.filter((item) => item.kind === 'receita').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Despesas recorrentes</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(recurringSchedules.filter((item) => item.kind === 'despesa').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Saldo recorrente</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(recurringSchedules.filter((item) => item.kind === 'receita').reduce((sum, item) => sum + Number(item.amount || 0), 0) - recurringSchedules.filter((item) => item.kind === 'despesa').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
          </div>
        </div>
      </div>
    </div>}

    {tab === 'budget' && <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Planejamento orçamentário</h2>
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">estimativas sobre compromissos em aberto</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">Receita prevista</p>
            <p className="mt-2 text-xl font-semibold text-white">{money(expectedReceipts)}</p>
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-rose-300">Despesa prevista</p>
            <p className="mt-2 text-xl font-semibold text-white">{money(expectedPayments)}</p>
          </div>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">Reserva</p>
            <p className="mt-2 text-xl font-semibold text-white">{money(reservedCash)}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {budgetLines.map((item) => {
            const variance = item.planned - item.actual
            const width = Math.max(Math.min((item.actual / Math.max(item.planned, 1)) * 100, 100), 12)
            return (
              <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>{item.label}</span>
                  <span>{variance >= 0 ? '+' : '-'}{money(Math.abs(variance))}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className={`h-2 rounded-full ${variance >= 0 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`} style={{ width: `${width}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Real: {money(item.actual)}</span>
                  <span>Meta: {money(item.planned)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Projeção orçamentária estimada</h2>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Variação prevista</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(budgetVariance)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Margem operacional</p>
            <p className="mt-2 text-lg font-semibold text-white">{money(Math.max(netCash - expectedPayments * 0.1, 0))}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Status</p>
            <p className="mt-2 text-lg font-semibold text-white">{budgetVariance >= 0 ? 'Dentro do plano' : 'Ajuste requerido'}</p>
          </div>
        </div>
      </div>
    </div>}

    {tab !== 'overview' && tab !== 'cashflow' && tab !== 'recurring' && tab !== 'budget' && <div className="rounded-xl border border-white/[0.07] bg-[#11161e]">
      <div className="flex items-center justify-between border-b border-white/[0.07] p-4">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2">
          <Search className="size-4 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lançamento" className="bg-transparent text-xs text-white outline-none" />
        </div>
        <button className="hidden items-center gap-2 text-xs text-slate-500 hover:text-white sm:flex"><Download className="size-3.5" />Exportar</button>
      </div>

      {loading ? (
        <p className="p-8 text-center text-xs text-slate-500">Carregando lançamentos...</p>
      ) : (
        <>
          <ListingControls total={tab === 'payable' ? filteredPayables.length : filteredReceivables.length} page={page} onPageChange={setPage} hasActiveFilters={Boolean(query)} onClear={() => { setQuery(''); setPage(0) }} />
          <p className="border-b border-white/[0.06] px-5 py-2 text-[11px] text-slate-500">O status “Atrasada” é calculado automaticamente quando o vencimento passa sem a quitação total.</p>
          <div className="divide-y divide-white/[0.06]">
            {visibleFinanceRows.map((item) => (
              <div key={item.id} className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <div>
                  <p className="text-sm text-slate-200">{item.description}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{'beneficiary' in item ? item.beneficiary : item.category} · vencimento {item.due_date ? new Date(`${item.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{money(getRecordTotal(item))}</p>
                    <p className="text-[11px] text-slate-500">{getStatusLabel(item)}</p>
                  </div>
                  {canUpdate && <select aria-label={`Alterar status de ${item.description}`} disabled={saving} value={getSelectedStatus(item)} onChange={(event) => void updateRecordStatus(item, event.target.value)} className={`${inputClass} w-auto min-w-[136px] py-2 text-xs disabled:opacity-50`}>
                    {getStatusOptions(item).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>}
                  <button onClick={() => { setRecord(item); setEditingRecord(false); setShowPaymentForm(false); setMessage('') }} aria-label={`Ver detalhes de ${item.description}`} className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Eye className="size-4" /></button>
                  {canUpdate && <button onClick={() => { setRecord(item); setEditingRecord(true); setMessage('') }} aria-label={`Editar lançamento ${item.description}`} className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="size-4" /></button>}
                  {canDelete && <button onClick={() => void deleteRecord(item)} aria-label={`Excluir lançamento ${item.description}`} className="rounded p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-4" /></button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>}

    {record && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecord(null) }}><div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-blue-300">{'beneficiary' in record ? 'Conta a pagar' : 'Conta a receber'}</p><h3 className="mt-1 text-lg font-semibold text-white">{editingRecord ? 'Editar lançamento' : record.description}</h3></div><button type="button" onClick={() => setRecord(null)} aria-label="Fechar detalhes"><X className="size-5 text-slate-400" /></button></div>
      {editingRecord ? <form onSubmit={(event) => void saveRecord(event)} className="grid gap-3">
        {'beneficiary' in record && <label className="text-xs text-slate-400">Beneficiário<input name="beneficiary" required defaultValue={record.beneficiary} className={`${inputClass} mt-1`} /></label>}
        <label className="text-xs text-slate-400">Descrição<input name="description" required defaultValue={record.description} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs text-slate-400">Vencimento<input name="due_date" type="date" required defaultValue={record.due_date?.slice(0, 10) || ''} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs text-slate-400">Status<select name="status" defaultValue={getSelectedStatus(record)} className={`${inputClass} mt-1`}>
          {getStatusOptions(record).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <p className="text-[11px] text-slate-500">“Atrasada” é calculada pelo vencimento; pagamentos parciais aparecem conforme o valor já pago.</p>
        <label className="text-xs text-slate-400">Valor<input name="amount" type="number" min="0.01" step="0.01" required disabled={record.paid_amount > 0} defaultValue={'amount' in record ? record.amount : record.final_amount} className={`${inputClass} mt-1 disabled:opacity-50`} /></label>
        {record.paid_amount > 0 && <p className="text-xs text-amber-300">O valor não pode ser alterado após a existência de pagamentos registrados.</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingRecord(false)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white">{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form> : <><div className="grid gap-4 text-sm sm:grid-cols-2"><p className="text-slate-400">Valor<span className="mt-1 block text-slate-200">{money('amount' in record ? record.amount : record.final_amount)}</span></p><p className="text-slate-400">Pago<span className="mt-1 block text-slate-200">{money(record.paid_amount)}</span></p><p className="text-slate-400">Saldo em aberto<span className="mt-1 block text-slate-200">{money(getOpenBalance(record))}</span></p><p className="text-slate-400">Vencimento<span className="mt-1 block text-slate-200">{record.due_date ? new Date(`${record.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}</span></p><p className="text-slate-400">Status<span className="mt-1 block text-slate-200">{getStatusLabel(record)}</span></p><p className="text-slate-400 sm:col-span-2">{'beneficiary' in record ? 'Beneficiário' : 'Categoria'}<span className="mt-1 block text-slate-200">{'beneficiary' in record ? record.beneficiary : record.category}</span></p></div><EntityAttachments entityType={'beneficiary' in record ? 'accounts_payable' : 'accounts_receivable'} entityId={record.id} canUpload={permissions.includes('*') || permissions.includes('attachments:upload')} canDownload={permissions.includes('*') || permissions.includes('attachments:download')} canDelete={permissions.includes('*') || permissions.includes('attachments:delete')} /><div className="mt-5 border-t border-white/[0.08] pt-4"><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold text-slate-200">Histórico de pagamentos</h4>{canUpdate && getOpenBalance(record) > 0 && <button disabled={paymentTableMissing} onClick={() => setShowPaymentForm((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"><CircleDollarSign className="size-4" />Registrar pagamento</button>}</div>{showPaymentForm && <form onSubmit={(event) => void recordPayment(event)} className="mt-4 grid gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Valor pago<input required type="number" min="0.01" max={getOpenBalance(record)} step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className={`${inputClass} mt-1`} /></label><label className="text-xs text-slate-400">Data do pagamento<input required type="date" max={localDateInput()} value={paymentForm.payment_date} onChange={(event) => setPaymentForm({ ...paymentForm, payment_date: event.target.value })} className={`${inputClass} mt-1`} /></label><label className="text-xs text-slate-400">Forma de pagamento<select value={paymentForm.payment_method} onChange={(event) => setPaymentForm({ ...paymentForm, payment_method: event.target.value })} className={`${inputClass} mt-1`}><option>Transferência</option><option>PIX</option><option>Boleto</option><option>Cartão</option><option>Dinheiro</option><option>Outro</option></select></label><label className="text-xs text-slate-400">Observação<input maxLength={500} value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} className={`${inputClass} mt-1`} /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowPaymentForm(false)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Cancelar</button><button disabled={saving || paymentTableMissing} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Registrando...' : 'Confirmar pagamento'}</button></div></form>}<div className="mt-3 divide-y divide-white/[0.06]">{paymentEvents.filter((payment) => payment.account_id === record.id && payment.account_type === ('beneficiary' in record ? 'payable' : 'receivable')).length === 0 ? <p className="py-3 text-xs text-slate-500">{paymentTableMissing ? 'O histórico ficará disponível após a aplicação do SQL pendente.' : 'Nenhum pagamento detalhado registrado.'}</p> : paymentEvents.filter((payment) => payment.account_id === record.id && payment.account_type === ('beneficiary' in record ? 'payable' : 'receivable')).map((payment) => <div key={payment.id} className="flex items-start justify-between gap-3 py-3 text-xs"><div><p className="font-medium text-slate-200">{payment.payment_method || 'Pagamento'}{payment.notes ? ` · ${payment.notes}` : ''}</p><p className="mt-1 text-slate-500">{new Date(`${payment.payment_date}T12:00:00`).toLocaleDateString('pt-BR')}</p></div><span className="font-semibold text-emerald-300">{money(payment.amount)}</span></div>)}</div></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setRecord(null)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Fechar</button>{canUpdate && <button onClick={() => setEditingRecord(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white"><Pencil className="size-3.5" />Editar</button>}</div></>}
    </div></div>}
  </section>
}
