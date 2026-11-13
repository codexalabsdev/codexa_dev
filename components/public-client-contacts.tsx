'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import { ArrowRight, BriefcaseBusiness, LoaderCircle, Mail, Phone, Users, X } from 'lucide-react'

type EmployeeContact = {
  name: string
  sector: string
  jobTitle: string | null
  email: string | null
  phone: string | null
}

type ContactResponse = { employees: EmployeeContact[] }
type DialogProps = { open: boolean; onDismiss: () => void; labelledBy: string; children: ReactNode }

const sectorOrder = ['Suporte Técnico', 'Financeiro', 'Comercial', 'Operações']
const inputClass = 'mt-2 w-full rounded-xl border border-white/10 bg-[#0b1118] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15'

async function fetchContacts(url: string): Promise<ContactResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json() as ContactResponse & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os contatos.')
  return result
}

function ContactDialog({ open, onDismiss, labelledBy, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onCancel={(event) => { event.preventDefault(); onDismiss() }}
      onClick={(event) => { if (event.target === event.currentTarget) onDismiss() }}
      className="fixed m-auto max-h-[calc(100dvh_-_2rem)] w-[min(720px,calc(100vw_-_2rem))] max-w-none overflow-y-auto rounded-3xl border border-white/10 bg-[#0d141d] p-0 text-white shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm"
    >
      {children}
    </dialog>
  )
}

export function PublicClientContacts() {
  const [step, setStep] = useState<'closed' | 'code' | 'contacts'>('closed')
  const [clientCode, setClientCode] = useState('')
  const { data, error, isLoading } = useSWR<ContactResponse>(step === 'contacts' ? '/api/public/contact' : null, fetchContacts)

  const groups = useMemo(() => {
    const bySector = new Map<string, EmployeeContact[]>()
    for (const sector of sectorOrder) bySector.set(sector, [])
    for (const employee of data?.employees ?? []) {
      bySector.get(employee.sector)?.push(employee)
    }
    for (const employees of bySector.values()) {
      employees.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }
    return [...bySector.entries()]
  }, [data])

  function openCodeDialog() {
    setClientCode('')
    setStep('code')
  }

  function continueToContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (clientCode.trim()) setStep('contacts')
  }

  return (
    <>
      <section id="contato" className="scroll-mt-20 border-y border-white/[0.08] py-24">
        <div className="flex flex-col justify-between gap-8 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-7 sm:flex-row sm:items-center sm:p-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Área do cliente</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Fale diretamente com a equipe certa.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-400">Informe seu código de cliente para consultar os contatos organizados por setor.</p>
          </div>
          <button type="button" onClick={openCodeDialog} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#071016] transition hover:bg-cyan-200">
            Acessar contatos <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <ContactDialog open={step === 'code'} onDismiss={() => setStep('closed')} labelledBy="client-code-title">
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Acesso do cliente</p>
              <h2 id="client-code-title" className="mt-2 text-2xl font-semibold tracking-tight">Informe seu código</h2>
            </div>
            <button type="button" onClick={() => setStep('closed')} aria-label="Fechar" className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <X className="size-5" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">Use o código recebido da Codexa para acessar os contatos da equipe.</p>
          <form onSubmit={continueToContacts} className="mt-6">
            <label htmlFor="client-code" className="text-xs font-medium text-slate-300">Código do cliente</label>
            <input id="client-code" name="clientCode" type="text" autoComplete="off" required maxLength={80} value={clientCode} onChange={(event) => setClientCode(event.target.value)} placeholder="Digite seu código" className={inputClass} />
            <button type="submit" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-[#071016] transition hover:bg-cyan-200">
              Continuar <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </ContactDialog>

      <ContactDialog open={step === 'contacts'} onDismiss={() => setStep('closed')} labelledBy="employee-contacts-title">
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Diretório da equipe</p>
              <h2 id="employee-contacts-title" className="mt-2 text-2xl font-semibold tracking-tight">Quem você precisa encontrar?</h2>
            </div>
            <button type="button" onClick={() => setStep('closed')} aria-label="Fechar contatos" className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <X className="size-5" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">Escolha o setor e fale diretamente com uma pessoa da equipe.</p>

          {isLoading && <div className="flex items-center gap-3 py-12 text-sm text-slate-400"><LoaderCircle className="size-4 animate-spin" />Carregando contatos...</div>}
          {error && <p role="alert" className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200">{error.message}</p>}
          {data && data.employees.length === 0 && <p className="mt-6 rounded-xl border border-white/[0.08] p-4 text-sm text-slate-400">Nenhum contato ativo está disponível no momento.</p>}

          {data && data.employees.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {groups.map(([sector, employees]) => (
                <section key={sector} aria-label={sector} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><BriefcaseBusiness className="size-4 text-cyan-300" aria-hidden="true" />{sector}</h3>
                  {employees.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">Nenhum contato cadastrado neste setor.</p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {employees.map((employee) => (
                        <li key={`${employee.sector}-${employee.name}-${employee.email ?? ''}-${employee.phone ?? ''}`} className="rounded-xl border border-white/[0.06] bg-[#0a1017] p-3">
                          <p className="text-sm font-medium text-slate-100">{employee.name}</p>
                          {employee.jobTitle && <p className="mt-1 text-xs text-slate-500">{employee.jobTitle}</p>}
                          <div className="mt-3 space-y-2">
                            {employee.phone ? (
                              <a href={`tel:${employee.phone.replace(/[^+0-9]/g, '')}`} className="flex items-center gap-2 text-xs text-slate-300 transition hover:text-cyan-200"><Phone className="size-3.5 text-cyan-300" aria-hidden="true" />{employee.phone}</a>
                            ) : (
                              <p className="flex items-center gap-2 text-xs text-slate-500"><Phone className="size-3.5" aria-hidden="true" />Telefone não informado</p>
                            )}
                            {employee.email ? (
                              <a href={`mailto:${employee.email}`} className="flex min-w-0 items-center gap-2 break-all text-xs text-slate-300 transition hover:text-cyan-200"><Mail className="size-3.5 shrink-0 text-cyan-300" aria-hidden="true" />{employee.email}</a>
                            ) : (
                              <p className="text-xs text-slate-500">E-mail não informado</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}

          {data && data.employees.length > 0 && <p className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Users className="size-3.5" aria-hidden="true" />Os contatos são exibidos conforme o cadastro ativo de cada funcionário.</p>}
        </div>
      </ContactDialog>
    </>
  )
}
