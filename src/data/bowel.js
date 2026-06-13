export const BRISTOL_TYPES = [
  {
    id: 1,
    label: 'Separate hard lumps',
    tone: 'Very constipated',
    className: 'type-1',
  },
  {
    id: 2,
    label: 'Lumpy sausage',
    tone: 'Slightly constipated',
    className: 'type-2',
  },
  {
    id: 3,
    label: 'Sausage with cracks',
    tone: 'Normal',
    className: 'type-3',
  },
  {
    id: 4,
    label: 'Smooth soft sausage',
    tone: 'Normal',
    className: 'type-4',
  },
  {
    id: 5,
    label: 'Soft blobs',
    tone: 'Lacking fibre',
    className: 'type-5',
  },
  {
    id: 6,
    label: 'Mushy ragged edges',
    tone: 'Inflammation',
    className: 'type-6',
  },
  {
    id: 7,
    label: 'Liquid consistency',
    tone: 'Inflammation and diarrhoea',
    className: 'type-7',
  },
]

export const BRISTOL_TYPE_IDS = BRISTOL_TYPES.map((type) => type.id)

export const getBristolType = (id) =>
  BRISTOL_TYPES.find((type) => type.id === Number(id)) ?? BRISTOL_TYPES[0]

export const createBowelDistribution = (events = []) =>
  BRISTOL_TYPE_IDS.reduce((distribution, id) => {
    distribution[id] = events.filter((event) => Number(event.type) === id).length
    return distribution
  }, {})

export const getMostCommonBowelType = (events = []) => {
  if (!events.length) return null
  const distribution = createBowelDistribution(events)
  return BRISTOL_TYPE_IDS.reduce((best, id) => {
    if (!best || distribution[id] > distribution[best]) return id
    return best
  }, null)
}
