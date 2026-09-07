/** Festivos de Colombia: fijos, Ley Emiliani (traslado a lunes) y Semana Santa. */

export interface OfficialHoliday {
  date: string
  name: string
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function nextMonday(date: Date): Date {
  const weekday = date.getUTCDay()
  if (weekday === 1) return date
  const days = weekday === 0 ? 1 : 8 - weekday
  return addDays(date, days)
}

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month, day)
}

export function colombiaHolidays(year: number): OfficialHoliday[] {
  const easter = easterSunday(year)
  const unique = new Map<string, string>()

  function add(date: Date, name: string) {
    const key = toISO(date)
    const previous = unique.get(key)
    unique.set(key, previous && previous !== name ? `${previous} / ${name}` : name)
  }

  add(utcDate(year, 1, 1), 'Año Nuevo')
  add(nextMonday(utcDate(year, 1, 6)), 'Día de los Reyes Magos')
  add(nextMonday(utcDate(year, 3, 19)), 'Día de San José')
  add(addDays(easter, -3), 'Jueves Santo')
  add(addDays(easter, -2), 'Viernes Santo')
  add(utcDate(year, 5, 1), 'Día del Trabajo')
  add(nextMonday(addDays(easter, 39)), 'Ascensión del Señor')
  add(nextMonday(addDays(easter, 60)), 'Corpus Christi')
  add(nextMonday(addDays(easter, 68)), 'Sagrado Corazón de Jesús')
  add(nextMonday(utcDate(year, 6, 29)), 'San Pedro y San Pablo')
  add(utcDate(year, 7, 20), 'Independencia de Colombia')
  add(utcDate(year, 8, 7), 'Batalla de Boyacá')
  add(nextMonday(utcDate(year, 8, 15)), 'Asunción de la Virgen')
  add(nextMonday(utcDate(year, 10, 12)), 'Día de la Raza')
  add(nextMonday(utcDate(year, 11, 1)), 'Todos los Santos')
  add(nextMonday(utcDate(year, 11, 11)), 'Independencia de Cartagena')
  add(utcDate(year, 12, 8), 'Inmaculada Concepción')
  add(utcDate(year, 12, 25), 'Navidad')

  return [...unique.entries()]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function colombiaHolidaysForYears(fromYear: number, toYear: number): OfficialHoliday[] {
  const rows: OfficialHoliday[] = []
  for (let year = fromYear; year <= toYear; year += 1) {
    rows.push(...colombiaHolidays(year))
  }
  return rows
}
