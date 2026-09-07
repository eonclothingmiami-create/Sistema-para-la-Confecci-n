export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value) || 0
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatSignedMoney(value: number | string | null | undefined): string {
  const amount = Number(value) || 0
  const formatted = formatMoney(Math.abs(amount))
  if (amount > 0) return `+${formatted}`
  if (amount < 0) return `−${formatted}`
  return formatted
}

export function formatMinuteRate(value: number | string | null | undefined): string {
  return formatMoney(value)
}
