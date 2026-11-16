'use client'

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

type SignaturePosition = { x_percent: number; y_percent: number; width_percent: number; height_percent: number }
type SuggestedPosition = SignaturePosition & { page_number: number }
type Props = {
  url: string
  pageNumber: number
  position: SignaturePosition
  suggestion: SuggestedPosition | null
  signaturePreview: string
  canMove: boolean
  onPositionChange: (position: SignaturePosition) => void
  onSuggestion: (position: SuggestedPosition | null) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function findSuggestedPosition(textBoxes: Array<{ left: number; top: number; right: number; bottom: number }>, pageWidth: number, pageHeight: number, pageNumber: number): SuggestedPosition {
  const widthPercent = 42
  const heightPercent = 12
  let best = { x_percent: 8, y_percent: 78, score: Number.POSITIVE_INFINITY }

  for (let yPercent = 56; yPercent <= 84; yPercent += 4) {
    for (let xPercent = 6; xPercent <= 54; xPercent += 6) {
      const left = pageWidth * xPercent / 100
      const top = pageHeight * yPercent / 100
      const right = pageWidth * (xPercent + widthPercent) / 100
      const bottom = pageHeight * (yPercent + heightPercent) / 100
      const overlap = textBoxes.reduce((sum, box) => sum + Math.max(0, Math.min(right, box.right) - Math.max(left, box.left)) * Math.max(0, Math.min(bottom, box.bottom) - Math.max(top, box.top)), 0)
      const score = overlap / (pageWidth * pageHeight) * 10000 + (100 - yPercent) * 0.2 + Math.abs(xPercent - 8) * 0.08
      if (score < best.score) best = { x_percent: xPercent, y_percent: yPercent, score }
    }
  }

  return { page_number: pageNumber, x_percent: best.x_percent, y_percent: best.y_percent, width_percent: widthPercent, height_percent: heightPercent }
}

export function SignaturePdfPreview({ url, pageNumber, position,   suggestion,
  signaturePreview,
  canMove,
  onPositionChange, onSuggestion }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragOffset = useRef<{ x: number; y: number } | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [containerWidth, setContainerWidth] = useState(720)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let loadingTask: PDFDocumentLoadingTask | undefined
    setPdf(null)
    setLoading(true)
    setError('')

    void import('pdfjs-dist').then(async (pdfjs) => {
      if (!active) return
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      loadingTask = pdfjs.getDocument({ url })
      const document = await loadingTask.promise
      if (active) setPdf(document)
    }).catch(() => {
      if (active) setError('Não foi possível carregar a prévia deste PDF. Verifique sua conexão e tente novamente.')
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
      void loadingTask?.destroy()
    }
  }, [url])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf || !canvasRef.current || containerWidth <= 0) return
    let active = true
    let renderTask: ReturnType<PDFPageProxy['render']> | undefined

    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(containerWidth / baseViewport.width, 1.5)
        const viewport = page.getViewport({ scale })
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d')
        if (!canvas || !context) return
        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        const currentRenderTask = page.render({ canvas, canvasContext: context, viewport })
        renderTask = currentRenderTask
        await currentRenderTask.promise
        if (!active) return

        const textContent = await page.getTextContent()
        const textBoxes: Array<{ left: number; top: number; right: number; bottom: number }> = []
        for (const item of textContent.items) {
          if (!('transform' in item) || !item.str.trim()) continue
          const [, , a, b, tx, ty] = item.transform
          const height = Math.hypot(a, b)
          const first = viewport.convertToViewportPoint(tx, ty - height)
          const second = viewport.convertToViewportPoint(tx + item.width, ty)
          textBoxes.push({ left: Math.min(first[0], second[0]), top: Math.min(first[1], second[1]), right: Math.max(first[0], second[0]), bottom: Math.max(first[1], second[1]) })
        }
        onSuggestion(findSuggestedPosition(textBoxes, viewport.width, viewport.height, pageNumber))
      } catch {
        if (active) setError('Não foi possível renderizar esta página do PDF.')
      }
    })()

    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [containerWidth, onSuggestion, pageNumber, pdf])

  function startMove(event: PointerEvent<HTMLButtonElement>) {
    const container = containerRef.current
    if (!canMove || !container) return
    const rect = container.getBoundingClientRect()
    dragOffset.current = {
      x: event.clientX - rect.left - rect.width * position.x_percent / 100,
      y: event.clientY - rect.top - rect.height * position.y_percent / 100,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const container = containerRef.current
    if (!canMove || !container || !dragOffset.current || event.buttons !== 1) return
    const rect = container.getBoundingClientRect()
    onPositionChange({
      ...position,
      x_percent: clamp((event.clientX - rect.left - dragOffset.current.x) / rect.width * 100, 0, 100 - position.width_percent),
      y_percent: clamp((event.clientY - rect.top - dragOffset.current.y) / rect.height * 100, 0, 100 - position.height_percent),
    })
  }

  function stopMove() {
    dragOffset.current = null
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 5 : 1
    const updates: Record<string, number> = {
      ArrowLeft: -step,
      ArrowRight: step,
      ArrowUp: -step,
      ArrowDown: step,
    }
    const delta = updates[event.key]
    if (delta === undefined) return
    event.preventDefault()
    onPositionChange({
      ...position,
      x_percent: clamp(position.x_percent + (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? delta : 0), 0, 100 - position.width_percent),
      y_percent: clamp(position.y_percent + (event.key === 'ArrowUp' || event.key === 'ArrowDown' ? delta : 0), 0, 100 - position.height_percent),
    })
  }

  const markerStyle = {
    left: `${position.x_percent}%`,
    top: `${position.y_percent}%`,
    width: `${position.width_percent}%`,
    height: `${position.height_percent}%`,
  }

  return <div className="grid gap-2">
    <div className="flex min-h-16 items-center justify-center rounded-xl border border-white/10 bg-[#111722] p-3 text-center text-xs text-slate-400" aria-live="polite">
      {loading ? 'Carregando prévia do documento…' : error || `Página ${pageNumber} de ${pdf?.numPages ?? '—'}`}
    </div>
    <div ref={containerRef} className="relative mx-auto w-full max-w-[840px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl">
      <canvas ref={canvasRef} aria-label={`Página ${pageNumber} do documento`} className="block h-auto w-full" />
      {pdf && canMove && suggestion?.page_number === pageNumber && <div aria-hidden="true" className="pointer-events-none absolute rounded-md border-2 border-dashed border-violet-600 bg-violet-300/20" style={{ left: `${suggestion.x_percent}%`, top: `${suggestion.y_percent}%`, width: `${suggestion.width_percent}%`, height: `${suggestion.height_percent}%` }}><span className="absolute -top-5 left-0 rounded bg-violet-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">Sugestão</span></div>}
      {pdf && canMove && <button type="button" aria-label="Campo de assinatura. Arraste para mover ou use as setas do teclado." title="Arraste para reposicionar · use as setas do teclado para mover com precisão" onPointerDown={startMove} onPointerMove={move} onPointerUp={stopMove} onPointerCancel={stopMove} onKeyDown={moveWithKeyboard} className="absolute touch-none cursor-move select-none overflow-hidden rounded-md border-2 border-cyan-600 bg-cyan-200/55 text-left text-[clamp(9px,1.2vw,13px)] font-semibold text-cyan-950 shadow-[0_1px_8px_rgba(8,145,178,.3)] outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" style={markerStyle}>{signaturePreview ? <img src={signaturePreview} alt="Prévia da assinatura neste campo" className="pointer-events-none size-full object-contain" /> : <span className="px-2" aria-hidden="true">Assinatura · mover</span>}</button>}
      {pdf && !canMove && <div role="img" aria-label={signaturePreview ? 'Prévia da assinatura no documento' : 'Campo de assinatura no documento'} className="pointer-events-none absolute overflow-hidden rounded-md border-2 border-cyan-600 bg-cyan-200/55" style={markerStyle}>{signaturePreview && <img src={signaturePreview} alt="" className="size-full object-contain" />}</div>}
    </div>
  </div>
}
