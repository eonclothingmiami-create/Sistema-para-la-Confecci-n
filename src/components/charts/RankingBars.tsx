import { Link } from 'react-router-dom'
import { formatPercent, statusHex } from '../../lib/efficiency'

export function RankingBars({
  items,
}: {
  items: { id: string; name: string; value: number }[]
}) {
  const max = Math.max(100, ...items.map((item) => item.value))

  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-400">Sin datos este mes.</p>
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <Link to={`/operarios/${item.id}`} className="truncate font-medium text-zinc-800 hover:underline">
              {item.name}
            </Link>
            <span className="tabular text-zinc-500">{formatPercent(item.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (item.value / max) * 100)}%`,
                backgroundColor: statusHex(item.value),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}