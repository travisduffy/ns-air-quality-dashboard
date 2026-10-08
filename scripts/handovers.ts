import type { Handover } from '../shared/contract.ts'

export const HANDOVERS: Handover[] = [
  {
    name: 'Halifax',
    oldSite: 'Halifax',
    newSite: 'Halifax Johnston',
    firstDay: '2018-01-01',
    reason: {
      text: 'The Johnston site replaced the Halifax Vogue site, which stopped monitoring at the end of 2017. The Vogue site stood less than one block away.',
      source:
        'the description of the dataset "Halifax Johnston", Nova Scotia Open Data',
    },
  },
]
