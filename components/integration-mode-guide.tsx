'use client'

import { useState } from 'react'
import { Check, ChevronDown, Copy, X } from 'lucide-react'

type IntegrationMode = 'routes' | 'single'

const guides = {
  routes: {
    title: 'Integração padrão',
    compatibility: 'Next.js com páginas ou layouts independentes por módulo',
    description: 'Protege rotas já existentes com uma verificação server-side antes de disponibilizar cada módulo.',
    sections: [
      ['O que é este modo', 'O pacote adiciona um middleware compartilhado às rotas cadastradas na Codexa. Ele é adequado quando cada módulo possui uma URL própria e não exige reescrever a página original.'],
      ['Quando utilizar', 'Use para /financeiro, /clientes ou /relatorios separados. Prefira a integração com rota única quando vários módulos vivem na mesma página e apenas o conteúdo interno muda.'],
      ['O que a Codexa faz automaticamente', 'Gera middleware.ts com os padrões de rota, códigos dos módulos e caminhos de bloqueio. Valida a licença no servidor e falha fechado quando a chave, a API ou o módulo não estão disponíveis.'],
      ['O que é necessário antes de gerar', 'Cadastre cada padrão de rota, associe-o a um módulo contratado e informe o caminho de bloqueio. Revise duplicidades e mantenha a chave fora de variáveis NEXT_PUBLIC_.'],
      ['Passo a passo de geração', 'Abra os detalhes da licença, cadastre as rotas, confira o código do módulo exibido, gere middleware.ts, baixe o arquivo e revise o conteúdo antes de copiar para a raiz do projeto.'],
      ['Instalação no projeto cliente', 'Copie middleware.ts para a raiz do projeto Next.js. Preserve páginas, layouts e handlers existentes. Configure CODEXA_LICENSE_KEY e CODEXA_LICENSE_API_URL somente no servidor e execute a verificação local do projeto.'],
      ['Configuração da licença', 'A chave server-to-server identifica a licença perante a API central. Os códigos precisam coincidir com os módulos liberados na Codexa; nenhum segredo deve aparecer em componentes client ou no HTML.'],
      ['Como funciona o bloqueio', 'O middleware impede a navegação para a rota quando a licença é inválida ou o módulo não está liberado. Isso não substitui RLS, autorização de API ou proteção de dados no backend do cliente.'],
      ['Testes após a instalação', 'Teste licença válida, expirada, suspensa e sem chave; abra rotas liberadas e bloqueadas; confira redirects, compilação, ausência de segredos no bundle e comportamento após deploy.'],
      ['Problemas comuns e soluções', 'Erro de chave indica variável ausente ou incorreta; módulo inexistente indica código divergente; redirect inesperado indica licença indisponível ou rota cadastrada incorretamente; erro de build indica incompatibilidade de versão ou import.'],
      ['Atualização e manutenção', 'Regere o middleware quando rotas ou módulos mudarem. Faça diff do arquivo antes de substituir alterações próprias do cliente; o gerador não aplica atualizações automaticamente.'],
      ['Resumo final', 'Será gerado middleware.ts. Você cadastra e revisa as rotas, configura as variáveis server-side, instala o arquivo e valida o bloqueio antes do deploy.'],
    ],
  },
  single: {
    title: 'Integração rota única',
    compatibility: 'Sistemas com abas, estado React ou conteúdo condicional na mesma página',
    description: 'Gera a integração completa de uma página administrativa existente, incluindo o pacote de instalação. É a opção recomendada para integrar uma página com abas.',
    sections: [
      ['O que é este modo', 'A integração mantém uma única rota e controla quais áreas internas podem ser navegadas e renderizadas. O código original é analisado como TypeScript/TSX antes de qualquer pacote ser produzido. Este é o fluxo completo; o helper isolado é uma alternativa avançada para integração manual.'],
      ['Quando utilizar', 'Use quando Financeiro, Clientes e Relatórios compartilham a mesma página, seja por tabs, estado React, menu interno ou renderização condicional. Para páginas independentes, use rotas existentes.'],
      ['O que a Codexa faz automaticamente', 'Analisa a sintaxe, identifica candidatos a estados de navegação, valida o mapeamento, gera o helper server-side e cria um ZIP com somente os arquivos necessários e um manifesto de instalação.'],
      ['O que é necessário antes de gerar', 'Envie o arquivo original da página, informe framework/estrutura quando solicitado e confirme a associação entre cada área e o internal_code da Codexa. Associações ambíguas interrompem a geração.'],
      ['Passo a passo de geração', 'Selecione este modo, cole o código original, revise o mapeamento detectado, confirme a correspondência, gere o ZIP, leia o resumo do pacote e baixe somente depois da validação sintática.'],
      ['Instalação no projeto cliente', 'Extraia o ZIP na raiz do projeto e siga o INSTALL.md. Os caminhos dependem dos arquivos analisados; substitua apenas os arquivos listados no manifesto e mantenha os demais intactos.'],
      ['Configuração da licença', 'Configure CODEXA_LICENSE_KEY e CODEXA_LICENSE_API_URL no ambiente do servidor. A página server-side consulta a API e passa apenas decisões booleanas ao cliente; a chave nunca usa NEXT_PUBLIC_.'],
      ['Como funciona o bloqueio', 'Áreas não liberadas são removidas da navegação e não são renderizadas. Se a aba ativa perder permissão, o wrapper escolhe uma área permitida ou mostra indisponibilidade. Operações e dados ainda precisam de autorização própria.'],
      ['Testes após a instalação', 'Verifique licença válida e inválida, cada módulo liberado, ocultação de áreas bloqueadas, troca para fallback após revogação, CRUD dos módulos permitidos, build e ausência da chave no navegador.'],
      ['Problemas comuns e soluções', 'Estrutura não reconhecida exige mapeamento manual ou uma página mais simples; código divergente indica internal_code incorreto; erro de import aponta caminho diferente; falha de API exige conferir URL, chave e disponibilidade da licença.'],
      ['Atualização e manutenção', 'Regere quando a estrutura da página ou os módulos mudarem. Compare o ZIP com suas alterações locais e preserve handlers, estilos e regras próprias; não há merge automático.'],
      ['Resumo final', 'O pacote contém arquivos de integração, manifesto e instruções. Você confirma o mapeamento, instala os caminhos listados, configura o servidor e testa cada estado de autorização. Use o botão de helper apenas se você já souber integrar manualmente o código.'],
    ],
  },
} as const

export function IntegrationModeGuide({ mode, onClose }: { mode: IntegrationMode; onClose: () => void }) {
  const guide = guides[mode]
  const [open, setOpen] = useState(guide.sections.map((_, index) => index < 2))
  const [copied, setCopied] = useState(false)
  const installText = mode === 'routes' ? 'CODEXA_LICENSE_KEY=\nCODEXA_LICENSE_API_URL=' : 'CODEXA_LICENSE_KEY=\nCODEXA_LICENSE_API_URL=\n\n# Não use NEXT_PUBLIC_ para nenhuma dessas variáveis.'
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="integration-guide-title">
    <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#10151d] shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#10151d]/95 p-5 backdrop-blur"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Guia de integração</p><h2 id="integration-guide-title" className="mt-1 text-lg font-semibold text-white">{guide.title}</h2><p className="mt-1 text-xs text-slate-400">{guide.compatibility}</p></div><button type="button" onClick={onClose} aria-label="Fechar instruções" className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><X className="size-4" /></button></header>
      <div className="space-y-2 p-5">{guide.sections.map(([title, text], index) => <section key={title} className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]"><button type="button" onClick={() => setOpen((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"><span className="text-sm font-medium text-slate-200">{title}</span><ChevronDown className={`size-4 text-slate-500 transition-transform ${open[index] ? 'rotate-180' : ''}`} /></button>{open[index] && <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 text-sm leading-6 text-slate-400"><p>{text}</p>{title === 'Configuração da licença' && <div className="relative mt-3"><pre className="overflow-x-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-emerald-200">{installText}</pre><button type="button" onClick={() => { void navigator.clipboard.writeText(installText); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }} className="absolute right-2 top-2 rounded-md border border-white/10 p-1.5 text-slate-400 hover:text-white" aria-label="Copiar configuração">{copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}</button></div>}</div>}</section>)}</div>
    </div>
  </div>
}
