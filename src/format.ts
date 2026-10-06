// A share rounds down to one decimal, so a share below 100 percent never shows
// as 100.0 percent.
export const shareText = (reported: number, expected: number) => {
  if (expected <= 0) {
    return 'n/a'
  }
  return `${(Math.floor((reported * 1000) / expected) / 10).toFixed(1)}%`
}

export const count = (n: number) => n.toLocaleString('en-CA')

export const hoursText = (n: number) =>
  `${count(n)} ${n === 1 ? 'hour' : 'hours'}`

// A reading keeps the digits that the data holds, up to 3 decimals.
export const num = (n: number) =>
  Number(n.toFixed(3)).toLocaleString('en-CA', { maximumFractionDigits: 3 })
