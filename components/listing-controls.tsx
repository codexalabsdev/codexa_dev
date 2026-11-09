'use client'

import { ChevronDown, ChevronLeft, ChevronRight, Filter, RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'

type ListingControlsProps = {
  total: number
  page: number
  pageSize?: number
  onPageChange: (page: number) => void
  onClear?: () => void
  hasActiveFilters?: boolean
  children?: ReactNode
}

export function ListingControls({ total, page, pageSize = 10, onPageChange, onClear, hasActiveFilters = false, children }: ListingControlsProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const canPrevious = page > 0
  const canNext = page < pageCount - 1

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3">
        <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.04]">
          <Filter className="size-3.5" />Filtros{hasActiveFilters ? ' (ativos)' : ''}<ChevronDown className={`size-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
        {hasActiveFilters && onClear && <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-white"><RotateCcw className="size-3.5" />Limpar filtros</button>}
        <span className="ml-auto text-xs text-slate-500">{total} {total === 1 ? 'registro' : 'registros'}</span>
      </div>
      {filtersOpen && <div className="flex flex-wrap items-end gap-3 border-b border-white/[0.07] bg-white/[0.015] px-5 py-4">{children}</div>}
      <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3">
        <span className="text-xs text-slate-500">Página {page + 1} de {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={!canPrevious} onClick={() => onPageChange(page - 1)} aria-label="Página anterior" className="rounded-lg border border-white/[0.08] p-2 text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="size-3.5" /></button>
          <button type="button" disabled={!canNext} onClick={() => onPageChange(page + 1)} aria-label="Próxima página" className="rounded-lg border border-white/[0.08] p-2 text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="size-3.5" /></button>
        </div>
      </div>
    </>
  )
}
