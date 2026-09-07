import { Link } from 'react-router-dom'
import { formatMoney, formatSignedMoney } from '../../lib/money'

export function ResultCard({
  title,
  result,
  revenue,
  variableCosts,
  fixedCosts,
  fixedLabel,
  missingRate,
  hasFixed,
  href,
}: {
  title: string
  result: number
  revenue: number
  variableCosts: number
  fixedCosts: number
  fixedLabel: string
  missingRate: boolean
  hasFixed: boolean
  href?: string
}) {
  const tone = result > 0 ? 'text-emerald-700' : result < 0 ? 'text-rose-600' : 'text-zinc-800'
  const label = result > 0 ? 'Ganando' : result < 0 ? 'Perdiendo' : 'En ceros'

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{title}</p>
        {href ? (
          <Link to={href} className="text-sm text-zinc-500 hover:text-zinc-800">
            Cargar gastos
          </Link>
        ) : null}
      </div>
      <p className={`mt-2 text-4xl font-semibold tracking-tight tabular sm:text-5xl ${tone}`}>
        {formatSignedMoney(result)}
      </p>
      <p className={`mt-2 text-sm font-medium ${tone}`}>{label}</p>
      <p className="mt-3 text-sm text-zinc-500">
        Ingreso {formatMoney(revenue)} · Gastos {formatMoney(variableCosts)} · {fixedLabel} {formatMoney(fixedCosts)}
      </p>
      {missingRate ? (
        <p className="mt-3 text-sm text-amber-700">Falta valor minuto en algún lote. El ingreso puede salir $0.</p>
      ) : null}
      {!hasFixed ? (
        <p className="mt-3 text-sm text-amber-700">
          Aún no hay fijos de este mes.{' '}
          {href ? (
            <Link to={href} className="font-medium underline">
              Cárgalos en Resultado
            </Link>
          ) : (
            'Cárgalos para que el resultado esté completo.'
          )}
        </p>
      ) : null}
    </section>
  )
}
