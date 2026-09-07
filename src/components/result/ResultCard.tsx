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
      <div className="mt-3 flex flex-col gap-1 text-sm text-zinc-500 sm:block">
        <span>Ingreso {formatMoney(revenue)}</span>
        <span className="hidden sm:inline"> · </span>
        <span>Gastos {formatMoney(variableCosts)}</span>
        <span className="hidden sm:inline"> · </span>
        <span>
          {fixedLabel} {formatMoney(fixedCosts)}
        </span>
      </div>
      {missingRate ? (
        <p className="mt-3 text-sm text-amber-700">Falta valor minuto en algún lote. El ingreso puede salir $0.</p>
      ) : null}
      {!hasFixed ? (
        <p className="mt-3 text-sm text-amber-700">
          Aún no hay fijos para copiar.{' '}
          {href ? (
            <Link to={href} className="font-medium underline">
              Cárgalos una vez en Resultado
            </Link>
          ) : (
            'Cárgalos una vez; los meses siguientes se copian solos.'
          )}
        </p>
      ) : null}
    </section>
  )
}
