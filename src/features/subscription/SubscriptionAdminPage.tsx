import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field, PrimaryButton, TextInput } from '../../components/ui/FormField'
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

export function SubscriptionAdminPage() {
  const vendorQuery = useIsVendorAdmin()
  const subscriptionQuery = useSubscription()
  const queryClient = useQueryClient()

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
        period_end: values.period_end,
        amount: values.amount,
        method: values.method || null,
        reference: values.reference || null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['subscription_state'] })
      await queryClient.invalidateQueries({ queryKey: ['subscription_payments'] })
      form.reset({
        period_end: '',
        amount: 0,
        method: 'transferencia',
        reference: '',
      })
    },
  })

  if (vendorQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-zinc-500">Cargando…</div>
  }

  if (!vendorQuery.data) {
    return <Navigate to="/" replace />
  }

  const state = subscriptionQuery.data

  return (
    <div className="space-y-8">
      <PageHeader title="Suscripción" />

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Estado actual</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Estado efectivo</dt>
            <dd className="font-medium text-zinc-900">{state?.status ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Plan</dt>
            <dd className="font-medium text-zinc-900">{state?.plan ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Vence</dt>
            <dd className="font-medium text-zinc-900">
              {formatSubscriptionDateLong(state?.current_period_end)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Días restantes</dt>
            <dd className="font-medium text-zinc-900">{state?.days_left ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Días de gracia restantes</dt>
            <dd className="font-medium text-zinc-900">{state?.grace_days_left ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Enforcement</dt>
            <dd className="font-medium text-zinc-900">
              {state?.enforcement_enabled ? 'Activo (bloquea escritura vencida)' : 'Apagado (fail-open)'}
            </dd>
          </div>
        </dl>
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
