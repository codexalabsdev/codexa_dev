'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Copy, KeyRound, Loader2, Plus, Trash2, X } from 'lucide-react'

type ClientContactCode = {
  id: string
  code: string
  created_at: string
  revoked_at: string | null
}

type CodeList = { codes: ClientContactCode[] }
type ClientContactCodeManagerProps = { client: { id: string; legal_name: string }; onClose: () => void }

async function fetchCodes(url: string): Promise<CodeList> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json() as CodeList & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os códigos.')
  return result
}

async function sendCodeRequest(method: 'POST' | 'DELETE', body: Record<string, string>) {
  const response = await fetch('/api/admin/client-contact-codes', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const result = await response.json() as { error?: string }
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.')
  return result
}

export function ClientContactCodeManager({ client, onClose }: ClientContactCodeManagerProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const { data, error, isLoading, mutate } = useSWR<CodeList>(
    `/api/admin/client-contact-codes?clientId=${encodeURIComponent(client.id)}`,
    fetchCodes,
  )

  async function generateCode() {
    const activeCode = data?.codes.find((item) => !item.revoked_at)
    if (activeCode && !window.confirm('Gerar outro código e revogar o código ativo atual?')) return

    setSaving(true)
    setErrorMessage('')
    setNotice('')
    try {
      await sendCodeRequest('POST', { clientId: client.id })
      await mutate()
      setNotice('Código novo gerado e vinculado ao cliente. O código anterior foi revogado, se havia um ativo.')
    } catch (requestError) {
      setErrorMessage(requestError instanceof Error ? requestError.message : 'Não foi possível gerar o código.')
    } finally {
      setSaving(false)
    }
  }

  async function revokeCode(codeId: string) {
    if (!window.confirm('Revogar este código? Ele deixará de liberar o acesso aos contatos.')) return

    setSaving(true)
    setErrorMessage('')
    setNotice('')
    try {
      await sendCodeRequest('DELETE', { clientId: client.id, codeId })
      await mutate()
      setNotice('Código revogado.')
    } catch (requestError) {
      setErrorMessage(requestError instanceof Error ? requestError.message : 'Não foi possível revogar o código.')
    } finally {
      setSaving(false)
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setNotice('Código copiado.')
      setErrorMessage('')
    } catch {
      setErrorMessage('Não foi possível copiar automaticamente. Selecione e copie o código manualmente.')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="client-contact-codes-title" className="w-full max-w-xl rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-300">Códigos de acesso</p>
            <h2 id="client-contact-codes-title" className="mt-1 text-lg font-semibold text-white">{client.legal_name}</h2>
            <p className="mt-1 text-xs text-slate-500">Cada cliente tem um código ativo por vez.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar códigos" className="text-slate-500 hover:text-white disabled:opacity-40"><X className="size-5" /></button>
        </div>

        {(errorMessage || error) && <p role="alert" className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">{errorMessage || error?.message}</p>}
        {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

        {isLoading ? (
          <div className="flex min-h-24 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando códigos...</div>
        ) : data?.codes.length ? (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {data.codes.map((item) => (
              <li key={item.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <code className="block break-all text-xs text-slate-100">{item.code}</code>
                    <p className={`mt-1 text-[10px] ${item.revoked_at ? 'text-slate-500' : 'text-emerald-300'}`}>
                      {item.revoked_at ? `Revogado em ${new Date(item.revoked_at).toLocaleString('pt-BR')}` : 'Ativo'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!item.revoked_at && <>
                      <button type="button" onClick={() => void copyCode(item.code)} aria-label="Copiar código" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-2 text-xs text-slate-300 hover:bg-white/[0.04]"><Copy className="size-3.5" />Copiar</button>
                      <button type="button" disabled={saving} onClick={() => void revokeCode(item.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 px-2.5 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="size-3.5" />Revogar</button>
                    </>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : !error ? (
          <p className="rounded-lg border border-white/[0.07] px-3 py-4 text-xs text-slate-500">Nenhum código foi encontrado para este cliente.</p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.06] pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Fechar</button>
          <button type="button" onClick={() => void generateCode()} disabled={saving || isLoading} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : data?.codes.some((item) => !item.revoked_at) ? <KeyRound className="size-3.5" /> : <Plus className="size-3.5" />}
            {saving ? 'Gerando...' : 'Gerar código novo'}
          </button>
        </div>
      </section>
    </div>
  )
}
