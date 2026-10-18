import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { z } from 'zod'
import { Field, PrimaryButton, SecondaryButton, TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { useIsVendorAdmin, useSubscription } from '../../hooks/useSubscription'
import { formatMoney } from '../../lib/money'
import { formatSubscriptionDateLong } from '../../lib/subscription'
import { supabase } from '../../lib/supabase'
import type { SubscriptionPayment } from '../../types/database'

const schema = z.object({
  period_end: z.string().min(10, 'Fecha requerida'),
  amount: z.number().min(0, 'Monto inválido'),
  method: z.string().optional(),
  reference: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

type SubscriptionEventRow = {
  id: string
  at: string
  source: string
  actor: string | null
  old_state: Record<string, unknown> | null
  new_state: Record<string, unknown> | null
}

async function invalidateSubscription(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ['subscription_state'] })
  await queryClient.invalidateQueries({ queryKey: ['subscription_payments'] })
  await queryClient.invalidateQueries({ queryKey: ['subscription_events'] })
}

function formatSyncAt(iso: string | null | undefined): string {
  if (!iso) return 'Nunca'
  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Bogota',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function SubscriptionAdminPage() {
  const vendorQuery = useIsVendorAdmin()
  const subscriptionQuery = useSubscription()
  const queryClient = useQueryClient()
  const [graceUntil, setGraceUntil] = useState('')

  const paymentsQuery = useQuery({
    queryKey: ['subscription_payments'],
    enabled: vendorQuery.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_payments')
        .select('*')
        .order('paid_at', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SubscriptionPayment[]
    },
  })

  const eventsQuery = useQuery({
    queryKey: ['subscription_events'],
    enabled: vendorQuery.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_events')
        .select('id, at, source, actor, old_state, new_state')
        .order('at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data as SubscriptionEventRow[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      period_end: '',
      amount: 0,
      method: 'transferencia',
      reference: '',
    },
  })

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.rpc('register_payment', {
        p_period_end: values.period_end,
        p_amount: values.amount,
        p_method: values.method || null,
        p_reference: values.reference || null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateSubscription(queryClient)
      form.reset({
        period_end: '',
        amount: 0,
        method: 'transferencia',
        reference: '',
      })
    },
  })

  const setEnforcement = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc('set_enforcement', { p_enabled: enabled })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateSubscription(queryClient)
    },
  })

  const suspend = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('suspend_subscription')
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateSubscription(queryClient)
    },
  })

  const reactivate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reactivate_subscription')
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateSubscription(queryClient)
    },
  })

  const setGrace = useMutation({
    mutationFn: async (until: string) => {
      const { error } = await supabase.rpc('set_grace', { p_until: until })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateSubscription(queryClient)
      setGraceUntil('')
    },
  })

  if (vendorQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-zinc-500">Cargando…</div>
  }

  if (!vendorQuery.data) {
    return <Navigate to="/" replace />
  }

  const state = subscriptionQuery.data
  const enforcementOn = state?.enforcement_enabled === true
  const storedSuspended = state?.stored_status === 'suspended'
  const controlsBusy =
    setEnforcement.isPending || suspend.isPending || reactivate.isPending || setGrace.isPending
  const originLabel = state?.source === 'panel' ? 'Panel global' : 'Local'

  return (
    <div className="space-y-8">
      <PageHeader title="Suscripción" />

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Estado actual</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Origen</dt>
            <dd className="font-medium text-zinc-900">{originLabel}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Última sincronización</dt>
            <dd className="font-medium text-zinc-900">{formatSyncAt(state?.last_synced_at)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Estado efectivo</dt>
            <dd className="font-medium text-zinc-900">
              {state?.effective_status ?? state?.status ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Estado guardado</dt>
            <dd className="font-medium text-zinc-900">{state?.stored_status ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">tenant_id</dt>
            <dd className="font-medium text-zinc-900">{state?.tenant_id ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">panel_version</dt>
            <dd className="font-medium text-zinc-900">{state?.panel_version ?? 0}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Vence</dt>
            <dd className="font-medium text-zinc-900">
              {formatSubscriptionDateLong(state?.current_period_end)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Gracia hasta</dt>
            <dd className="font-medium text-zinc-900">
              {formatSubscriptionDateLong(state?.grace_until)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Días restantes</dt>
            <dd className="font-medium text-zinc-900">{state?.days_left ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Días de gracia</dt>
            <dd className="font-medium text-zinc-900">
              {state?.days_left_in_grace ?? state?.grace_days_left ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Enforcement</dt>
            <dd className="font-medium text-zinc-900">
              {enforcementOn ? 'Activo (bloquea escritura)' : 'Apagado (fail-open)'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Mensaje</dt>
            <dd className="font-medium text-zinc-900">{state?.message?.trim() || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Controles de emergencia</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Respaldo local si el panel global no está disponible. Marca source = local.
        </p>

        <label className="mt-4 flex items-center gap-3 text-sm text-zinc-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-300"
            checked={enforcementOn}
            disabled={controlsBusy || !state}
            onChange={(event) => setEnforcement.mutate(event.target.checked)}
          />
          Bloqueo activo (enforcement)
        </label>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Poner en gracia hasta…">
            <TextInput
              type="date"
              value={graceUntil}
              onChange={(event) => setGraceUntil(event.target.value)}
            />
          </Field>
          <SecondaryButton
            type="button"
            disabled={controlsBusy || !graceUntil}
            onClick={() => setGrace.mutate(graceUntil)}
          >
            {setGrace.isPending ? 'Aplicando…' : 'Aplicar gracia'}
          </SecondaryButton>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <SecondaryButton
            type="button"
            disabled={controlsBusy || storedSuspended}
            onClick={() => {
              if (
                confirm(
                  '¿Suspender ahora? La app quedará en solo lectura si el bloqueo está activo.',
                )
              ) {
                suspend.mutate()
              }
            }}
          >
            {suspend.isPending ? 'Suspendiendo…' : 'Suspender ahora'}
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={
              controlsBusy ||
              (!storedSuspended &&
                state?.status !== 'expired' &&
                state?.status !== 'suspended' &&
                state?.status !== 'grace')
            }
            onClick={() => reactivate.mutate()}
          >
            {reactivate.isPending ? 'Reactivando…' : 'Reactivar'}
          </PrimaryButton>
        </div>

        {setEnforcement.isError || suspend.isError || reactivate.isError || setGrace.isError ? (
          <p className="mt-3 text-sm text-rose-600">
            {(setEnforcement.error || suspend.error || reactivate.error || setGrace.error) instanceof
            Error
              ? (
                  (setEnforcement.error ||
                    suspend.error ||
                    reactivate.error ||
                    setGrace.error) as Error
                ).message
              : 'No se pudo aplicar el control'}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Registrar pago</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <Field label="Nuevo vencimiento" error={form.formState.errors.period_end?.message}>
            <TextInput type="date" {...form.register('period_end')} />
          </Field>
          <Field label="Monto" error={form.formState.errors.amount?.message}>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              {...form.register('amount', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Método">
            <TextInput {...form.register('method')} placeholder="transferencia, efectivo…" />
          </Field>
          <Field label="Referencia">
            <TextInput {...form.register('reference')} placeholder="Nº comprobante" />
          </Field>
          <div className="sm:col-span-2">
            <PrimaryButton type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Registrar pago'}
            </PrimaryButton>
            {save.isError ? (
              <p className="mt-2 text-sm text-rose-600">
                {save.error instanceof Error ? save.error.message : 'No se pudo registrar el pago'}
              </p>
            ) : null}
            {save.isSuccess ? (
              <p className="mt-2 text-sm text-emerald-700">Pago registrado y periodo extendido.</p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Historial de eventos</h2>
        {eventsQuery.isLoading ? (
          <p className="mt-3 text-sm text-zinc-500">Cargando eventos…</p>
        ) : eventsQuery.data?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-2">Cuándo</th>
                  <th className="px-2 py-2">Origen</th>
                  <th className="px-2 py-2">Actor</th>
                  <th className="px-2 py-2">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {eventsQuery.data.map((row) => {
                  const oldStatus = row.old_state?.status
                  const newStatus = row.new_state?.status
                  return (
                    <tr key={row.id} className="border-t border-zinc-100">
                      <td className="px-2 py-2 whitespace-nowrap">{formatSyncAt(row.at)}</td>
                      <td className="px-2 py-2">{row.source}</td>
                      <td className="px-2 py-2">{row.actor ?? '—'}</td>
                      <td className="px-2 py-2">
                        {String(oldStatus ?? '—')} → {String(newStatus ?? '—')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">Aún no hay eventos.</p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Historial de pagos</h2>
        {paymentsQuery.isLoading ? (
          <p className="mt-3 text-sm text-zinc-500">Cargando pagos…</p>
        ) : paymentsQuery.data?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-2">Pagado</th>
                  <th className="px-2 py-2">Monto</th>
                  <th className="px-2 py-2">Método</th>
                  <th className="px-2 py-2">Referencia</th>
                  <th className="px-2 py-2">Periodo</th>
                </tr>
              </thead>
              <tbody>
                {paymentsQuery.data.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-2 py-2 whitespace-nowrap">{row.paid_at}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatMoney(Number(row.amount))}</td>
                    <td className="px-2 py-2">{row.method ?? '—'}</td>
                    <td className="px-2 py-2">{row.reference ?? '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {row.period_start ?? '—'} → {row.period_end}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">Aún no hay pagos registrados.</p>
        )}
      </section>
    </div>
  )
}
