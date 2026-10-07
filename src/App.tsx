import { Suspense, lazy, useSyncExternalStore } from 'react'
import StoryView from './views/story/StoryView.tsx'

// The coverage view carries the map engine, so it loads only on its route.
const CoverageView = lazy(() => import('./views/coverage/CoverageView.tsx'))

const STORY_HASH = '#/'
const COVERAGE_HASH = '#/coverage'

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

// A visit with no hash opens the story.
const readHash = () => window.location.hash || STORY_HASH

const View = ({ hash }: { hash: string }) => {
  if (hash === STORY_HASH) {
    return <StoryView />
  }
  if (hash === COVERAGE_HASH) {
    return (
      <Suspense fallback={<p>Loading…</p>}>
        <CoverageView />
      </Suspense>
    )
  }
  return (
    <main>
      <p className="error">There is no page at {hash}.</p>
    </main>
  )
}

export const App = () => {
  const hash = useSyncExternalStore(subscribe, readHash)
  return (
    <>
      <nav aria-label="Views">
        <a
          href={STORY_HASH}
          aria-current={hash === STORY_HASH ? 'page' : undefined}
        >
          The story
        </a>
        <a
          href={COVERAGE_HASH}
          aria-current={hash === COVERAGE_HASH ? 'page' : undefined}
        >
          Coverage
        </a>
      </nav>
      <View hash={hash} />
    </>
  )
}
