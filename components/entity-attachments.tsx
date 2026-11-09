'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadContractAttachment } from '@/lib/contract-attachments'
import { Download, ExternalLink, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'

type Attachment = { id: string; file_name: string; storage_path: string; mime_type: string; file_size: number; uploaded_by: string | null; created_at: string }
type TeamMember = { id: string; user_id: string | null; full_name: string }

export function EntityAttachments({ entityType, entityId, canUpload = true, canDownload = true, canDelete = true }: { entityType: string; entityId: string; canUpload?: boolean; canDownload?: boolean; canDelete?: boolean }) {
  const [items, setItems] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [members, setMembers] = useState<TeamMember[]>([])
  const supabase = createClient()

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const memberRequest = supabase.from('team_members').select('id,user_id,full_name')
      if (entityType === 'contract') {
        const [response, memberResult] = await Promise.all([
          fetch(`/api/workspace/contracts/${entityId}/attachments`),
          memberRequest,
        ])
        const result = await response.json() as { attachments?: Attachment[]; error?: string }
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os anexos do contrato.')
        setItems(result.attachments ?? [])
        if (memberResult.error) setMessage(`Anexos carregados, mas não foi possível identificar quem enviou: ${memberResult.error.message}`)
        else setMembers((memberResult.data ?? []) as TeamMember[])
      } else {
        const [attachmentResult, memberResult] = await Promise.all([
          supabase.from('entity_attachments').select('id,file_name,storage_path,mime_type,file_size,uploaded_by,created_at').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false }),
          memberRequest,
        ])
        if (attachmentResult.error) throw new Error(attachmentResult.error.message)
        setItems((attachmentResult.data ?? []) as Attachment[])
        if (memberResult.error) setMessage(memberResult.error.message)
        else setMembers((memberResult.data ?? []) as TeamMember[])
      }
    } catch (error) {
      console.error('Attachment list load failed:', error)
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os anexos.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canDownload) {
      setItems([])
      setLoading(false)
      setMessage('Seu cargo não tem permissão para visualizar anexos.')
      return
    }
    void load()
  }, [canDownload, entityId, entityType])

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!canUpload) { setMessage('Seu cargo não tem permissão para enviar anexos.'); return }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) { setMessage('O arquivo deve ter conteúdo e no máximo 10 MB.'); return }
    if (entityType === 'contract' && ((file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf'))) { setMessage('Selecione um arquivo PDF para anexar ao contrato.'); return }
    if (!file.name.trim() || (file.type && !/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(file.type))) { setMessage('O tipo ou nome do arquivo não é válido.'); return }
    setUploading(true); setMessage('')
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) { setMessage(userError.message); setUploading(false); return }
    if (!userData.user) { setMessage('Sua sessão expirou. Entre novamente.'); setUploading(false); return }
    if (entityType === 'contract') {
      try {
        await uploadContractAttachment(entityId, file)
        setMessage('Anexo enviado.')
        await load()
      } catch (error) {
        console.error('Contract attachment upload failed:', error)
        setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o anexo do contrato.')
      } finally {
        setUploading(false)
      }
      return
    }
    const safeName = file.name.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${userData.user.id}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName.slice(0, 160) || 'arquivo'}`
    let uploaded = false
    try {
      const uploadResult = await supabase.storage.from('private-documents').upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (uploadResult.error) {
        setMessage(uploadResult.error.message)
        return
      }
      uploaded = true
      const insertResult = await supabase.from('entity_attachments').insert({ entity_type: entityType, entity_id: entityId, file_name: file.name, storage_path: storagePath, mime_type: file.type || 'application/octet-stream', file_size: file.size, uploaded_by: userData.user.id })
      if (insertResult.error) {
        const { error: cleanupError } = await supabase.storage.from('private-documents').remove([storagePath])
        uploaded = Boolean(cleanupError)
        setMessage(cleanupError
          ? `Não foi possível registrar o anexo (${insertResult.error.message}) nem remover o arquivo enviado (${cleanupError.message}).`
          : insertResult.error.message)
        return
      }
      uploaded = false
      setMessage('Anexo enviado.')
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível enviar o anexo.'
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage.from('private-documents').remove([storagePath])
        setMessage(cleanupError
          ? `${message} O arquivo enviado também não pôde ser removido (${cleanupError.message}).`
          : message)
      } else {
        setMessage(message)
      }
    } finally {
      setUploading(false)
    }
  }

  async function remove(item: Attachment) {
    if (!canDelete) { setMessage('Seu cargo não tem permissão para excluir anexos.'); return }
    if (!window.confirm(`Excluir “${item.file_name}”?`)) return
    const { error: storageError } = await supabase.storage.from('private-documents').remove([item.storage_path])
    if (storageError) { setMessage(storageError.message); return }
    const { error } = await supabase.from('entity_attachments').delete().eq('id', item.id)
    if (error) setMessage(`Arquivo removido do armazenamento, mas os metadados não puderam ser excluídos: ${error.message}`)
    else { setMessage('Anexo excluído.'); await load() }
  }

  return <div className="mt-5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Paperclip className="size-3.5 text-violet-300" />Anexos</p><p className="mt-1 text-[11px] text-slate-600">Documentos privados, disponíveis somente para usuários autenticados.</p></div>
      {canUpload && <label className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold text-white ${uploading ? 'cursor-wait bg-violet-500/60' : 'cursor-pointer bg-violet-500 hover:bg-violet-400'}`}>
        <Upload className="size-3.5" />{uploading ? 'Enviando...' : 'Adicionar arquivo'}
        <input type="file" accept={entityType === 'contract' ? 'application/pdf,.pdf' : undefined} className="sr-only" onChange={upload} disabled={uploading} />
      </label>}
    </div>
    {message && <p role="status" className="mt-3 text-xs text-slate-400">{message}</p>}
    {loading ? <p className="mt-4 flex items-center text-xs text-slate-600"><Loader2 className="mr-2 size-3.5 animate-spin" />Carregando anexos...</p> : items.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhum anexo.</p> : <div className="mt-3 space-y-2">
      {items.map((item) => {
        const member = members.find((person) => person.user_id === item.uploaded_by || person.id === item.uploaded_by)
        const previewUrl = entityType === 'contract'
          ? `/api/workspace/contracts/${entityId}/attachments/${item.id}`
          : `/api/workspace/attachments/${item.id}`
        const downloadUrl = `${previewUrl}?download=1`
        return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/[0.06] px-3 py-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-200">{item.file_name}</p><p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500"><span>{item.mime_type || 'Tipo não informado'}</span><span>{Math.max(1, Math.round(item.file_size / 1024))} KB</span><span>{member?.full_name || 'Membro da equipe'}</span><span>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(item.created_at))}</span></p></div>
          <div className="flex shrink-0 gap-1">
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Visualizar ${item.file_name}`} title="Visualizar arquivo" className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-white"><ExternalLink className="size-4" /></a>
            <a href={downloadUrl} aria-label={`Baixar ${item.file_name}`} title="Baixar arquivo" className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Download className="size-4" /></a>
            {canDelete && <button type="button" onClick={() => void remove(item)} aria-label={`Excluir ${item.file_name}`} className="rounded p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-4" /></button>}
          </div>
        </div>
      })}
    </div>}
  </div>
}
