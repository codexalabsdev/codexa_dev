'use client'

import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { AuthError, User } from '@supabase/supabase-js'
import { Check, CircleHelp, Contrast, Download, Eye, Gauge, Laptop, Moon, Palette, RotateCcw, Save, Sun, Type, Upload, Waves } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ColorPicker } from '@/components/color-picker'
import { applyWorkspaceAppearance, defaultAppearance, resolveIconColor, type ContrastMode, type FontFamily, type MotionMode, type RadiusScale, type WorkspaceAppearance, type WorkspaceTheme } from '@/lib/workspace-theme'

type AppearanceKey = keyof WorkspaceAppearance
type ColorKey = Extract<AppearanceKey, `${string}_color`>

const colorFields = [
  { key: 'primary_color', label: 'Primária', description: 'Botões, seleção, links e navegação.' },
  { key: 'icon_color', label: 'Ícones', description: 'Ícones do sistema, barra lateral e páginas.' },
  { key: 'background_color', label: 'Fundo do site', description: 'Plano principal de todas as páginas.' },
  { key: 'surface_color', label: 'Superfícies', description: 'Cards, painéis, modais e tabelas.' },
  { key: 'sidebar_color', label: 'Barra lateral', description: 'Menu principal e navegação lateral.' },
  { key: 'header_color', label: 'Barra superior', description: 'Cabeçalho, breadcrumb e ações.' },
  { key: 'text_color', label: 'Texto principal', description: 'Títulos e informações prioritárias.' },
  { key: 'muted_text_color', label: 'Texto secundário', description: 'Legendas, dicas e estados neutros.' },
  { key: 'border_color', label: 'Bordas e divisores', description: 'Separadores, campos e contornos.' },
  { key: 'focus_color', label: 'Foco e seleção', description: 'Anéis de foco e campos selecionados.' },
] as const

const appearanceOptions: Array<{ value: WorkspaceTheme; label: string; description: string; icon: typeof Moon }> = [
  { value: 'dark', label: 'Escuro', description: 'Reduz o brilho e favorece ambientes com pouca luz.', icon: Moon },
  { value: 'light', label: 'Claro', description: 'Mais contraste para ambientes bem iluminados.', icon: Sun },
  { value: 'system', label: 'Automático', description: 'Acompanha a preferência do sistema operacional.', icon: Laptop },
]

function isHex(value: string) { return /^#[0-9A-Fa-f]{6}$/.test(value) }

function OptionCard<T extends string>({ value, current, label, description, onSelect, children }: { value: T; current: T; label: string; description?: string; onSelect: (value: T) => void; children?: React.ReactNode }) {
  const selected = value === current
  return <button type="button" aria-pressed={selected} onClick={() => onSelect(value)} className={`group rounded-xl border p-4 text-left transition-all ${selected ? 'border-[var(--primary)] bg-[var(--primary)]/[0.12] shadow-[0_0_0_1px_var(--primary)]' : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.2] hover:bg-white/[0.05]'}`}>
    <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-white">{label}</span>{selected && <Check className="size-4 text-[var(--primary)]" />}</span>
    {description && <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>}
    {children}
  </button>
}

function ColorTransferControls({ appearance, onImport }: { appearance: WorkspaceAppearance; onImport: (values: Partial<Record<ColorKey, string>>) => void }) {
  function exportColors() {
    const payload = Object.fromEntries(colorFields.map(({ key }) => [key, appearance[key]]))
    const blob = new Blob([JSON.stringify({ version: 1, colors: payload }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'workspace-colors.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function importColors(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    file.text().then((text) => {
      const parsed = JSON.parse(text) as { colors?: Record<string, unknown> }
      const values = Object.fromEntries(colorFields.flatMap(({ key }) => {
        const value = parsed.colors?.[key]
        return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? [[key, value.toLowerCase()]] : []
      })) as Partial<Record<ColorKey, string>>
      if (Object.keys(values).length) onImport(values)
    }).catch(() => undefined)
  }

  return <div className="mt-5 flex flex-wrap items-center justify-center gap-3 border-t border-white/[0.08] pt-4">
    <button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--button-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--button-primary-text)] shadow-sm transition-colors hover:bg-[var(--button-primary-hover)] sm:w-auto" onClick={exportColors}><Download className="size-4 shrink-0" />Exportar cores</button>
    <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--button-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--button-primary-text)] shadow-sm transition-colors hover:bg-[var(--button-primary-hover)] sm:w-auto"><Upload className="size-4 shrink-0" />Importar cores<input type="file" accept="application/json,.json" className="sr-only" onChange={importColors} /></label>
  </div>
}

export function AccountWorkspace({ section, initialName = '' }: { section: string; initialName?: string }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState(initialName)
  const [appearance, setAppearance] = useState<WorkspaceAppearance>(defaultAppearance)
  const [savedAppearance, setSavedAppearance] = useState<WorkspaceAppearance>(defaultAppearance)
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingAppearance, setLoadingAppearance] = useState(true)

  useEffect(() => {
    setName(initialName)
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data, error }: { data: { user: User | null }; error: AuthError | null }) => {
      if (error || !data.user) {
        setMessageError(true)
        setMessage('Não foi possível autenticar para carregar a aparência.')
        setLoadingAppearance(false)
        return
      }
      setEmail(data.user.email ?? '')
      const { data: preferences, error: preferencesError } = await supabase
        .from('user_preferences')
        .select('theme,primary_color,background_color,surface_color,sidebar_color,header_color,text_color,muted_text_color,border_color,focus_color,font_size_base,heading_scale,font_weight,line_height,letter_spacing,button_radius,card_radius,shadow_strength,appearance_palette,accent_color,font_family,radius_scale,contrast_mode,motion_mode')
        .eq('user_id', data.user.id)
        .maybeSingle()
      if (preferencesError) {
        setMessageError(true)
        setMessage('Não foi possível carregar as preferências de aparência.')
      }
      const loaded = preferences as (Partial<WorkspaceAppearance> & { accent_color?: string }) | null
      const nextAppearance = { ...defaultAppearance, ...(loaded ?? {}), icon_color: resolveIconColor(loaded?.appearance_palette, loaded?.accent_color) } as WorkspaceAppearance
      setAppearance(nextAppearance)
      setSavedAppearance(nextAppearance)
      applyWorkspaceAppearance(nextAppearance)
      setLoadingAppearance(false)
    })
  }, [initialName])

  const isAppearance = section === 'Aparência'
  const hasAppearanceChanges = useMemo(() => JSON.stringify(appearance) !== JSON.stringify(savedAppearance), [appearance, savedAppearance])

  function updateAppearance<K extends AppearanceKey>(key: K, value: WorkspaceAppearance[K]) {
    const next = { ...appearance, [key]: value }
    setAppearance(next)
    applyWorkspaceAppearance(next)
    setMessage('')
  }

  function updateColor(key: ColorKey, value: string) {
    if (!isHex(value)) return
    updateAppearance(key, value)
  }

  async function saveAppearance() {
    setSaving(true)
    setMessage('')
    setMessageError(false)
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      setMessageError(true)
      setMessage('Sua sessão expirou. Entre novamente para salvar a aparência.')
      setSaving(false)
      return
    }
    const { error } = await supabase.from('user_preferences').upsert({
      user_id: authData.user.id,
      theme: appearance.theme,
      primary_color: appearance.primary_color,

      background_color: appearance.background_color,
      surface_color: appearance.surface_color,
      sidebar_color: appearance.sidebar_color,
      header_color: appearance.header_color,
      text_color: appearance.text_color,
      muted_text_color: appearance.muted_text_color,
      border_color: appearance.border_color,
      focus_color: appearance.focus_color,
      font_size_base: appearance.font_size_base,
      heading_scale: appearance.heading_scale,
      font_weight: appearance.font_weight,
      line_height: appearance.line_height,
      letter_spacing: appearance.letter_spacing,
      button_radius: appearance.button_radius,
      card_radius: appearance.card_radius,
      shadow_strength: appearance.shadow_strength,
      appearance_palette: JSON.stringify({ icon_color: appearance.icon_color }),
      font_family: appearance.font_family,
      radius_scale: appearance.radius_scale,
      contrast_mode: appearance.contrast_mode,
      motion_mode: appearance.motion_mode,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) {
      setMessageError(true)
      setMessage('Não foi possível salvar suas preferências.')
    } else {
      setSavedAppearance(appearance)
      setMessage('Preferências de aparência salvas.')
    }
    setSaving(false)
  }

  function resetAppearance() {
    setAppearance(defaultAppearance)
    applyWorkspaceAppearance(defaultAppearance)
    setMessage('Alterações restauradas para o padrão.')
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setMessageError(false)
    try {
      const response = await fetch('/api/workspace/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: name }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível salvar seu perfil.')
      setMessage('Perfil atualizado com sucesso.')
      window.location.reload()
    } catch (error) {
      setMessageError(true)
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar seu perfil.')
    } finally {
      setSaving(false)
    }
  }

  if (!isAppearance) return <section className="mt-6 max-w-3xl rounded-xl border border-white/[0.07] bg-card p-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--primary)]">Configurações pessoais</p><h1 className="mt-2 text-2xl font-semibold text-white">Meu perfil</h1><p className="mt-2 text-sm text-muted-foreground">Consulte e atualize seus dados pessoais sem alterar suas permissões.</p><form onSubmit={saveProfile} className="mt-6 space-y-4"><div><label htmlFor="profile-name" className="text-xs text-slate-400">Nome de exibição</label><input id="profile-name" required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="field mt-1" /></div><div><span className="text-xs text-slate-400">E-mail da conta</span><p className="mt-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-sm text-slate-300">{email || 'Carregando...'}</p></div><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"><Save className="size-4" />{saving ? 'Salvando...' : 'Salvar alterações'}</button></form>{message && <p role={messageError ? 'alert' : 'status'} className={`mt-4 text-xs ${messageError ? 'text-rose-300' : 'text-emerald-300'}`}>{message}</p>}</section>

  return <main className="mt-6 w-full max-w-5xl pb-10"><header><p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--primary)]">Configurações pessoais</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight text-white">Aparência</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Personalize o workspace para trabalhar do seu jeito. As preferências ficam salvas apenas na sua conta.</p></div><div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400"><Eye className="size-3.5" />Prévia em tempo real</div></div></header>
    <div className="mt-8 space-y-3">
      <details className="appearance-accordion"><summary><span><Palette className="size-4" /><span><strong>Tema e modo de exibição</strong><small>Escuro, claro ou automático.</small></span></span><span className="accordion-chevron">⌄</span></summary><div className="accordion-content">
      <section className="rounded-2xl border border-white/[0.08] bg-card p-5 shadow-xl shadow-black/10"><div className="flex items-start gap-3"><div className="rounded-lg bg-[var(--primary)]/10 p-2.5 text-[var(--primary)]"><Palette className="size-5" /></div><div><h2 className="font-semibold text-white">Tema</h2><p className="mt-1 text-sm text-muted-foreground">Escolha a base visual do seu workspace.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-3">{appearanceOptions.map(({ value, label, description, icon: Icon }) => <OptionCard key={value} value={value} current={appearance.theme} label={label} description={description} onSelect={(next) => updateAppearance('theme', next)}><Icon className="mt-4 size-5 text-slate-400" /></OptionCard>)}</div></section></div></details>
      <details className="appearance-accordion"><summary><span><Palette className="size-4" /><span><strong>Cores do sistema</strong><small>Identidade, superfícies, menus e textos.</small></span></span><span className="accordion-chevron">⌄</span></summary><div className="accordion-content"><ColorTransferControls appearance={appearance} onImport={(values) => Object.entries(values).forEach(([key, value]) => updateAppearance(key as ColorKey, value as string))} /><section className="rounded-2xl border border-white/[0.08] bg-card p-5 shadow-xl shadow-black/10"><div className="flex items-start gap-3"><div className="rounded-lg bg-[var(--primary)]/10 p-2.5 text-[var(--primary)]"><Palette className="size-5" /></div><div><h2 className="font-semibold text-white">Cores personalizadas</h2><p className="mt-1 text-sm text-muted-foreground">Escolha cada cor em RGB ou informe o valor HEX.</p></div></div><div className="mt-5 grid gap-4 lg:grid-cols-3">{colorFields.map(({ key, label, description }) => { const value = appearance[key]; return <div key={key} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-white">{label}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div><span className="size-9 rounded-lg border border-white/10" style={{ backgroundColor: value }} /></div><div className="mt-4 space-y-3"><ColorPicker value={value} label={label} onChange={(next) => updateColor(key, next)} /><div className="grid grid-cols-3 gap-2">{(['R', 'G', 'B'] as const).map((channel, index) => { const rgb = Number.parseInt(value.slice(1 + index * 2, 3 + index * 2), 16); return <label key={channel} className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{channel}<input type="range" min="0" max="255" value={rgb} onChange={(event) => { const channels = [0, 0, 0].map((_, channelIndex) => channelIndex === index ? Number(event.target.value) : Number.parseInt(value.slice(1 + channelIndex * 2, 3 + channelIndex * 2), 16)); updateColor(key, `#${channels.map((part) => part.toString(16).padStart(2, '0')).join('')}`) }} className="mt-2 w-full accent-[var(--primary)]" /></label>})}</div><label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">HEX<div className="mt-1 flex gap-2"><input aria-label={`Código HEX da cor ${label}`} value={value} maxLength={7} onChange={(event) => { const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`; if (isHex(next)) updateColor(key, next.toLowerCase()) }} className="field mt-0 font-mono text-xs uppercase" /><button type="button" aria-label={`Copiar código HEX da cor ${label}`} onClick={() => void navigator.clipboard.writeText(value)} className="rounded-lg border border-white/10 px-3 text-xs text-slate-400 hover:text-white">Copiar</button></div></label></div></div>})}</div></section></div></details>
      <details className="appearance-accordion"><summary><span><Type className="size-4" /><span><strong>Tipografia e densidade</strong><small>Fonte, ritmo, arredondamento e movimento.</small></span></span><span className="accordion-chevron">⌄</span></summary><div className="accordion-content"><div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/[0.08] bg-card p-5 shadow-xl shadow-black/10"><div className="flex items-start gap-3"><Type className="mt-1 size-5 text-[var(--primary)]" /><div><h2 className="font-semibold text-white">Tipografia</h2><p className="mt-1 text-sm text-muted-foreground">Ajuste a personalidade do texto.</p></div></div><div className="mt-5 space-y-2">{([['inter','Inter','Neutra e versátil'],['roboto','Roboto','Clássica e funcional'],['open-sans','Open Sans','Aberta e legível'],['lato','Lato','Humanista e profissional'],['montserrat','Montserrat','Geométrica e marcante'],['poppins','Poppins','Geométrica e amigável'],['nunito-sans','Nunito Sans','Suave e acessível'],['manrope','Manrope','Geométrica e espaçosa'],['dm-sans','DM Sans','Contemporânea e limpa'],['plus-jakarta','Plus Jakarta Sans','Editorial e refinada'],['outfit','Outfit','Moderna e expressiva'],['source-sans-3','Source Sans 3','Leitura prolongada'],['ibm-plex-sans','IBM Plex Sans','Técnica e corporativa'],['work-sans','Work Sans','Objetiva e compacta'],['merriweather','Merriweather','Serifada e confortável'],['playfair-display','Playfair Display','Serifada e editorial'],['ibm-plex-mono','IBM Plex Mono','Técnica e monoespaçada']] as const).map(([value, label, description]) => <OptionCard key={value} value={value} current={appearance.font_family} label={label} description={description} onSelect={(next) => updateAppearance('font_family', next)} />)}<div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4" style={{ fontSize: `${appearance.font_size_base}px`, fontWeight: appearance.font_weight, lineHeight: appearance.line_height, letterSpacing: `${appearance.letter_spacing}em` }}><p style={{ fontSize: `${appearance.font_size_base * appearance.heading_scale}px` }} className="font-semibold text-white">Prévia de título</p><p className="mt-1 text-sm text-slate-400">Texto comum, descrição e botão com a tipografia escolhida.</p><button type="button" className="mt-3 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-[var(--primary-foreground)]">Botão de exemplo</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Tamanho base: {appearance.font_size_base}px<input type="range" min="12" max="20" value={appearance.font_size_base} onChange={(event) => updateAppearance('font_size_base', Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)]" /></label><label className="text-xs text-slate-400">Escala de títulos: {appearance.heading_scale.toFixed(2)}<input type="range" min="0.85" max="1.25" step="0.05" value={appearance.heading_scale} onChange={(event) => updateAppearance('heading_scale', Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)]" /></label><label className="text-xs text-slate-400">Peso: {appearance.font_weight}<select value={appearance.font_weight} onChange={(event) => updateAppearance('font_weight', Number(event.target.value) as WorkspaceAppearance['font_weight'])} className="field mt-1"><option value="400">Regular</option><option value="500">Médio</option><option value="600">Semibold</option><option value="700">Bold</option></select></label><label className="text-xs text-slate-400">Altura da linha: {appearance.line_height.toFixed(2)}<input type="range" min="1.1" max="2" step="0.05" value={appearance.line_height} onChange={(event) => updateAppearance('line_height', Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)]" /></label><label className="text-xs text-slate-400">Espaçamento: {appearance.letter_spacing.toFixed(2)}em<input type="range" min="-0.05" max="0.2" step="0.01" value={appearance.letter_spacing} onChange={(event) => updateAppearance('letter_spacing', Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)]" /></label></div></div></section><section className="rounded-2xl border border-white/[0.08] bg-card p-5 shadow-xl shadow-black/10"><div className="flex items-start gap-3"><Waves className="mt-1 size-5 text-[var(--primary)]" /><div><h2 className="font-semibold text-white">Densidade e movimento</h2><p className="mt-1 text-sm text-muted-foreground">Deixe a interface mais compacta ou suave.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><OptionCard value="small" current={appearance.radius_scale} label="Compacto" description="Cantos mais discretos." onSelect={(next) => updateAppearance('radius_scale', next as RadiusScale)} /><OptionCard value="medium" current={appearance.radius_scale} label="Equilibrado" description="O padrão recomendado." onSelect={(next) => updateAppearance('radius_scale', next as RadiusScale)} /><OptionCard value="large" current={appearance.radius_scale} label="Suave" description="Cantos mais expressivos." onSelect={(next) => updateAppearance('radius_scale', next as RadiusScale)} /><OptionCard value="full" current={appearance.motion_mode} label="Movimento completo" description="Transições e feedbacks ativos." onSelect={(next) => updateAppearance('motion_mode', next as MotionMode)} /><OptionCard value="reduced" current={appearance.motion_mode} label="Movimento reduzido" description="Para foco e acessibilidade." onSelect={(next) => updateAppearance('motion_mode', next as MotionMode)} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Raio dos botões: {appearance.button_radius.toFixed(2)}rem<input type="range" min="0" max="2" step="0.05" value={appearance.button_radius} onChange={(event) => updateAppearance('button_radius', Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)]" /></label><label className="text-xs text-slate-400">Raio dos cards: {appearance.card_radius.toFixed(2)}rem<input type="range" min="0" max="2" step="0.05" value={appearance.card_radius} onChange={(event) => updateAppearance('card_radius', Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)]" /></label><label className="text-xs text-slate-400">Intensidade da sombra: {appearance.shadow_strength}%<input type="range" min="0" max="60" value={appearance.shadow_strength} onChange={(event) => updateAppearance('shadow_strength', Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)]" /></label></div></section></div>
      </div></details>
      <details className="appearance-accordion"><summary><span><Contrast className="size-4" /><span><strong>Acessibilidade e foco</strong><small>Contraste, foco e conforto visual.</small></span></span><span className="accordion-chevron">⌄</span></summary><div className="accordion-content"><section className="rounded-2xl border border-white/[0.08] bg-card p-5 shadow-xl shadow-black/10"><div className="flex items-start gap-3"><Contrast className="mt-1 size-5 text-[var(--primary)]" /><div><h2 className="font-semibold text-white">Acessibilidade</h2><p className="mt-1 text-sm text-muted-foreground">Ajustes para leitura e conforto visual.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><OptionCard value="normal" current={appearance.contrast_mode} label="Contraste normal" description="Equilíbrio entre hierarquia e suavidade." onSelect={(next) => updateAppearance('contrast_mode', next as ContrastMode)} /><OptionCard value="high" current={appearance.contrast_mode} label="Alto contraste" description="Bordas e textos mais definidos." onSelect={(next) => updateAppearance('contrast_mode', next as ContrastMode)} /></div></section></div></details>
    </div>
    <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.1] bg-[#0f141c]/95 p-3 shadow-2xl backdrop-blur"><div className="flex items-center gap-2 text-xs text-slate-400"><CircleHelp className="size-4" />{loadingAppearance ? 'Carregando suas preferências...' : hasAppearanceChanges ? 'Você tem alterações não salvas.' : 'Suas preferências estão atualizadas.'}</div><div className="flex gap-2"><button type="button" onClick={resetAppearance} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05]"><RotateCcw className="size-3.5" />Restaurar padrão</button><button type="button" disabled={saving || loadingAppearance || !hasAppearanceChanges} onClick={() => void saveAppearance()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50"><Save className="size-3.5" />{saving ? 'Salvando...' : 'Salvar preferências'}</button></div></div>
    {message && <p role={messageError ? 'alert' : 'status'} className={`mt-3 text-xs ${messageError ? 'text-rose-300' : 'text-emerald-300'}`}>{message}</p>}
  </main>
}
