import { PROJECT } from '../shared/contract.ts'
import './map.css'
import './screen.css'
import { useEffect, useState, type CSSProperties } from 'react'

// A fast load shows no skeleton: it appears only after this wait.
export const SKELETON_DELAY = 200
// The box of the Nova Scotia map, so the frame keeps its size on load.
export const MAP_ASPECT = '1689 / 1360'

const TILES = 8
const POLLUTANTS = 8

export const useDelayed = (ms = SKELETON_DELAY) => {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return shown
}

type BoneProps = {
  className?: string
  style?: CSSProperties
  pending?: boolean
}

export const Bone = ({ className, style, pending }: BoneProps) => (
  <span
    className={['skeleton', className].join(' ').trim()}
    style={style}
    aria-hidden="true"
    data-skeleton
    data-pending={pending || undefined}
  />
)

const TileSkeleton = () => (
  <div className="c-tile sk-tile" aria-hidden="true">
    <Bone className="sk-line" style={{ width: '60%', height: 18 }} />
    <Bone className="sk-line" style={{ width: '50%' }} />
    <Bone style={{ height: 12 }} />
    <Bone className="sk-line" style={{ width: '85%' }} />
    <Bone className="sk-line" style={{ width: '70%' }} />
    <Bone style={{ height: 8 }} />
    <Bone className="sk-line" style={{ width: '65%' }} />
    <Bone className="sk-years" />
    <Bone className="sk-line sk-health" style={{ width: '55%' }} />
  </div>
)

export const MapSkeleton = () => (
  <div className="map-view" data-ready="false" data-loading="map" aria-busy>
    <div className="map-frame" style={{ aspectRatio: MAP_ASPECT }}>
      <Bone className="sk-fill" />
    </div>
    <p className="legend" aria-hidden="true">
      <Bone className="sk-line" style={{ width: 'min(420px, 100%)' }} />
      <Bone className="sk-line" style={{ width: 200 }} />
    </p>
  </div>
)

export const ShellSkeleton = () => {
  const shown = useDelayed()
  return (
    <main
      className="c-page sk-shell"
      aria-busy
      data-loading="shell"
      data-pending={!shown || undefined}
    >
      <p className="sr-only" role="status">
        Loading the dashboard
      </p>
      <header className="c-top" data-loading="header">
        <div className="c-title">
          <h1>{PROJECT}</h1>
          <p aria-hidden="true">
            <Bone className="sk-line sk-subtitle" />
          </p>
        </div>
        <div className="c-year" aria-hidden="true">
          <span>Year</span>
          <Bone className="sk-select" />
        </div>
        <div className="c-pollutants" aria-hidden="true">
          <div className="c-select">
            <span>Pollutant</span>
            <Bone className="sk-select" />
          </div>
          <div className="c-buttons">
            {Array.from({ length: POLLUTANTS }, (_, i) => (
              <Bone key={i} className="sk-pill" />
            ))}
          </div>
        </div>
      </header>
      <div className="c-panel">
        <section className="c-grid" data-loading="tiles" aria-hidden="true">
          <Bone className="sk-heading" />
          <Bone className="sk-line" style={{ width: '90%' }} />
          <Bone className="sk-line sk-note" style={{ width: '60%' }} />
          <div className="c-tiles">
            {Array.from({ length: TILES }, (_, i) => (
              <TileSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
      <div className="c-map">
        <MapSkeleton />
      </div>
    </main>
  )
}
