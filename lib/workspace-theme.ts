export type WorkspaceTheme = 'dark' | 'light' | 'system'
export type FontFamily = 'inter' | 'roboto' | 'open-sans' | 'lato' | 'montserrat' | 'poppins' | 'nunito-sans' | 'manrope' | 'dm-sans' | 'plus-jakarta' | 'outfit' | 'source-sans-3' | 'ibm-plex-sans' | 'work-sans' | 'merriweather' | 'playfair-display' | 'ibm-plex-mono'
export type RadiusScale = 'small' | 'medium' | 'large'
export type ContrastMode = 'normal' | 'high'
export type MotionMode = 'full' | 'reduced'

export type WorkspaceAppearance = {
  theme: WorkspaceTheme
  primary_color: string
  background_color: string
  surface_color: string
  sidebar_color: string
  header_color: string
  text_color: string
  muted_text_color: string
  border_color: string
  focus_color: string
  font_size_base: number
  heading_scale: number
  font_weight: 400 | 500 | 600 | 700
  line_height: number
  letter_spacing: number
  button_radius: number
  card_radius: number
  shadow_strength: number
  appearance_palette: string
  icon_color: string
  font_family: FontFamily
  radius_scale: RadiusScale
  contrast_mode: ContrastMode
  motion_mode: MotionMode
  navigation_collapsed?: boolean
  table_density?: 'comfortable' | 'compact'
}

const legacyAccentColors: Record<string, string> = {
  blue: '#6485ff',
  violet: '#9b7cff',
  emerald: '#42c995',
  amber: '#f2b84b',
  rose: '#e77986',
}

export function resolveIconColor(palette: string | null | undefined, legacyAccent: string | null | undefined) {
  try {
    const parsed = palette ? JSON.parse(palette) as { icon_color?: unknown } : null
    if (typeof parsed?.icon_color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.icon_color)) return parsed.icon_color
  } catch {}
  if (typeof legacyAccent === 'string' && /^#[0-9A-Fa-f]{6}$/.test(legacyAccent)) return legacyAccent
  return legacyAccentColors[legacyAccent ?? ''] ?? '#6485ff'
}

const defaultAppearance: WorkspaceAppearance = {
  theme: 'dark',
  primary_color: '#6485ff',
  background_color: '#090b10',
  surface_color: '#11161e',
  sidebar_color: '#0d1118',
  header_color: '#090b10',
  text_color: '#f8fafc',
  muted_text_color: '#94a3b8',
  border_color: '#253044',
  focus_color: '#6485ff',
  font_size_base: 16,
  heading_scale: 1,
  font_weight: 400,
  line_height: 1.5,
  letter_spacing: 0,
  button_radius: 0.65,
  card_radius: 0.75,
  shadow_strength: 20,
  appearance_palette: 'custom',
  icon_color: '#6485ff',
  font_family: 'inter',
  radius_scale: 'medium',
  contrast_mode: 'normal',
  motion_mode: 'full',
}

export function getDefaultWorkspaceAppearance(): WorkspaceAppearance {
  return { ...defaultAppearance }
}

function hexChannels(hex: string): [number, number, number] {
  const normalized = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.slice(1) : '6485ff'
  return [Number.parseInt(normalized.slice(0, 2), 16), Number.parseInt(normalized.slice(2, 4), 16), Number.parseInt(normalized.slice(4, 6), 16)]
}

function hexToRgb(hex: string) {
  return hexChannels(hex).join(', ')
}

function relativeLuminance(hex: string) {
  return hexChannels(hex).reduce((total, channel, index) => {
    const value = channel / 255
    return total + (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]
  }, 0)
}

function contrastText(background: string) {
  const luminance = relativeLuminance(background)
  const whiteContrast = 1.05 / (luminance + 0.05)
  const darkContrast = (luminance + 0.05) / 0.05
  return whiteContrast >= darkContrast ? '#ffffff' : '#111827'
}

function lighten(hex: string, amount: number) {
  return `#${hexChannels(hex).map((channel) => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0')).join('')}`
}

function darken(hex: string, amount: number) {
  return `#${hexChannels(hex).map((channel) => Math.round(channel * (1 - amount)).toString(16).padStart(2, '0')).join('')}`
}

export function applyWorkspaceAppearance(appearance: WorkspaceAppearance): void {
  const root = document.documentElement
  root.style.setProperty('--primary-custom', appearance.primary_color)
  root.style.setProperty('--primary-custom-rgb', hexToRgb(appearance.primary_color))
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
  const resolvedTheme = appearance.theme === 'system' ? (prefersLight ? 'light' : 'dark') : appearance.theme
  const isLight = resolvedTheme === 'light'
  const background = isLight ? lighten(appearance.background_color, 0.82) : appearance.background_color
  const surface = isLight ? lighten(appearance.surface_color, 0.78) : appearance.surface_color
  const sidebar = appearance.sidebar_color
  const primaryText = contrastText(appearance.primary_color)
  const mainText = isLight ? darken(appearance.text_color, 0.72) : appearance.text_color
  const mutedText = isLight ? darken(appearance.muted_text_color, 0.2) : appearance.muted_text_color
  const hover = isLight ? darken(appearance.primary_color, 0.12) : lighten(appearance.primary_color, 0.12)
  root.style.setProperty('--workspace-background', background)
  root.style.setProperty('--workspace-surface', surface)
  root.style.setProperty('--workspace-sidebar', sidebar)
  root.style.setProperty('--workspace-header', appearance.header_color)
  root.style.setProperty('--workspace-theme-scheme', isLight ? 'light' : 'dark')
  root.style.setProperty('--workspace-text', mainText)
  root.style.setProperty('--workspace-muted', mutedText)
  root.style.setProperty('--workspace-border', isLight ? darken(appearance.border_color, 0.05) : appearance.border_color)
  root.style.setProperty('--background-main', background)
  root.style.setProperty('--background-card', surface)
  root.style.setProperty('--background-elevated', isLight ? '#ffffff' : lighten(surface, 0.08))
  root.style.setProperty('--background-input', isLight ? '#ffffff' : darken(surface, 0.18))
  root.style.setProperty('--background-sidebar', sidebar)
  root.style.setProperty('--text-primary', mainText)
  root.style.setProperty('--text-secondary', mutedText)
  root.style.setProperty('--text-muted', mutedText)
  root.style.setProperty('--text-inverse', primaryText)
  root.style.setProperty('--text-link', appearance.primary_color)
  root.style.setProperty('--text-info', appearance.primary_color)
  root.style.setProperty('--text-accent', appearance.primary_color)
  root.style.setProperty('--text-success', appearance.primary_color)
  root.style.setProperty('--text-warning', appearance.primary_color)
  root.style.setProperty('--text-danger', '#e77986')
  root.style.setProperty('--icon-color', appearance.icon_color)
  root.style.setProperty('--border-default', appearance.border_color)
  root.style.setProperty('--border-subtle', isLight ? lighten(appearance.border_color, 0.35) : appearance.border_color)
  root.style.setProperty('--border-strong', appearance.border_color)
  root.style.setProperty('--border-divider', appearance.border_color)
  root.style.setProperty('--button-primary-bg', appearance.primary_color)
  root.style.setProperty('--button-primary-text', primaryText)
  root.style.setProperty('--button-primary-hover', hover)
  root.style.setProperty('--button-secondary-bg', appearance.primary_color)
  root.style.setProperty('--button-secondary-text', primaryText)
  root.style.setProperty('--button-secondary-hover', hover)
  root.style.setProperty('--button-disabled-bg', isLight ? '#e5e7eb' : '#273142')
  root.style.setProperty('--button-disabled-text', isLight ? '#6b7280' : '#94a3b8')
  root.style.setProperty('--interactive-focus', appearance.focus_color)
  root.style.setProperty('--interactive-selected', appearance.focus_color)
  root.style.setProperty('--interactive-hover', hover)
  root.style.setProperty('--focus-color', appearance.focus_color)
  const fontFamilies: Record<FontFamily, string> = {
    inter: 'Inter, ui-sans-serif, system-ui, sans-serif', roboto: 'Roboto, ui-sans-serif, system-ui, sans-serif', 'open-sans': 'Open Sans, ui-sans-serif, system-ui, sans-serif', lato: 'Lato, ui-sans-serif, system-ui, sans-serif', montserrat: 'Montserrat, ui-sans-serif, system-ui, sans-serif', poppins: 'Poppins, ui-sans-serif, system-ui, sans-serif', 'nunito-sans': 'Nunito Sans, ui-sans-serif, system-ui, sans-serif', manrope: 'Manrope, ui-sans-serif, system-ui, sans-serif', 'dm-sans': 'DM Sans, ui-sans-serif, system-ui, sans-serif', 'plus-jakarta': 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif', outfit: 'Outfit, ui-sans-serif, system-ui, sans-serif', 'source-sans-3': 'Source Sans 3, ui-sans-serif, system-ui, sans-serif', 'ibm-plex-sans': 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif', 'work-sans': 'Work Sans, ui-sans-serif, system-ui, sans-serif', merriweather: 'Merriweather, Georgia, serif', 'playfair-display': 'Playfair Display, Georgia, serif', 'ibm-plex-mono': 'IBM Plex Mono, ui-monospace, monospace',
  }
  root.style.setProperty('--workspace-font-family', fontFamilies[appearance.font_family] ?? fontFamilies.inter)
  root.style.setProperty('--font-size-base', `${appearance.font_size_base}px`)
  root.style.setProperty('--heading-scale', String(appearance.heading_scale))
  root.style.setProperty('--font-weight-base', String(appearance.font_weight))
  root.style.setProperty('--line-height-base', String(appearance.line_height))
  root.style.setProperty('--letter-spacing-base', `${appearance.letter_spacing}em`)
  root.style.setProperty('--radius', `${appearance.card_radius}rem`)
  root.style.setProperty('--button-radius', `${appearance.button_radius}rem`)
  root.style.setProperty('--card-radius', `${appearance.card_radius}rem`)
  root.style.setProperty('--shadow-strength', `${appearance.shadow_strength}%`)
  root.style.setProperty('--background', background)
  root.style.setProperty('--card', surface)
  root.style.setProperty('--popover', isLight ? '#ffffff' : surface)
  root.style.setProperty('--sidebar', sidebar)
  root.style.setProperty('--foreground', mainText)
  root.style.setProperty('--muted-foreground', mutedText)
  root.style.setProperty('--border', appearance.border_color)
  root.style.setProperty('--input', appearance.border_color)
  root.style.setProperty('--primary', appearance.primary_color)
  root.style.setProperty('--primary-foreground', primaryText)
  root.style.setProperty('--secondary-foreground', primaryText)
  root.style.setProperty('--ring', appearance.focus_color)
  root.style.setProperty('--sidebar-primary', appearance.primary_color)
  root.style.setProperty('--chart-1', appearance.primary_color)
  root.style.setProperty('--chart-2', appearance.primary_color)
  root.style.setProperty('--chart-3', appearance.primary_color)
  root.style.setProperty('--secondary', appearance.primary_color)
  root.style.setProperty('--accent', appearance.primary_color)
  root.dataset.theme = resolvedTheme
  root.dataset.themePreference = appearance.theme
  root.classList.toggle('light', resolvedTheme === 'light')
  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.dataset.font = appearance.font_family
  root.dataset.radius = appearance.radius_scale
  root.dataset.contrast = appearance.contrast_mode
  root.dataset.motion = appearance.motion_mode
}

export function getWorkspaceThemePreference(): WorkspaceTheme {
  const preference = document.documentElement.dataset.themePreference
  return preference === 'light' || preference === 'system' ? preference : 'dark'
}

export function applyWorkspaceTheme(preference: WorkspaceTheme): void {
  applyWorkspaceAppearance({ ...defaultAppearance, theme: preference })
}

export { defaultAppearance }
