# Nova Scotia Air Quality Dashboard

![The dashboard: hover a county, open Halifax County, and change the pollutant filter](docs/demo.gif)

A dashboard of Nova Scotia broken down by each county by its air quality. It compares the 2025 hourly readings of the provincial monitoring stations with official air quality limits.

## Why

Nova Scotia publishes a lot of open data, and I wanted to build something with it. The air quality data stood out since it's real-time - stations across NS measure the air every hour and anyone can download the readings. Air quality affects everyone who breathes (that's pretty much everyone!), so this data deserves a clear picture.

## How

A script downloads the hourly readings from [Nova Scotia Open Data](https://data.novascotia.ca). A second script compares them with the limits of the Nova Scotia Air Quality Regulations and the Canadian Ambient Air Quality Standards.

The page is static TypeScript, built with Vite. Each county is green, yellow, or red by how close its highest reading came to a limit. A gray county has no station (yet!). My work-in-progress map library, [map-engine](https://github.com/travisduffy/map-engine), powers the map. A copy of it is in `vendor/map-engine/`.

## Run it

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000/ns-air-quality-dashboard/`. To download the data again & rebuild the results, run `npm run data`.
