'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

type ColorPickerProps = { value: string; label: string; onChange: (value: string) => void }
type Rgb = [number, number, number]

function normalizeHex(value: string) {
  const candidate = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : null
}

function hexToRgb(value: string): Rgb {
  const hex = normalizeHex(value) ?? '#6485ff'
  return [0, 1, 2].map((index) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)) as Rgb
}

function rgbToHex(rgb: Rgb) {
  return `#${rgb.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsv([red, green, blue]: Rgb) {
  const channels = [red, green, blue].map((channel) => channel / 255)
  const max = Math.max(...channels)
  const min = Math.min(...channels)
  const delta = max - min
  let hue = 0
  if (delta) {
    if (max === channels[0]) hue = 60 * (((channels[1] - channels[2]) / delta) % 6)
    else if (max === channels[1]) hue = 60 * ((channels[2] - channels[0]) / delta + 2)
    else hue = 60 * ((channels[0] - channels[1]) / delta + 4)
  }
  return { hue: hue < 0 ? hue + 360 : hue, saturation: max ? delta / max : 0, value: max }
}

function hsvToRgb(hue: number, saturation: number, value: number): Rgb {
  const chroma = value * saturation
  const segment = (hue / 60) % 6
  const second = chroma * (1 - Math.abs((segment % 2) - 1))
  const match = value - chroma
  const [red, green, blue] = segment < 1 ? [chroma, second, 0] : segment < 2 ? [second, chroma, 0] : segment < 3 ? [0, chroma, second] : segment < 4 ? [0, second, chroma] : segment < 5 ? [second, 0, chroma] : [chroma, 0, second]
  return [red, green, blue].map((channel) => (channel + match) * 255) as Rgb
}

export function ColorPicker({ value, label, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState(value)
  const [rgbDraft, setRgbDraft] = useState<Rgb>(() => hexToRgb(value))
  const ref = useRef<HTMLDivElement>(null)
  const rgb = hexToRgb(value)
  const hsv = rgbToHsv(rgb)

  useEffect(() => {
    setHexDraft(value)
    setRgbDraft(rgb)
  }, [value])

  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function commitRgb(next: Rgb) {
    const nextHex = rgbToHex(next)
    setRgbDraft(hexToRgb(nextHex))
    setHexDraft(nextHex)
    onChange(nextHex)
  }

  function updateChannel(index: number, rawValue: string) {
    const next = [...rgbDraft] as Rgb
    const parsed = Number.parseInt(rawValue, 10)
    if (!Number.isNaN(parsed)) next[index] = Math.max(0, Math.min(255, parsed))
    setRgbDraft(next)
    if (rawValue !== '' && !Number.isNaN(parsed)) commitRgb(next)
  }

  function updateSurface(event: ReactMouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const saturation = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
    const brightness = Math.max(0, Math.min(1, 1 - (event.clientY - box.top) / box.height))
    commitRgb(hsvToRgb(hsv.hue, saturation, brightness))
  }

  return <div ref={ref} className="relative">
    <button type="button" aria-label={`Abrir seletor da cor ${label}`} aria-expanded={open} onClick={() => setOpen((current) => !current)} className="h-10 w-full rounded-lg border border-[var(--border-default)] p-1.5 text-left" style={{ backgroundColor: value }}><span className="block h-full rounded-md border border-black/10" style={{ backgroundColor: value }} /></button>
    {open && <div className="absolute z-50 mt-2 w-72 rounded-xl border border-[var(--border-default)] bg-[var(--background-elevated,var(--card))] p-3 shadow-2xl">
      <div className="relative h-32 cursor-crosshair overflow-hidden rounded-lg" style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)`, backgroundImage: 'linear-gradient(to right, #fff, transparent), linear-gradient(to top, #000, transparent)' }} onClick={updateSurface}>
        <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${hsv.saturation * 100}%`, top: `${(1 - hsv.value) * 100}%` }} />
      </div>
      <label className="mt-3 block text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Matiz<input aria-label={`Matiz da cor ${label}`} type="range" min="0" max="360" value={Math.round(hsv.hue)} onChange={(event) => commitRgb(hsvToRgb(Number(event.target.value), hsv.saturation, hsv.value))} className="mt-1 w-full accent-[var(--primary)]" /></label>
      <div className="mt-3 grid grid-cols-3 gap-2">{(['R', 'G', 'B'] as const).map((channel, index) => <label key={channel} className="text-[10px] uppercase text-[var(--text-secondary)]">{channel}<input aria-label={`${channel} da cor ${label}`} type="number" min="0" max="255" value={rgbDraft[index]} onChange={(event) => updateChannel(index, event.target.value)} className="field mt-1 px-2 py-1.5 text-xs" /></label>)}</div>
      <label className="mt-3 block text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">HEX<input aria-label={`HEX da cor ${label}`} value={hexDraft} onChange={(event) => { setHexDraft(event.target.value); const normalized = normalizeHex(event.target.value); if (normalized) onChange(normalized) }} onBlur={() => setHexDraft(value)} className="field mt-1 font-mono text-xs uppercase" /></label>
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><span className="size-7 rounded-md border border-[var(--border-default)]" style={{ backgroundColor: value }} />{value.toUpperCase()} · RGB {rgb.join(', ')}</div>
    </div>}
  </div>
}
