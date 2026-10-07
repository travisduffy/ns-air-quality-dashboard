# Nova Scotia Air Quality Dashboard

Ten years of hourly air quality readings from the provincial monitoring stations of Nova Scotia, 2016 to 2025, from [Nova Scotia Open Data](https://data.novascotia.ca). The site has two views:

1. **The story** (`#/`): six short chapters over one chart, the fabric. The fabric draws one thread per station and one column per day, 3,653 days. Each chapter lights one part of it: the days over a limit, the four worst days for fine particles, the wildfire smoke of June 2023, the smell at Pictou, the ozone of spring and autumn, and the gaps in the record. A click, a tap, or Enter on the fabric opens the values of every station for that day. The last block, "How the data got in", lists every dataset, row count, file, and SHA-256 from the manifest.
2. **Coverage** (`#/coverage`): a map of the counties of Nova Scotia. A click on a county lists each station in it, its last report, and how long it reported. The map uses [map-engine](https://github.com/travisduffy/map-engine), vendored in `vendor/map-engine/`.

## Why

Nova Scotia publishes a lot of open data, and I wanted to build something with it. The air quality data stood out - stations across NS measure the air every hour, and the province publishes the checked readings each year for anyone to download. Air quality affects everyone who breathes (that's pretty much everyone!), so this data deserves a clear picture.

## Run it

Node 24 runs the TypeScript scripts directly, with no build step.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000/ns-air-quality-dashboard/`. The data files in `public/data/` are committed, so the site runs with no download.

## How the data gets in

Each stage does one job, and each stage fails at once on bad input. Only the fetch makes a request to the source.

```
data.novascotia.ca
  │ fetch    scripts/fetch.ts      raw pages, unchanged, + data/fetch-record.json (URL, time, HTTP status, rows, bytes, SHA-256)
  ▼
data/raw/ (gitignored, about 391 MB)
  │ load     scripts/load.ts       each file against its SHA-256 in the record, each row parsed and validated
  ▼
  │ derive   scripts/coverage.ts   pure functions: first and last report and coverage of each station
  │          scripts/fabric.ts     the daily value and the hours reported, per station, per layer
  │          scripts/story.ts      every number and highlight of the six chapters
  ▼
  │ emit     scripts/publish.ts    sorted keys, written to a temporary file and renamed into place
  │          scripts/manifest.ts   the manifest last: each dataset and each file, with bytes and SHA-256
  ▼
public/data/  manifest.json, stations.json, story.json, fabric/pm25.json, fabric/o3.json, fabric/trs.json
  │ client   src/api.ts            fetch, then the guard of each file, then a loading, error, or ready state
  ▼
the two views
```

1. **The contract.** `shared/contract.ts` holds one hand-written guard for each file of `public/data/`, and each type derives from its guard. The pipeline runs the guard before it writes a file, and the browser runs the same guard before it draws one. The fixtures in `tests/fixtures/` hold one small valid file for each.
2. **Fetch.** The fetch pages each dataset of the source and keeps the bytes as they came. `data/fetch-record.json` holds the URL, fetch time, HTTP status, row count, byte count, and SHA-256 of each raw file. A file that differs from its earlier hash is reported.
3. **Load.** The loader refuses a raw file whose SHA-256 differs from the record, a row with a bad timestamp, a series in two datasets, and a series with two units. Two different values for one hour make that hour missing.
4. **Derive.** Pure functions over the loaded rows. The coverage of a station counts from its first report to its last report, not over the whole window, so a station that closed is not shown as broken. An hour of the source ends at its timestamp.
5. **Emit.** The output is deterministic: two runs of `npm run data:build` give byte-identical files. The manifest holds the fetch time and no build time.
6. **Client.** `src/api.ts` gives `getManifest`, `getStations`, `getStory`, `getLayer`, and the hook `useData`. A file that fails its guard shows an error, and no view draws from unchecked data.

The current files come from 36 datasets and 3,568,270 hourly rows, fetched on 6 October 2026. Seven datasets hold no rows at the source, and the manifest lists them.

## Commands

| Command                  | What it does                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Serve the site with Vite on port 3000.                                                                                                                                                |
| `npm run build`          | Type-check, then build the site into `dist/`.                                                                                                                                         |
| `npm run fetch`          | Download the raw files again and rewrite `data/fetch-record.json`. Makes requests to the source.                                                                                      |
| `npm run data:build`     | Build `public/data/` from `data/raw/`. Makes no request.                                                                                                                              |
| `npm run data`           | `fetch`, then `data:build`.                                                                                                                                                           |
| `npm run data:check`     | Check `public/data/` alone: each file against its guard, each byte count and SHA-256 against the manifest, no file that the manifest does not list, and no unknown station or county. |
| `npm run data:raw-check` | Check `data/raw/` against `data/fetch-record.json`.                                                                                                                                   |
| `npm run typecheck`      | Run `tsc`.                                                                                                                                                                            |
| `npm run test:unit`      | Run every unit test, with the Node test runner. Some tests read `data/raw/`.                                                                                                          |
| `npm run test:ci`        | Run only the unit tests that read `public/data/` or the fixtures.                                                                                                                     |
| `npm run test:browser`   | Run the Playwright specs of both views at 390x844 and 1440x900.                                                                                                                       |
| `npm test`               | `test:unit`, then `test:browser`.                                                                                                                                                     |

## Gates

1. **Before a commit:** `npm run typecheck`, `npm test`, `npm run data:check`, and `npm run build` exit 0.
2. **In CI:** `.github/workflows/deploy.yml` runs `npm ci`, `npm run test:ci`, `npm run data:check`, and `npm run build`, and publishes `dist/` to GitHub Pages on a push to `main`. CI has no raw data, so it runs the checks that read `public/data/` only.
3. **The browser specs** check that each number of the story equals its key in `story.json`, that the day card of 27 July 2021 shows the values of each station, that the page makes no request to another origin and logs no error, and that nothing animates under reduced motion.

## Layout

| Path                                      | Contents                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `shared/`                                 | The data contract and the county of each station, used by the pipeline and the browser. |
| `scripts/`                                | The pipeline and the two checks.                                                        |
| `data/`                                   | The fetch record and the limits. `data/raw/` is not in git.                             |
| `public/data/`                            | The files that the site reads.                                                          |
| `public/map.png`, `public/sectors.json`   | The county bitmap and the county names of the coverage map.                             |
| `src/views/story/`, `src/views/coverage/` | The two views.                                                                          |
| `tests/`                                  | The unit tests (`*.test.ts`), the browser specs (`*.spec.ts`), and the fixtures.        |
| `vendor/map-engine/`                      | The vendored copy of map-engine.                                                        |

## Licence

MIT. See `LICENSE`. The data is under the Nova Scotia Open Government Licence.
