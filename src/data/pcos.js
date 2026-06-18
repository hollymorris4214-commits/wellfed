export const PCOS_PRIORITIES = [
  { id: 'appetiteCravings', label: 'Appetite / cravings' },
  { id: 'bloodSugarSteadiness', label: 'Blood sugar steadiness' },
  { id: 'cycleRegularity', label: 'Cycle regularity' },
  { id: 'energyCrashes', label: 'Energy crashes' },
  { id: 'stressEating', label: 'Stress eating' },
  { id: 'digestionTiming', label: 'Digestion / meal timing' },
  { id: 'weightManagement', label: 'Weight management' },
  { id: 'skinAcne', label: 'Skin / acne' },
  { id: 'hairChanges', label: 'Hair growth / hair loss' },
  { id: 'fertilityPlanning', label: 'Fertility / future planning' },
  { id: 'moodAnxiety', label: 'Mood / anxiety' },
]

export const PCOS_INSULIN_RESISTANCE_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'Unsure' },
]

export const PCOS_DIGESTION_ISSUES = [
  { id: '', label: 'Not set' },
  { id: 'longGaps', label: 'Long gaps' },
  { id: 'lateMeals', label: 'Late meals' },
  { id: 'highFat', label: 'High-fat meals' },
  { id: 'stress', label: 'Stress' },
  { id: 'fibre', label: 'Fibre changes' },
  { id: 'unknown', label: 'Unknown / mixed' },
]

export const PCOS_STRESS_PATTERNS = [
  { id: '', label: 'Not set' },
  { id: 'evening', label: 'Evening' },
  { id: 'workStress', label: 'Work stress' },
  { id: 'social', label: 'Social' },
  { id: 'boredom', label: 'Boredom' },
  { id: 'emotionalCrash', label: 'Emotional crash' },
  { id: 'other', label: 'Other / mixed' },
]

export const PCOS_EATING_DRIVERS = [
  { id: 'physicalHunger', label: 'Physical hunger' },
  { id: 'stress', label: 'Stress' },
  { id: 'boredom', label: 'Boredom' },
  { id: 'comfort', label: 'Comfort' },
  { id: 'habitRoutine', label: 'Habit / routine' },
  { id: 'social', label: 'Social' },
  { id: 'craving', label: 'Craving' },
  { id: 'lowEnergy', label: 'Low energy' },
  { id: 'available', label: 'It was just there' },
  { id: 'wanted', label: 'Genuinely wanted it' },
]

export const PCOS_POST_MEAL_RESPONSES = [
  { id: 'energyStable', label: 'Energy stable' },
  { id: 'sleepyCrash', label: 'Sleepy / crashed' },
  { id: 'stillHungry', label: 'Still hungry' },
  { id: 'sweetCraving', label: 'Craving more sweet food' },
  { id: 'bloated', label: 'Bloated' },
  { id: 'refluxNausea', label: 'Reflux / nausea' },
  { id: 'satisfiedCalm', label: 'Satisfied / calm' },
]

export const PCOS_PHASES = [
  { id: '', label: 'Not noted' },
  { id: 'menstrual', label: 'Menstrual' },
  { id: 'follicular', label: 'Follicular' },
  { id: 'ovulatory', label: 'Ovulatory' },
  { id: 'luteal', label: 'Luteal' },
  { id: 'uncertain', label: 'Uncertain / irregular' },
]

export const PCOS_SYMPTOMS = [
  { id: 'cravings', label: 'Cravings' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'mood', label: 'Mood' },
  { id: 'pain', label: 'Pain' },
  { id: 'acne', label: 'Acne' },
  { id: 'bloating', label: 'Bloating' },
]

const optionLabel = (options, id) =>
  options.find((option) => option.id === id)?.label ?? id

const timeMinutes = (time = '') => {
  const [hours, minutes] = String(time).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const formatClockMinutes = (minutes) => {
  if (minutes === null || minutes === undefined) return 'not available'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

const formatGap = (minutes) => {
  if (!Number.isFinite(minutes)) return 'not available'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!remainder) return `${hours}h`
  return `${hours}h ${remainder}m`
}

const sortedFoodEvents = (events = []) =>
  [...events]
    .filter(
      (event) =>
        event.type !== 'supplement' &&
        (Number(event.nutrients?.caloriesKcal) || 0) > 0,
    )
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))

const eventHasSupport = (event) =>
  (Number(event.nutrients?.proteinG) || 0) >= 10 ||
  (Number(event.nutrients?.fibreG) || 0) >= 3 ||
  (Number(event.nutrients?.fatG) || 0) >= 8

const eventIsUnsupportedCarb = (event) =>
  (Number(event.nutrients?.carbohydratesG) || 0) >= 30 &&
  !eventHasSupport(event)

const countValues = (values = []) =>
  values.reduce((counts, value) => {
    if (value) counts[value] = (counts[value] ?? 0) + 1
    return counts
  }, {})

const countLabels = (counts, options) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${optionLabel(options, id)} ${count}`)

export const normalisePcosEventContext = (context = {}) => ({
  eatingDriver: PCOS_EATING_DRIVERS.some(
    (option) => option.id === context.eatingDriver,
  )
    ? context.eatingDriver
    : '',
  postMealResponses: Array.isArray(context.postMealResponses)
    ? context.postMealResponses.filter((id) =>
        PCOS_POST_MEAL_RESPONSES.some((option) => option.id === id),
      )
    : [],
  treatSatisfactionScore:
    Number(context.treatSatisfactionScore) >= 1 &&
    Number(context.treatSatisfactionScore) <= 10
      ? Number(context.treatSatisfactionScore)
      : '',
  cravingContinued:
    context.cravingContinued === 'yes' || context.cravingContinued === 'no'
      ? context.cravingContinued
      : '',
  notes: String(context.notes ?? '').trim(),
})

export const pcosEventContextLine = (event = {}) => {
  const context = normalisePcosEventContext(event.pcosContext)
  const parts = []
  if (context.eatingDriver) {
    parts.push(
      `driver ${optionLabel(PCOS_EATING_DRIVERS, context.eatingDriver)}`,
    )
  }
  if (context.postMealResponses.length) {
    parts.push(
      `afterwards ${context.postMealResponses
        .map((id) => optionLabel(PCOS_POST_MEAL_RESPONSES, id))
        .join(', ')}`,
    )
  }
  if (context.treatSatisfactionScore) {
    parts.push(`treat satisfaction ${context.treatSatisfactionScore}/10`)
  }
  if (context.cravingContinued) {
    parts.push(`craving continued ${context.cravingContinued}`)
  }
  if (context.notes) parts.push(`context note: ${context.notes}`)
  return parts.join('; ')
}

export const analysePcosDay = (events = []) => {
  const foodEvents = sortedFoodEvents(events)
  const firstEvent = foodEvents[0] ?? null
  const firstSubstantialEvent =
    foodEvents.find(
      (event) =>
        (Number(event.nutrients?.caloriesKcal) || 0) >= 150 ||
        (Number(event.nutrients?.proteinG) || 0) >= 10,
    ) ?? firstEvent
  const proteinAnchors = foodEvents.filter(
    (event) => (Number(event.nutrients?.proteinG) || 0) >= 20,
  )
  let longestGapMinutes = null
  let longestGapFrom = ''
  let longestGapTo = ''
  const treatsAfterLongGap = []

  foodEvents.forEach((event, index) => {
    if (!index) return
    const previous = foodEvents[index - 1]
    const currentMinutes = timeMinutes(event.time)
    const previousMinutes = timeMinutes(previous.time)
    if (currentMinutes === null || previousMinutes === null) return
    const gap = currentMinutes - previousMinutes
    if (longestGapMinutes === null || gap > longestGapMinutes) {
      longestGapMinutes = gap
      longestGapFrom = previous.name
      longestGapTo = event.name
    }
    if (
      gap >= 240 &&
      (Number(event.nutrients?.upfDiscretionaryCaloriesKcal) || 0) > 0
    ) {
      treatsAfterLongGap.push(event)
    }
  })

  const unsupportedCarbEvents = foodEvents.filter(eventIsUnsupportedCarb)
  const lateEatingEvents = foodEvents.filter(
    (event) => (timeMinutes(event.time) ?? -1) >= 21 * 60,
  )
  const treatEvents = foodEvents.filter(
    (event) =>
      (Number(event.nutrients?.upfDiscretionaryCaloriesKcal) || 0) > 0,
  )
  const pairedTreats = treatEvents.filter(eventHasSupport)
  const firstSubstantialMinutes = firstSubstantialEvent
    ? timeMinutes(firstSubstantialEvent.time)
    : null
  const caffeineBeforeFood = events.some((event) => {
    const eventMinutes = timeMinutes(event.time)
    return (
      (Number(event.caffeineMg) || 0) > 0 &&
      eventMinutes !== null &&
      firstSubstantialMinutes !== null &&
      eventMinutes < firstSubstantialMinutes
    )
  })
  const contexts = foodEvents.map((event) =>
    normalisePcosEventContext(event.pcosContext),
  )
  const eatingDriverCounts = countValues(
    contexts.map((context) => context.eatingDriver),
  )
  const responseCounts = countValues(
    contexts.flatMap((context) => context.postMealResponses),
  )
  const lowSatisfactionTreats = treatEvents.filter((event) => {
    const score = Number(event.pcosContext?.treatSatisfactionScore)
    return score > 0 && score <= 4
  })
  const cravingContinuedTreats = treatEvents.filter(
    (event) => event.pcosContext?.cravingContinued === 'yes',
  )

  return {
    caffeineBeforeFood,
    contextEventCount: contexts.filter(
      (context) =>
        context.eatingDriver ||
        context.postMealResponses.length ||
        context.treatSatisfactionScore ||
        context.cravingContinued ||
        context.notes,
    ).length,
    cravingContinuedTreats,
    eatingDriverCounts,
    firstCalorieTime: firstEvent?.time ?? '',
    firstProteinAnchorTime: proteinAnchors[0]?.time ?? '',
    firstSubstantialTime: firstSubstantialEvent?.time ?? '',
    foodEventCount: foodEvents.length,
    lateEatingEvents,
    longestGapFrom,
    longestGapMinutes,
    longestGapTo,
    lowSatisfactionTreats,
    pairedTreats,
    proteinAnchorCount: proteinAnchors.length,
    proteinAtFirstMeal:
      firstEvent === null
        ? null
        : (Number(firstEvent.nutrients?.proteinG) || 0) >= 15,
    responseCounts,
    treatEvents,
    treatsAfterLongGap,
    unsupportedCarbEvents,
  }
}

export const pcosDaySignalLines = (events = []) => {
  const analysis = analysePcosDay(events)
  if (!analysis.foodEventCount) return ['No food timing pattern available yet.']

  return [
    `First calorie time: ${analysis.firstCalorieTime || 'not available'}.`,
    `First substantial protein anchor: ${
      analysis.firstProteinAnchorTime || 'not logged'
    }.`,
    `Longest logged meal gap: ${
      analysis.longestGapMinutes === null
        ? 'not available'
        : formatGap(analysis.longestGapMinutes)
    }${
      analysis.longestGapFrom && analysis.longestGapTo
        ? ` (${analysis.longestGapFrom} to ${analysis.longestGapTo})`
        : ''
    }.`,
    `Protein distribution: ${analysis.proteinAnchorCount} event${
      analysis.proteinAnchorCount === 1 ? '' : 's'
    } with at least 20g protein.`,
    `Carb-heavy events without much protein, fibre, or fat support: ${analysis.unsupportedCarbEvents.length}.`,
    `Treats after a gap of at least 4 hours: ${analysis.treatsAfterLongGap.length}.`,
    `Caffeine before substantial food: ${analysis.caffeineBeforeFood ? 'yes' : 'no'}.`,
    `Eating after 21:00: ${analysis.lateEatingEvents.length ? 'logged' : 'not logged'}.`,
  ]
}

export const pcosDayInsightLines = (events = []) => {
  const analysis = analysePcosDay(events)
  if (!analysis.foodEventCount) {
    return ['No food logged yet, so there is no meal-timing pattern to interpret.']
  }

  const insights = []
  if (analysis.proteinAtFirstMeal === false) {
    insights.push(
      'Protein was light at the first food event; an earlier protein anchor may be a useful experiment.',
    )
  }
  if (
    analysis.longestGapMinutes !== null &&
    analysis.longestGapMinutes >= 300
  ) {
    insights.push(
      `The longest logged gap was ${formatGap(
        analysis.longestGapMinutes,
      )}; appetite or energy may have been more vulnerable later.`,
    )
  }
  if (analysis.treatsAfterLongGap.length) {
    insights.push(
      'A discretionary food followed a long gap. This may reflect under-fuelling or context as much as craving.',
    )
  }
  if (analysis.unsupportedCarbEvents.length) {
    insights.push(
      `${analysis.unsupportedCarbEvents.length} carb-forward event${
        analysis.unsupportedCarbEvents.length === 1 ? '' : 's'
      } had little protein, fibre, or fat support; pairing is a possible experiment, not a rule.`,
    )
  }
  if (analysis.caffeineBeforeFood) {
    insights.push(
      'Caffeine appeared before substantial food; pairing it with nourishment may be worth comparing.',
    )
  }
  if (analysis.responseCounts.sleepyCrash || analysis.responseCounts.stillHungry) {
    insights.push(
      'Logged post-meal responses include an energy dip or lingering hunger; compare these with timing and meal support.',
    )
  }
  if (analysis.lowSatisfactionTreats.length || analysis.cravingContinuedTreats.length) {
    insights.push(
      'At least one treat was low-satisfaction or followed by continued craving; a more deliberate or better-supported version may feel more worthwhile.',
    )
  }
  if (!insights.length) {
    insights.push(
      'No strong steadiness concern stands out from the logged timing and context today.',
    )
  }
  return insights
}

export const pcosPeriodSummary = (dayRecords = []) => {
  const analyses = dayRecords
    .filter((day) => (day?.events ?? []).length)
    .map((day) => analysePcosDay(day.events))
  const withKnownGap = analyses.filter(
    (analysis) => analysis.longestGapMinutes !== null,
  )
  const firstTimes = analyses
    .map((analysis) => timeMinutes(analysis.firstCalorieTime))
    .filter((minutes) => minutes !== null)
  const driverCounts = analyses.reduce((counts, analysis) => {
    Object.entries(analysis.eatingDriverCounts).forEach(([id, count]) => {
      counts[id] = (counts[id] ?? 0) + count
    })
    return counts
  }, {})
  const responseCounts = analyses.reduce((counts, analysis) => {
    Object.entries(analysis.responseCounts).forEach(([id, count]) => {
      counts[id] = (counts[id] ?? 0) + count
    })
    return counts
  }, {})

  return {
    averageFirstCalorieTime: firstTimes.length
      ? formatClockMinutes(
          Math.round(
            firstTimes.reduce((sum, minutes) => sum + minutes, 0) /
              firstTimes.length,
          ),
        )
      : '',
    averageLongestGapMinutes: withKnownGap.length
      ? Math.round(
          withKnownGap.reduce(
            (sum, analysis) => sum + analysis.longestGapMinutes,
            0,
          ) / withKnownGap.length,
        )
      : null,
    caffeineBeforeFoodDays: analyses.filter(
      (analysis) => analysis.caffeineBeforeFood,
    ).length,
    contextEventCount: analyses.reduce(
      (sum, analysis) => sum + analysis.contextEventCount,
      0,
    ),
    driverLabels: countLabels(driverCounts, PCOS_EATING_DRIVERS),
    earlyProteinDays: analyses.filter(
      (analysis) => analysis.proteinAtFirstMeal === true,
    ).length,
    lateEatingDays: analyses.filter(
      (analysis) => analysis.lateEatingEvents.length,
    ).length,
    loggedDays: analyses.length,
    responseLabels: countLabels(responseCounts, PCOS_POST_MEAL_RESPONSES),
    treatAfterLongGapCount: analyses.reduce(
      (sum, analysis) => sum + analysis.treatsAfterLongGap.length,
      0,
    ),
    unsupportedCarbCount: analyses.reduce(
      (sum, analysis) => sum + analysis.unsupportedCarbEvents.length,
      0,
    ),
  }
}

export const pcosPeriodSignalLines = (dayRecords = []) => {
  const summary = pcosPeriodSummary(dayRecords)
  if (!summary.loggedDays) return ['No logged food days in this period.']

  return [
    `Logged food days interpreted: ${summary.loggedDays}.`,
    `Average first calorie time: ${summary.averageFirstCalorieTime || 'not available'}.`,
    `Average longest logged gap: ${
      summary.averageLongestGapMinutes === null
        ? 'not available'
        : formatGap(summary.averageLongestGapMinutes)
    }.`,
    `Protein at the first food event: ${summary.earlyProteinDays}/${summary.loggedDays} days.`,
    `Caffeine before substantial food: ${summary.caffeineBeforeFoodDays}/${summary.loggedDays} days.`,
    `Late eating window: ${summary.lateEatingDays}/${summary.loggedDays} days.`,
    `Carb-forward events with little support: ${summary.unsupportedCarbCount}.`,
    `Treats after long gaps: ${summary.treatAfterLongGapCount}.`,
    `Eating drivers logged: ${
      summary.driverLabels.length ? summary.driverLabels.join(', ') : 'none'
    }.`,
    `Post-meal responses logged: ${
      summary.responseLabels.length ? summary.responseLabels.join(', ') : 'none'
    }.`,
  ]
}

export const pcosPeriodInsightLines = (dayRecords = []) => {
  const summary = pcosPeriodSummary(dayRecords)
  if (!summary.loggedDays) {
    return ['No repeated meal-timing pattern is available yet.']
  }

  const insights = []
  if (summary.earlyProteinDays / summary.loggedDays < 0.5) {
    insights.push(
      'Protein was light at the first food event on more than half of logged days; an earlier protein anchor is a useful experiment.',
    )
  }
  if (
    summary.averageLongestGapMinutes !== null &&
    summary.averageLongestGapMinutes >= 300
  ) {
    insights.push(
      `The average longest gap was ${formatGap(
        summary.averageLongestGapMinutes,
      )}; a planned bridge may support later appetite and energy.`,
    )
  }
  if (summary.caffeineBeforeFoodDays / summary.loggedDays >= 0.4) {
    insights.push(
      'Caffeine often appeared before substantial food; compare this with appetite, anxiety, and energy responses.',
    )
  }
  if (summary.unsupportedCarbCount) {
    insights.push(
      'Some carb-forward events had little protein, fibre, or fat support. Pairing is one optional experiment without restricting carbohydrate.',
    )
  }
  if (summary.treatAfterLongGapCount) {
    insights.push(
      'Some discretionary foods followed long gaps, which may point to timing or under-fuelling context rather than willpower.',
    )
  }
  if (!insights.length) {
    insights.push(
      'No repeated steadiness concern stands out from the logged period.',
    )
  }
  return insights
}

export const pcosCheckinLine = (event = {}) => {
  const details = []
  if (event.periodActive === 'yes') details.push('period active')
  if (event.periodActive === 'no') details.push('period not active')
  if (event.periodActive === 'unsure') details.push('period status unsure')
  if (event.phase) details.push(`phase ${optionLabel(PCOS_PHASES, event.phase)}`)
  if (event.symptoms?.length) {
    details.push(
      `symptoms ${event.symptoms
        .map((id) => optionLabel(PCOS_SYMPTOMS, id))
        .join(', ')}`,
    )
  }
  if (event.irregularityNote) {
    details.push(`cycle note: ${event.irregularityNote}`)
  }
  if (event.notes) details.push(event.notes)
  return details.join('; ') || 'PCOS context noted'
}
