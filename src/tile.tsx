import {
  handoverYear,
  judgedVerdict,
  worstVerdict,
  type Handover,
  type VerdictState,
} from '../shared/contract.ts'
import { count, num, shareText } from './format.ts'
import {
  VERDICT_MARK,
  VERDICT_WORD,
  getSinceText,
  type Station,
} from './stations.ts'
import type { YearPoint, YearSeries } from './years.ts'

const SCALE_HEADROOM = 1.1

export const findSeries = (station: Station, pollutant: string) =>
  station.series.find(s => s.pollutant === pollutant)

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

const getJudgedText = (series: YearSeries) => {
  if (series.verdict.kind === 'none') {
    return series.verdict.reason
  }

  const { over, judged, unit } = series.judgement
  if (over === 0) {
    return `All ${count(judged)} ${unit} within the limit.`
  }
  return `${count(over)} of ${count(judged)} ${unit} above the limit`
}

const getPeakText = (series: YearSeries) => {
  const verdict = series.verdict
  const ratio = series.judgement.ratio
  if (verdict.kind === 'none' || verdict.maxValue === null || ratio === null) {
    return ''
  }

  const percent = Math.round(ratio * 100)
  const peak = `${num(verdict.maxValue)} ${series.unit}`
  return `Peak ${peak} (${percent}% of limit)`
}

const getPointText = (point: YearPoint) => {
  if (point.verdict === 'nodata') {
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
  handover: Handover | null
}

const YearStrip = ({ points, year, scaleMax, handover }: YearStripProps) => {
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
          const state = point.verdict === 'nodata' ? 'missing' : point.verdict
          const since =
            handover !== null &&
            point.year === handoverYear(handover) &&
            point !== points[0]
          return (
            <li
              key={point.year}
              className={point.year === year ? 'on' : ''}
              data-year={point.year}
              data-state={state}
              data-since={since ? '' : undefined}
              title={since ? `${text}. ${getSinceText(handover)}` : text}
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

const VerdictLine = ({ verdict }: { verdict: VerdictState }) => (
  <p className="c-verdict">
    <span className="c-mark" aria-hidden="true">
      {VERDICT_MARK[verdict]}
    </span>{' '}
    <strong>{VERDICT_WORD[verdict]}</strong>
  </p>
)

export const getAllVerdict = (station: Station) =>
  worstVerdict(
    station.series.map(s =>
      judgedVerdict(station.verdicts[s.pollutant], s.reported)
    )
  )

export const getAllText = (station: Station) => {
  const verdicts = Object.entries(station.verdicts)
  const over = verdicts.filter(([, verdict]) => verdict === 'over')
  const within = verdicts.filter(([, verdict]) => verdict === 'within')
  const parts = []
  if (over.length > 0) {
    parts.push(`${over.map(([code]) => code).join(', ')} over`)
  }
  if (within.length > 0) {
    parts.push(`${within.length} within`)
  }
  return parts.length === 0 ? 'No pollutant judged' : parts.join(' · ')
}

type FactsProps = {
  series: YearSeries
  scaleMax: number
  year: number
  handover: Handover | null
}

const Facts = ({ series, scaleMax, year, handover }: FactsProps) => {
  const { verdict, ratio } = series.judgement
  const fill = ratio === null ? 0 : Math.min(ratio / scaleMax, 1) * 100
  const reportedText = shareText(series.reported, series.expected)

  return (
    <>
      <VerdictLine verdict={verdict} />
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
      <YearStrip
        points={series.points}
        year={year}
        scaleMax={scaleMax}
        handover={handover}
      />
    </>
  )
}

type TileProps = {
  station: Station
  handover: Handover | null
  pollutant: string | null
  year: number
  scaleMax: number
  picked: boolean
  hot: boolean
  onPick: (station: string) => void
  onHot: (station: string | null) => void
}

export const Tile = (props: TileProps) => {
  const { station, handover, pollutant, year, scaleMax, picked, hot } = props
  const series = pollutant === null ? undefined : findSeries(station, pollutant)
  const verdict =
    pollutant === null ? getAllVerdict(station) : station.verdicts[pollutant]
  const health = station.health
  const classes = ['c-tile', picked ? 'picked' : '', hot ? 'hot' : '']

  return (
    <article
      className={classes.join(' ').trim()}
      data-testid="c-tile"
      data-station={station.station}
      data-verdict={verdict}
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
      {handover !== null && (
        <p className="c-handover" data-testid="c-handover">
          {getSinceText(handover)}
        </p>
      )}
      {pollutant === null ? (
        <>
          <VerdictLine verdict={verdict} />
          <p className="c-fact" data-testid="c-all-line">
            {verdict === 'nodata'
              ? `No readings in ${year}.`
              : getAllText(station)}
          </p>
        </>
      ) : series === undefined ? (
        <p className="c-verdict">Not measured at this station.</p>
      ) : (
        <Facts
          series={series}
          scaleMax={scaleMax}
          year={year}
          handover={handover}
        />
      )}
      <p className="c-health">
        Station health {shareText(health.reported, health.expected)}
      </p>
    </article>
  )
}
