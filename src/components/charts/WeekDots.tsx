import { formatPercent, statusHex } from '../../lib/efficiency'
import type { WorkshopDayPoint } from '../../lib/efficiency'

export function WeekDots({ days }: { days: WorkshopDayPoint[] }) {
  return (
    <div className="flex items-end gap-2">
      {days.map((day) => {
        const value = day.efficiency
        const color = value == null ? '#e4e4e7' : statusHex(value)
        return (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
              title={
                value == null
                  ? `${day.date}: sin captura`
                  : `${day.date}: ${formatPercent(value)}`
              }
            />
            <span className="text-[10px] tabular text-zinc-400">{day.label}</span>
          </div>
        )
      })}
    </div>
  )
}
