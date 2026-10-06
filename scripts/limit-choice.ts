// The limit chosen for each pollutant. The value, unit, quote, and URL come
// from data/limits.json at start.
export type LimitChoice = {
  pollutant: string
  framework: string
  averagingHours: number
}

const SCHEDULE_A = 'Nova Scotia Air Quality Regulations, Schedule A (‡)'

export const chosenLimits: LimitChoice[] = [
  { pollutant: 'O3', framework: 'CAAQS (2025 standard)', averagingHours: 8 },
  {
    pollutant: 'PM2.5',
    framework: 'CAAQS (2020 standard)',
    averagingHours: 24,
  },
  { pollutant: 'SO2', framework: SCHEDULE_A, averagingHours: 1 },
  { pollutant: 'NO2', framework: SCHEDULE_A, averagingHours: 1 },
  { pollutant: 'CO', framework: SCHEDULE_A, averagingHours: 1 },
]

export const noLimitReasons: Record<string, string> = {
  TRS: 'The only official value is 7 ug/m3 over 24 hours. Total reduced sulphur has no single molar mass, so no official ppb value exists.',
  NO: 'No official limit exists for nitric oxide.',
  NOX: 'No official limit exists for nitrogen oxides.',
}

export const unknownLimitReason = 'No limit has been chosen for this pollutant.'
