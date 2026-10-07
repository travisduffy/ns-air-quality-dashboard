import type { Story } from '../../../shared/contract.ts'
import { formatNumber, formatShortDay, formatDay } from './format.ts'
import type { CSSProperties, ReactNode } from 'react'

type Values = Story['values']
type NumberKey = {
  [K in keyof Values]: Values[K] extends number ? K : never
}[keyof Values]

const TOP_AXIS = 40
const RISE_AXIS = 40
const SMELL_AXIS = 40
const TOP_DAYS = [1, 2, 3, 4] as const
const RISE_STATIONS = [
  'Lake Major',
  'Sydney',
  'Pictou',
  'Port Hawkesbury',
  'Kentville',
  'Aylesford',
] as const
const SMELL_YEARS = [
  2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
] as const
const QUIET_FROM_YEAR = 2020
const PER_DAYS = 1000
// A station-day label ends in a day, YYYY-MM-DD.
const DAY_CHARS = 10

// Each number of the story renders as a <data> element that names its key,
// so a test can hold the page to story.json.
const Num = ({
  values,
  name,
  children,
}: {
  values: Values
  name: NumberKey
  children?: ReactNode
}) => (
  <data value={values[name]} data-key={name}>
    {children ?? formatNumber(values[name])}
  </data>
)

const Chapter = ({
  number,
  title,
  big,
  children,
}: {
  number: number
  title: string
  big: ReactNode
  children: ReactNode
}) => (
  <article className="chapter" data-chapter={number} id={`chapter-${number}`}>
    <p className="chapter-number">{number}</p>
    <h2 className="chapter-title">{title}</h2>
    <p className="chapter-big">{big}</p>
    {children}
  </article>
)

const Bar = ({
  label,
  value,
  axis,
  text,
  accent,
}: {
  label: string
  value: number
  axis: number
  text: ReactNode
  accent?: boolean
}) => (
  <li className="bar-row">
    <span className="bar-label">{label}</span>
    <span className="bar-track">
      <span
        className={accent ? 'bar accent' : 'bar'}
        style={{ width: `${(Math.min(value, axis) / axis) * 100}%` }}
      />
    </span>
    <span className="bar-value">{text}</span>
  </li>
)

export const Chapters = ({ story, limit }: { story: Story; limit: number }) => {
  const { values } = story
  const perThousand = Math.round(
    (values.c14_o3_pm25_station_days_over /
      values.c14_o3_pm25_station_days_judged) *
      PER_DAYS
  )

  return (
    <>
      <Chapter
        number={1}
        title="Almost every day was fine"
        big={
          <>
            <Num values={values} name="c14_o3_pm25_station_days_over" /> of{' '}
            <Num values={values} name="c14_o3_pm25_station_days_judged" />
          </>
        }
      >
        <p className="chapter-body">
          Of <Num values={values} name="c14_o3_pm25_station_days_judged" />{' '}
          station-days checked for ozone and fine particles,{' '}
          <Num values={values} name="c14_o3_pm25_station_days_over" /> went over
          the limit. That is <Num values={values} name="c14_o3_pm25_pct_over" />
          %. The highest sulphur dioxide hour reached{' '}
          <Num values={values} name="c14_SO2_max_pct_of_limit" />% of its limit.
        </p>
        <p className="chapter-caption">
          Days over the limit, out of every {formatNumber(PER_DAYS)} days
          checked: about {perThousand}
        </p>
      </Chapter>

      <Chapter
        number={2}
        title="The worst days"
        big={
          <>
            <Num values={values} name="c4_station_days_gt27" /> days
          </>
        }
      >
        <p className="chapter-body">
          Only <Num values={values} name="c4_station_days_gt27" /> station-days
          in ten years went over the daily limit for fine particles. The worst
          day for the whole province was{' '}
          <data value={values.c4_province_top1_day}>
            {formatDay(values.c4_province_top1_day)}
          </data>
          , when <Num values={values} name="c4_province_top1_stations" />{' '}
          stations averaged <Num values={values} name="c4_province_top1_mean" />
          .
        </p>
        <ol
          className="bars limit-bars"
          aria-label={`The ${values.c4_station_days_gt27} days over ${limit}`}
          style={{ '--limit-share': limit / TOP_AXIS } as CSSProperties}
        >
          {TOP_DAYS.map(rank => {
            const name = `c4_top${rank}_daily_mean` as const
            const label = values[`c4_top${rank}_station_day`]
            const day = label.slice(-DAY_CHARS)
            return (
              <Bar
                key={rank}
                label={`${label.slice(0, -DAY_CHARS - 1)}, ${formatShortDay(day)}`}
                value={values[name]}
                axis={TOP_AXIS}
                text={<Num values={values} name={name} />}
                accent
              />
            )
          })}
          <li className="limit-note" aria-hidden="true">
            daily limit {formatNumber(limit)}
          </li>
        </ol>
      </Chapter>

      <Chapter
        number={3}
        title="June 2023: the smoke"
        big={
          <>
            <Num values={values} name="c2_june2023_rise_Lake Major">
              {Math.round(values['c2_june2023_rise_Lake Major'])}
            </Num>
            % more
          </>
        }
      >
        <p className="chapter-body">
          In June 2023, fine particles at Lake Major averaged{' '}
          <Num values={values} name="c2_june2023_rise_Lake Major">
            {Math.round(values['c2_june2023_rise_Lake Major'])}
          </Num>
          % more than in the other Junes. Sydney, Pictou, and Port Hawkesbury
          were up by about a third. Halifax Johnston sent no reading at all that
          month.
        </p>
        <p className="chapter-caption">
          June 2023 compared with the other Junes
        </p>
        <ul className="bars">
          {RISE_STATIONS.map((station, i) => {
            const name = `c2_june2023_rise_${station}` as const
            return (
              <Bar
                key={station}
                label={station}
                value={values[name]}
                axis={RISE_AXIS}
                text={
                  <>
                    <Num values={values} name={name}>
                      {Math.round(values[name])}
                    </Num>
                    % more
                  </>
                }
                accent={i === 0}
              />
            )
          })}
          {values.c2_halifax_johnston_pm25_june2023_readings === 0 && (
            <li className="bar-row nil">
              <span>Halifax Johnston: no reading sent in June 2023</span>
            </li>
          )}
        </ul>
      </Chapter>

      <Chapter
        number={4}
        title="Pictou: the smell that stopped"
        big={
          <>
            <Num values={values} name="c1_trs_hours_ge3_2016_2019" /> →{' '}
            <Num values={values} name="c1_trs_hours_ge3_2020_2025" />
          </>
        }
      >
        <p className="chapter-body">
          The rotten-egg smell gases at Pictou reached the smell level in{' '}
          <Num values={values} name="c1_trs_hours_ge3_2016_2019" /> hours from
          2016 to 2019, and in{' '}
          <Num values={values} name="c1_trs_hours_ge3_2020_2025" /> hours from
          2020 to 2025. The quiet began in October 2019, before the mill closed
          in early 2020. The data cannot say why.
        </p>
        <p className="chapter-caption">Hours at the smell level, each year</p>
        <ol className="years">
          {SMELL_YEARS.map(year => {
            const name = `c1_trs_hours_ge3_${year}` as const
            return (
              <li key={year} className="year">
                <span className="year-value">
                  <Num values={values} name={name} />
                </span>
                <span
                  className={year >= QUIET_FROM_YEAR ? 'bar accent' : 'bar'}
                  style={{
                    height: `${(values[name] / SMELL_AXIS) * 100}%`,
                  }}
                />
                <span className="year-label">{year}</span>
              </li>
            )
          })}
        </ol>
      </Chapter>

      <Chapter number={5} title="Spring, not summer" big="March">
        <p className="chapter-body">
          Ground-level ozone is highest in March and lowest in September. Most
          people expect summer.
        </p>
        <div className="pair">
          <p className="pair-item accent">
            <Num values={values} name="c3_o3_month_mean_3" />
            <span className="pair-label">March average</span>
          </p>
          <p className="pair-item">
            <Num values={values} name="c3_o3_month_mean_9" />
            <span className="pair-label">September average</span>
          </p>
        </div>
      </Chapter>

      <Chapter
        number={6}
        title="What the record cannot tell us"
        big={
          <>
            <Num values={values} name="c5_pct_total" />%
          </>
        }
      >
        <p className="chapter-body">
          The stations sent <Num values={values} name="c5_pct_total" />% of the
          hours they should have. The gaps cluster: one Halifax monitor was
          silent for{' '}
          <Num
            values={values}
            name="c2_halifax_johnston_pm25_longest_gap_2023_hours"
          />{' '}
          hours from April 2023. A record can also jump when a monitor is
          replaced. Where we know of a gap, we show it.
        </p>
      </Chapter>
    </>
  )
}
