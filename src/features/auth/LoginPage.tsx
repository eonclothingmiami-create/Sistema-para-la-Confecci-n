import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { z } from 'zod'
import { Field, PrimaryButton, TextInput } from '../../components/ui/FormField'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

const signupSchema = loginSchema
  .extend({
    full_name: z.string().min(2, 'Nombre requerido'),
    confirm_password: z.string().min(6, 'Confirma la contraseña'),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  })

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof signupSchema>

export function LoginPage() {
  const { session, initializing } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: '', email: '', password: '', confirm_password: '' },
  })

  if (initializing) {
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-500">Cargando…</div>
  }

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function onLogin(values: LoginValues) {
    setError(null)
    setInfo(null)
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    if (signError) {
      setError('No se pudo iniciar sesión. Verifica el correo y la contraseña.')
    }
  }

  async function onSignup(values: SignupValues) {
    setError(null)
    setInfo(null)
    const { data, error: signError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.full_name },
      },
    })
    if (signError) {
      const raw = signError.message || ''
      if (/already|registered|exists/i.test(raw)) {
        setError('Ese correo ya tiene una cuenta. Entra con tu contraseña.')
      } else if (/confirm|confirmation email|error sending/i.test(raw)) {
        setError(
          'Supabase no pudo enviar el correo de confirmación. En Authentication → Providers → Email desactiva “Confirm email”.',
        )
      } else if (/signups? not allowed|disabled/i.test(raw)) {
        setError('El registro está desactivado en Supabase Auth. Habilita Email signups.')
      } else if (/captcha/i.test(raw)) {
        setError('Auth pide captcha. Desactívalo en Authentication → Bot and Abuse Protection.')
      } else {
        setError(raw)
      }
      return
    }
    if (data.session) return
    setInfo('Cuenta creada. Si pide confirmación, revisa tu correo y luego entra.')
    setMode('login')
    loginForm.reset({ email: values.email, password: '' })
  }

  function switchMode(next: 'login' | 'signup') {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Taller</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Sistema para la Confección</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {mode === 'login'
            ? 'Entra con tu correo o crea una cuenta nueva.'
            : 'Crea una cuenta para usar el sistema. El rol inicial será supervisor.'}
        </p>

        {mode === 'login' ? (
          <form className="mt-6 space-y-4" onSubmit={loginForm.handleSubmit(onLogin)}>
            <Field label="Correo" error={loginForm.formState.errors.email?.message}>
              <TextInput type="email" autoComplete="email" {...loginForm.register('email')} />
            </Field>
            <Field label="Contraseña" error={loginForm.formState.errors.password?.message}>
              <TextInput
                type="password"
                autoComplete="current-password"
                {...loginForm.register('password')}
              />
            </Field>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
            <PrimaryButton className="w-full" disabled={loginForm.formState.isSubmitting}>
              {loginForm.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
            </PrimaryButton>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={signupForm.handleSubmit(onSignup)}>
            <Field label="Nombre" error={signupForm.formState.errors.full_name?.message}>
              <TextInput autoComplete="name" {...signupForm.register('full_name')} />
            </Field>
            <Field label="Correo" error={signupForm.formState.errors.email?.message}>
              <TextInput type="email" autoComplete="email" {...signupForm.register('email')} />
            </Field>
            <Field label="Contraseña" error={signupForm.formState.errors.password?.message}>
              <TextInput
                type="password"
                autoComplete="new-password"
                {...signupForm.register('password')}
              />
            </Field>
            <Field label="Confirmar contraseña" error={signupForm.formState.errors.confirm_password?.message}>
              <TextInput
                type="password"
                autoComplete="new-password"
                {...signupForm.register('confirm_password')}
              />
            </Field>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
            <PrimaryButton className="w-full" disabled={signupForm.formState.isSubmitting}>
              {signupForm.formState.isSubmitting ? 'Creando…' : 'Crear cuenta'}
            </PrimaryButton>
          </form>
        )}

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-zinc-600 hover:text-zinc-900"
          onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? '¿No tienes cuenta? Crear cuenta' : '¿Ya tienes cuenta? Entrar'}
        </button>
      </div>
    </div>
  )
}
