import { getLayer, getManifest, getStations, getStory } from '../../api.ts'

export type StoryData = Awaited<ReturnType<typeof getStoryData>>

// The view loads its six files in parallel through the typed client, which
// checks each one against its contract.
export const getStoryData = async (signal: AbortSignal) => {
  const [manifest, stations, story, pm25, o3, trs] = await Promise.all([
    getManifest(signal),
    getStations(signal),
    getStory(signal),
    getLayer('pm25', signal),
    getLayer('o3', signal),
    getLayer('trs', signal),
  ])

  // The story measures its worst days against the limit of fine particles.
  if (pm25.limit === null) {
    throw new Error('fabric/pm25.json has no limit')
  }
  return {
    manifest,
    stations,
    story,
    layers: { pm25, o3, trs },
    pm25Limit: pm25.limit,
  }
}
