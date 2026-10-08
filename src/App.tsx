import { PROJECT } from '../shared/contract.ts'
import { Screen } from './screen.tsx'
import { useDashboardData } from './use-dashboard-data.ts'

export const App = () => {
  const state = useDashboardData()
  if (state.kind === 'failed') {
    return (
      <main>
        <h1>{PROJECT}</h1>
        <p className="error">Could not load the data: {state.text}</p>
      </main>
    )
  }
  if (state.kind === 'loading') {
    return (
      <main>
        <h1>{PROJECT}</h1>
        <p>Loading…</p>
      </main>
    )
  }
  return <Screen dashboard={state.dashboard} />
}
