import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'pwa-install-dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')
  const [standalone, setStandalone] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const ios = typeof navigator !== 'undefined' && isIos()

  useEffect(() => {
    setStandalone(isStandalone())
    const media = window.matchMedia('(max-width: 639px)')
    const syncWidth = () => setNarrow(media.matches)
    syncWidth()
    media.addEventListener('change', syncWidth)
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => {
      media.removeEventListener('change', syncWidth)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const visible = !standalone && !dismissed && (Boolean(deferred) || ios || narrow)

  const install = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    if (choice.outcome === 'accepted') {
      localStorage.setItem(STORAGE_KEY, '1')
      setDismissed(true)
    }
  }, [deferred])

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }, [])

  return { visible, canPrompt: Boolean(deferred), ios, install, dismiss }
}
