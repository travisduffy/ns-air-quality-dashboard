import type { Manifest } from '../../../shared/contract.ts'
import { formatLongDay, formatNumber } from './format.ts'

const BYTES_PER_KB = 1024

// Every dataset name reads "... Ambient <pollutant> Hourly Data <station>".
// The table groups the datasets by pollutant and names each by its station.
const NAME_PARTS = /Ambient (.+) Hourly Data (.+)$/
const OTHER_GROUP = 'Other'

type Dataset = Manifest['datasets'][number]

const groupByPollutant = (datasets: Dataset[]) => {
  const groups = new Map<string, { label: string; set: Dataset }[]>()
  for (const set of datasets) {
    const match = NAME_PARTS.exec(set.name)
    const pollutant = match?.[1] ?? OTHER_GROUP
    const label = match?.[2] ?? set.name
    groups.set(pollutant, [...(groups.get(pollutant) ?? []), { label, set }])
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pollutant, rows]) => ({
      pollutant,
      rows: rows.sort((a, b) => a.label.localeCompare(b.label)),
    }))
}

const formatKb = (bytes: number) =>
  `${formatNumber(Math.round(bytes / BYTES_PER_KB))} KB`

// The block answers "how did the data get in" from the manifest alone. The
// checksums of the published files fold behind one click, because on a phone
// they are most of its length.
export const DataOrigin = ({ manifest }: { manifest: Manifest }) => {
  const { source, datasets, files } = manifest
  const rows = datasets.reduce((sum, set) => sum + set.rows, 0)
  const empty = datasets.filter(set => set.rows === 0).length
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  const fetched = formatLongDay(manifest.fetchedAt.slice(0, 10))

  return (
    <section className="origin" aria-labelledby="origin-title">
      <h2 id="origin-title">How the data got in</h2>
      <ol className="origin-steps">
        <li>
          <strong>Fetched.</strong> {formatNumber(datasets.length)} datasets of{' '}
          {source.name}, from{' '}
          <a href={source.site} rel="noreferrer">
            {source.site.replace(/^https?:\/\//, '')}
          </a>
          , on {fetched}. Each raw file is kept as it came, with its SHA-256.
        </li>
        <li>
          <strong>Checked.</strong> {formatNumber(rows)} hourly rows, each
          parsed and validated before any number uses it.
          {empty > 0 &&
            ` ${formatNumber(empty)} datasets hold no rows at the source, and they stay listed.`}
        </li>
        <li>
          <strong>Derived.</strong> The daily values, the hours reported, and
          every number of the story come from pure functions over those rows.
        </li>
        <li>
          <strong>Published.</strong> {formatNumber(files.length)} files and
          this manifest, {formatKb(bytes)} in all, each with its SHA-256.
        </li>
        <li>
          <strong>Loaded.</strong> This page checks each file against its
          contract before it draws a thread.
        </li>
      </ol>

      <div className="origin-table">
        <table>
          <caption>
            The {formatNumber(datasets.length)} datasets of {source.name}, as
            fetched
          </caption>
          <thead>
            <tr>
              <th scope="col">Dataset</th>
              <th scope="col">Rows</th>
              <th scope="col">SHA-256</th>
            </tr>
          </thead>
          {groupByPollutant(datasets).map(({ pollutant, rows }) => (
            <tbody key={pollutant}>
              <tr className="origin-group">
                <th scope="rowgroup" colSpan={3}>
                  {pollutant}
                </th>
              </tr>
              {rows.map(({ label, set }) => (
                <tr key={set.id}>
                  <th scope="row">
                    {label} <span className="origin-id">{set.id}</span>
                  </th>
                  <td className="number">{formatNumber(set.rows)}</td>
                  <td>
                    {set.rows === 0 ? 'no rows' : <code>{set.sha256}</code>}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <details className="origin-checksums">
        <summary>Show the checksums</summary>
        <div className="origin-table">
          <table>
            <caption>The files this page reads</caption>
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Size</th>
                <th scope="col">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {files.map(file => (
                <tr key={file.path}>
                  <th scope="row">
                    <code>{file.path}</code>
                  </th>
                  <td className="number">{formatKb(file.bytes)}</td>
                  <td>
                    <code>{file.sha256}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="origin-source">
        Source: {source.name}, {source.licence}. Every number on this page was
        computed two ways and the two agree. Causes such as wildfire smoke or a
        mill closure come from the news, not from the data.
      </p>
    </section>
  )
}
