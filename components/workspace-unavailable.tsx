import { AlertTriangle } from 'lucide-react'

export function WorkspaceUnavailable() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#090b10] px-4 py-10 text-slate-100">
      <section role="alert" className="w-full max-w-lg rounded-2xl border border-amber-400/15 bg-[#11161e] p-7 text-center shadow-2xl sm:p-9">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-400/10 text-amber-200">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Workspace indisponível</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Não foi possível carregar o dashboard</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          O servidor não conseguiu validar a autenticação e as permissões do workspace. O acesso aos dados permanece bloqueado até a conexão ser restabelecida.
        </p>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Confira a conexão e as variáveis do projeto, depois tente carregar a página novamente.
        </p>
        <a href="/workspace" className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">
          Tentar novamente
        </a>
      </section>
    </main>
  )
}
