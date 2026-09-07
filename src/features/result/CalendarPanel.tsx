import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Field, PrimaryButton, SelectInput, TextInput } from '../../components/ui/FormField'
import { useAddWorkshopDay, useDeleteWorkshopDay, useWorkshopCalendar } from '../../hooks/useWorkshopCalendar'
import { endOfMonthISO, formatMonthLong, startOfMonthISO, todayISO } from '../../lib/efficiency'
import { workingDaysInMonth } from '../../lib/result'
import type { WorkshopCalendarKind } from '../../types/database'

const KIND_LABEL: Record<WorkshopCalendarKind, string> = {
  festivo: 'Festivo',
  cierre: 'Cierre',
  extra: 'Día extra',
}

export function CalendarPanel() {
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const from = startOfMonthISO(`${month}-01`)
  const to = endOfMonthISO(`${month}-01`)
  const calendarQuery = useWorkshopCalendar(from, to)
  const addDay = useAddWorkshopDay()
  const deleteDay = useDeleteWorkshopDay()
  const entries = calendarQuery.data ?? []
  const workingDays = workingDaysInMonth(from, new Set(), entries)

  const [occurredOn, setOccurredOn] = useState(from)
  const [kind, setKind] = useState<Exclude<WorkshopCalendarKind, 'festivo'>>('cierre')
  const [name, setName] = useState('')

  const monthEntries = useMemo(
    () => entries.filter((item) => item.occurred_on >= from && item.occurred_on <= to),
    [entries, from, to],
  )

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <Field label="Mes">
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value)
              setOccurredOn(startOfMonthISO(`${event.target.value}-01`))
            }}
            className="w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </Field>
      </div>

      <p className="mb-4 text-sm text-zinc-500">
        {formatMonthLong(from)}:{' '}
        <span className="font-medium text-zinc-800">{workingDays} días laborales</span>
        {calendarQuery.isLoading ? ' Cargando…' : ''}
      </p>

      <form
        className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-4 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          addDay.mutate(
            { occurred_on: occurredOn, kind, name },
            {
              onSuccess: () => setName(''),
            },
          )
        }}
      >
        <Field label="Fecha">
          <TextInput
            type="date"
            value={occurredOn}
            min={from}
            max={to}
            onChange={(event) => setOccurredOn(event.target.value)}
          />
        </Field>
        <Field label="Tipo">
          <SelectInput
            value={kind}
            onChange={(event) => setKind(event.target.value as 'cierre' | 'extra')}
          >
            <option value="cierre">Cierre (no se trabaja)</option>
            <option value="extra">Día extra (sí se trabaja)</option>
          </SelectInput>
        </Field>
        <Field label="Nombre">
          <TextInput
            value={name}
            placeholder={kind === 'cierre' ? 'Cierre taller' : 'Sábado de producción'}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <PrimaryButton type="submit" disabled={addDay.isPending}>
          {addDay.isPending ? 'Guardando…' : 'Agregar día'}
        </PrimaryButton>
        {addDay.error ? (
          <p className="text-sm text-rose-600 sm:col-span-4">{addDay.error.message}</p>
        ) : null}
      </form>

      {monthEntries.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-400">
          Este mes no tiene festivos ni ajustes.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {monthEntries.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-2.5 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-800">{item.name}</p>
                <p className="text-xs text-zinc-500">
                  {item.occurred_on} · {KIND_LABEL[item.kind]}
                </p>
              </div>
              {item.source === 'manual' ? (
                <button
                  type="button"
                  className="shrink-0 text-rose-500 hover:text-rose-700"
                  title="Quitar"
                  onClick={() => deleteDay.mutate(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <span className="shrink-0 text-[11px] text-zinc-400">Oficial</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
