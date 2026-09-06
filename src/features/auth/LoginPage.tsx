import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { z } from 'zod'
import { Field, PrimaryButton, TextInput } from '../../components/ui/FormField'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const schema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { session, initializing } = useAuth()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  if (initializing) {
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-500">Cargando…</div>
  }

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(values: FormValues) {
    setError(null)
    const { error: signError } = await supabase.auth.signInWithPassword(values)
    if (signError) {
      setError('No se pudo iniciar sesión. Verifica el correo y la contraseña.')
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Taller</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Sistema para la Confección</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Ingresa con la cuenta creada por el administrador en Supabase Auth.
        </p>
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Field label="Correo" error={form.formState.errors.email?.message}>
            <TextInput type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Field label="Contraseña" error={form.formState.errors.password?.message}>
            <TextInput type="password" autoComplete="current-password" {...form.register('password')} />
          </Field>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <PrimaryButton className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
