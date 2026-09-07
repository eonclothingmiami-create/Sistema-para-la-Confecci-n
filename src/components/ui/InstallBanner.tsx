import { Download, X } from 'lucide-react'
import type { useInstallPrompt } from '../../hooks/useInstallPrompt'

type Prompt = ReturnType<typeof useInstallPrompt>

export function InstallBanner({ prompt }: { prompt: Prompt }) {
  const { visible, canPrompt, ios, install, dismiss } = prompt

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[25] border-t border-zinc-200 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(24,24,27,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-lg items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">Descargar app</p>
          <p className="mt-0.5 text-sm text-zinc-500">
            {ios && !canPrompt
              ? 'Toca Compartir → Añadir a pantalla de inicio.'
              : 'Ábrela desde la pantalla de inicio, sin el navegador.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {canPrompt ? (
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Descargar app
              </button>
            ) : null}
            <button type="button" onClick={dismiss} className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600">
              Ahora no
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="shrink-0 p-1 text-zinc-400" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
