'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Archive, BriefcaseBusiness } from 'lucide-react'
import { CommercialDocumentsWorkspace } from '@/components/commercial-documents-workspace'
import { DocumentsWorkspace } from '@/components/documents-workspace'

const liftBrandColor = (hex: string) => `#${(hex.match(/[A-Fa-f0-9]{2}/g) ?? []).map((channel) => Math.round(Number.parseInt(channel, 16) + (255 - Number.parseInt(channel, 16)) * 0.58).toString(16).padStart(2, '0')).join('')}`

export function DocumentsModuleWorkspace({ permissions }: { permissions: string[] }) {
  const [tab, setTab] = useState<'library' | 'commercial'>('commercial')
  const { data } = useSWR<{ settings?: { issuer_primary_color?: string; issuer_secondary_color?: string } | null }>('/api/workspace/commercial-documents', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('Não foi possível carregar as cores dos documentos.')
    return response.json()
  })
  const primaryColor = /^#[0-9A-F]{6}$/i.test(data?.settings?.issuer_primary_color ?? '') ? data!.settings!.issuer_primary_color! : '#17324D'
  const secondaryColor = /^#[0-9A-F]{6}$/i.test(data?.settings?.issuer_secondary_color ?? '') ? data!.settings!.issuer_secondary_color! : '#0F766E'
  const activeTabStyle = { color: liftBrandColor(primaryColor), backgroundColor: `${primaryColor}1A`, boxShadow: `inset 0 -2px 0 ${primaryColor}` }
  const activeIconColor = liftBrandColor(secondaryColor)
  return <div>
    <div role="tablist" aria-label="Áreas da Central de Documentos" className="mt-5 flex flex-wrap gap-2 border-b border-white/[.08] pb-3">
      <button type="button" role="tab" aria-selected={tab === 'commercial'} onClick={() => setTab('commercial')} style={tab === 'commercial' ? activeTabStyle : undefined} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition text-slate-400 hover:bg-white/5 hover:text-slate-200"><BriefcaseBusiness className="size-4" style={{ color: tab === 'commercial' ? activeIconColor : undefined }} />Documentos comerciais</button>
      <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')} style={tab === 'library' ? activeTabStyle : undefined} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition text-slate-400 hover:bg-white/5 hover:text-slate-200"><Archive className="size-4" style={{ color: tab === 'library' ? activeIconColor : undefined }} />Arquivos da equipe</button>
    </div>
    <div role="tabpanel" className="outline-none">{tab === 'commercial' ? <CommercialDocumentsWorkspace permissions={permissions} /> : <DocumentsWorkspace />}</div>
  </div>
}
