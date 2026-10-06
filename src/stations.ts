// Each provincial station, keyed by the station name in the source data, to
// the county that holds it, keyed by its color in public/sectors.json.
export const STATION_COUNTIES: Record<string, string> = {
  Aylesford: 'ff007b',
  'Halifax Johnston': 'ff0000',
  Kentville: 'ff007b',
  'Lake Major': 'ff0000',
  Pictou: '0099ff',
  'Port Hawkesbury': '3700ff',
  'Sable Island': 'ff0000',
  Sydney: '00ff1a',
}
