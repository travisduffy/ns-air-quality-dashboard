import { useEffect, useState } from 'react'
import {
  parseFabricLayer,
  parseManifest,
  parseStations,
  parseStory,
  type FabricLayer,
} from '../shared/contract.ts'

export type DataState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

// The build writes the data as static files, so every path is relative to the
// base path of the site.
const getJson = async <T>(path: string, signal?: AbortSignal) => {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal })
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`)
  }
  return (await response.json()) as T
}

// Each file passes its guard in shared/contract.ts at the browser boundary,
// the same guard that the pipeline ran before it wrote the file.
const getData = async <T>(
  path: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal
) => parse(await getJson<unknown>(`data/${path}`, signal))

export const getManifest = (signal?: AbortSignal) =>
  getData('manifest.json', parseManifest, signal)

export const getStations = (signal?: AbortSignal) =>
  getData('stations.json', parseStations, signal)

export const getStory = (signal?: AbortSignal) =>
  getData('story.json', parseStory, signal)

export const getLayer = async (
  layer: FabricLayer['layer'],
  signal?: AbortSignal
) => {
  const found = await getData(`fabric/${layer}.json`, parseFabricLayer, signal)
  if (found.layer !== layer) {
    throw new Error(`fabric/${layer}.json holds the layer ${found.layer}`)
  }
  return found
}

// Run one load for the life of a component and give back its state. Pass a
// function that keeps its identity across renders, such as one at module
// level, or the load runs again on each render.
export const useData = <T>(load: (signal: AbortSignal) => Promise<T>) => {
  const [state, setState] = useState<DataState<T>>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    load(controller.signal)
      .then(data => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        console.error('data load failed:', error)
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => controller.abort()
  }, [load])

  return state
}
