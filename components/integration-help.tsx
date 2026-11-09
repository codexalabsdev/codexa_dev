'use client'

import { HelpCircle } from 'lucide-react'

export function IntegrationHelp({ title, steps }: { title: string; steps: string[] }) {
  return (
    <details className="relative inline-block align-middle">
      <summary className="flex size-6 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 text-slate-500 transition hover:border-blue-400/50 hover:bg-blue-400/10 hover:text-blue-200" aria-label={`Como usar ${title}`}>
        <HelpCircle className="size-3.5" />
      </summary>
      <div className="absolute right-0 top-8 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-[#151b24] p-4 text-left shadow-2xl">
        <p className="text-xs font-semibold text-white">Como usar {title}</p>
        <ol className="mt-3 flex flex-col gap-2.5 text-xs leading-5 text-slate-400">
          {steps.map((step, index) => <li key={step} className="flex gap-2"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-400/10 text-[10px] font-semibold text-blue-200">{index + 1}</span><span>{step}</span></li>)}
        </ol>
      </div>
    </details>
  )
}
