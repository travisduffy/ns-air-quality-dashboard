export const shareText = (reported: number, expected: number) => {
  if (expected <= 0) {
    return 'n/a'
  }
  return `${(Math.floor((reported * 1000) / expected) / 10).toFixed(1)}%`
}

export const count = (n: number) => n.toLocaleString('en-CA')

export const hoursText = (n: number) =>
  `${count(n)} ${n === 1 ? 'hour' : 'hours'}`

export const num = (n: number) =>
  Number(n.toFixed(3)).toLocaleString('en-CA', { maximumFractionDigits: 3 })
