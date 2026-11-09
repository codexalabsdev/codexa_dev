'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Blocks, ChevronRight, Code2, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { PublicContact } from '@/components/public-contact'

const services = [
  { icon: Code2, title: 'Sites que convertem', description: 'Landing pages e sites institucionais rápidos, estratégicos e desenhados para transformar atenção em oportunidade.' },
  { icon: Workflow, title: 'Sistemas sob medida', description: 'Plataformas web e ferramentas internas que eliminam retrabalho e acompanham a operação real do seu negócio.' },
  { icon: Blocks, title: 'Automação e integrações', description: 'Conectamos suas ferramentas e automatizamos processos para sua equipe ganhar tempo e previsibilidade.' },
]

const portfolio = [
  { label: 'Produto digital', title: 'Plataforma de gestão para times em crescimento', description: 'Um ecossistema web modular para centralizar operação, indicadores e decisões.', accent: 'from-cyan-300/30 to-blue-500/5' },
  { label: 'Presença digital', title: 'Marca posicionada para vender mais', description: 'Site institucional com narrativa, performance e jornadas pensadas para conversão.', accent: 'from-violet-300/30 to-fuchsia-500/5' },
  { label: 'Automação', title: 'Processos conectados sem planilhas', description: 'Integrações que transformam tarefas manuais em fluxos simples e rastreáveis.', accent: 'from-emerald-300/25 to-cyan-500/5' },
]

export function PublicLanding() {
  return (
    <main className="landing-page relative min-h-screen overflow-x-clip overflow-y-hidden bg-[#07090d] text-slate-100">
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="landing-orb landing-orb-one pointer-events-none absolute -right-40 top-0 size-[34rem] rounded-full blur-3xl" />
      <div className="landing-orb landing-orb-two pointer-events-none absolute left-[-18rem] top-[32rem] size-[30rem] rounded-full blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-white/[0.08] py-3">
          <Link href="/" aria-label="Codexa — início" className="flex items-center gap-3">
            <Image src="/codexa-logo.png" alt="Codexa" width={92} height={92} priority className="size-14 object-contain" />
            <span className="hidden border-l border-white/15 pl-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:block">Software house</span>
          </Link>
          <nav className="hidden items-center gap-7 text-xs text-slate-400 md:flex" aria-label="Navegação da página">
            <a href="#servicos" className="transition-colors hover:text-white">Serviços</a>
            <a href="#portfolio" className="transition-colors hover:text-white">Portfólio</a>
            <a href="#metodo" className="transition-colors hover:text-white">Nosso método</a>
          </nav>
          <a href="#contato" className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-white transition hover:border-cyan-300/50 hover:bg-white/[0.08] sm:px-4 sm:text-xs">
            Vamos conversar <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </header>

        <section className="grid min-h-0 items-center gap-12 py-16 sm:py-20 lg:min-h-[650px] lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.13em] text-cyan-200">
              <Sparkles className="size-3.5" /> Engenharia para negócios ambiciosos
            </div>
            <h1 className="max-w-4xl text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.055em] text-white sm:text-7xl lg:text-[5.8rem]">Ideias fortes merecem uma presença <span className="landing-gradient-text">à altura.</span></h1>
            <p className="mt-8 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">A Codexa cria sites, sistemas e automações que ajudam negócios ambiciosos a vender melhor, operar com clareza e crescer com tecnologia.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#contato" className="group inline-flex items-center gap-3 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#071016] transition hover:bg-cyan-200">Comece um projeto <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></a>
              <a href="#portfolio" className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-slate-300 transition hover:text-white">Ver portfólio <ChevronRight className="size-4" /></a>
            </div>
            <div className="mt-14 flex flex-wrap gap-x-8 gap-y-3 text-[11px] uppercase tracking-[0.13em] text-slate-500"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-300" /> Produto e operação</span><span>Brasil · remoto</span><span>Desde 2020</span></div>
          </div>

          <div className="relative mx-auto w-full max-w-[31rem] lg:ml-auto">
            <div className="absolute -inset-10 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="relative grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/[0.16] to-white/[0.03] p-6 shadow-2xl shadow-cyan-950/30">
                <Code2 className="size-6 text-cyan-200" />
                <p className="mt-10 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 sm:mt-16">Web design</p>
                <p className="mt-3 text-xl font-semibold leading-tight text-white">Uma presença digital que trabalha por você.</p>
              </div>
              <div className="mt-8 rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-300/[0.15] to-white/[0.03] p-6 sm:mt-16">
                <Workflow className="size-6 text-violet-200" />
                <p className="mt-16 text-xs font-semibold uppercase tracking-[0.16em] text-violet-100">Tecnologia sob medida</p>
                <p className="mt-3 text-xl font-semibold leading-tight text-white">Processos mais simples, negócios mais fortes.</p>
              </div>
              <div className="rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.12] to-white/[0.03] p-6 sm:col-span-2">
                <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Do conceito à entrega</p><p className="mt-2 text-sm text-slate-300">Estratégia, design e código em um só time.</p></div><ShieldCheck className="size-7 shrink-0 text-emerald-200" /></div>
              </div>
            </div>
          </div>
        </section>

        <section id="servicos" className="scroll-mt-20 border-t border-white/[0.08] py-24"><div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">O que fazemos</p><h2 className="mt-4 max-w-md text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Da primeira ideia à operação que sustenta o crescimento.</h2></div><div className="grid gap-3 sm:grid-cols-3">{services.map((service) => { const Icon = service.icon; return <article key={service.title} className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-white/[0.05]"><Icon className="size-5 text-cyan-300" /><h3 className="mt-12 text-sm font-semibold text-white">{service.title}</h3><p className="mt-3 text-xs leading-5 text-slate-500">{service.description}</p></article> })}</div></div></section>

        <section id="portfolio" className="scroll-mt-20 border-y border-white/[0.08] py-24"><div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Portfólio em movimento</p><h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Projetos que tiram negócios do lugar.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-500">Cada entrega combina estratégia, design e engenharia para resolver um problema de verdade.</p></div><div className="mt-12 grid gap-4 lg:grid-cols-3">{portfolio.map((project, index) => <article key={project.title} className={`group relative min-h-72 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${project.accent} p-6 transition hover:-translate-y-1 hover:border-cyan-300/40`}><div className="absolute inset-x-6 top-6 h-28 rounded-xl border border-white/10 bg-[#0b1119]/70 p-3 opacity-80 transition group-hover:scale-[1.02]"><div className="flex gap-1.5"><span className="size-1.5 rounded-full bg-cyan-300" /><span className="size-1.5 rounded-full bg-white/20" /><span className="size-1.5 rounded-full bg-white/20" /></div><div className="mt-5 grid grid-cols-4 gap-2"><span className="h-2 rounded bg-white/15" /><span className="col-span-2 h-2 rounded bg-cyan-300/45" /><span className="h-2 rounded bg-white/10" /></div><div className="mt-2 grid grid-cols-3 gap-2"><span className="col-span-2 h-8 rounded bg-white/10" /><span className="h-8 rounded bg-violet-300/30" /></div></div><div className="relative mt-36"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">0{index + 1} · {project.label}</span><h3 className="mt-3 text-lg font-semibold leading-tight text-white">{project.title}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{project.description}</p></div></article>)}</div></section>

        <PublicContact />

        <section id="metodo" className="scroll-mt-20 py-24"><div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Como trabalhamos</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Pensar. Construir. Evoluir.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-500">Times enxutos, decisões claras e tecnologia que acompanha o ritmo real do negócio.</p></div><div className="mt-12 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-3">{['01 / Descoberta', '02 / Construção', '03 / Evolução'].map((step, index) => <div key={step}><span className="text-xs font-medium text-cyan-300">{step}</span><p className="mt-5 text-lg font-medium text-white">{['Encontramos o que importa.', 'Entregamos valor em ciclos.', 'Medimos e melhoramos sempre.'][index]}</p><p className="mt-3 text-sm leading-6 text-slate-500">{['Estratégia e produto alinhados ao objetivo certo.', 'Código limpo, feedback rápido e operação visível.', 'A próxima versão começa com o que aprendemos.'][index]}</p></div>)}</div></section>

        <footer className="flex flex-col gap-5 border-t border-white/[0.08] py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Image src="/codexa-logo.png" alt="Codexa" width={52} height={52} className="size-8 object-contain" /><span>Codexa · Software house</span></div><span>© 2026 Codexa. Tecnologia com direção.</span></footer>
      </div>
    </main>
  )
}
