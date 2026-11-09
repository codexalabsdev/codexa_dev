'use client'

import { Children, isValidElement, useState, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children)
  return ''
}

function CopyablePre({ children }: ComponentProps<'pre'>) {
  const [copied, setCopied] = useState(false)
  const code = extractText(children)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl border border-white/10 bg-[#080d12]">
      <Button type="button" variant="ghost" size="xs" onClick={() => void copyCode()} aria-label={copied ? 'Código copiado' : 'Copiar código'} className="absolute right-2 top-2 z-10 text-slate-400 hover:text-white">
        {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
      <pre className="overflow-x-auto px-4 pb-4 pt-12 text-[11px] leading-5 text-slate-200"><code>{children}</code></pre>
    </div>
  )
}

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="assistant-markdown min-w-0 text-[13px] leading-6 text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <CopyablePre>{children}</CopyablePre>,
          code: ({ className, children, ...props }) => <code className={`rounded bg-white/[0.07] px-1 py-0.5 font-mono text-[0.92em] text-cyan-100 ${className ?? ''}`} {...props}>{children}</code>,
          p: ({ children }) => <p className="whitespace-pre-wrap [&+p]:mt-3">{children}</p>,
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-semibold text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-sm font-semibold text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-3 text-[13px] font-semibold text-white">{children}</h3>,
          ul: ({ children }) => <ul className="my-2 list-disc pl-5 marker:text-cyan-400">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-5 marker:text-cyan-400">{children}</ol>,
          li: ({ children }) => <li className="my-1 pl-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-cyan-400/50 pl-3 text-slate-400">{children}</blockquote>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline decoration-cyan-400/30 underline-offset-2 hover:text-cyan-200">{children}</a>,
          table: ({ children }) => <div className="my-3 overflow-x-auto rounded-lg border border-white/10"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-white/10 bg-white/[0.04] px-3 py-2 font-semibold text-slate-200">{children}</th>,
          td: ({ children }) => <td className="border-b border-white/[0.06] px-3 py-2 align-top text-slate-300">{children}</td>,
          hr: () => <div className="my-4 h-px bg-white/10" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
