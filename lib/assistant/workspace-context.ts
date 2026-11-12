import 'server-only'

import { workspaceLabel } from '@/lib/workspace-modules'

const moduleGuides: Record<string, string> = {
  dashboard: 'Dashboard em /workspace. Mostra cartões de leads, clientes, projetos, chamados, contratos e valores; ranking da equipe por XP; atividade recente; próximos vencimentos; e projetos por status. Os cartões de clientes, projetos, chamados e contratos recebem métricas da API. Os cartões de leads e financeiros, além de atividade, vencimentos e distribuição por status, ainda usam valores/estados de apresentação e não devem ser descritos como dados operacionais atualizados. O ranking é alimentado pelos dados de XP.',
  comercial: 'Visão comercial em /workspace/comercial. A visão geral resume leads em andamento, propostas enviadas e contratos ativos; o pipeline organiza leads por etapa, de Novo lead até Fechado — ganho/perdido. As telas Propostas e Contratos exibem listas pesquisáveis, filtro de status, paginação, detalhes e controles de criar, editar e excluir conforme as permissões. Contratos também podem ter anexos.',
  documentos: 'Central de documentos. Permite pesquisar e filtrar por categoria (Geral, Contratos, Avisos, Metas, Processos e Financeiro), publicar arquivo com título/descrição/categoria, editar metadados, baixar, excluir e vincular/desvincular documentos de projetos, tarefas, contratos, chamados ou registros financeiros. A tela resume quantidade de documentos, vínculos e armazenamento.',
  leads: 'CRM > Leads. Lista pesquisável de oportunidades; o formulário aceita nome, contato, e-mail, telefone e origem. Ao abrir um registro, é possível consultar detalhes e, com permissão, editar etapa/status e prioridade (baixa, média, alta ou urgente), ou excluir. A sequência de status inclui Novo lead, Primeiro contato, Qualificação, Reunião agendada, Levantamento de requisitos, Proposta em preparação, Proposta enviada, Negociação, Fechado — ganho e Fechado — perdido.',
  clientes: 'CRM > Clientes. Lista pesquisável de clientes com razão social/nome, nome fantasia, e-mail, telefone e status. O formulário Novo registro cadastra os dados; os detalhes permitem editar e definir status Ativo, Inativo ou Prospecto. Criar, atualizar e excluir dependem das permissões efetivas.',
  contatos: 'A rota Contatos não é um catálogo separado nesta versão: abre CRM > Mensagens recebidas. A lista pesquisa remetente, assunto e canal; o formulário registra remetente, assunto, conteúdo e canal (Manual, Formulário do site, E-mail ou WhatsApp). Detalhes permitem atualizar conteúdo, status e prioridade conforme as permissões.',
  propostas: 'Comercial > Propostas. A lista pesquisa e filtra status, abre detalhes, e permite criar/editar/excluir conforme permissões. O formulário de criação reúne título, cliente, status, valor unitário, quantidade, desconto, descrição do item e observações. Na edição também há validade. Estados visíveis incluem Rascunho, Enviada, Em negociação, Aprovada, Rejeitada, Cancelada e Expirada.',
  contratos: 'Comercial > Contratos. A lista pesquisa e filtra status; detalhes exibem cliente, situação, valor, vigência, observações e anexos. O cadastro aceita título, cliente, valor contratado e PDF; a edição inclui status, tipo, início, término e observações. Alterações e exclusão dependem das permissões de contratos; acesso a anexos também depende das permissões específicas de anexos.',
  projetos: 'Operações > Projetos. Lista projetos com busca e filtros por data, status, prioridade, cliente e responsável, além de ordenação por criação, prazo, nome ou prioridade. Os cartões incluem indicadores de tarefas e prazos; a tela permite abrir detalhes e iniciar cadastro/edição conforme permissões. Projeto e tarefas têm controles de compartilhamento e atribuição condicionados às permissões e ao vínculo do usuário com o projeto.',
  tarefas: 'A rota Tarefas é um alias da área de Projetos nesta implementação e inicia a lista de projetos; não existe uma página independente de tarefas nesse caminho. As tarefas são consultadas dentro do contexto de projetos e as tarefas compartilhadas comigo aparecem na área operacional disponível ao usuário.',
  solicitacoes: 'Operações > Solicitações de alteração. Exibe solicitações com título, solicitante, descrição, status, prioridade, categoria e esforço estimado. Use a busca/filtros da lista; Novo registro abre o formulário e detalhes permitem revisar ou editar conforme as permissões.',
  suporte: 'Operações > Suporte. A central de chamados mostra indicadores de total, abertos, em andamento, aguardando cliente/equipe, resolvidos, fechados, atrasados, tempo de primeira resposta e resolução média. Alterne entre Lista e Kanban; filtre por categoria, setor, status, prioridade, responsável e período. Abra um chamado para consultar detalhes, registrar interação interna/externa e acessar anexos; criação, edição, exclusão e atribuição dependem da permissão e do setor do usuário.',
  sistemas: 'Produtos > Sistemas dos clientes. O catálogo lista sistemas vinculados a clientes, com código interno, status operacional, tipo de acesso, URLs e datas. Pesquise, atualize, adicione, edite ou exclua conforme os controles disponíveis; abrir um sistema mostra descrição, anexos e módulos associados.',
  modulos: 'Produtos > Módulos. Catálogo de funcionalidades vinculáveis a um sistema, com código interno único, categoria, tipo de acesso, URL e status de implementação/disponibilidade. Crie ou edite o módulo nesta tela; o vínculo de rota protegida é configurado na licença, não inferido pelo nome do módulo.',
  planos: 'Produtos > Planos. Catálogo de ofertas comerciais com sistema associado, nome, código, descrição, preço, período de cobrança e limite de usuários. Usuários com planos:manage podem criar, editar e excluir; a exclusão pode ser bloqueada enquanto houver vínculos com clientes ou licenças.',
  licencas: 'Produtos > Licenças. Emita licença para cliente e sistema, opcionalmente com domínio autorizado e data de expiração. A chave e o token de integração são exibidos uma única vez; copie-os e configure-os apenas no servidor do sistema cliente. Nos detalhes avançados, marque primeiro Contratado e depois Liberado para módulos disponíveis; configure rotas, escolha o modo de integração, gere/baixe middleware quando houver rotas cadastradas e consulte as instruções. Status, validade e exclusão exigem licença:manage_licenses.',
  'contas-a-receber': 'Financeiro > A receber. Consulta lançamentos de recebíveis e oferece criação/edição conforme permissões. Use o seletor de período (30 dias, 90 dias ou todo o período) e os filtros apresentados para localizar vencimentos e status.',
  'contas-a-pagar': 'Financeiro > A pagar. Consulta lançamentos de pagamentos e oferece criação/edição conforme permissões. Use o seletor de período e os filtros apresentados para acompanhar despesas, pagamentos e vencimentos.',
  'fluxo-de-caixa': 'Financeiro > Fluxo de caixa. Compara entradas, saídas e saldo líquido ao longo dos últimos seis meses, com resumos de maiores entradas/saídas. A visualização depende dos lançamentos financeiros disponíveis e das permissões do usuário.',
  recorrencias: 'Financeiro > Recorrências. Exibe padrões recorrentes e permite cadastrar, editar ou excluir agendamentos conforme permissões. Os dados mostrados dependem das recorrências cadastradas.',
  orcamento: 'Financeiro > Orçamento. Apresenta planejamento e estimativas de receita, despesa e reserva usando os dados financeiros disponíveis.',
  transacoes: 'A rota Transações abre a visão geral do Financeiro nesta versão; não há uma tela independente de transações no roteador atual. A visão geral resume saldo em aberto, receitas, despesas e atrasos, com seletor de período.',
  'categorias-financeiras': 'A rota Categorias financeiras abre a visão geral do Financeiro nesta versão; não há uma tela independente de categorias no roteador atual. Não invente uma lista ou controles de categorias que não estejam documentados na tela.',
  relatorios: 'Administração > Relatórios. Apresenta seções comercial e financeira conforme permissões: contagens de leads, clientes, propostas e contratos; status de propostas/contratos; totais, recebidos, em aberto e atrasados. Exportar CSV exige a permissão de exportação da seção correspondente e inclui somente dados visíveis para a conta.',
  equipe: 'Administração > Equipe abre Controle do workspace. As áreas internas podem incluir Equipe, Notificações, Auditoria e Configurações, cada uma condicionada à permissão. Equipe lista membros e permite consultar atividades quando o usuário também pode ver projetos. Não confunda esta tela com a matriz de cargos e permissões.',
  usuarios: 'Administração > Usuários abre a visão Usuários de Cargos e permissões. Pesquise por nome, e-mail, papel ou setor; consulte detalhes e permissões individuais; com users:manage_users, crie conta com senha inicial ou vincule conta existente deixando a senha vazia, edite nome/e-mail, cargo ou status conforme permitido. Alterações são auditadas; não altere a própria conta.',
  'papeis-e-permissoes': 'Administração > Papéis e permissões abre Cargos e matriz. Selecione um cargo para ver a matriz granular por setor/módulo e ações; pesquise permissões, altere concessões e salve. Cargos não sistêmicos podem ser criados e alguns excluídos com as regras de substituição. O cargo Admin é protegido e não pode ser reduzido. Exceções por usuário ficam nos detalhes de Usuários.',
  emblemas: 'Administração > Emblemas. Gerencie reconhecimentos e critérios, consulte a classificação da equipe por XP, pesquise pessoas e selecione um emblema para atribuição. As opções de editar, duplicar, arquivar, excluir e atribuir aparecem conforme o estado do emblema e as permissões.',
  'configuracao-xp': 'Administração > Configuração de XP tem três abas: Níveis (marcos e XP mínimo), Regras de XP (ações, condições JSON, quantidade e ativação) e Ajustes e histórico (ajuste manual positivo/negativo com justificativa obrigatória e consulta do ledger filtrável por membro, ação, origem ou justificativa). Mudanças dependem das permissões administrativas.',
  'meu-perfil': 'Conta > Meu perfil reúne identidade, nome/apelido, URL da foto, cargo e nível/XP, emblemas conquistados e segurança da conta. Salve a identidade para atualizar o perfil; a senha pode ser atualizada informando uma nova senha com pelo menos oito caracteres.',
  'meu-historico': 'Conta > Meu histórico mostra até 100 atividades de projeto feitas pelo usuário autenticado. Pesquise pelo resumo/tipo/ID e filtre por módulo; quando houver projeto associado, use Abrir projeto. O acesso depende da permissão de leitura de projetos.',
  configuracoes: 'Administração > Configurações abre a área administrativa com abas condicionadas por permissão. A aba Configurações lê e salva nome fantasia, razão social, e-mail e telefone da empresa; as abas Notificações e Auditoria mostram essas áreas quando o usuário tem os grants necessários.',
  aparencia: 'Conta > Aparência personaliza preferências individuais: tema Escuro/Claro/Automático, cores do workspace, tipografia e densidade, arredondamento/movimento e acessibilidade/contraste. As mudanças são pré-visualizadas em tempo real; use Salvar preferências para persistir ou Restaurar padrão para descartar.',
  auditoria: 'Administração > Auditoria mostra eventos administrativos recentes. Pesquise por ação, entidade, ID, ator ou resultado; filtre por tipo de entidade e expanda um evento para consultar dados anteriores e posteriores. Acesso depende de audit:view_audit.',
}

const pageKeywords: Record<string, string[]> = {
  dashboard: ['painel', 'indicadores'],
  comercial: ['pipeline', 'vendas'],
  documentos: ['arquivo', 'anexo', 'upload', 'vínculo'],
  leads: ['oportunidade'],
  clientes: ['cliente'],
  contatos: ['mensagem', 'mensagens'],
  propostas: ['proposta'],
  contratos: ['contrato'],
  projetos: ['projeto'],
  tarefas: ['tarefa'],
  solicitacoes: ['solicitação', 'alteração'],
  suporte: ['chamado', 'ticket'],
  sistemas: ['sistema'],
  modulos: ['módulo'],
  planos: ['plano'],
  licencas: ['licença', 'licenciamento'],
  'contas-a-receber': ['receita', 'recebimento', 'receber'],
  'contas-a-pagar': ['despesa', 'pagamento', 'pagar'],
  'fluxo-de-caixa': ['caixa', 'entrada', 'saída'],
  recorrencias: ['recorrência', 'recorrências', 'recorrente'],
  orcamento: ['orçamento', 'planejamento financeiro', 'reserva'],
  transacoes: ['transação'],
  'categorias-financeiras': ['categoria financeira'],
  relatorios: ['relatório', 'exportar csv'],
  equipe: ['membro da equipe'],
  usuarios: ['usuário', 'conta de usuário'],
  'papeis-e-permissoes': ['papel', 'permissão', 'permissões', 'cargo', 'matriz de permissões'],
  emblemas: ['emblema', 'conquista'],
  'configuracao-xp': ['xp', 'gamificação'],
  'meu-perfil': ['perfil', 'senha'],
  'meu-historico': ['histórico pessoal', 'atividade pessoal'],
  configuracoes: ['configuração da empresa'],
  aparencia: ['tema', 'cores', 'tipografia', 'contraste'],
  auditoria: ['auditoria', 'evento administrativo'],
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function getRelevantPageSlugs(moduleSlug?: string, query = ''): string[] {
  const normalizedQuery = normalizeForMatch(query)
  const mentionedPages = Object.keys(moduleGuides).filter((slug) => {
    const candidates = [workspaceLabel(slug) ?? slug, slug.replaceAll('-', ' '), ...(pageKeywords[slug] ?? [])]
      .map(normalizeForMatch)
      .filter((candidate) => candidate.length >= 4 || candidate === 'xp')
    return candidates.some((candidate) => normalizedQuery.includes(candidate))
  })

  return [...new Set([moduleSlug, ...mentionedPages].filter((slug): slug is string => Boolean(slug && moduleGuides[slug])))].slice(0, 3)
}

const workspaceOverview = [
  'A Codexa é um workspace de gestão com CRM, operação/projetos, comercial, documentos, catálogo de produtos, licenças, finanças, relatórios, administração, conta e gamificação.',
  'Navegação lateral: Workspace (Dashboard, Visão comercial, Documentos); Relacionamento (Leads, Clientes, Contatos); Comercial (Propostas, Contratos); Operações (Projetos, Tarefas, Solicitações de alteração, Suporte); Produtos (Sistemas dos clientes, Módulos, Planos, Licenças); Financeiro (Contas a receber, Contas a pagar, Fluxo de caixa, Transações, Categorias financeiras); Administração (Relatórios, Equipe, Usuários, Papéis e permissões, Emblemas, Configuração de XP, Auditoria); Conta (Meu perfil, Meu histórico, Configurações, Aparência).',
  'Seções internas conhecidas: CRM alterna Leads, Clientes e Mensagens; Comercial reúne Visão geral, Pipeline, Propostas e Contratos; Operações alterna Projetos, Alterações e Suporte, que também oferece Lista/Kanban; Catálogo alterna Sistemas dos clientes e Módulos; Financeiro tem Visão geral, A receber, A pagar, Fluxo de caixa, Recorrências e Orçamento; Configuração de XP tem Níveis, Regras de XP e Ajustes e histórico; Cargos e permissões tem Cargos e matriz e Usuários; Administração pode mostrar Equipe, Notificações, Auditoria e Configurações conforme as permissões.',
  'Atalhos do workspace: Ctrl+K abre a busca de páginas; Ctrl+Shift+A abre/fecha o Code-X; Escape fecha a janela ou a busca ativa.',
].join('\n\n')

const assistantGuide = [
  'O Code-X pode explicar o workspace e documentação, pesquisar conhecimento interno, manter conversas quando o schema de histórico estiver aplicado, alternar entre modelos, ativar até dois modelos de contingência, abrir o histórico, iniciar conversa, copiar respostas e mostrar fontes retornadas.',
  'A janela do Code-X pode ser movida pelo controle do cabeçalho; a alça inferior redimensiona largura e altura com mouse ou toque. Com o foco na alça, use as setas para ajustar e Home para restaurar o tamanho padrão. Os botões de minimizar e ampliar aplicam tamanhos predefinidos.',
].join('\n\n')

export function getWorkspacePageContext(moduleSlug?: string, query?: string): string {
  const pageLabel = moduleSlug ? workspaceLabel(moduleSlug) : undefined
  const relevantPages = getRelevantPageSlugs(moduleSlug, query)
  const pageCatalog = Object.entries(moduleGuides)
    .map(([slug, guide]) => {
      const summary = guide.split(/(?<=\.)\s/, 1)[0] ?? guide
      return `${workspaceLabel(slug) ?? slug} (${slug}): ${summary}`
    })
    .join('\n')
  const detailedGuides = relevantPages
    .map((slug) => `${workspaceLabel(slug) ?? slug} (${slug}): ${moduleGuides[slug]}`)
    .join('\n\n')

  return [
    workspaceOverview,
    `Mapa funcional resumido de todas as páginas:\n${pageCatalog}`,
    pageLabel ? `Página atual: ${pageLabel} (rota ${moduleSlug}).` : 'Página atual: não identificada; use o mapa para perguntas gerais.',
    detailedGuides ? `Guias detalhados da página atual e das páginas mencionadas na pergunta:\n${detailedGuides}` : '',
    assistantGuide,
    'Como orientar um fluxo: informe o caminho exato (grupo > página > aba/seção), apresente passos curtos e numerados com os rótulos conhecidos dos controles e mencione pré-requisitos/permissões. Explique o que cada aba mostra e quando usá-la. Ao comparar páginas, destaque aliases e telas compartilhadas descritos no mapa.',
    'As permissões efetivas são validadas no servidor e podem ocultar ações; a rota e o contexto enviados pelo cliente ajudam a identificar a tela, mas não concedem acesso. Este agente pesquisa documentação e explica o sistema; não tem ferramenta para consultar ou modificar registros operacionais. Nunca afirme que buscou, criou, editou, excluiu ou confirmou dados de clientes, usuários, valores, projetos, propostas, contratos ou chamados.',
    'Este guia descreve a estrutura conhecida da interface, não o estado atual dos dados. Não invente telas, campos, abas, regras, permissões, valores ou resultados. Para detalhes de negócio que não constem no mapa, use somente documentação recuperada e cite o título e o link da fonte quando disponível; se a documentação não cobrir o caso, diga isso claramente.',
  ].filter(Boolean).join('\n\n')
}
