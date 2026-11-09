'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, Loader2 } from 'lucide-react'

type Member = { user_id: string | null; full_name: string; email: string; status: string; role_name?: string | null }

type RequestRow = { id: string; task_id: string; requester_id: string; target_id: string; request_type: 'share' | 'transfer'; status: string; created_at?: string; responded_at?: string | null }
type HistoryRow = { id: string; actor_id: string; from_responsible_id: string | null; to_responsible_id: string | null; action_type: string; created_at: string }

export function TaskSharing({ taskId, projectId, currentUserId, responsibleId, onChanged }: { taskId: string; projectId: string; currentUserId: string; responsibleId: string | null; onChanged?: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [target, setTarget] = useState('')
  const [requestType, setRequestType] = useState<'share' | 'transfer'>('share')
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const supabase = createClient()

  async function load() {
    const [memberResult, requestResult, historyResult] = await Promise.all([
      supabase.from('team_members').select('user_id,full_name,email,status,role_name').eq('status', 'Ativo').order('full_name'),
      supabase.from('task_transfer_requests').select('id,task_id,requester_id,target_id,request_type,status,created_at,responded_at').eq('task_id', taskId).order('created_at', { ascending: false }),
      supabase.from('task_assignment_history').select('id,actor_id,from_responsible_id,to_responsible_id,action_type,created_at').eq('task_id', taskId).order('created_at', { ascending: false }),
    ])
    const loadedMembers = (memberResult.data ?? []) as Member[]
    setMembers(loadedMembers)
    setIsAdmin(loadedMembers.some((member) => member.user_id === currentUserId && member.status === 'Ativo' && /admin/i.test((member as Member & { role_name?: string }).role_name ?? '')))
    setRequests((requestResult.data ?? []) as RequestRow[])
    setHistory((historyResult.data ?? []) as HistoryRow[])
  }
  useEffect(() => { void load() }, [taskId])

  async function request() {
    if (!target || target === currentUserId) return
    setBusy(true); setMessage('')
    if (isAdmin) {
      const { error } = await supabase.rpc('admin_assign_workspace_task', {
        p_task_id: taskId,
        p_target_id: target,
        p_request_type: requestType,
      })
      if (error) { setMessage('Não foi possível aplicar a ação administrativa.'); setBusy(false); return }
      setMessage('Ação administrativa aplicada.'); setTarget(''); await load(); onChanged?.()
    } else {
      const { error } = await supabase.rpc('create_task_transfer_request', { p_task_id: taskId, p_target_id: target, p_request_type: requestType })
      if (error) setMessage(error.message.includes('pendente') ? 'Já existe uma solicitação pendente para este usuário.' : 'Não foi possível enviar a solicitação.')
      else { setMessage('Solicitação enviada para consentimento.'); setTarget(''); await load(); onChanged?.() }
    }
    setBusy(false)
  }

  async function respond(item: RequestRow, status: 'accepted' | 'rejected') {
    setBusy(true); setMessage('')
    const { error } = await supabase.rpc('respond_task_transfer_request', { p_request_id: item.id, p_status: status })
    if (!error) { await load(); onChanged?.() }
    else setMessage(error.message || 'Não foi possível responder à solicitação.')
    setBusy(false)
  }

  return <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
    <p className="text-xs font-semibold text-slate-300">Compartilhar ou transferir atividade</p>
    <div className="mt-2 flex flex-wrap gap-2"><select value={requestType} onChange={(event) => setRequestType(event.target.value as 'share' | 'transfer')} className="field"><option value="share">Compartilhar</option><option value="transfer">Transferir responsabilidade</option></select><select value={target} onChange={(event) => setTarget(event.target.value)} className="field"><option value="">Escolha um membro</option>{members.filter((member) => member.user_id && member.user_id !== currentUserId && member.user_id !== responsibleId).map((member) => <option key={member.user_id} value={member.user_id as string}>{member.full_name}</option>)}</select><button type="button" onClick={() => void request()} disabled={!target || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="size-3.5" />{busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Enviar'}</button></div>
    {requests.filter((item) => item.status === 'pending' && item.target_id === currentUserId).map((item) => <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-400/10 p-2 text-xs text-amber-100"><span>Solicitação de {item.request_type === 'share' ? 'compartilhamento' : 'transferência'} pendente.</span><span className="flex gap-1"><button type="button" onClick={() => void respond(item, 'accepted')} className="rounded bg-emerald-500/20 px-2 py-1">Aceitar</button><button type="button" onClick={() => void respond(item, 'rejected')} className="rounded bg-rose-500/20 px-2 py-1">Recusar</button></span></div>)}
    {requests.filter((item) => item.status !== 'pending').slice(0, 3).map((item) => <p key={item.id} className="mt-2 text-[11px] text-slate-500">{item.request_type === 'share' ? 'Compartilhamento' : 'Transferência'}: {item.status === 'accepted' ? 'aceita' : item.status === 'rejected' ? 'recusada' : item.status}.</p>)}
    {history.length > 0 && <div className="mt-3 border-t border-white/[0.06] pt-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Histórico de movimentações</p>{history.slice(0, 4).map((item) => <p key={item.id} className="mt-1 text-[11px] text-slate-500">{item.action_type.replace('admin_', 'administrador: ').replace('transfer', 'transferência').replace('share', 'compartilhamento')} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</p>)}</div>}
    {message && <p role="status" className="mt-2 text-xs text-slate-400">{message}</p>}
  </div>
}
