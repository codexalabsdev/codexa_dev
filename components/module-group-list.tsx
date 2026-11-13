'use client'

import { ChevronDown, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

type CatalogModule = {
  id: string
  system_id: string | null
  name: string
  internal_code: string
  description: string | null
  category: string | null
  icon: string | null
  access_url: string | null
  access_type: string
  implementation_status: string
  availability_status: string
  observations: string | null
}

export type ModuleGroup = {
  id: string
  systemName: string
  clientName: string
  modules: CatalogModule[]
}

type ModuleGroupListProps = {
  groups: ModuleGroup[]
  onEdit: (module: CatalogModule) => void
  onRemove: (module: CatalogModule) => void
}

export function ModuleGroupList({ groups, onEdit, onRemove }: ModuleGroupListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  return (
    <div className="flex flex-col gap-4 p-5">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`module-group-${group.id}`} className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <header className="border-b border-white/[0.07]">
            <button
              type="button"
              id={`module-group-trigger-${group.id}`}
              aria-expanded={expandedGroups[group.id] ?? false}
              aria-controls={`module-group-content-${group.id}`}
              onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <div>
                <h3 id={`module-group-${group.id}`} className="text-sm font-semibold text-slate-100">{group.systemName}</h3>
                <p className="mt-1 text-xs text-slate-500">Cliente: {group.clientName}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-medium text-violet-200">
                  {group.modules.length} {group.modules.length === 1 ? 'módulo' : 'módulos'}
                </span>
                <ChevronDown className={`size-4 shrink-0 text-slate-500 transition-transform ${expandedGroups[group.id] ? 'rotate-180' : ''}`} aria-hidden="true" />
              </div>
            </button>
          </header>
          <div
            id={`module-group-content-${group.id}`}
            aria-labelledby={`module-group-trigger-${group.id}`}
            hidden={!expandedGroups[group.id]}
            className="divide-y divide-white/[0.06]"
          >
            {group.modules.map((module) => (
              <article key={module.id} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium text-slate-200">{module.name}</h4>
                    <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-slate-300">{module.implementation_status}</span>
                    <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] text-slate-400">{module.availability_status}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{module.internal_code}{module.category ? ` · ${module.category}` : ''}</p>
                  {module.description && <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">{module.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {module.access_url && module.implementation_status !== 'Não iniciado' && (
                    <a href={module.access_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium text-violet-300 transition hover:bg-violet-400/10 hover:text-violet-200">
                      Acessar <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  )}
                  <button type="button" onClick={() => onEdit(module)} aria-label={`Editar módulo ${module.name}`} className="inline-flex size-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-white">
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onRemove(module)} aria-label={`Excluir módulo ${module.name}`} className="inline-flex size-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-300">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
