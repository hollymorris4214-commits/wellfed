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

export const EMPTYING_QUALITY_OPTIONS = [
  { id: 'complete', label: 'Complete' },
  { id: 'partial', label: 'Partial' },
  { id: 'blocked', label: 'Unsatisfying / still feel blocked' },
]

export const TOILET_TIME_OPTIONS = [
  { id: 'quick', label: 'Quick', detail: 'under 5 minutes' },
  { id: 'normal', label: 'Normal', detail: '5-10 minutes' },
  { id: 'prolonged', label: 'Prolonged', detail: 'over 10 minutes' },
]

export const YES_NO_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
]

export const BREATH_RELAXATION_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'notTried', label: 'Not tried' },
]

const optionLabel = (options, value) =>
  options.find((option) => option.id === value)?.label ?? ''

const numericOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const repeatTripsKnown = (event) =>
  event.repeatTrips === true || event.repeatTrips === false

const boolLabel = (value) => {
  if (value === true || value === 'yes') return 'yes'
  if (value === false || value === 'no') return 'no'
  return ''
}

const average = (values = []) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null

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

export const hasEvacuationDetails = (event = {}) =>
  numericOrNull(event.strainScore) !== null ||
  numericOrNull(event.painScore) !== null ||
  Boolean(event.emptyingQuality) ||
  Boolean(event.toiletTime) ||
  repeatTripsKnown(event) ||
  Boolean(event.notes) ||
  Boolean(event.mechanics && Object.values(event.mechanics).some(Boolean))

export const getEmptyingQualityLabel = (value) =>
  optionLabel(EMPTYING_QUALITY_OPTIONS, value)

export const getToiletTimeLabel = (value) => {
  const option = TOILET_TIME_OPTIONS.find((item) => item.id === value)
  return option ? `${option.label} (${option.detail})` : ''
}

export const bowelDifficultyFlags = (event = {}) => {
  const flags = []
  const strain = numericOrNull(event.strainScore)
  const pain = numericOrNull(event.painScore)

  if (strain !== null && strain > 2) flags.push('strain')
  if (pain !== null && pain > 0) flags.push('pain')
  if (event.emptyingQuality === 'partial') flags.push('partial emptying')
  if (event.emptyingQuality === 'blocked') flags.push('still felt blocked')
  if (event.toiletTime === 'prolonged') flags.push('prolonged toilet time')
  if (event.repeatTrips === true) flags.push('repeat trips')
  if (event.mechanics?.outletIssue === 'yes') flags.push('outlet/coordination feel')
  if (event.mechanics?.hardDry === 'yes') flags.push('hard/dry feel')

  return flags
}

export const getBowelEventQuality = (event = {}) => {
  const type = Number(event.type)
  const normalAppearance = type === 3 || type === 4
  const hardAppearance = type === 1 || type === 2
  const looseAppearance = type >= 5
  const strain = numericOrNull(event.strainScore)
  const pain = numericOrNull(event.painScore)
  const detailsKnown = hasEvacuationDetails(event)
  const difficultyFlags = bowelDifficultyFlags(event)
  const difficultyPresent = difficultyFlags.length > 0
  const highStrain = strain !== null && strain > 5
  const easyEvacuation =
    detailsKnown &&
    normalAppearance &&
    (strain ?? 0) <= 2 &&
    (pain ?? 0) === 0 &&
    event.emptyingQuality === 'complete' &&
    event.toiletTime !== 'prolonged' &&
    event.repeatTrips !== true

  if (!detailsKnown) {
    return {
      id: 'appearance-only',
      label: 'Appearance only',
      detailsKnown,
      difficultyPresent,
      flags: difficultyFlags,
    }
  }

  if (easyEvacuation) {
    return {
      id: 'excellent',
      label: 'Easy Type 3-4',
      detailsKnown,
      difficultyPresent,
      flags: difficultyFlags,
    }
  }

  if (
    (normalAppearance && (highStrain || event.mechanics?.outletIssue === 'yes')) ||
    (hardAppearance && strain !== null && strain <= 2 && (pain ?? 0) === 0)
  ) {
    return {
      id: 'mixed',
      label: 'Mixed signal',
      detailsKnown,
      difficultyPresent,
      flags: difficultyFlags,
    }
  }

  if (hardAppearance) {
    return {
      id: 'constipation',
      label: 'Constipation-coded',
      detailsKnown,
      difficultyPresent,
      flags: difficultyFlags,
    }
  }

  if (looseAppearance) {
    return {
      id: 'loose',
      label: 'Loose/urgency-coded',
      detailsKnown,
      difficultyPresent,
      flags: difficultyFlags,
    }
  }

  if (normalAppearance && difficultyPresent) {
    return {
      id: 'watch-mechanics',
      label: 'Watch mechanics',
      detailsKnown,
      difficultyPresent,
      flags: difficultyFlags,
    }
  }

  return {
    id: 'mixed',
    label: 'Mixed signal',
    detailsKnown,
    difficultyPresent,
    flags: difficultyFlags,
  }
}

export const bowelEventDetailText = (event = {}) => {
  const quality = getBowelEventQuality(event)
  if (!quality.detailsKnown) return 'Evacuation details not logged'

  const details = []
  const strain = numericOrNull(event.strainScore)
  const pain = numericOrNull(event.painScore)
  const emptying = getEmptyingQualityLabel(event.emptyingQuality)
  const toiletTime = getToiletTimeLabel(event.toiletTime)

  if (strain !== null) details.push(`strain ${strain}/10`)
  if (pain !== null) details.push(`pain ${pain}/10`)
  if (emptying) details.push(emptying.toLowerCase())
  if (toiletTime) details.push(toiletTime.toLowerCase())
  if (repeatTripsKnown(event)) {
    details.push(`repeat trips ${event.repeatTrips ? 'yes' : 'no'}`)
  }

  return details.join(', ')
}

export const bowelMechanicsText = (event = {}) => {
  const mechanics = event.mechanics ?? {}
  const details = []

  if (boolLabel(mechanics.footstool)) {
    details.push(`footstool ${boolLabel(mechanics.footstool)}`)
  }
  if (boolLabel(mechanics.leanedForward)) {
    details.push(`leaned forward ${boolLabel(mechanics.leanedForward)}`)
  }
  if (mechanics.breathRelaxation) {
    details.push(
      `breath/relaxation ${
        mechanics.breathRelaxation === 'notTried'
          ? 'not tried'
          : boolLabel(mechanics.breathRelaxation)
      }`,
    )
  }
  if (boolLabel(mechanics.hardDry)) {
    details.push(`hard/dry feel ${boolLabel(mechanics.hardDry)}`)
  }
  if (boolLabel(mechanics.outletIssue)) {
    details.push(`outlet/coordination feel ${boolLabel(mechanics.outletIssue)}`)
  }
  if (mechanics.tensionNotes) {
    details.push(`tension noted: ${mechanics.tensionNotes}`)
  }

  return details.join(', ')
}

export const summariseBowelQuality = (events = []) => {
  const distribution = createBowelDistribution(events)
  const qualityCounts = events.reduce((summary, event) => {
    const quality = getBowelEventQuality(event)
    summary[quality.id] = (summary[quality.id] ?? 0) + 1
    return summary
  }, {})
  const detailsLogged = events.filter(hasEvacuationDetails)
  const incompleteEvents = events.filter((event) =>
    ['partial', 'blocked'].includes(event.emptyingQuality),
  )
  const repeatTripEvents = events.filter((event) => event.repeatTrips === true)
  const prolongedEvents = events.filter((event) => event.toiletTime === 'prolonged')
  const normalHighStrainEvents = events.filter((event) => {
    const type = Number(event.type)
    return (type === 3 || type === 4) && (numericOrNull(event.strainScore) ?? 0) > 5
  })
  const hardEvents = events.filter((event) => Number(event.type) <= 2)
  const footstoolYesStrains = events
    .filter((event) => event.mechanics?.footstool === 'yes')
    .map((event) => numericOrNull(event.strainScore))
    .filter((value) => value !== null)
  const footstoolNoStrains = events
    .filter((event) => event.mechanics?.footstool === 'no')
    .map((event) => numericOrNull(event.strainScore))
    .filter((value) => value !== null)
  const breathYesStrains = events
    .filter((event) => event.mechanics?.breathRelaxation === 'yes')
    .map((event) => numericOrNull(event.strainScore))
    .filter((value) => value !== null)
  const breathNotHelpedStrains = events
    .filter((event) =>
      ['no', 'notTried'].includes(event.mechanics?.breathRelaxation),
    )
    .map((event) => numericOrNull(event.strainScore))
    .filter((value) => value !== null)

  return {
    distribution,
    detailsLogged: detailsLogged.length,
    hardEvents: hardEvents.length,
    incompleteEvents: incompleteEvents.length,
    normalHighStrainEvents: normalHighStrainEvents.length,
    prolongedEvents: prolongedEvents.length,
    qualityCounts,
    repeatTripEvents: repeatTripEvents.length,
    total: events.length,
    footstoolAverageStrain: average(footstoolYesStrains),
    noFootstoolAverageStrain: average(footstoolNoStrains),
    breathAverageStrain: average(breathYesStrains),
    noBreathAverageStrain: average(breathNotHelpedStrains),
  }
}

export const bowelQualitySignalLine = (events = []) => {
  if (!events.length) return 'No bowel events logged.'

  const summary = summariseBowelQuality(events)
  const dominant = getMostCommonBowelType(events)
  const dominantCount = dominant ? summary.distribution[dominant] ?? 0 : 0
  const dominantText = dominant
    ? `Bristol Type ${dominant}${dominantCount ? ` (${dominantCount}/${events.length})` : ''}`
    : 'Bristol appearance'
  const hasTypeOne = (summary.distribution[1] ?? 0) > 0
  const hasTypeFive = (summary.distribution[5] ?? 0) > 0
  const difficultyEvents = events.filter(
    (event) => getBowelEventQuality(event).difficultyPresent,
  )
  const excellentEvents = summary.qualityCounts.excellent ?? 0

  if (hasTypeOne && hasTypeFive) {
    return `Mixed bowel pattern: Type 1 and Type 5 both appeared. Treat as a mixed transit signal rather than simple constipation or simple looseness.`
  }

  if (!summary.detailsLogged) {
    return `${dominantText} appearance pattern; evacuation details not logged yet.`
  }

  if (excellentEvents === events.length) {
    return 'Type 3-4 easy evacuation pattern: strong bowel signal.'
  }

  if (dominant && dominant <= 2) {
    const highStrainOrPain = events.some(
      (event) =>
        Number(event.type) <= 2 &&
        ((numericOrNull(event.strainScore) ?? 0) > 5 ||
          (numericOrNull(event.painScore) ?? 0) > 0),
    )
    return `${dominantText} constipation-coded movement${
      highStrainOrPain ? ' with high strain/pain' : ''
    }.`
  }

  if (dominant && dominant >= 5) {
    return `${dominantText} loose/urgency-coded movement${
      summary.repeatTripEvents || summary.prolongedEvents
        ? ' with repeat/prolonged toilet context'
        : ''
    }.`
  }

  if (summary.normalHighStrainEvents || summary.incompleteEvents) {
    return `${dominantText} dominant, but evacuation difficulty present due to ${[
      summary.normalHighStrainEvents ? 'strain' : '',
      summary.incompleteEvents ? 'incomplete emptying' : '',
      summary.prolongedEvents ? 'prolonged time' : '',
      summary.repeatTripEvents ? 'repeat trips' : '',
    ]
      .filter(Boolean)
      .join(', ')}.`
  }

  if (difficultyEvents.length) {
    return `${dominantText} appearance with ${difficultyEvents.length} evacuation difficulty signal${
      difficultyEvents.length === 1 ? '' : 's'
    }.`
  }

  return `${dominantText} appearance with low recorded evacuation difficulty.`
}

export const bowelTrendInsightLines = (events = []) => {
  if (!events.length) return []

  const summary = summariseBowelQuality(events)
  const lines = []
  const enoughForPattern = events.length >= 3
  const rate = (count) => count / Math.max(1, events.length)

  if (
    summary.normalHighStrainEvents >= 2 ||
    (enoughForPattern && rate(summary.normalHighStrainEvents) >= 0.35)
  ) {
    lines.push(
      'Frequent Type 3-4 stools with high strain: consider evacuation mechanics or pelvic-floor coordination context, not fibre/hydration alone.',
    )
  }

  if (
    summary.hardEvents >= 3 ||
    (enoughForPattern && rate(summary.hardEvents) >= 0.4)
  ) {
    lines.push(
      'Frequent Type 1-2 stools: constipation/dryness or slower-transit pattern is worth steering around.',
    )
  }

  if (
    summary.incompleteEvents >= 2 ||
    summary.repeatTripEvents >= 2 ||
    (enoughForPattern &&
      rate(summary.incompleteEvents + summary.repeatTripEvents) >= 0.35)
  ) {
    lines.push(
      'Incomplete emptying or repeat trips are recurring enough to watch separately from Bristol appearance.',
    )
  }

  if (
    summary.footstoolAverageStrain !== null &&
    summary.noFootstoolAverageStrain !== null
  ) {
    const difference =
      summary.noFootstoolAverageStrain - summary.footstoolAverageStrain
    if (difference >= 1) {
      lines.push('Footstool/knees-elevated notes are linked with lower strain so far.')
    } else if (difference <= -1) {
      lines.push('Footstool/knees-elevated notes have not lowered strain in the logged data so far.')
    }
  }

  if (
    summary.breathAverageStrain !== null &&
    summary.noBreathAverageStrain !== null
  ) {
    const difference = summary.noBreathAverageStrain - summary.breathAverageStrain
    if (difference >= 1) {
      lines.push('Breath/relaxation notes are linked with lower strain so far.')
    } else if (difference <= -1) {
      lines.push('Breath/relaxation notes have not lowered strain in the logged data so far.')
    }
  }

  if (!lines.length && summary.detailsLogged) {
    lines.push('Evacuation details are being captured; no repeated mechanics pattern yet.')
  }

  return lines
}
