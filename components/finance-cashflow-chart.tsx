'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

type CashflowPoint = { key: string; label: string; inflow: number; outflow: number }

const chartConfig = {
  inflow: { label: 'Entradas pagas', color: 'var(--chart-3)' },
  outflow: { label: 'Saídas pagas', color: 'var(--chart-5)' },
  balance: { label: 'Saldo em aberto', color: 'var(--chart-1)' },
} satisfies ChartConfig

const currency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
}).format(value)

export function FinanceCashflowChart({ data }: { data: CashflowPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full" role="group" aria-label="Gráfico de entradas e saídas pagas por mês">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis tickLine={false} axisLine={false} width={76} tickFormatter={(value: number) => currency(value)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => currency(Number(value))} />} />
        <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartContainer>
  )
}

export function FinanceCategoryChart({ data }: { data: { label: string; amount: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[230px] w-full" role="group" aria-label="Saldos em aberto por categoria">
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={112} interval={0} tick={{ fontSize: 10 }} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => currency(Number(value))} />} />
        <Bar dataKey="amount" name="balance" fill="var(--color-balance)" radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  )
}
