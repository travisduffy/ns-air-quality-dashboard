// The one module of the hour convention.
// Stamps carry no zone. They are read as UTC only to count hours between them.
// A stamp closes its hour: the stamp 2025-02-01T00:00 holds the hour
// 2025-01-31T23:00 to 2025-02-01T00:00.

export const HOUR_MS = 3_600_000

export type StampRange = { first: number; last: number }

export const stampMs = (stamp: string) => Date.parse(stamp + 'Z')

export const msStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19)

// The span of time that a stamp closes.
export const hourSpan = (ms: number) => ({ start: ms - HOUR_MS, end: ms })

// A stamp belongs to the day of the stamp minus one hour.
export const dayOf = (ms: number) => msStamp(hourSpan(ms).start).slice(0, 10)

// The first and the last stamp of a day: D 01:00 to D+1 00:00.
export const dayStamps = (day: string): StampRange => {
  const start = Date.parse(day + 'T00:00:00Z')
  return { first: start + HOUR_MS, last: start + 24 * HOUR_MS }
}

// The first and the last stamp of a month: day 1 at 01:00 to day 1 of the next
// month at 00:00.
export const monthStamps = (month: string): StampRange => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return { first: Date.UTC(y, m - 1, 1) + HOUR_MS, last: Date.UTC(y, m, 1) }
}

// The months of the stamps firstMs to lastMs, by the day of each stamp.
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
