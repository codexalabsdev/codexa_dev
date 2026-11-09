import { ShieldAlert } from 'lucide-react'

export function AccessDenied() {
  return <section className="mx-auto mt-12 max-w-xl rounded-xl border border-amber-500/20 bg-[#11161e] p-8 text-center">
    <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/10 text-amber-300">
      <ShieldAlert className="size-6" />
    </div>
    <h1 className="mt-4 text-xl font-semibold text-white">Acesso não autorizado</h1>
    <p className="mt-2 text-sm leading-6 text-slate-400">Seu cargo não tem permissão para acessar este ambiente. Se você acredita que precisa deste acesso, solicite ao administrador da equipe.</p>
  </section>
}
