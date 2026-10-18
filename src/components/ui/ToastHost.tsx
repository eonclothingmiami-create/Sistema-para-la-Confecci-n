import { useEffect, useState } from 'react'
import { subscribeToast } from '../../lib/toast'

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    return subscribeToast((next) => {
      setMessage(next)
    })
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 5500)
    return () => window.clearTimeout(timer)
  }, [message])

  if (!message) return null

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-[80] max-w-sm rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-800 shadow-lg"
    >
      <p>{message}</p>
      <button
        type="button"
        className="mt-2 text-xs font-medium text-rose-700 underline"
        onClick={() => setMessage(null)}
      >
        Cerrar
      </button>
    </div>
  )
}
