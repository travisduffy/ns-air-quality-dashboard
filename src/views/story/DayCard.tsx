import type { FabricLayer } from '../../../shared/contract.ts'
import type { StoryData } from './data.ts'
import {
  dayAt,
  formatLongDay,
  formatNumber,
  formatUnit,
  hourDay,
} from './format.ts'
import { useEffect } from 'react'

const DAY_HOURS = 24

const MEASURES: Record<FabricLayer['layer'], string> = {
  pm25: 'the daily average of the hourly fine-particle (PM2.5) readings',
  o3: 'the highest 8-hour average of ground-level ozone (O3) each day',
  trs: 'the count of hours each day with total reduced sulphur at 3 ppb or more',
}

const measureOf = (layer: FabricLayer) => {
  const unit = layer.layer === 'trs' ? '' : `, in ${formatUnit(layer.unit)}`
  const limit =
    layer.limit === null
      ? ''
      : `, against the limit of ${formatNumber(layer.limit)}`
  return `${MEASURES[layer.layer]}${unit}${limit}`
}

const formatValue = (layer: FabricLayer, value: number) =>
  layer.layer === 'trs' ? formatNumber(value) : value.toFixed(1)

type Props = {
  day: number
  layer: FabricLayer
  data: StoryData
  onClose: () => void
}

export const DayCard = ({ day, layer, data, onClose }: Props) => {
  const iso = dayAt(layer.firstDay, day)
  const { values } = data.story
  const { manifest } = data
  const rows = new Map(layer.stations.map(row => [row.station, row]))
  const rowsRead = manifest.datasets.reduce((sum, set) => sum + set.rows, 0)

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A station shows only on the days that it existed, so that a station
  // replaced in 2018 does not read as a gap in 2021.
  const lines = data.stations
    .filter(
      station =>
        rows.has(station.name) &&
        hourDay(station.firstReport) <= iso &&
        iso <= hourDay(station.lastReport)
    )
    .map(station => {
      const row = rows.get(station.name)!
      return {
        station: station.name,
        value: row.values[day],
        hours: row.hours[day],
      }
    })
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        return Number(a.value === null) - Number(b.value === null)
      }
      return b.value - a.value
    })

  return (
    <section
      className="day-card"
      role="dialog"
      aria-labelledby="day-card-date"
      aria-live="polite"
    >
      <h2 id="day-card-date">{formatLongDay(iso)}</h2>
      <p className="day-card-line">
        {iso === values.c4_province_top1_day &&
          `The worst day of the decade for the whole province. ${formatNumber(
            values.c4_province_top1_stations
          )} stations averaged ${values.c4_province_top1_mean.toFixed(1)}.`}
      </p>
      {lines.length === 0 ? (
        <p>No station measured this that day.</p>
      ) : (
        <ul className="day-card-rows">
          {lines.map(line => (
            <li
              key={line.station}
              className={line.value === null ? 'nil' : undefined}
              data-station={line.station}
            >
              <span className="day-card-station">{line.station}</span>
              <span className="day-card-value">
                {line.value === null
                  ? 'Not enough hours that day'
                  : formatValue(layer, line.value)}
                {line.value !== null &&
                  layer.limit !== null &&
                  line.value > layer.limit &&
                  ' ▲ over the limit'}
              </span>
              <span className="day-card-hours">
                {line.hours} of {DAY_HOURS} hours reported
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="day-card-how">
        How we know: each value is {measureOf(layer)}. It comes from{' '}
        {formatNumber(rowsRead)} hourly rows of {manifest.source.name}, fetched{' '}
        {formatLongDay(manifest.fetchedAt.slice(0, 10))}.
      </p>
      <button type="button" className="day-card-close" onClick={onClose}>
        Close
      </button>
    </section>
  )
}
