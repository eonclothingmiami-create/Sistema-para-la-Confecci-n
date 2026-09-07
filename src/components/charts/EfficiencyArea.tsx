import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPercent, META_EFFICIENCY_PERCENT } from '../../lib/efficiency'

export function EfficiencyArea({
  data,
}: {
  data: { label: string; date: string; efficiency: number | null }[]
}) {
  const hasValues = data.some((item) => item.efficiency != null)

  if (!hasValues) {
    return (
      <p className="grid h-64 place-items-center text-sm text-zinc-400">Sin capturas en este mes.</p>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 120]}
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(value) => `${value}`}
          />
          <ReferenceLine y={META_EFFICIENCY_PERCENT} stroke="#10b981" strokeDasharray="4 4" />
          <Tooltip
            formatter={(value) => formatPercent(Number(value ?? 0))}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e4e4e7',
              boxShadow: 'none',
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="efficiency"
            stroke="#3f3f46"
            fill="#e4e4e7"
            strokeWidth={2}
            connectNulls={false}
            dot={false}
            activeDot={{ r: 4, fill: '#18181b' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
