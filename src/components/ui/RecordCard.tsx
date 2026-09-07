import type { ReactNode } from 'react'

export function RecordCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div> : null}
      </div>
      {children ? <dl className="mt-3 space-y-2">{children}</dl> : null}
    </article>
  )
}

export function RecordField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm text-zinc-800">{children}</dd>
    </div>
  )
}

export function RecordCardList({ children }: { children: ReactNode }) {
  return <div className="space-y-3 sm:hidden">{children}</div>
}

export function DesktopOnly({ children }: { children: ReactNode }) {
  return <div className="hidden sm:block">{children}</div>
}
