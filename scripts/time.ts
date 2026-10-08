export const HOUR_MS = 3_600_000

export type StampRange = { first: number; last: number }

export const stampMs = (stamp: string) => Date.parse(stamp + 'Z')

export const msStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19)

export const hourSpan = (ms: number) => ({ start: ms - HOUR_MS, end: ms })

export const dayOf = (ms: number) => msStamp(hourSpan(ms).start).slice(0, 10)

export const dayStamps = (day: string): StampRange => {
  const start = Date.parse(day + 'T00:00:00Z')
  return { first: start + HOUR_MS, last: start + 24 * HOUR_MS }
}

export const monthStamps = (month: string): StampRange => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return { first: Date.UTC(y, m - 1, 1) + HOUR_MS, last: Date.UTC(y, m, 1) }
}

export const monthsOf = (firstMs: number, lastMs: number) => {
  const out: string[] = []
  const b = dayOf(lastMs).slice(0, 7)
  let [y, m] = dayOf(firstMs).split('-').map(Number) as [number, number]
  for (let k = 0; k < 600; k++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key >= b) break
    m += 1
    if (m === 13) {
      m = 1
      y += 1
    }
  }
  return out
}

export const yearStamps = (year: number): StampRange => ({
  first: Date.UTC(year, 0, 1) + HOUR_MS,
  last: Date.UTC(year + 1, 0, 1),
})

export const yearHours = (year: number) => {
  const { first, last } = yearStamps(year)
  return (last - first) / HOUR_MS + 1
}

export const yearOf = (ms: number) => Number(dayOf(ms).slice(0, 4))

export const yearsOf = (firstMs: number, lastMs: number) => {
  const out: number[] = []
  for (let y = yearOf(firstMs); y <= yearOf(lastMs); y++) out.push(y)
  return out
}
