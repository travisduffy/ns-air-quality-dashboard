import type { SeriesSummary } from '../scripts/derive.ts'
import {
  VERDICT_MARK,
  VERDICT_WORD,
  getSeriesVerdict,
  type Station,
} from './stations.ts'
import { count, num, shareText } from './format.ts'
import type { YearPoint, YearSeries } from './years.ts'

// Room above the limit tick, so that a peak above the limit stays on the bar.
const SCALE_HEADROOM = 1.1

export const findSeries = (station: Station, pollutant: string) =>
  station.series.find(s => s.pollutant === pollutant)

// The highest value as a share of the limit, or null when there is none.
const getPeakRatio = (series: SeriesSummary) => {
  const verdict = series.verdict
  if (verdict.kind === 'none' || verdict.maxValue === null) {
    return null
  }

  return verdict.maxValue / verdict.limit.value
}

// One maximum for all tiles and all years of a pollutant, so that bars compare
// by length, and the bar of a year matches the cell of that year in the strip.
export const getScaleMax = (stations: Station[], pollutant: string) => {
  let top = 1
  for (const station of stations) {
    const series = findSeries(station, pollutant)
    for (const point of series?.points ?? []) {
      if (point.ratio !== null && point.ratio > top) {
        top = point.ratio
      }
    }
  }
  return top * SCALE_HEADROOM
}

const getJudgedText = (series: SeriesSummary) => {
  const verdict = series.verdict
  if (verdict.kind === 'none') {
    return verdict.reason
  }

  const unit = verdict.kind === 'hourly' ? 'hours' : 'days'
  const judged =
    verdict.kind === 'hourly' ? verdict.judgedHours : verdict.judgedDays
  const over = verdict.kind === 'hourly' ? verdict.overHours : verdict.overDays
  if (over === 0) {
    return `All ${count(judged)} ${unit} within the limit.`
  }
  return `${count(over)} of ${count(judged)} ${unit} over the limit.`
}

const getPeakText = (series: SeriesSummary) => {
  const verdict = series.verdict
  if (verdict.kind === 'none' || verdict.maxValue === null) {
    return ''
  }

  const percent = Math.round((verdict.maxValue / verdict.limit.value) * 100)
  const peak = `${num(verdict.maxValue)} ${series.unit}`
  return `Peak ${peak} (${percent}% of limit)`
}

const getPointText = (point: YearPoint) => {
  if (point.reported === 0) {
    return `${point.year}: no readings`
  }
  if (point.ratio === null) {
    return `${point.year}: no official limit`
  }
  return `${point.year}: peak ${Math.round(point.ratio * 100)}% of the limit`
}

type YearStripProps = {
  points: YearPoint[]
  year: number
  scaleMax: number
}

// One cell for each year. The height is the yearly peak as a share of the
// limit, on the scale of the bar above. A year with no reading is an empty,
// dashed cell, never a zero.
const YearStrip = ({ points, year, scaleMax }: YearStripProps) => {
  const first = points[0]?.year
  const last = points[points.length - 1]?.year
  return (
    <div className="c-years">
      <ol
        aria-label={`Yearly peak as a share of the limit, ${first} to ${last}`}
      >
        {points.map(point => {
          const text = getPointText(point)
          const height =
            point.ratio === null ? 0 : Math.min(point.ratio / scaleMax, 1) * 100
          const state =
            point.reported === 0
              ? 'missing'
              : point.ratio === null
                ? 'none'
                : point.ratio > 1
                  ? 'over'
                  : 'within'
          return (
            <li
              key={point.year}
              className={point.year === year ? 'on' : ''}
              data-year={point.year}
              data-state={state}
              title={text}
            >
              <span className="c-year-bar" aria-hidden="true">
                <span style={{ height: `${height}%` }} />
              </span>
              <span className="sr-only">{text}</span>
            </li>
          )
        })}
      </ol>
      <p className="c-years-ends" aria-hidden="true">
        <span>{first}</span>
        <span>{last}</span>
      </p>
    </div>
  )
}

type FactsProps = { series: YearSeries; scaleMax: number; year: number }

const Facts = ({ series, scaleMax, year }: FactsProps) => {
  const verdict = getSeriesVerdict(series)
  const ratio = getPeakRatio(series)
  const fill = ratio === null ? 0 : Math.min(ratio / scaleMax, 1) * 100
  const reportedText = shareText(series.reported, series.expected)

  return (
    <>
      <p className="c-verdict">
        <span className="c-mark" aria-hidden="true">
          {VERDICT_MARK[verdict]}
        </span>{' '}
        <strong>{VERDICT_WORD[verdict]}</strong>
      </p>
      <div className="c-track" aria-hidden="true">
        <span className="c-fill" style={{ width: `${fill}%` }} />
        {ratio !== null && (
          <span className="c-limit" style={{ left: `${100 / scaleMax}%` }} />
        )}
      </div>
      <p className="c-fact">{getPeakText(series)}</p>
      <p className="c-fact">
        {series.reported === 0
          ? `No readings in ${year}.`
          : getJudgedText(series)}
      </p>
      <div className="c-strip" aria-hidden="true">
        <span style={{ width: `${series.reportedShare * 100}%` }} />
      </div>
      <p className="c-fact">{reportedText} of hours reported</p>
      <YearStrip points={series.points} year={year} scaleMax={scaleMax} />
    </>
  )
}

type TileProps = {
  station: Station
  pollutant: string
  year: number
  scaleMax: number
  picked: boolean
  hot: boolean
  onPick: (station: string) => void
  onHot: (station: string | null) => void
}

export const Tile = (props: TileProps) => {
  const { station, pollutant, year, scaleMax, picked, hot } = props
  const series = findSeries(station, pollutant)
  const health = station.health
  const classes = ['c-tile', picked ? 'picked' : '', hot ? 'hot' : '']

  return (
    <article
      className={classes.join(' ').trim()}
      data-testid="c-tile"
      data-station={station.station}
      data-verdict={series === undefined ? 'absent' : getSeriesVerdict(series)}
      onPointerEnter={() => props.onHot(station.station)}
      onPointerLeave={() => props.onHot(null)}
      onFocus={() => props.onHot(station.station)}
      onBlur={() => props.onHot(null)}
    >
      <h3>
        <button
          type="button"
          className="c-tile-pick"
          aria-pressed={picked}
          onClick={() => props.onPick(station.station)}
        >
          {station.station}
        </button>
      </h3>
      {series === undefined ? (
        <p className="c-verdict">Not measured at this station.</p>
      ) : (
        <Facts series={series} scaleMax={scaleMax} year={year} />
      )}
      <p className="c-health">
        Station health {shareText(health.reported, health.expected)}
      </p>
    </article>
  )
}
