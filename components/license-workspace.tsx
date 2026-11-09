'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, KeyRound, Loader2, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { isModuleAvailable } from '@/lib/licensing/module-status'
import { IntegrationHelp } from '@/components/integration-help'
import { IntegrationModeGuide } from '@/components/integration-mode-guide'

type Client = { id: string; name: string }
type System = { id: string; name: string; client_id: string | null }
type Module = {
  id: string
  name: string
  internal_code: string
  availability_status: string
  is_contracted: boolean
  is_enabled: boolean
}
type License = {
  id: string
  client_id: string
  system_id: string
  status: string
  expires_at: string | null
  allowed_domain: string | null
  created_at: string
  plan_id: string | null
  contract_id: string | null
  modules: Module[]
}
type LicenseData = { clients: Client[]; systems: System[]; licenses: License[] }
type RouteMapping = { id: string; system_module_id: string; route_pattern: string; blocked_path: string }
type RotaAnalysis = { tabs: string[]; detectedTabs: Array<{ tab: string; code: string; confidence: number; hasContent: boolean; hasTrigger: boolean; navigationElements?: string[]; contentEvidence?: string[]; functionalities?: string[]; dependencies?: string[] }>; mappings: Array<{ tab: string; code: string }>; sharedComponents: string[]; warnings: string[]; uncertain: string[]; requiresConfirmation: boolean; compatibility?: number }

const inputClass = 'field rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-400/60'
const statusNames: Record<string, string> = { active: 'Ativa', suspended: 'Suspensa', revoked: 'Revogada' }
const defaultLicenseSiteUrl = 'https://codexash.vercel.app'

function licenseStatusLabel(license: License) {
  if (license.status === 'active' && license.expires_at && new Date(license.expires_at).getTime() < Date.now()) return 'Expirada'
  return statusNames[license.status] ?? license.status
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const result = await response.json() as T & { error?: string; warning?: string | null }
  if (!response.ok) throw new Error(result.error || 'A solicitação não foi concluída.')
  return result
}

export function LicenseWorkspace({ permissions }: { permissions: string[] }) {
  const canManage = permissions.includes('*') || permissions.includes('licenses:manage_licenses')
  const [data, setData] = useState<LicenseData>({ clients: [], systems: [], licenses: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [expandedLicenseId, setExpandedLicenseId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newLicenseKey, setNewLicenseKey] = useState('')
  const [integrationToken, setIntegrationToken] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [selectedSystem, setSelectedSystem] = useState('')
  const [scriptOrigin, setScriptOrigin] = useState(defaultLicenseSiteUrl)
  const [routesByLicense, setRoutesByLicense] = useState<Record<string, RouteMapping[]>>({})
  const [singleRouteByLicense, setSingleRouteByLicense] = useState<Record<string, string>>({})
  const [visualScriptByLicense, setVisualScriptByLicense] = useState<Record<string, string>>({})
  const [scriptSnippetByLicense, setScriptSnippetByLicense] = useState<Record<string, string>>({})
  const [adminSourceByLicense, setAdminSourceByLicense] = useState<Record<string, string>>({})
  const [generatingZipId, setGeneratingZipId] = useState('')
  const [mappingByLicense, setMappingByLicense] = useState<Record<string, string>>({})
  const [analysisByLicense, setAnalysisByLicense] = useState<Record<string, RotaAnalysis>>({})
  const [analyzingLicenseId, setAnalyzingLicenseId] = useState('')
  const [guideMode, setGuideMode] = useState<'routes' | 'single' | null>(null)
  const [routeForm, setRouteForm] = useState({ licenseId: '', moduleId: '', pattern: '', blockedPath: '/acesso-bloqueado' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await requestJson<LicenseData>('/api/admin/licenses'))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as licenças.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visibleSystems = useMemo(
    () => data.systems.filter((system) => !system.client_id || system.client_id === selectedClient),
    [data.systems, selectedClient],
  )
  const filteredLicenses = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data.licenses
    return data.licenses.filter((license) => {
      const client = data.clients.find((item) => item.id === license.client_id)?.name ?? ''
      const system = data.systems.find((item) => item.id === license.system_id)?.name ?? ''
      return `${client} ${system} ${license.status}`.toLowerCase().includes(term)
    })
  }, [data, search])

  async function createLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await requestJson<{ license: License; licenseKey: string; warning: string | null }>(
        '/api/admin/licenses',
        {
          method: 'POST',
          body: JSON.stringify({
            clientId: form.get('clientId'),
            systemId: form.get('systemId'),
            expiresAt: form.get('expiresAt') || null,
            allowedDomain: form.get('allowedDomain') || null,
          }),
        },
      )
      setNewLicenseKey(result.licenseKey)
      const integration = await requestJson<{ integrationToken: string }>(`/api/admin/licenses/${result.license.id}/integration`, { method: 'POST' })
      setIntegrationToken(integration.integrationToken)
      setNotice(result.warning || 'Licença e integração preparadas. Guarde os dois segredos: eles não serão exibidos novamente.')
      setShowForm(false)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível criar a licença.')
    } finally {
      setSaving(false)
    }
  }

  async function updateLicense(licenseId: string, changes: { status?: string; expiresAt?: string | null }) {
    setError('')
    setNotice('')
    try {
      const result = await requestJson<{ license: { id: string; status: string; expires_at: string | null }; warning: string | null }>(
        `/api/admin/licenses/${licenseId}`,
        { method: 'PATCH', body: JSON.stringify(changes) },
      )
      setData((current) => ({
        ...current,
        licenses: current.licenses.map((item) => item.id === licenseId
          ? { ...item, status: result.license.status, expires_at: result.license.expires_at }
          : item),
      }))
      if (result.warning) setNotice(result.warning)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar a licença.')
    }
  }

  async function updateModule(licenseId: string, module: Module, contracted: boolean, enabled: boolean) {
    setError('')
    setNotice('')
    try {
      const result = await requestJson<{ warning: string | null }>(
        `/api/admin/licenses/${licenseId}/modules/${module.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ contracted, enabled: contracted && enabled }),
        },
      )
      setData((current) => ({
        ...current,
        licenses: current.licenses.map((license) => license.id === licenseId
          ? {
              ...license,
              modules: license.modules.map((item) => item.id === module.id
                ? { ...item, is_contracted: contracted, is_enabled: contracted && enabled }
                : item),
            }

          : license),
      }))
      if (result.warning) setNotice(result.warning)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar o módulo.')
    }
  }

  async function loadRoutes(licenseId: string) {
    try {
      const result = await requestJson<{ routes: RouteMapping[] }>(`/api/admin/licenses/${licenseId}/routes`)
      setRoutesByLicense((current) => ({ ...current, [licenseId]: result.routes }))
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as rotas.') }
  }

  async function addRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const result = await requestJson<{ route: RouteMapping }>(`/api/admin/licenses/${routeForm.licenseId}/routes`, { method: 'POST', body: JSON.stringify({ moduleId: routeForm.moduleId, routePattern: routeForm.pattern, blockedPath: routeForm.blockedPath }) })
      setRoutesByLicense((current) => ({ ...current, [routeForm.licenseId]: [...(current[routeForm.licenseId] ?? []), result.route] }))
      setRouteForm((current) => ({ ...current, pattern: '' }))
      setNotice('Rota protegida adicionada.')
    } catch (routeError) { setError(routeError instanceof Error ? routeError.message : 'Não foi possível adicionar a rota.') }
  }

  async function deleteRoute(licenseId: string, routeId: string) {
    try {
      await requestJson(`/api/admin/licenses/${licenseId}/routes?id=${encodeURIComponent(routeId)}`, { method: 'DELETE' })
      setRoutesByLicense((current) => ({ ...current, [licenseId]: (current[licenseId] ?? []).filter((route) => route.id !== routeId) }))
      setNotice('Rota protegida removida.')
    } catch (routeError) { setError(routeError instanceof Error ? routeError.message : 'Não foi possível remover a rota.') }
  }

  async function generateMiddleware(licenseId: string) {
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/admin/licenses/${licenseId}/middleware`)
      if (!response.ok) {
        const result = await response.json() as { error?: string }
        throw new Error(result.error || 'Não foi possível gerar o pacote de rotas.')
      }
      const routeCount = Number(response.headers.get('x-codexa-route-count') ?? 0)
      if (!routeCount) throw new Error('Cadastre ao menos uma rota protegida antes de gerar o pacote.')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'codexa-rotas-padrao.zip'
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice(`Pacote gerado com ${routeCount} rota${routeCount === 1 ? '' : 's'}. Ele inclui middleware.ts e a página padrão de bloqueio.`)
    } catch (generateError) { setError(generateError instanceof Error ? generateError.message : 'Não foi possível gerar o pacote de rotas.') }
  }

  async function analyzeRotaUnica(licenseId: string) {
    const originalCode = adminSourceByLicense[licenseId]?.trim()
    if (!originalCode) { setError('Cole o conteúdo original de AdminClient.tsx antes de analisar.'); return }
    setAnalyzingLicenseId(licenseId); setError('')
    try {
      const form = new FormData(); form.set('originalCode', originalCode); form.set('analyze', 'true')
      const mapping = mappingByLicense[licenseId]?.trim(); if (mapping) form.set('mapping', mapping)
      const response = await fetch(`/api/admin/licenses/${licenseId}/integration/rota-unica`, { method: 'POST', body: form })
      const result = await response.json() as { analysis?: RotaAnalysis; error?: string }
      if (!response.ok || !result.analysis) throw new Error(result.error || 'Não foi possível analisar o código.')
      setAnalysisByLicense((current) => ({ ...current, [licenseId]: result.analysis! }))
      setMappingByLicense((current) => current[licenseId]?.trim()
        ? current
        : { ...current, [licenseId]: JSON.stringify(result.analysis!.mappings, null, 2) })
      setNotice(`Análise concluída: ${result.analysis.tabs.length} aba${result.analysis.tabs.length === 1 ? '' : 's'} detectada${result.analysis.tabs.length === 1 ? '' : 's'}. Compatibilidade estimada em ${result.analysis.compatibility ?? 0}%; o JSON foi preenchido automaticamente e pode ser revisado.`)
    } catch (analysisError) { setError(analysisError instanceof Error ? analysisError.message : 'Não foi possível analisar o código.') }
    finally { setAnalyzingLicenseId('') }
  }

  async function generateRotaUnicaZip(licenseId: string) {
    const originalCode = adminSourceByLicense[licenseId]?.trim()
    if (!originalCode) { setError('Cole o conteúdo original de AdminClient.tsx antes de gerar o ZIP.'); return }
    setGeneratingZipId(licenseId)
    setError('')
    try {
      const form = new FormData()
      form.set('originalCode', originalCode)
      const mapping = mappingByLicense[licenseId]?.trim()
      if (mapping) form.set('mapping', mapping)
      const response = await fetch(`/api/admin/licenses/${licenseId}/integration/rota-unica`, { method: 'POST', body: form })
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error || 'Não foi possível gerar o pacote.') }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'codexa-integration-rota-unica.zip'
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice('ZIP de integração com rota única gerado. Revise o manifesto para ver os arquivos e caminhos detectados.')
    } catch (generateError) { setError(generateError instanceof Error ? generateError.message : 'Não foi possível gerar o pacote ZIP.') }
    finally { setGeneratingZipId('') }
  }

  async function generateSingleRouteHelper(licenseId: string) {
    setError('')
    try {
const result = await requestJson<{ source: string; visualScript: string; scriptSnippet: string; moduleCount: number }>(`/api/admin/licenses/${licenseId}/integration/helper`)
  setSingleRouteByLicense((current) => ({ ...current, [licenseId]: result.source }))
  setVisualScriptByLicense((current) => ({ ...current, [licenseId]: result.visualScript }))
  setScriptSnippetByLicense((current) => ({ ...current, [licenseId]: result.scriptSnippet }))
  setNotice(`Helper e script visual gerados para ${result.moduleCount} módulos. O script usa data-lic-module/data-lic-action e deve ser combinado com proteção server-side.`)
    } catch (generateError) { setError(generateError instanceof Error ? generateError.message : 'Não foi possível gerar a integração de rota única.') }
  }

  function downloadTextFile(fileName: string, source: string, message: string) {
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice(message)
  }

  async function deleteLicense(license: License) {
    const clientName = data.clients.find((client) => client.id === license.client_id)?.name ?? 'este cliente'
    const systemName = data.systems.find((system) => system.id === license.system_id)?.name ?? 'este sistema'
    if (!window.confirm(`Excluir permanentemente a licença de ${clientName} (${systemName})? Os módulos associados também serão removidos.`)) return

    setDeletingId(license.id)
    setError('')
    setNotice('')
    try {
      const result = await requestJson<{ warning?: string | null }>(`/api/admin/licenses/${license.id}`, { method: 'DELETE' })
      setData((current) => ({ ...current, licenses: current.licenses.filter((item) => item.id !== license.id) }))
      setNotice(result.warning || 'Licença excluída.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir a licença.')
    } finally {
      setDeletingId('')
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(newLicenseKey)
      setNotice('Chave copiada para a área de transferência.')
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie a chave exibida.')
    }
  }

  return <section className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Produtos e acesso</p>
        <h1 className="text-2xl font-semibold text-white">Licenças</h1>
        <div className="flex items-start gap-2"><p className="mt-1.5 text-sm text-slate-500">Gerencie chaves, validade, contratação e liberação dos módulos por sistema.</p><IntegrationHelp title="licenças" steps={['Selecione o cliente e o sistema que receberão a licença.', 'Defina a validade, se houver, e emita a licença.', 'Dentro da licença, marque primeiro os módulos contratados.', 'Depois marque Liberado apenas para módulos disponíveis ao cliente.', 'Altere status ou validade quando o acesso precisar ser suspenso ou renovado.']} /></div>
      </div>
      {canManage && <button onClick={() => { setShowForm((value) => !value); setError('') }} className="flex w-fit items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400">
        {showForm ? <X className="size-4" /> : <Plus className="size-4" />}{showForm ? 'Fechar' : 'Nova licença'}
      </button>}
    </header>

    {error && <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

    {newLicenseKey && <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.06] p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-blue-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-blue-100">Chave de licença — exibida uma única vez</p>
          <code className="mt-2 block break-all rounded-lg bg-black/20 p-3 text-xs text-slate-200">{newLicenseKey}</code>
          {integrationToken && <><p className="mt-4 text-xs font-medium text-blue-100">Token server-to-server — exibido uma única vez</p><code className="mt-2 block break-all rounded-lg bg-black/20 p-3 text-xs text-amber-200">{integrationToken}</code><p className="mt-1 text-[11px] text-slate-500">Configure como CODEXA_LICENSE_KEY apenas no servidor do cliente. Nunca coloque este token no navegador.</p></>}
          <p className="mt-4 text-xs font-medium text-blue-100">Script visual opcional para entregar ao cliente</p>
          <code className="mt-2 block break-all rounded-lg bg-black/20 p-3 text-xs text-slate-300">{`<script src="${scriptOrigin}/client-script.js?token=${newLicenseKey}&api=${encodeURIComponent(`${scriptOrigin}/api/licenses/validate`)}" defer></script>`}</code>
          <button onClick={() => void copyKey()} className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"><Copy className="size-3.5" />Copiar chave</button>
        </div>
        <button onClick={() => setNewLicenseKey('')} aria-label="Ocultar chave" className="rounded p-1 text-slate-500 hover:text-white"><X className="size-4" /></button>
      </div>
    </div>}

    {showForm && <form onSubmit={(event) => void createLicense(event)} className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
      <div className="mb-4"><h2 className="text-sm font-semibold text-white">Emitir licença</h2><p className="mt-1 text-xs text-slate-500">A chave é gerada aleatoriamente e armazenada somente como hash. Informe a URL pública que hospedará o script de validação.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-slate-500">URL pública do site
          <input name="siteUrl" type="url" value={scriptOrigin} onChange={(event) => setScriptOrigin(event.target.value.replace(/\/$/, ''))} placeholder={defaultLicenseSiteUrl} required className={`${inputClass} mt-2 w-full`} />
          <span className="mt-1 block text-[11px] text-slate-600">Será usada no script entregue ao cliente. Padrão: {defaultLicenseSiteUrl}</span>
        </label>
        <label className="text-xs text-slate-500">Cliente
          <select required name="clientId" value={selectedClient} onChange={(event) => { setSelectedClient(event.target.value); setSelectedSystem('') }} className={`${inputClass} mt-2 w-full`}>
            <option value="">Selecione o cliente</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Sistema
          <select required name="systemId" value={selectedSystem} onChange={(event) => setSelectedSystem(event.target.value)} className={`${inputClass} mt-2 w-full`}>
            <option value="">Selecione o sistema</option>{visibleSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Domínio autorizado (opcional)
          <input name="allowedDomain" type="text" placeholder="cliente.com.br" className={`${inputClass} mt-2 w-full`} />
          <span className="mt-1 block text-[11px] text-slate-600">Aceita o domínio e seus subdomínios. Não inclua protocolo ou caminho.</span>
        </label>
        <label className="text-xs text-slate-500">Válida até (opcional)
          <input name="expiresAt" type="date" className={`${inputClass} mt-2 w-full`} />
        </label>
      </div>
      <button disabled={saving} className="mt-4 flex items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Emitir licença
      </button>
    </form>}

    <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#11161e] px-3 py-2.5">
      <Search className="size-4 text-slate-500" />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, sistema ou status" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
    </div>

    {loading ? <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#11161e] p-8 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Carregando licenças...</div>
      : filteredLicenses.length ? <div className="space-y-3">{filteredLicenses.map((license) => {
        const client = data.clients.find((item) => item.id === license.client_id)?.name ?? 'Cliente não encontrado'
        const system = data.systems.find((item) => item.id === license.system_id)?.name ?? 'Sistema não encontrado'
        return <article key={license.id} className="rounded-xl border border-white/[0.07] bg-[#11161e]">
          <div className="grid gap-3 border-b border-white/[0.06] px-4 py-3 lg:grid-cols-[1fr_130px_165px_auto] lg:items-center">
            <div><p className="text-sm font-medium text-white">{client}</p><p className="mt-1 text-xs text-slate-500">{system}</p>{license.allowed_domain && <p className="mt-1 text-[11px] text-blue-300/70">Domínio: {license.allowed_domain}</p>}<p className="mt-2 text-[11px] text-slate-600">Criada em {new Date(license.created_at).toLocaleDateString('pt-BR')}</p></div>
            {canManage ? <label className="text-[11px] text-slate-500">Status
              <span className={`mt-1.5 block text-xs font-medium ${licenseStatusLabel(license) === 'Ativa' ? 'text-emerald-200' : 'text-amber-100'}`}>{licenseStatusLabel(license)}</span>
              <select value={license.status} onChange={(event) => void updateLicense(license.id, { status: event.target.value })} className={`${inputClass} mt-1.5 w-full text-xs`}>
                {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label> : <div className="text-[11px] text-slate-500">Status<span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${licenseStatusLabel(license) === 'Ativa' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-100'}`}>{licenseStatusLabel(license)}</span></div>}
            {canManage ? <label className="text-[11px] text-slate-500">Expira em
              <input type="date" value={license.expires_at ? new Date(license.expires_at).toISOString().slice(0, 10) : ''} onChange={(event) => void updateLicense(license.id, { expiresAt: event.target.value || null })} className={`${inputClass} mt-1.5 w-full text-xs`} />
            </label> : <div className="text-[11px] text-slate-500">Expira em<span className="mt-2 block text-xs text-slate-300">{license.expires_at ? new Date(license.expires_at).toLocaleDateString('pt-BR') : 'Sem expiração'}</span></div>}
            {canManage && <button type="button" onClick={() => void deleteLicense(license)} disabled={deletingId === license.id} title="Excluir licença permanentemente" aria-label={`Excluir licença de ${client}`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/20 px-3 py-2.5 text-xs font-medium text-rose-200 hover:bg-rose-400/10 disabled:cursor-wait disabled:opacity-50">
              {deletingId === license.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}<span className="lg:hidden">Excluir</span>
            </button>}
          </div>
          <div className="border-t border-white/[0.06] px-5 py-3"><button type="button" onClick={() => { const next = expandedLicenseId === license.id ? null : license.id; setExpandedLicenseId(next); if (next) { setRouteForm((current) => ({ ...current, licenseId: license.id, moduleId: license.modules[0]?.id ?? '' })); void loadRoutes(license.id) } }} aria-expanded={expandedLicenseId === license.id} className="flex w-full items-center justify-between text-left text-xs font-medium text-blue-200"><span>{expandedLicenseId === license.id ? 'Ocultar detalhes avançados' : 'Ver detalhes avançados'}</span><span>{license.modules.filter((module) => module.is_enabled).length} módulos liberados</span></button></div>
          {expandedLicenseId === license.id && <div className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-xs font-semibold text-slate-200">Módulos contratados e liberados</h2><p className="mt-1 text-[11px] text-slate-600">Aqui você define o acesso desta licença. Cadastre os módulos do sistema em Catálogo → Módulos; nesta tela apenas contrate e libere.</p></div>
              <span className="text-[11px] text-slate-500">{license.modules.filter((module) => module.is_enabled).length} liberados</span>
            </div>
            {license.modules.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{license.modules.map((module) => <div key={module.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
              <div className="min-w-0"><p className="truncate text-xs font-medium text-slate-200">{module.name}</p><p className="mt-1 truncate font-mono text-[10px] text-slate-600">{module.internal_code} · {module.availability_status}</p></div>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-1.5 text-[10px] text-slate-500"><input type="checkbox" checked={module.is_contracted} disabled={!canManage} onChange={(event) => void updateModule(license.id, module, event.target.checked, event.target.checked && module.is_enabled)} className="accent-blue-500 disabled:opacity-40" />Contratado</label>
                <label className="flex items-center gap-1.5 text-[10px] text-slate-500"><input type="checkbox" checked={module.is_enabled} disabled={!canManage || !module.is_contracted || !isModuleAvailable(module.availability_status)} onChange={(event) => void updateModule(license.id, module, module.is_contracted, event.target.checked)} className="accent-emerald-500 disabled:opacity-40" />Liberado</label>
              </div>
            </div>)}</div> : <p className="rounded-lg border border-dashed border-white/[0.08] p-5 text-center text-xs text-slate-600">Nenhum módulo cadastrado para este sistema. Cadastre módulos em Catálogo → Módulos antes de configurar a licença.</p>}
          <div id={`routes-${license.id}`} className="mt-6 border-t border-white/[0.06] pt-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-white">Rotas padrão protegidas</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Associe cada módulo a uma rota real do sistema. O middleware bloqueia a entrada antes da página carregar e envia o cliente para a página configurada.</p></div>
              <div className="flex items-center gap-2"><span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-[10px] font-medium text-blue-200">{(routesByLicense[license.id] ?? []).length} configuradas</span>{canManage && <button type="button" onClick={() => void generateMiddleware(license.id)} disabled={!(routesByLicense[license.id]?.length)} className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"><Download className="size-3.5" />Baixar pacote</button>}</div>
            </div>
            {canManage && <form onSubmit={(event) => void addRoute(event)} className="grid gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 md:grid-cols-[1fr_1.2fr_1.2fr_auto] md:items-end">
              <label className="text-[11px] text-slate-400">Módulo<select required value={routeForm.licenseId === license.id ? routeForm.moduleId : ''} onChange={(event) => setRouteForm((current) => ({ ...current, licenseId: license.id, moduleId: event.target.value }))} className={`${inputClass} mt-1.5 w-full`}><option value="">Selecione</option>{license.modules.filter((module) => module.is_contracted).map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label>
              <label className="text-[11px] text-slate-400">Rota protegida<input required value={routeForm.licenseId === license.id ? routeForm.pattern : ''} onChange={(event) => setRouteForm((current) => ({ ...current, licenseId: license.id, pattern: event.target.value }))} placeholder="/admin/produtos" className={`${inputClass} mt-1.5 w-full`} /></label>
              <label className="text-[11px] text-slate-400">Página de bloqueio<input required value={routeForm.licenseId === license.id ? routeForm.blockedPath : '/acesso-bloqueado'} onChange={(event) => setRouteForm((current) => ({ ...current, licenseId: license.id, blockedPath: event.target.value }))} placeholder="/acesso-bloqueado" className={`${inputClass} mt-1.5 w-full`} /></label>
              <button disabled={!canManage} className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-40"><Plus className="size-4" />Adicionar</button>
            </form>}
            <div className="mt-3 flex flex-col gap-2">{(routesByLicense[license.id] ?? []).map((route) => <div key={route.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.015] px-3 py-2.5"><div className="min-w-0"><p className="font-mono text-xs text-slate-200">{route.route_pattern}</p><p className="mt-1 text-[10px] text-slate-500">{license.modules.find((module) => module.id === route.system_module_id)?.name ?? 'Módulo'} → {route.blocked_path}</p></div>{canManage && <button type="button" onClick={() => void deleteRoute(license.id, route.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-400/10 hover:text-rose-200" aria-label={`Remover rota ${route.route_pattern}`}><Trash2 className="size-3.5" /></button>}</div>)}{routesByLicense[license.id]?.length === 0 && <p className="rounded-lg border border-dashed border-white/[0.08] p-4 text-center text-[11px] text-slate-600">Nenhuma rota cadastrada. Adicione a primeira rota acima.</p>}</div>
          </div>
          <div className="mt-5 border-t border-white/[0.06] pt-4"><div className="mb-4 grid gap-3 lg:grid-cols-2"><article className="rounded-xl border border-blue-400/25 bg-gradient-to-br from-blue-500/[0.12] to-blue-500/[0.03] p-4 shadow-[0_12px_30px_-20px_rgba(59,130,246,0.8)]"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Rotas padrão</p><span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-2 py-1 text-[10px] font-medium text-blue-200">Mais comum</span></div><h2 className="mt-2 text-base font-semibold text-white">Proteção por rotas</h2><p className="mt-1 text-xs leading-5 text-slate-400">Para páginas e rotas independentes. O middleware verifica a licença antes de liberar cada caminho.</p><p className="mt-3 text-[10px] text-slate-500">Compatível: Next.js com rotas individuais · Intervenção: copiar um arquivo e configurar o servidor.</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => document.getElementById(`routes-${license.id}`)?.scrollIntoView({ behavior: 'smooth' })} className="rounded-lg bg-blue-500/20 px-3 py-2 text-[11px] font-semibold text-blue-100">Selecionar modo</button><button type="button" onClick={() => setGuideMode('routes')} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-slate-300">Instruções</button></div></article><article className="rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.14] to-violet-500/[0.03] p-4 shadow-[0_12px_30px_-20px_rgba(139,92,246,0.85)]"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Opção 2</p><span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-1 text-[10px] font-medium text-violet-200">Uma única página</span></div><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Integração rota única</p><h2 className="mt-2 text-base font-semibold text-white">Integração rota única</h2><p className="mt-1 text-xs leading-5 text-slate-400">Para abas, estados React ou conteúdo condicional agrupado em uma única página.</p><p className="mt-3 text-[10px] text-slate-500">Compatível: páginas TSX analisáveis · Intervenção: confirmar mapeamento e instalar o ZIP.</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => document.getElementById(`single-${license.id}`)?.scrollIntoView({ behavior: 'smooth' })} className="rounded-lg bg-violet-500/20 px-3 py-2 text-[11px] font-semibold text-violet-100">Selecionar modo</button><button type="button" onClick={() => setGuideMode('single')} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-slate-300">Instruções</button></div></article></div><div id={`single-${license.id}`} className="rounded-lg border border-violet-400/15 bg-violet-400/5 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xs font-semibold text-violet-200">Integração rota única</h2><p className="mt-1 text-[11px] text-slate-500">Cole o AdminClient.tsx original do sistema cliente para gerar os três arquivos prontos, sem expor a chave privada.</p></div><button type="button" disabled={generatingZipId === license.id} onClick={() => void generateRotaUnicaZip(license.id)} className="rounded-lg bg-violet-500/20 px-3 py-2 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/30 disabled:opacity-50">{generatingZipId === license.id ? 'Gerando ZIP...' : 'Gerar integração de rota única'}</button></div><textarea value={adminSourceByLicense[license.id] ?? ''} onChange={(event) => setAdminSourceByLicense((current) => ({ ...current, [license.id]: event.target.value }))} placeholder="Cole aqui o código original da p��gina ou componente agrupador" aria-label="Código original da página agrupadora" className="mt-3 min-h-32 w-full rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[10px] text-slate-300 outline-none placeholder:text-slate-700" /><label className="mt-3 block text-[10px] text-slate-500">Mapeamento confirmado (JSON opcional, obrigatório quando houver mais de uma interpretação)<textarea value={mappingByLicense[license.id] ?? ''} onChange={(event) => setMappingByLicense((current) => ({ ...current, [license.id]: event.target.value }))} placeholder={'[{"tab":"financeiro","code":"finance"}]'} className="mt-1 min-h-16 w-full rounded-lg border border-white/[0.06] bg-black/20 p-2 font-mono text-[10px] text-slate-300 outline-none placeholder:text-slate-700" /></label><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-slate-600">A análise detecta tipos, constantes, estados, branches, switches e componentes auxiliares antes de gerar o ZIP.</p><div className="flex gap-2"><button type="button" onClick={() => void analyzeRotaUnica(license.id)} disabled={analyzingLicenseId === license.id} className="rounded-lg border border-blue-400/25 px-3 py-2 text-[11px] font-medium text-blue-200 hover:bg-blue-400/10 disabled:opacity-50">{analyzingLicenseId === license.id ? 'Analisando...' : 'Analisar código'}</button><button type="button" onClick={() => void generateSingleRouteHelper(license.id)} className="rounded-lg border border-violet-400/25 px-3 py-2 text-[11px] font-medium text-violet-200 hover:bg-violet-400/10">Gerar apenas helper</button></div></div>{analysisByLicense[license.id] && <div className="mt-3 rounded-lg border border-blue-400/15 bg-blue-400/5 p-3"><p className="text-[11px] font-semibold text-blue-200">Diagnóstico: {analysisByLicense[license.id].tabs.length} abas detectadas</p><div className="mt-2 grid gap-1.5 sm:grid-cols-2">{analysisByLicense[license.id].detectedTabs.map((tab) => <p key={tab.tab} className="text-[10px] text-slate-400"><span className="font-medium text-slate-200">{tab.tab}</span> → {tab.code || 'sem módulo'} · {Math.round(tab.confidence * 100)}%</p>)}</div>{analysisByLicense[license.id].uncertain.length > 0 && <p className="mt-2 text-[10px] text-amber-300">Revisar: {analysisByLicense[license.id].uncertain.join(', ')}</p>}</div>}{singleRouteByLicense[license.id] && <div><div className="mt-3 flex items-center justify-between gap-2"><p className="text-[11px] text-emerald-300">Modo Compatível — Rota Única pronto</p><button type="button" onClick={() => downloadTextFile('codexa-license.ts', singleRouteByLicense[license.id], 'codexa-license.ts baixado. Mantenha CODEXA_LICENSE_API_URL e CODEXA_LICENSE_KEY apenas no servidor.')} className="rounded-lg bg-violet-500/15 px-3 py-2 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/25">Baixar helper</button></div><textarea readOnly value={singleRouteByLicense[license.id]} aria-label="helper de rota única gerado" className="mt-2 min-h-52 w-full rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[10px] text-slate-300 outline-none" />{visualScriptByLicense[license.id] && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-amber-200">Script visual JavaScript</p><button type="button" onClick={() => downloadTextFile('codexa-license.js', visualScriptByLicense[license.id], 'codexa-license.js baixado.')} className="rounded-lg bg-amber-400/15 px-3 py-2 text-[11px] font-semibold text-amber-100 hover:bg-amber-400/25">Baixar JS</button></div><p className="mt-1 text-[10px] text-slate-400">Publique este arquivo ou use o endpoint /api/client-script.js. Marque módulos com data-lic-module e ações com data-lic-action.</p><textarea readOnly value={scriptSnippetByLicense[license.id]} aria-label="snippet do script visual" className="mt-2 min-h-16 w-full rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[10px] text-amber-100 outline-none" /></div>}</div>}</div>
          </div></div>}
        </article>
      })}</div> : <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-10 text-center"><Check className="mx-auto size-6 text-slate-600" /><p className="mt-3 text-sm text-slate-400">Nenhuma licença encontrada</p><p className="mt-1 text-xs text-slate-600">Emita uma licença para começar a controlar o acesso aos módulos.</p></div>}
    {guideMode && <IntegrationModeGuide mode={guideMode} onClose={() => setGuideMode(null)} />}
  </section>
}
