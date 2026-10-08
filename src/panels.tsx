import {
  handoverYear,
  type Handover,
  type Outage,
  type SeriesReadings,
} from '../shared/contract.ts'
import {
  HOUR_MS,
  monthStamps,
  monthsOf,
  stampMs,
  yearStamps,
} from '../shared/time.ts'
import {
  ChartSkeleton,
  DAILY_HEIGHT,
  DailyChart,
  HourlyChart,
} from './charts.tsx'
import { Fabric } from './fabric.tsx'
import { count, hoursText, num, shareText } from './format.ts'
import type { DashboardData } from './use-dashboard-data.ts'
import {
  VERDICT_WORD,
  getHandover,
  getSiteName,
  getYearSite,
} from './stations.ts'
import type { YearSeries, YearStation } from './years.ts'
import { useMemo } from 'react'

type Summary = YearStation

const outageText = (o: Outage | null) =>
  o === null ? 'none' : `${hoursText(o.hours)}, ${o.start} to ${o.end}`

const limitText = (s: YearSeries) => {
  const v = s.verdict
  if (v.kind === 'none') {
    return null
  }
  const period =
    v.kind === 'hourly'
      ? '1-hour'
      : v.statistic === 'daily mean'
        ? '24-hour'
        : '8-hour'
  return `${num(v.limit.value)} ${v.limit.unit}, ${period}`
}

const Verdict = ({ s }: { s: YearSeries }) => {
  const v = s.verdict
  if (v.kind === 'none') {
    return (
      <p className="verdict none" data-verdict="none">
        <strong>No official limit.</strong> {v.reason}
      </p>
    )
  }
  const { verdict, over, judged, unit } = s.judgement
  if (verdict === 'nodata') {
    return (
      <p className="verdict nodata" data-verdict="nodata">
        <strong>{VERDICT_WORD.nodata}.</strong>
      </p>
    )
  }
  const limit = `${num(v.limit.value)} ${s.unit}`
  const statistic = s.metric?.value ?? null
  if (verdict === 'within' && statistic !== null) {
    return (
      <p className="verdict within" data-verdict="within">
        <strong>{VERDICT_WORD.within}:</strong> 3-year statistic{' '}
        {num(statistic)} {s.unit}, limit {limit}.
        {over === 0
          ? ''
          : ` ${count(over)} of ${count(judged)} ${unit} above ${limit}.`}
      </p>
    )
  }
  const when = v.kind === 'hourly' ? `at ${v.maxAt}` : `on ${v.maxDay}`
  const high =
    v.maxValue === null ? '' : ` Highest: ${num(v.maxValue)} ${s.unit} ${when}.`
  return (
    <p className={`verdict ${verdict}`} data-verdict={verdict}>
      <strong>{VERDICT_WORD[verdict]}:</strong>{' '}
      {verdict === 'over'
        ? `${count(over)} of ${count(judged)} ${unit} above ${limit}.`
        : `All ${count(judged)} ${unit} at or below ${limit}.`}
      {high}
    </p>
  )
}

export const HandoverNote = (props: {
  handover: Handover
  years: number[]
}) => {
  const { handover, years } = props
  const since = handoverYear(handover)
  const before = years.filter(y => y < since)
  const after = years.filter(y => y >= since)
  const span = (list: number[]) =>
    list.length === 1
      ? `${list[0]}`
      : `${list[0]}\u2013${list[list.length - 1]}`
  return (
    <aside className="c-handover-note" data-testid="c-handover-note">
      <p>
        <strong>Two sites report as {handover.name}.</strong>{' '}
        {before.length > 0 && `${span(before)} come from the earlier site, `}
        {after.length > 0 &&
          `${span(after)} from the ${getSiteName(handover, handover.newSite)} site. `}
        Each year shows the figures of the site that measured it.
      </p>
      {handover.reason !== null && (
        <p>
          {handover.reason.text} Source: {handover.reason.source}.
        </p>
      )}
    </aside>
  )
}

const SeriesCard = (props: {
  station: string
  site: string | null
  summary: YearSeries
  readings: SeriesReadings | undefined
  start: string | undefined
  domain: { t0: number; t1: number }
  month: string
  year: number
}) => {
  const { summary: s, readings: r } = props
  const v = s.verdict
  const limit = v.kind === 'none' ? null : v.limit.value
  const lt = limitText(s)
  const limitLabel = lt === null || limit === null ? '' : `limit ${num(limit)}`
  const span = props.month === '' ? String(props.year) : props.month
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
  const numbers = `${count(inRange.length)} readings${lo === null ? '' : `, lowest ${num(lo as number)}, highest ${num(hi as number)}`}, ${count(s.missing)} missing hours in ${props.year}${limit === null ? ', no official limit' : `, limit ${num(limit)} ${s.unit}`}`
  const place =
    props.site === null ? props.station : `${props.station}, ${props.site} site`
  const hourlyLabel = `Hourly ${s.label} at ${place} in ${s.unit}, ${span}: ${numbers}. A dark strip below the chart marks each missing hour.`
  const daily = r?.daily
  const longest = s.longestOutage
  return (
    <article className="card" data-series={s.pollutant}>
      <h3>
        {s.label} <span className="unit">({s.unit})</span>
      </h3>
      {props.site !== null && (
        <p className="meta c-site" data-testid="c-site">
          Measured at the {props.site} site.
        </p>
      )}
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
        Missing hours: {count(s.missing)} of {count(s.expected)}.
        {longest !== null && ` Longest gap: ${hoursText(longest.hours)}.`}
      </p>
      {s.reported === 0 && (
        <p className="meta" data-testid="no-readings">
          No readings in {props.year}.
        </p>
      )}
      {s.reported > 0 && r === undefined && v.kind === 'daily' && (
        <>
          <h4>Daily values</h4>
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
            too few readings
          </p>
          <h4>Hourly readings</h4>
          <ChartSkeleton height={110} />
        </>
      )}
      {s.reported > 0 && r === undefined && v.kind !== 'daily' && (
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
            <h4>Daily values</h4>
            <DailyChart
              days={daily}
              gaps={r.gaps}
              limit={v.limit.value}
              limitLabel={limitLabel}
              domain={props.domain}
              label={`Daily ${v.statistic} of ${s.label} at ${place} in ${s.unit}, ${span}: ${count(v.judgedDays)} judged days, ${count(v.overDays)} over the limit of ${num(v.limit.value)}, ${count(v.insufficientDays)} days with too few readings and no value. A dark strip marks each missing hour.`}
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
              too few readings
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
      {s.reported > 0 && (
        <p className="legend">
          <span className="mk blank" aria-hidden="true">
            ▮
          </span>{' '}
          dark strip: missing hours
        </p>
      )}
    </article>
  )
}

type MissingProps = {
  station: string
  label: string
  measured: YearSeries[]
  onPollutant: (code: string) => void
}

const Missing = ({ station, label, measured, onPollutant }: MissingProps) => (
  <div className="c-missing" data-testid="c-missing">
    <p>
      {station} does not measure {label}. It measures:
    </p>
    <ul>
      {measured.map(s => (
        <li key={s.pollutant}>
          <button
            type="button"
            className="c-link"
            onClick={() => onPollutant(s.pollutant)}
          >
            {s.pollutant}, {s.label}
          </button>
        </li>
      ))}
    </ul>
  </div>
)

export const Readings = (props: {
  dashboard: DashboardData
  pollutant: string | null
  onPollutant: (code: string) => void
}) => {
  const {
    overview,
    year,
    setYear,
    stations,
    station,
    setStation,
    month,
    setMonth,
    data,
    failed,
  } = props.dashboard
  const range = yearStamps(year)
  const domain = useMemo(() => {
    if (month === '') {
      return { t0: range.first, t1: range.last }
    }
    const r = monthStamps(month)
    return {
      t0: Math.max(r.first, range.first),
      t1: Math.min(r.last, range.last),
    }
  }, [month, range.first, range.last])

  const picked = stations.find(s => s.station === station)
  if (picked === undefined) {
    throw new Error(`the overview holds no station ${station}`)
  }
  const handover = getHandover(overview, picked.station)
  const site = handover === null ? null : getYearSite(handover, year)
  const rank = (s: YearSeries) => (s.verdict.kind === 'none' ? 1 : 0)
  const shown =
    props.pollutant === null
      ? picked.series
      : picked.series.filter(s => s.pollutant === props.pollutant)
  const ordered = [...shown].sort((x, y) => rank(x) - rank(y))
  const label =
    overview.pollutants.find(p => p.code === props.pollutant)?.label ?? ''
  return (
    <section
      aria-labelledby="readings-h"
      className="readings"
      aria-busy={data === undefined && failed === null}
    >
      {props.pollutant !== null && shown.length > 0 && (
        <Fabric
          station={picked.station}
          pollutant={props.pollutant}
          label={label}
          years={overview.years}
          year={year}
          handover={handover}
          onYear={setYear}
        />
      )}
      <h2 id="readings-h">Readings, {year}</h2>
      <div className="controls">
        <label>
          Station{' '}
          <select
            value={picked.station}
            onChange={e => setStation(e.target.value)}
            data-testid="station-picker"
          >
            {stations.map(s => (
              <option key={s.station}>{s.station}</option>
            ))}
          </select>
        </label>
        <label>
          Year{' '}
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            data-testid="readings-year-picker"
          >
            {overview.years.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
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
            <option value="">Whole year</option>
            {monthsOf(range.first, range.last).map(m => (
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
      {props.pollutant !== null && shown.length === 0 && (
        <Missing
          station={picked.station}
          label={label}
          measured={picked.series}
          onPollutant={props.onPollutant}
        />
      )}
      {failed === null &&
        ordered.map(s => {
          const r = data?.series.find(x => x.pollutant === s.pollutant)
          return data !== undefined &&
            r === undefined &&
            s.reported > 0 ? null : (
            <SeriesCard
              key={s.pollutant}
              station={picked.station}
              site={site}
              summary={s}
              readings={r}
              start={data?.start}
              domain={domain}
              month={month}
              year={year}
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
        Share of hours reported. Tap a row to pick a station.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Station</th>
            <th scope="col">Share</th>
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
        <summary>Per pollutant</summary>
        <table className="per-series">
          <thead>
            <tr>
              <th scope="col">Pollutant</th>
              <th scope="col">Share</th>
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
      This screen is not live. It shows historical hourly readings, one checked
      year at a time. A missing hour is shown as missing.
    </p>
  </footer>
)
