import type {
  Overview,
  Outage,
  SeriesReadings,
  SeriesSummary,
} from '../scripts/derive.ts'
import { HOUR_MS, monthStamps, monthsOf, stampMs } from '../scripts/time.ts'
import {
  ChartSkeleton,
  DAILY_HEIGHT,
  DailyChart,
  HourlyChart,
} from './charts.tsx'
import { count, hoursText, num, shareText } from './format.ts'
import type { DashboardData } from './use-dashboard-data.ts'
import { useMemo } from 'react'

type Summary = Overview['stations'][number]

const outageText = (o: Outage | null) =>
  o === null ? 'none' : `${hoursText(o.hours)}, ${o.start} to ${o.end}`

const limitText = (s: SeriesSummary) => {
  const v = s.verdict
  if (v.kind === 'none') {
    return null
  }
  const period =
    v.kind === 'hourly'
      ? '1-hour limit'
      : v.statistic === 'daily mean'
        ? '24-hour limit, on the daily mean'
        : '8-hour limit, on the daily maximum 8-hour average'
  return `${num(v.limit.value)} ${v.limit.unit} ${period}`
}

const Verdict = ({ s }: { s: SeriesSummary }) => {
  const v = s.verdict
  if (v.kind === 'none') {
    return (
      <p className="verdict none" data-verdict="none">
        <strong>No official limit.</strong> {v.reason}
      </p>
    )
  }
  if (v.kind === 'hourly') {
    const over = v.overHours > 0
    const high =
      v.maxValue === null
        ? ''
        : ` The highest hour was ${num(v.maxValue)} ${s.unit} at ${v.maxAt}.`
    return (
      <p
        className={over ? 'verdict over' : 'verdict within'}
        data-verdict={over ? 'over' : 'within'}
      >
        <strong>{over ? 'Over the limit' : 'Within the limit'}:</strong>{' '}
        {over
          ? `${count(v.overHours)} of ${count(v.judgedHours)} reported hours were above ${num(v.limit.value)} ${s.unit}.`
          : `all ${count(v.judgedHours)} reported hours were at or below ${num(v.limit.value)} ${s.unit}.`}
        {high}
      </p>
    )
  }
  const over = v.overDays > 0
  const high =
    v.maxValue === null
      ? ''
      : ` The highest day was ${num(v.maxValue)} ${s.unit} on ${v.maxDay}.`
  const thin =
    v.insufficientDays > 0
      ? ` ${count(v.insufficientDays)} of ${count(v.days)} days had too few readings to judge and are left blank.`
      : ''
  return (
    <p
      className={over ? 'verdict over' : 'verdict within'}
      data-verdict={over ? 'over' : 'within'}
    >
      <strong>{over ? 'Over the limit' : 'Within the limit'}:</strong>{' '}
      {over
        ? `${count(v.overDays)} of ${count(v.judgedDays)} judged days were above ${num(v.limit.value)} ${s.unit}.`
        : `all ${count(v.judgedDays)} judged days were at or below ${num(v.limit.value)} ${s.unit}.`}
      {high}
      {thin}
    </p>
  )
}

const SeriesCard = (props: {
  station: string
  summary: SeriesSummary
  // Undefined while the readings of the station load. The text shows at once,
  // and each chart is a skeleton.
  readings: SeriesReadings | undefined
  start: string | undefined
  domain: { t0: number; t1: number }
  month: string
}) => {
  const { summary: s, readings: r } = props
  const v = s.verdict
  const limit = v.kind === 'none' ? null : v.limit.value
  const lt = limitText(s)
  const limitLabel = lt === null || limit === null ? '' : `limit ${num(limit)}`
  const span = props.month === '' ? 'the whole window' : props.month
  const t0 = props.start === undefined ? 0 : stampMs(props.start)
  const values = r?.values ?? []
  const inRange = values.filter(
    (x, i) =>
      x !== null &&
      t0 + i * HOUR_MS >= props.domain.t0 &&
      t0 + i * HOUR_MS <= props.domain.t1
  ) as number[]
  const lo = inRange.length ? Math.min(...inRange) : null
  const hi = inRange.length ? Math.max(...inRange) : null
  const numbers = `${count(inRange.length)} readings${lo === null ? '' : `, lowest ${num(lo as number)}, highest ${num(hi as number)}`}, ${count(s.missing)} missing hours in the whole window${limit === null ? ', no official limit' : `, limit ${num(limit)} ${s.unit}`}`
  const hourlyLabel = `Hourly ${s.label} at ${props.station} in ${s.unit}, ${span}: ${numbers}. A dark strip below the chart marks each missing hour.`
  const daily = r?.daily
  const longest = s.longestOutage
  return (
    <article className="card" data-series={s.pollutant}>
      <h3>
        {s.label} <span className="unit">({s.unit})</span>
      </h3>
      <Verdict s={s} />
      {lt !== null && v.kind !== 'none' && (
        <p className="meta">
          Limit: {lt}. {v.limit.framework}
          {v.limit.converted ? `, converted to ${s.unit}` : ''}.{' '}
          <a href={v.limit.url} target="_blank" rel="noopener noreferrer">
            Official source
          </a>
        </p>
      )}
      <p className="meta" data-gaps>
        Missing hours: {count(s.missing)} of {count(s.expected)} in{' '}
        {count(s.gapCount)} gaps.{' '}
        {longest === null
          ? 'No gap.'
          : `Longest gap: ${hoursText(longest.hours)}, ${longest.start} to ${longest.end}.`}
      </p>
      {r === undefined && v.kind === 'daily' && (
        <>
          <h4>Daily values ({v.statistic})</h4>
          <ChartSkeleton height={DAILY_HEIGHT} />
          <p className="legend">
            <span className="mk within" aria-hidden="true">
              ●
            </span>{' '}
            within limit{' '}
            <span className="mk over" aria-hidden="true">
              ◆
            </span>{' '}
            over limit{' '}
            <span className="mk blank" aria-hidden="true">
              ▮
            </span>{' '}
            too few readings, no value
          </p>
          <h4>Hourly readings</h4>
          <ChartSkeleton height={110} />
        </>
      )}
      {r === undefined && v.kind !== 'daily' && (
        <>
          <h4>Hourly readings</h4>
          <ChartSkeleton />
        </>
      )}
      {r !== undefined &&
        props.start !== undefined &&
        daily !== undefined &&
        v.kind === 'daily' && (
          <>
            <h4>Daily values ({v.statistic})</h4>
            <DailyChart
              days={daily}
              gaps={r.gaps}
              limit={v.limit.value}
              limitLabel={limitLabel}
              domain={props.domain}
              label={`Daily ${v.statistic} of ${s.label} at ${props.station} in ${s.unit}, ${span}: ${count(v.judgedDays)} judged days, ${count(v.overDays)} over the limit of ${num(v.limit.value)}, ${count(v.insufficientDays)} days with too few readings and no value. A dark strip marks each missing hour.`}
            />
            <p className="legend">
              <span className="mk within" aria-hidden="true">
                ●
              </span>{' '}
              within limit{' '}
              <span className="mk over" aria-hidden="true">
                ◆
              </span>{' '}
              over limit{' '}
              <span className="mk blank" aria-hidden="true">
                ▮
              </span>{' '}
              too few readings, no value
            </p>
            <h4>Hourly readings</h4>
            <HourlyChart
              start={props.start}
              values={r.values}
              gaps={r.gaps}
              limit={null}
              limitLabel=""
              domain={props.domain}
              height={110}
              label={hourlyLabel}
            />
          </>
        )}
      {r !== undefined && props.start !== undefined && daily === undefined && (
        <>
          <h4>Hourly readings</h4>
          <HourlyChart
            start={props.start}
            values={r.values}
            gaps={r.gaps}
            limit={limit}
            limitLabel={limitLabel}
            domain={props.domain}
            label={hourlyLabel}
          />
        </>
      )}
      <p className="legend">
        <span className="mk blank" aria-hidden="true">
          ▮
        </span>{' '}
        strip: each dark mark is a missing hour
      </p>
    </article>
  )
}

export const Readings = (props: { dashboard: DashboardData }) => {
  const { overview, station, setStation, month, setMonth, data, failed } =
    props.dashboard
  const w = overview.window
  const domain = useMemo(() => {
    if (month === '') {
      return { t0: stampMs(w.start), t1: stampMs(w.end) }
    }
    const r = monthStamps(month)
    return {
      t0: Math.max(r.first, stampMs(w.start)),
      t1: Math.min(r.last, stampMs(w.end)),
    }
  }, [month, w.start, w.end])

  const picked = overview.stations.find(s => s.station === station)
  if (picked === undefined) {
    throw new Error(`the overview holds no station ${station}`)
  }
  const ordered = [...picked.series].sort(
    (x, y) =>
      Number(x.verdict.kind === 'none') - Number(y.verdict.kind === 'none')
  )
  return (
    <section
      aria-labelledby="readings-h"
      className="readings"
      aria-busy={data === undefined && failed === null}
    >
      <h2 id="readings-h">Readings</h2>
      <div className="controls">
        <label>
          Station{' '}
          <select
            value={picked.station}
            onChange={e => setStation(e.target.value)}
            data-testid="station-picker"
          >
            {overview.stations.map(s => (
              <option key={s.station}>{s.station}</option>
            ))}
          </select>
        </label>
        <label>
          Show{' '}
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            data-testid="month-picker"
          >
            <option value="">Whole window</option>
            {monthsOf(stampMs(w.start), stampMs(w.end)).map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      {failed !== null && (
        <p className="error">Could not load the readings: {failed}</p>
      )}
      {failed === null &&
        ordered.map(s => {
          const r = data?.series.find(x => x.pollutant === s.pollutant)
          return data !== undefined && r === undefined ? null : (
            <SeriesCard
              key={s.pollutant}
              station={picked.station}
              summary={s}
              readings={r}
              start={data?.start}
              domain={domain}
              month={month}
            />
          )
        })}
    </section>
  )
}

export const Health = (props: {
  stations: Summary[]
  picked: string
  onPick: (s: string) => void
}) => {
  const picked = props.stations.find(s => s.station === props.picked)
  if (picked === undefined) {
    throw new Error(`the overview holds no station ${props.picked}`)
  }
  return (
    <section aria-labelledby="health-h" className="health">
      <h2 id="health-h">Station health</h2>
      <p className="meta">
        Share of hours that reported, over all pollutants of the station, and
        the longest outage of any one pollutant. Tap a row to show that station.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Station</th>
            <th scope="col">Hours reported</th>
            <th scope="col">Longest outage</th>
          </tr>
        </thead>
        <tbody>
          {props.stations.map(s => {
            const h = s.health
            const o = h.longestOutage
            return (
              <tr
                key={s.station}
                data-testid="health-row"
                data-station={s.station}
                className={s.station === props.picked ? 'picked' : ''}
                onClick={() => props.onPick(s.station)}
              >
                <th scope="row">
                  <button
                    type="button"
                    onClick={event => {
                      // The row onClick above also picks the station. Stop the
                      // click here so that it does not pick the station twice.
                      event.stopPropagation()
                      props.onPick(s.station)
                    }}
                    aria-pressed={s.station === props.picked}
                  >
                    {s.station}
                  </button>
                </th>
                <td data-cell="share">{shareText(h.reported, h.expected)}</td>
                <td data-cell="outage">
                  {o === null ? (
                    'none'
                  ) : (
                    <>
                      {hoursText(o.hours)}, {o.pollutant}
                      <br />
                      {o.start} to {o.end}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <details>
        <summary>Numbers per pollutant at {picked.station}</summary>
        <table className="per-series">
          <thead>
            <tr>
              <th scope="col">Pollutant</th>
              <th scope="col">Hours reported</th>
              <th scope="col">Missing</th>
              <th scope="col">Longest outage</th>
            </tr>
          </thead>
          <tbody>
            {picked.series.map(s => (
              <tr key={s.pollutant}>
                <th scope="row">{s.label}</th>
                <td>{shareText(s.reported, s.expected)}</td>
                <td>{count(s.missing)}</td>
                <td>{outageText(s.longestOutage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

export const Footer = () => (
  <footer>
    <p>
      This screen is not live: it shows a fixed window of published data and
      nothing after the data end. It gives no forecast, no health index, and no
      value that the source did not publish. A missing hour is shown as missing.
    </p>
  </footer>
)
