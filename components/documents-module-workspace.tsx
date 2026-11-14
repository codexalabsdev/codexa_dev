'use client'

import { useState } from 'react'
import { Archive, BriefcaseBusiness } from 'lucide-react'
import { CommercialDocumentsWorkspace } from '@/components/commercial-documents-workspace'
import { DocumentsWorkspace } from '@/components/documents-workspace'

export function DocumentsModuleWorkspace({ permissions }: { permissions: string[] }) {
  const [tab, setTab] = useState<'library' | 'commercial'>('commercial')
  return <div>
    <div role="tablist" aria-label="Áreas da Central de Documentos" className="mt-5 flex flex-wrap gap-2 border-b border-white/[.08] pb-3">
      <button type="button" role="tab" aria-selected={tab === 'commercial'} onClick={() => setTab('commercial')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${tab === 'commercial' ? 'bg-cyan-300/10 font-medium text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><BriefcaseBusiness className="size-4" />Documentos comerciais</button>
      <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${tab === 'library' ? 'bg-cyan-300/10 font-medium text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Archive className="size-4" />Arquivos da equipe</button>
    </div>
    <div role="tabpanel" className="outline-none">{tab === 'commercial' ? <CommercialDocumentsWorkspace permissions={permissions} /> : <DocumentsWorkspace />}</div>
  </div>
}
