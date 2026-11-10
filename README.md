<div align="center">

# 🚀 CODEXA
### Intelligent Business Management Platform

*Uma plataforma de gestão inteligente, modular e integrada.*

<!-- Badges de Status e Tecnologias -->
<p align="center">
  <img src="https://img.shields.io/badge/Status-Em%20Desenvolvimento-885CF6?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Next.js-App%20Router-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-Typed-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3FCF87?style=for-the-badge&logo=supabase" alt="Supabase" />
</p>

</div>

---

## 📌 Sobre o projeto

A **Codexa** é uma plataforma de gestão empresarial desenvolvida para centralizar diferentes áreas de uma operação em um único ambiente, conectando processos comerciais, financeiros, administrativos e operacionais.

Mais do que um dashboard administrativo, o projeto propõe um ecossistema modular no qual informações, usuários, permissões, projetos, contratos, transações e processos trabalham de forma integrada.

O objetivo é reduzir a fragmentação de ferramentas, melhorar a organização operacional e oferecer uma estrutura escalável para empresas que precisam de controle, visibilidade e eficiência.

O projeto também explora a integração de inteligência artificial como camada de assistência operacional, permitindo interações mais naturais com informações e funcionalidades do sistema.

---

## 🎯 Visão do produto

* 🏢 **Centralização** da gestão empresarial.
* 🔗 **Integração** entre módulos e processos.
* 🔐 **Controle de acesso** granular.
* 🎨 **Personalização** da experiência do usuário.
* ⚡ **Automação** de processos administrativos.
* 🤖 **Inteligência Artificial** integrada ao ambiente de trabalho.
* 📈 **Arquitetura escalável** para expansão e integração com sistemas externos.

---

## 🧩 Módulos e Funcionalidades

A arquitetura da Codexa é organizada em módulos, com responsabilidades específicas e possibilidade de evolução independente:

| Módulo | Descrição |
| :--- | :--- |
| 📊 **Dashboard** | Visão geral da operação e indicadores gerenciais. |
| 🤝 **Comercial** | Gestão de leads, clientes e oportunidades comerciais. |
| 📝 **Propostas** | Organização e acompanhamento de propostas comerciais. |
| 📑 **Contratos** | Gestão de contratos e documentos comerciais. |
| 📁 **Projetos** | Organização de projetos, responsáveis e participantes. |
| 🗂️ **Kanban** | Acompanhamento de projetos e etapas de execução. |
| ✅ **Tarefas** | Distribuição e gerenciamento de atividades. |
| 🔄 **Solicitações** | Controle de solicitações e alterações em projetos. |
| 🎧 **Suporte** | Gestão de chamados, responsáveis e setores. |
| 🖥️ **Sistemas** | Administração dos sistemas vinculados à operação. |
| 🧱 **Módulos e Planos** | Organização de funcionalidades e planos comerciais. |
| 🔑 **Licenças** | Controle de licenciamento e disponibilização de módulos. |
| 💰 **Financeiro** | Centralização de informações e operações financeiras. |
| 👥 **Equipe e Usuários** | Gerenciamento de usuários, cargos e estrutura interna. |
| 🛡️ **Permissões** | Controle granular de acesso por cargo e usuário. |
| 🎨 **Aparência** | Personalização de temas, cores e identidade visual. |
| 🤖 **Assistente IA** | Camada de inteligência artificial integrada ao sistema. |

---

## 💰 Gestão Financeira Integrada

O módulo financeiro foi concebido para trabalhar com uma estrutura unificada de informações, conectando diferentes operações financeiras. Entre as áreas contempladas estão:

* Contas a pagar e Contas a receber
* Transações e Fluxo de caixa
* Categorias financeiras e Orçamentos
* Relatórios e Lançamentos recorrentes
* Valores previstos vs. realizados

> **Objetivo arquitetural:** Manter consistência entre as diferentes visões financeiras, evitando duplicidade e divergência de informações.

---

## 🔑 Gestão de Licenças e Módulos

Um dos diferenciais arquiteturais da Codexa é a proposta de gerenciamento centralizado. A plataforma foi concebida para permitir:

* Criação e gerenciamento de licenças.
* Vinculação de licenças a sistemas clientes.
* Controle de módulos contratados.
* Ativação e desativação de funcionalidades.
* Organização de planos e recursos disponíveis.

---

## 🤖 Inteligência Artificial

A Codexa explora a integração de inteligência artificial como uma camada de assistência dentro do ambiente de gestão, permitindo interagir com o sistema via linguagem natural:

* Integração com provedores de modelos de linguagem.
* Processamento de mensagens e contexto conversacional.
* Assistência baseada nas informações do ambiente.
* Conexão com ferramentas e operações do sistema.
* Controle de acesso às funcionalidades utilizadas pelo agente.

---

## 🏗️ Tecnologias Utilizadas

| Tecnologia | Aplicação |
| :--- | :--- |
| **Next.js** | Framework principal e estrutura da aplicação (App Router). |
| **React** | Construção e componentização da interface. |
| **TypeScript** | Tipagem estática e segurança no desenvolvimento. |
| **Supabase** | Backend, banco de dados e autenticação. |
| **PostgreSQL** | Persistência e relacionamento dos dados. |
| **Tailwind CSS** | Estilização e design system da interface. |
| **Vercel** | Deploy e hospedagem contínua. |
| **Vercel AI SDK** | Integração com modelos de inteligência artificial. |
| **OpenRouter** | Camada de acesso a modelos de IA. |

---

## 🔐 Arquitetura e Segurança

O desenvolvimento considera a separação rigorosa de responsabilidades entre interface, lógica de negócio, serviços e persistência:

* Autenticação e gerenciamento seguro de usuários.
* Controle de acesso baseado em cargos e permissões (RBAC).
* Políticas de segurança em nível de linha (**RLS** - Row Level Security no Supabase).
* Validação rigorosa de operações no backend.

---

## 🧠 Conceitos de Engenharia Aplicados

| Área | Conceitos e Práticas |
| :--- | :--- |
| **Frontend** | React, Next.js, TypeScript e interfaces responsivas. |
| **Backend** | APIs, lógica de negócio e integração de serviços. |
| **Banco de Dados** | PostgreSQL, relacionamentos e modelagem de dados. |
| **Segurança** | Autenticação, autorização e políticas RLS. |
| **Arquitetura** | Modularização e separação clara de responsabilidades. |
| **Inteligência Artificial** | Integração com LLMs e agentes conversacionais. |
| **DevOps** | Git, GitHub e deploy automatizado na Vercel. |

---

## 📈 Evolução do Projeto

A Codexa está em desenvolvimento contínuo. Sua arquitetura e seus módulos evoluem conforme novas necessidades operacionais são identificadas e implementadas.

---

<div align="center">

<p><b>CODEXA</b> — Tecnologia conectando processos, pessoas e resultados.</p>

</div>
