import { MapEngine, type PickResult } from '@travisduffy/map-engine'
import {
  BAND_COLORS,
  getBand,
  type Band,
  type Limit,
  type Result,
} from './judge.ts'
import './style.css'

type Station = { name: string; county: string; results: Result[] }

type Summary = {
  year: string
  limits: Limit[]
  notJudged: string[]
  stations: Station[]
}

const POLLUTANTS = ['all', 'PM2.5', 'O3', 'NO2', 'SO2', 'CO']
const OUTSIDE_COLOR = '#dfe3e8'
const SEA_COLOR = '#d6e6f2'
// The bitmap paints the sea white and the land past the map black. Each has
// an entry, so that the engine draws it, but neither is a county.
const BACKDROP = ['ffffff', '000000']
// The engine has no size getter, so the bitmap size is kept here.
const MAP_BBOX = [0, 0, 2047, 1670] as const
const BAND_LABELS = {
  none: 'no station',
  low: 'under half the limit',
  mid: 'half the limit or more',
  over: 'over the limit',
}

const canvas = document.querySelector<HTMLCanvasElement>('#map')!
const tooltip = document.querySelector<HTMLDivElement>('#tooltip')!
const panel = document.querySelector<HTMLElement>('#panel')!
const filters = document.querySelector<HTMLDivElement>('#filters')!
const legend = document.querySelector<HTMLUListElement>('#legend')!

const engine = new MapEngine()

let summary: Summary
let filter = 'all'
let selected: string | null = null
let hovered: string | null = null

const isNovaScotia = (name: string) => name.endsWith(', NS')

const getCountyName = (hexKey: string) =>
  (engine.getSector(hexKey)?.name ?? hexKey).replace(', NS', '')

const getLimit = (id: string) => summary.limits.find(limit => limit.id === id)!

const isKept = (result: Result) =>
  filter === 'all' || getLimit(result.limitId).pollutant === filter

const getStations = (hexKey: string) =>
  summary.stations.filter(station => station.county === hexKey)

// The ratio of the highest averaged reading to its limit, over every station
// and limit of the county that the filter keeps. Null means no reading.
const getRatio = (hexKey: string) => {
  let ratio: number | null = null
  for (const station of getStations(hexKey)) {
    for (const result of station.results) {
      if (!isKept(result) || result.peak === null) continue
      ratio = Math.max(ratio ?? 0, result.peak / getLimit(result.limitId).value)
    }
  }
  return ratio
}

const mixColor = (hex: string, toward: number, amount: number) => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const mixed = channels.map(c => Math.round(c + (toward - c) * amount))
  return `rgb(${mixed.join(',')})`
}

const getColor = (hexKey: string) => {
  if (hexKey === 'ffffff') {
    return SEA_COLOR
  }
  const name = engine.getSector(hexKey)?.name ?? ''
  const base = isNovaScotia(name)
    ? BAND_COLORS[getBand(getRatio(hexKey))]
    : OUTSIDE_COLOR
  if (hexKey === selected) {
    return mixColor(base, 0, 0.35)
  }
  return hexKey === hovered ? mixColor(base, 255, 0.3) : base
}

const paint = () => {
  for (const hexKey of engine.getSectorKeys()) {
    engine.setSectorColor(hexKey, getColor(hexKey))
  }
}

const formatRatio = (ratio: number | null) =>
  ratio === null ? 'no reading' : `${Math.round(ratio * 100)}% of the limit`

const formatPeriod = (hours: number) =>
  hours === 1 ? 'hours' : hours === 8 ? 'days (8-hour)' : 'days'

const renderRanking = () => {
  const counties = [...new Set(summary.stations.map(s => s.county))]
    .map(hexKey => ({ hexKey, ratio: getRatio(hexKey) }))
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1))

  const rows = counties.map(({ hexKey, ratio }) => {
    const band = getBand(ratio)
    return `<li data-county="${hexKey}" data-band="${band}">
      <span class="swatch" style="background:${BAND_COLORS[band]}"></span>
      <span class="name">${getCountyName(hexKey)}</span>
      <span class="value">${formatRatio(ratio)}</span>
    </li>`
  })

  panel.innerHTML = `<h2>Counties with a station</h2>
    <p class="hint">The highest averaged reading of ${summary.year}, as a
    share of its official limit. Select a county for its stations.</p>
    <ol class="ranking">${rows.join('')}</ol>`
}

const renderCounty = (hexKey: string) => {
  const name = engine.getSector(hexKey)?.name ?? hexKey
  if (!isNovaScotia(name)) {
    panel.innerHTML = `<h2>${name}</h2>
      <p class="hint">Outside Nova Scotia. The provincial network has no
      station here.</p>`
    return
  }

  const ratio = getRatio(hexKey)
  const band = getBand(ratio)
  const stations = getStations(hexKey).map(station => {
    const rows = station.results.filter(isKept).map(result => {
      const limit = getLimit(result.limitId)
      const over = result.over > 0 ? ' class="over"' : ''
      return `<tr${over}>
        <td>${limit.pollutant}</td>
        <td>${limit.value} ${limit.unit}, ${limit.hours} h<br />
          <a href="${limit.url}" target="_blank" rel="noreferrer">
          ${limit.framework}</a></td>
        <td>${result.peak ?? '-'}</td>
        <td>${result.over} of ${result.periods} ${formatPeriod(limit.hours)}</td>
      </tr>`
    })
    return `<h3>${station.name}</h3>
      <table>
        <thead><tr><th>Pollutant</th><th>Limit</th><th>Peak</th>
        <th>Over the limit</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`
  })

  panel.innerHTML = `<h2 data-band="${band}">${getCountyName(hexKey)} County</h2>
    <p class="status"><span class="swatch"
      style="background:${BAND_COLORS[band]}"></span>
      ${stations.length ? formatRatio(ratio) : 'No provincial station'}</p>
    ${stations.join('')}
    <button id="back" type="button">All counties</button>`
  panel.querySelector<HTMLButtonElement>('#back')!.onclick = () => select(null)
}

const render = () => {
  paint()
  if (selected) {
    renderCounty(selected)
    return
  }
  renderRanking()
}

const select = (hexKey: string | null) => {
  selected = hexKey
  render()
}

const renderFilters = () => {
  filters.innerHTML = POLLUTANTS.map(
    pollutant => `<button type="button" data-filter="${pollutant}"
      aria-pressed="${pollutant === filter}">
      ${pollutant === 'all' ? 'All pollutants' : pollutant}</button>`
  ).join('')
  for (const button of filters.querySelectorAll<HTMLButtonElement>('button')) {
    button.onclick = () => {
      filter = button.dataset.filter!
      renderFilters()
      render()
    }
  }
}

const renderLegend = () => {
  const bands: Band[] = ['low', 'mid', 'over', 'none']
  legend.innerHTML = bands
    .map(
      band => `<li><span class="swatch"
        style="background:${BAND_COLORS[band]}"></span>${BAND_LABELS[band]}</li>`
    )
    .join('')
}

const onHover = (result: PickResult | null) => {
  const county = result && !BACKDROP.includes(result.hexKey) ? result : null
  if (county?.hexKey === hovered) {
    return
  }
  hovered = county?.hexKey ?? null
  paint()
  if (!county) {
    tooltip.hidden = true
    return
  }

  const name = county.sectorData.name
  const detail = isNovaScotia(name)
    ? getStations(county.hexKey).length
      ? formatRatio(getRatio(county.hexKey))
      : 'no provincial station'
    : 'outside Nova Scotia'
  tooltip.innerHTML = `<strong>${getCountyName(county.hexKey)}</strong>${detail}`
  tooltip.hidden = false
}

const main = async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}summary.json`)
  if (!response.ok) {
    panel.textContent = `failed to load the readings: ${response.status}`
    return
  }
  summary = await response.json()

  engine.on('sectorHover', onHover)
  engine.on('sectorClick', result => {
    if (BACKDROP.includes(result.hexKey)) {
      return
    }
    select(result.hexKey)
  })
  canvas.addEventListener('pointermove', event => {
    tooltip.style.left = `${event.clientX + 14}px`
    tooltip.style.top = `${event.clientY + 14}px`
  })
  canvas.addEventListener('pointerleave', () => onHover(null))

  // The engine keeps its pixel scale on a resize by default. Fit the whole
  // bitmap again on each resize, so a phone shows the whole province.
  engine.fitBounds(MAP_BBOX, { keepOnResize: true })
  await engine.loadMap({
    bitmapUrl: `${import.meta.env.BASE_URL}map.png`,
    definitionUrl: `${import.meta.env.BASE_URL}sectors.json`,
    canvas,
  })

  renderFilters()
  renderLegend()
  render()
  document.body.dataset.state = 'ready'
}

main().catch(error => {
  console.error('dashboard failed to start:', error)
  panel.textContent = `the map failed to load: ${error.message}`
})
