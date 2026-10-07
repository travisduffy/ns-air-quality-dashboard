import type { Highlight } from '../../../shared/contract.ts'
import { useData } from '../../api.ts'
import { Chapters } from './Chapters.tsx'
import { DataOrigin } from './DataOrigin.tsx'
import { DayCard } from './DayCard.tsx'
import { Fabric } from './Fabric.tsx'
import { getStoryData, type StoryData } from './data.ts'
import { dayIndex, formatCountWord } from './format.ts'
import './story.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const FIRST_CHAPTER = 1

const layerOf = (data: StoryData, highlight: Highlight) =>
  data.layers[highlight.layer === 'pm25-hours' ? 'pm25' : highlight.layer]

// The active chapter is the one that crosses the middle line of the screen.
const useActiveChapter = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [chapter, setChapter] = useState(FIRST_CHAPTER)

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setChapter(Number((entry.target as HTMLElement).dataset.chapter))
        }
      },
      { rootMargin: '-50% 0px -50% 0px' }
    )
    for (const element of ref.current!.querySelectorAll('.chapter')) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])

  return [ref, chapter] as const
}

const Story = ({ data }: { data: StoryData }) => {
  const { story, layers } = data
  const [chaptersRef, chapter] = useActiveChapter()
  const highlight = story.chapters[chapter - 1].highlight
  const layer = layerOf(data, highlight)
  const [selected, setSelected] = useState(() =>
    dayIndex(layers.pm25.firstDay, story.values.c4_province_top1_day)
  )
  const [open, setOpen] = useState(false)

  // Every layer keeps the same rows in the same order, so a station never
  // jumps when the chapter changes the layer.
  const stations = useMemo(
    () => [
      ...new Set(
        [layers.pm25, layers.o3, layers.trs].flatMap(each =>
          each.stations.map(row => row.station)
        )
      ),
    ],
    [layers]
  )

  const onOpen = useCallback((day: number) => {
    setSelected(day)
    setOpen(true)
  }, [])

  const onClose = useCallback(() => setOpen(false), [])

  return (
    <main className="story">
      <header className="hero">
        <div className="hero-text">
          <p className="kicker">NOVA SCOTIA, 2016 TO 2025</p>
          <h1>Ten years of the air we breathe</h1>
          <p className="standfirst">
            {formatCountWord(data.stations.length)} stations counted the air
            every hour for a decade. Most days were fine. A few were not. Here
            is what the record shows, and what it cannot.
          </p>
        </div>
        <p className="cue" aria-hidden="true">
          <span className="cue-ring">↓</span>
          Scroll
        </p>
      </header>

      <div className="story-body">
        <div className="fabric-column">
          <Fabric
            chapter={chapter}
            highlight={highlight}
            data={layer}
            stations={stations}
            selected={selected}
            onSelect={setSelected}
            onOpen={onOpen}
            open={open}
          />
        </div>
        <div className="chapters" ref={chaptersRef}>
          <Chapters story={story} limit={data.pm25Limit} />
        </div>
      </div>

      <DataOrigin manifest={data.manifest} />

      {open && (
        <DayCard day={selected} layer={layer} data={data} onClose={onClose} />
      )}
    </main>
  )
}

const StoryView = () => {
  const state = useData(getStoryData)

  if (state.status === 'loading') {
    return (
      <main className="story">
        <p className="story-status">Loading ten years of readings…</p>
      </main>
    )
  }
  if (state.status === 'error') {
    return (
      <main className="story">
        <p className="error" role="alert">
          The data did not load: {state.message}
        </p>
      </main>
    )
  }
  return <Story data={state.data} />
}

// The router imports each view by its default export.
export default StoryView
