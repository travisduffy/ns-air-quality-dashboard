import type { SeriesSummary } from '../scripts/derive.ts'
import {
  VERDICT_MARK,
  VERDICT_WORD,
  getSeriesVerdict,
  type Station,
} from './stations.ts'
import { count, hoursText, num, shareText } from './format.ts'

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

// One maximum for all tiles of a pollutant, so that bars compare by length.
export const getScaleMax = (stations: Station[], pollutant: string) => {
  let top = 1
  for (const station of stations) {
    const series = findSeries(station, pollutant)
    const ratio = series === undefined ? null : getPeakRatio(series)
    if (ratio !== null && ratio > top) {
      top = ratio
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
    return `All ${count(judged)} judged ${unit} within the limit.`
  }
  return `${count(over)} of ${count(judged)} judged ${unit} over the limit.`
}

const getPeakText = (series: SeriesSummary) => {
  const verdict = series.verdict
  if (verdict.kind === 'none' || verdict.maxValue === null) {
    return ''
  }

  const percent = Math.round((verdict.maxValue / verdict.limit.value) * 100)
  const limit = `${num(verdict.limit.value)} ${series.unit}`
  const peak = `${num(verdict.maxValue)} ${series.unit}`
  return `Peak ${peak}, ${percent}% of the ${limit} limit.`
}

type FactsProps = { series: SeriesSummary; scaleMax: number }

const Facts = ({ series, scaleMax }: FactsProps) => {
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
      <p className="c-fact">{getJudgedText(series)}</p>
      <div className="c-strip" aria-hidden="true">
        <span style={{ width: `${series.reportedShare * 100}%` }} />
      </div>
      <p className="c-fact">
        {reportedText} of hours reported, {hoursText(series.missing)} missing.
      </p>
    </>
  )
}

type TileProps = {
  station: Station
  pollutant: string
  scaleMax: number
  picked: boolean
  hot: boolean
  onPick: (station: string) => void
  onHot: (station: string | null) => void
}

export const Tile = (props: TileProps) => {
  const { station, pollutant, scaleMax, picked, hot } = props
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
        <Facts series={series} scaleMax={scaleMax} />
      )}
      <p className="c-health">
        Station health {shareText(health.reported, health.expected)}
      </p>
    </article>
  )
}
