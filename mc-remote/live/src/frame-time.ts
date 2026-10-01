const twoDigits = (value: number): string => String(value).padStart(2, '0')

export const formatFrameTime = (observedAt: number): { clock: string; detail: string; iso: string | null } => {
  const date = new Date(observedAt)
  if (Number.isNaN(date.getTime())) return { clock: '—', detail: String(observedAt), iso: null }

  const clock = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`
  const day = `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
  const offsetMinutes = -date.getTimezoneOffset()
  const offsetHours = twoDigits(Math.floor(Math.abs(offsetMinutes) / 60))
  const offsetRemainder = twoDigits(Math.abs(offsetMinutes) % 60)
  const offset = `UTC${offsetMinutes >= 0 ? '+' : '-'}${offsetHours}:${offsetRemainder}`
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return {
    clock,
    detail: `${day} ${clock}.${milliseconds} ${zone} (${offset})`,
    iso: date.toISOString(),
  }
}
