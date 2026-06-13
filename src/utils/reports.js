import {
  BRISTOL_TYPE_IDS,
  createBowelDistribution,
  getBristolType,
  getMostCommonBowelType,
} from '../data/bowel'
import {
  CALORIE_STREAMS,
  NUTRIENTS,
  WEEKDAY_KEYS,
  getNutrients,
} from '../data/nutrients'
import {
  formatDate,
  formatMonth,
  formatWeekRange,
  getMonthDates,
  getWeekDates,
  getWeekdayKey,
  parseDateKey,
  todayKey,
} from './date'
import { ensureDay } from './storage'

const round = (value, digits = 1) => {
  const factor = 10 ** digits
  return Math.round((Number(value) || 0) * factor) / factor
}

const alcoholUnitsText = (value) => {
  const rounded = round(value)
  return `${rounded} ${rounded === 1 ? 'unit' : 'units'}`
}

const calorieStreamTotalsFromEvents = (events = []) => {
  const streams = CALORIE_STREAMS.reduce((totals, stream) => {
    totals[stream.id] = 0
    return totals
  }, {})
  let total = 0

  events.forEach((event) => {
    total += Number(event.nutrients?.caloriesKcal) || 0
    CALORIE_STREAMS.forEach((stream) => {
      streams[stream.id] += Number(event.nutrients?.[stream.id]) || 0
    })
  })

  return { total, streams }
}

const calorieStreamLines = (source) => {
  const total = Number(source?.total ?? source?.caloriesKcal) || 0
  const streams = source?.streams ?? source ?? {}
  const streamText = CALORIE_STREAMS.map(
    (stream) => `- ${stream.label}: ${round(streams[stream.id])} kcal`,
  ).join('\n')

  return `- True total calories: ${round(total)} kcal\n${streamText}`
}

const energyBalanceText = (value) => {
  const amount = Number(value) || 0
  if (amount > 0) return `${round(amount)} kcal room in plan`
  if (amount < 0) return `${round(Math.abs(amount))} kcal above plan`
  return 'on plan'
}

const sortBowelEvents = (events = []) =>
  [...events].sort((a, b) => `${a.date ?? ''}${a.time}`.localeCompare(`${b.date ?? ''}${b.time}`))

const sortBodyEvents = (events = []) =>
  [...events].sort((a, b) => `${a.date ?? ''}${a.time}`.localeCompare(`${b.date ?? ''}${b.time}`))

const sortGlp1DoseEvents = (events = []) =>
  [...events].sort((a, b) => `${a.date ?? ''}${a.time}`.localeCompare(`${b.date ?? ''}${b.time}`))

const resolveNutrients = (settingsOrNutrients) =>
  Array.isArray(settingsOrNutrients)
    ? settingsOrNutrients
    : getNutrients(settingsOrNutrients)

const PRIORITY_NUTRIENT_IDS = [
  'proteinG',
  'fibreG',
  'omega3G',
  'vitaminAUg',
  'vitaminDUg',
  'vitaminEMg',
  'vitaminCMg',
  'calciumMg',
  'ironMg',
  'magnesiumMg',
  'zincMg',
  'potassiumMg',
  'seleniumUg',
]

const LIMIT_NUTRIENT_IDS = [
  'freeSugarG',
  'saturatedFatG',
  'transFatG',
  'sodiumMg',
]

const SPICE_AND_HERB_PLANTS = new Set([
  'basil',
  'black pepper',
  'cardamom',
  'cayenne',
  'chilli',
  'chili',
  'cinnamon',
  'clove',
  'coriander',
  'cumin',
  'dill',
  'fennel',
  'garlic powder',
  'ginger',
  'long pepper',
  'mint',
  'nutmeg',
  'oregano',
  'paprika',
  'parsley',
  'pepper',
  'rosemary',
  'sage',
  'thyme',
  'turmeric',
])

const BOTANICAL_EXTRACT_PLANTS = new Set([
  'black tea',
  'cacao',
  'cocoa',
  'coffee',
  'green tea',
  'maritime pine bark',
  'pine bark',
  'tea',
])

const hasFoodData = (day) => (day?.events ?? []).length > 0

const hasAnyDayData = (day) =>
  hasFoodData(day) ||
  (day?.bowelEvents ?? []).length > 0 ||
  (day?.bodyEvents ?? []).length > 0 ||
  (day?.glp1Doses ?? []).length > 0 ||
  Number(day?.waterMl) > 0 ||
  Number(day?.caffeineMg) > 0 ||
  Number(day?.alcoholUnits) > 0

export const emptyNutrients = (settingsOrNutrients) =>
  resolveNutrients(settingsOrNutrients).reduce((totals, nutrient) => {
    totals[nutrient.id] = 0
    return totals
  }, {})

const averageDayItems = (items, nutrients) => {
  const divisor = items.length || 1
  const nutrientAverages = emptyNutrients(nutrients)
  const foodNutrientAverages = emptyNutrients(nutrients)
  const supplementNutrientAverages = emptyNutrients(nutrients)

  items.forEach((item) => {
    nutrients.forEach((nutrient) => {
      nutrientAverages[nutrient.id] += item.totals.nutrients[nutrient.id] / divisor
      foodNutrientAverages[nutrient.id] +=
        item.totals.foodNutrients[nutrient.id] / divisor
      supplementNutrientAverages[nutrient.id] +=
        item.totals.supplementNutrients[nutrient.id] / divisor
    })
  })

  return {
    count: items.length,
    caloriesAverage:
      items.reduce((sum, item) => sum + item.totals.caloriesConsumed, 0) /
      divisor,
    waterAverage:
      items.reduce((sum, item) => sum + item.totals.waterMl, 0) / divisor,
    caffeineAverage:
      items.reduce((sum, item) => sum + item.totals.caffeineMg, 0) / divisor,
    alcoholAverage:
      items.reduce((sum, item) => sum + item.totals.alcoholUnits, 0) / divisor,
    plantServingsAverage:
      items.reduce((sum, item) => sum + item.totals.plantServings, 0) / divisor,
    nutrientAverages,
    foodNutrientAverages,
    supplementNutrientAverages,
  }
}

const dataStatusForDay = (item, currentDate = todayKey()) => {
  if (item.date > currentDate) return 'future / not started'
  if (item.date === currentDate) {
    return hasAnyDayData(item.day) ? 'partial day' : 'today / not started'
  }
  if (hasFoodData(item.day)) return 'completed logged day'
  if (hasAnyDayData(item.day)) return 'completed non-food data only'
  return 'past / no logged data'
}

const dataFlagLines = (daily, currentDate = todayKey()) =>
  daily
    .map(
      (item) =>
        `- ${item.weekday} ${item.date}: ${dataStatusForDay(item, currentDate)}`,
    )
    .join('\n')

const cleanPlantName = (plant) =>
  String(plant ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const collectPlantCategoriesFromEvents = (events = []) => {
  const categories = {
    whole: new Set(),
    herbsSpices: new Set(),
    botanicalExtracts: new Set(),
  }

  events.forEach((event) => {
    ;(event.plantFoods ?? []).forEach((plant) => {
      const cleaned = cleanPlantName(plant)
      if (!cleaned) return

      if (
        event.type === 'supplement' ||
        cleaned.includes('extract') ||
        cleaned.includes('bark') ||
        BOTANICAL_EXTRACT_PLANTS.has(cleaned)
      ) {
        categories.botanicalExtracts.add(cleaned)
        return
      }

      if (SPICE_AND_HERB_PLANTS.has(cleaned)) {
        categories.herbsSpices.add(cleaned)
        return
      }

      categories.whole.add(cleaned)
    })
  })

  return {
    whole: [...categories.whole].sort(),
    herbsSpices: [...categories.herbsSpices].sort(),
    botanicalExtracts: [...categories.botanicalExtracts].sort(),
  }
}

const plantCategoryLines = (categories) => `Whole plant foods: ${
  categories.whole.length
} (${plantListLine(categories.whole)})
Herbs/spices: ${categories.herbsSpices.length} (${plantListLine(
  categories.herbsSpices,
)})
Botanical extracts/supplement plants: ${
  categories.botanicalExtracts.length
} (${plantListLine(categories.botanicalExtracts)})`

const listOrFallback = (items, fallback = 'none flagged') =>
  items.length ? items.join(', ') : fallback

const nutrientLabel = (nutrients, id) =>
  nutrients.find((nutrient) => nutrient.id === id)?.label ?? id

const buildSteeringSummary = ({
  averages,
  plantServingsAverage,
  uniquePlantCount,
  uniquePlantTarget,
  waterAverage,
  settings,
  nutrients,
}) => {
  const strong = []
  const needs = []
  const limits = []

  if (waterAverage >= settings.waterTargetMl * 0.9) {
    strong.push('fluids')
  } else if (waterAverage < settings.waterTargetMl * 0.8) {
    needs.push('fluids')
  }

  if (plantServingsAverage >= settings.dailyPlantServingsTarget * 0.9) {
    strong.push('daily plant servings')
  } else if (plantServingsAverage < settings.dailyPlantServingsTarget * 0.8) {
    needs.push('daily plant servings')
  }

  if (uniquePlantTarget && uniquePlantCount >= uniquePlantTarget * 0.9) {
    strong.push('plant diversity')
  } else if (uniquePlantTarget && uniquePlantCount < uniquePlantTarget * 0.7) {
    needs.push('plant diversity')
  }

  PRIORITY_NUTRIENT_IDS.forEach((id) => {
    const target = Number(settings.nutrientTargets[id]) || 0
    if (!target) return
    const percent = (Number(averages[id]) || 0) / target
    const label = nutrientLabel(nutrients, id)
    if (percent >= 0.9) {
      strong.push(label)
    } else if (percent < 0.8) {
      needs.push(label)
    }
  })

  LIMIT_NUTRIENT_IDS.forEach((id) => {
    const target = Number(settings.nutrientTargets[id]) || 0
    const value = Number(averages[id]) || 0
    if (!target && value > 0) {
      limits.push(`${nutrientLabel(nutrients, id)} present`)
      return
    }
    if (!target) return
    const percent = value / target
    if (percent > 1) {
      limits.push(`${nutrientLabel(nutrients, id)} above reference`)
    } else if (percent >= 0.85) {
      limits.push(`${nutrientLabel(nutrients, id)} near reference`)
    }
  })

  return `Strong signal: ${listOrFallback(strong)}
Needs steering: ${listOrFallback(needs)}
Limit nutrients to watch: ${listOrFallback(limits)}`
}

export const getDayTotals = (day, settingsOrNutrients) => {
  const nutrients = resolveNutrients(settingsOrNutrients)
  const totals = emptyNutrients(nutrients)
  const foodNutrients = emptyNutrients(nutrients)
  const supplementNutrients = emptyNutrients(nutrients)
  let plantServings = 0
  let eventCaffeineMg = 0
  let eventAlcoholUnits = 0
  const uniquePlants = new Set()

  ;(day?.events ?? []).forEach((event) => {
    nutrients.forEach((nutrient) => {
      const value = Number(event.nutrients?.[nutrient.id]) || 0
      totals[nutrient.id] += value
      if (event.type === 'supplement') {
        supplementNutrients[nutrient.id] += value
      } else {
        foodNutrients[nutrient.id] += value
      }
    })
    plantServings += Number(event.plantServings) || 0
    eventCaffeineMg += Number(event.caffeineMg) || 0
    eventAlcoholUnits += Number(event.alcoholUnits) || 0
    ;(event.plantFoods ?? []).forEach((plant) => {
      const cleaned = plant.trim().toLowerCase()
      if (/[a-z]/i.test(cleaned)) uniquePlants.add(cleaned)
    })
  })

  return {
    nutrients: totals,
    foodNutrients,
    supplementNutrients,
    plantServings,
    uniquePlants: [...uniquePlants].sort(),
    waterMl: Number(day?.waterMl) || 0,
    caffeineMg: (Number(day?.caffeineMg) || 0) + eventCaffeineMg,
    alcoholUnits: (Number(day?.alcoholUnits) || 0) + eventAlcoholUnits,
    caloriesConsumed: totals.caloriesKcal,
    calorieStreams: CALORIE_STREAMS.reduce((streams, stream) => {
      streams[stream.id] = totals[stream.id] ?? 0
      return streams
    }, {}),
    bowelEvents: sortBowelEvents(day?.bowelEvents ?? []),
    bodyEvents: sortBodyEvents(day?.bodyEvents ?? []),
    glp1Doses: sortGlp1DoseEvents(day?.glp1Doses ?? []),
  }
}

const getEnergyTargetForDay = (day, settings, dateKey = day?.date) => {
  if (Number(day?.calorieTarget)) {
    return Number(day.calorieTarget)
  }
  const weekdayTarget = Number(
    dateKey ? settings.dailyCalorieGoals?.[getWeekdayKey(dateKey)] : 0,
  )
  if (weekdayTarget) return weekdayTarget
  return Number(settings.nutrientTargets?.caloriesKcal) || 0
}

const getTargetForDate = (days, settings, dateKey) =>
  getEnergyTargetForDay(days[dateKey], settings, dateKey)

export const getWeekSummary = (days, settings, dateKey) => {
  const nutrients = getNutrients(settings)
  const currentDate = todayKey()
  const dateKeys = getWeekDates(dateKey)
  const daily = dateKeys.map((key, index) => {
    const day = days[key]
    const totals = getDayTotals(day, nutrients)
    return {
      date: key,
      weekday: WEEKDAY_KEYS[index],
      day,
      totals,
      calorieTarget: getTargetForDate(days, settings, key),
    }
  })
  const completedLoggedDays = daily.filter(
    (item) => item.date < currentDate && hasFoodData(item.day),
  )
  const todayLoggedDays = daily.filter(
    (item) => item.date === currentDate && hasFoodData(item.day),
  )
  const toDateLoggedDays = daily.filter(
    (item) => item.date <= currentDate && hasFoodData(item.day),
  )
  const futureDays = daily.filter((item) => item.date > currentDate)
  const completedMetrics = averageDayItems(completedLoggedDays, nutrients)
  const toDateMetrics = averageDayItems(toDateLoggedDays, nutrients)
  const projectionMetrics = toDateMetrics.count
    ? toDateMetrics
    : completedMetrics
  const futurePlannedBudget = futureDays.reduce(
    (sum, item) => sum + item.calorieTarget,
    0,
  )

  const weeklyBudget = daily.reduce((sum, item) => sum + item.calorieTarget, 0)
  const caloriesConsumed = daily.reduce(
    (sum, item) => sum + item.totals.caloriesConsumed,
    0,
  )
  const uniquePlants = new Set()
  const nutrientAverages = emptyNutrients(nutrients)
  const foodNutrientAverages = emptyNutrients(nutrients)
  const supplementNutrientAverages = emptyNutrients(nutrients)
  const bowelEvents = []
  const bodyEvents = []
  const glp1Doses = []

  daily.forEach((item) => {
    item.totals.uniquePlants.forEach((plant) => uniquePlants.add(plant))
    bowelEvents.push(...item.totals.bowelEvents)
    bodyEvents.push(...item.totals.bodyEvents)
    glp1Doses.push(...item.totals.glp1Doses)
    nutrients.forEach((nutrient) => {
      nutrientAverages[nutrient.id] += item.totals.nutrients[nutrient.id] / 7
      foodNutrientAverages[nutrient.id] +=
        item.totals.foodNutrients[nutrient.id] / 7
      supplementNutrientAverages[nutrient.id] +=
        item.totals.supplementNutrients[nutrient.id] / 7
    })
  })

  return {
    dateKeys,
    label: formatWeekRange(dateKey),
    daily,
    weeklyBudget,
    caloriesConsumed,
    caloriesRemaining: weeklyBudget - caloriesConsumed,
    currentDate,
    completedLoggedDays,
    todayLoggedDay: todayLoggedDays[0] ?? null,
    toDateLoggedDays,
    futureDays,
    completedMetrics,
    toDateMetrics,
    projectionMetrics,
    futurePlannedBudget,
    remainingAfterFuturePlanned:
      weeklyBudget - caloriesConsumed - futurePlannedBudget,
    dataFlags: daily.map((item) => ({
      date: item.date,
      weekday: item.weekday,
      status: dataStatusForDay(item, currentDate),
    })),
    waterAverage: toDateMetrics.waterAverage,
    caffeineTotal: daily.reduce((sum, item) => sum + item.totals.caffeineMg, 0),
    caffeineAverage: toDateMetrics.caffeineAverage,
    alcoholTotal: daily.reduce(
      (sum, item) => sum + item.totals.alcoholUnits,
      0,
    ),
    alcoholAverage: toDateMetrics.alcoholAverage,
    plantServingsTotal: daily.reduce(
      (sum, item) => sum + item.totals.plantServings,
      0,
    ),
    uniquePlants: [...uniquePlants].sort(),
    nutrientAverages: toDateMetrics.nutrientAverages,
    foodNutrientAverages: toDateMetrics.foodNutrientAverages,
    supplementNutrientAverages: toDateMetrics.supplementNutrientAverages,
    fullWeekNutrientAverages: nutrientAverages,
    fullWeekFoodNutrientAverages: foodNutrientAverages,
    fullWeekSupplementNutrientAverages: supplementNutrientAverages,
    bowelEvents: sortBowelEvents(bowelEvents),
    bowelDistribution: createBowelDistribution(bowelEvents),
    mostCommonBowelType: getMostCommonBowelType(bowelEvents),
    daysWithBowelEntries: daily.filter((item) => item.totals.bowelEvents.length)
      .length,
    bodyEvents: sortBodyEvents(bodyEvents),
    glp1Doses: sortGlp1DoseEvents(glp1Doses),
  }
}

export const getMonthSummary = (days, settings, monthKey) => {
  const nutrients = getNutrients(settings)
  const currentDate = todayKey()
  const dateKeys = getMonthDates(monthKey)
  const existing = dateKeys.map((date) => ({
    date,
    day: ensureDay(days, date, settings),
  }))
  const eventDays = existing.filter(
    (item) => item.date <= currentDate && item.day.events?.length,
  )
  const averageDays = eventDays.length ? eventDays : []
  const divisor = averageDays.length || 1
  const nutrientAverages = emptyNutrients(nutrients)
  const foodNutrientAverages = emptyNutrients(nutrients)
  const supplementNutrientAverages = emptyNutrients(nutrients)
  const uniquePlants = new Set()
  const bowelEvents = []
  const bodyEvents = []
  const glp1Doses = []

  averageDays.forEach((item) => {
    const totals = getDayTotals(item.day, nutrients)
    nutrients.forEach((nutrient) => {
      nutrientAverages[nutrient.id] += totals.nutrients[nutrient.id] / divisor
      foodNutrientAverages[nutrient.id] +=
        totals.foodNutrients[nutrient.id] / divisor
      supplementNutrientAverages[nutrient.id] +=
        totals.supplementNutrients[nutrient.id] / divisor
    })
    totals.uniquePlants.forEach((plant) => uniquePlants.add(plant))
  })

  existing.forEach((item) => {
    const totals = getDayTotals(item.day, nutrients)
    bowelEvents.push(...totals.bowelEvents)
    bodyEvents.push(...totals.bodyEvents)
    glp1Doses.push(...totals.glp1Doses)
  })

  const calorieTargetAverage =
    (averageDays.length ? averageDays : existing).reduce(
      (sum, item) => sum + getTargetForDate(days, settings, item.date),
      0,
    ) / ((averageDays.length ? averageDays : existing).length || 1)

  return {
    label: formatMonth(monthKey),
    dateKeys,
    eventDays: eventDays.length,
    dataFlags: existing.map((item) => ({
      date: item.date,
      weekday: getWeekdayKey(item.date),
      status: dataStatusForDay(item, currentDate),
    })),
    nutrientAverages,
    foodNutrientAverages,
    supplementNutrientAverages,
    uniquePlants: [...uniquePlants].sort(),
    waterAverage:
      averageDays.reduce(
        (sum, item) => sum + getDayTotals(item.day, nutrients).waterMl,
        0,
      ) / divisor,
    caffeineTotal: existing.reduce(
      (sum, item) => sum + getDayTotals(item.day, nutrients).caffeineMg,
      0,
    ),
    caffeineAverage:
      averageDays.reduce(
        (sum, item) => sum + getDayTotals(item.day, nutrients).caffeineMg,
        0,
      ) / divisor,
    alcoholTotal: existing.reduce(
      (sum, item) => sum + getDayTotals(item.day, nutrients).alcoholUnits,
      0,
    ),
    alcoholAverage:
      averageDays.reduce(
        (sum, item) => sum + getDayTotals(item.day, nutrients).alcoholUnits,
        0,
      ) / divisor,
    plantServingsAverage:
      averageDays.reduce(
        (sum, item) => sum + getDayTotals(item.day, nutrients).plantServings,
        0,
      ) / divisor,
    calorieTargetAverage,
    bowelEvents: sortBowelEvents(bowelEvents),
    bowelDistribution: createBowelDistribution(bowelEvents),
    mostCommonBowelType: getMostCommonBowelType(bowelEvents),
    daysWithBowelEntries: existing.filter(
      (item) => getDayTotals(item.day, nutrients).bowelEvents.length,
    ).length,
    bodyEvents: sortBodyEvents(bodyEvents),
    glp1Doses: sortGlp1DoseEvents(glp1Doses),
  }
}

const nutrientLines = (
  totals,
  targets,
  nutrients = NUTRIENTS,
  targetOverrides = {},
) =>
  [...nutrients].sort((a, b) => {
    if (a.id === 'caloriesKcal') return 1
    if (b.id === 'caloriesKcal') return -1
    return 0
  }).map((nutrient) => {
    const value = round(totals[nutrient.id])
    const target = round(targetOverrides[nutrient.id] ?? targets[nutrient.id])
    if (!target) {
      return `- ${nutrient.label}: ${value}${nutrient.unit}`
    }
    const percent = target ? Math.round((value / target) * 100) : 0
    return `- ${nutrient.label}: ${value}${nutrient.unit} / ${target}${nutrient.unit} (${percent}%)`
  }).join('\n')

const bowelEventLines = (events = []) =>
  sortBowelEvents(events)
    .map((event) => `- ${event.time} Type ${event.type}`)
    .join('\n')

const bodyEventLabel = (event) => {
  const notes = event.notes ? ` (${event.notes})` : ''
  if (event.kind === 'hunger') return `hunger ${event.score}/10${notes}`
  if (event.kind === 'foodNoise') return `food noise ${event.score}/10`
  if (event.kind === 'craving') return `craving signal: ${event.label}`
  if (event.kind === 'glp1Symptom') {
    return `GLP-1 tolerability: ${event.label ?? event.symptom} ${event.severity}`
  }
  return event.kind
}

const bodyEventLines = (events = []) =>
  sortBodyEvents(events)
    .map((event) => `- ${event.time} ${bodyEventLabel(event)}`)
    .join('\n')

const hungerEventLines = (events = []) => {
  const hungerEvents = sortBodyEvents(events).filter(
    (event) => event.kind === 'hunger',
  )
  if (!hungerEvents.length) return '- No hunger events logged.'
  return hungerEvents
    .map(
      (event) =>
        `- ${event.time} hunger ${event.score}/10${
          event.notes ? ` (${event.notes})` : ''
        }`,
    )
    .join('\n')
}

const mealSatiationLines = (events = []) => {
  const foodEvents = sortBodyEvents(events)
  if (!foodEvents.length) return '- No food events logged.'
  return foodEvents
    .map(
      (event) =>
        `- ${event.time} ${event.name}: ${
          event.satietyScore ? `${event.satietyScore}/10` : 'not logged'
        }`,
    )
    .join('\n')
}

const inferredSatietyLines = (foodEvents = [], bodyEvents = []) => {
  const hungerEvents = sortBodyEvents(bodyEvents).filter(
    (event) => event.kind === 'hunger',
  )
  if (hungerEvents.length < 2) {
    return '- Not enough hunger-event timing yet to infer satiety patterns.'
  }

  const lines = sortBodyEvents(foodEvents)
    .map((event) => {
      const eventMinutes = timeMinutes(event.time)
      if (eventMinutes === null) return null
      const nextHunger = hungerEvents.find((hunger) => {
        const hungerMinutes = timeMinutes(hunger.time)
        return hungerMinutes !== null && hungerMinutes > eventMinutes
      })
      if (!nextHunger) return null
      const hungerMinutes = timeMinutes(nextHunger.time)
      const hoursLater = round((hungerMinutes - eventMinutes) / 60)
      return `- ${event.time} ${event.name}: next hunger ${nextHunger.time}, ${hoursLater}h later, ${nextHunger.score}/10`
    })
    .filter(Boolean)

  return lines.length
    ? lines.join('\n')
    : '- Hunger events are logged, but none after food events yet.'
}

const bodyEventSummary = (events = []) => {
  const hunger = events.filter((event) => event.kind === 'hunger')
  const foodNoise = events.filter((event) => event.kind === 'foodNoise')
  const cravings = events.filter((event) => event.kind === 'craving')
  const glp1Symptoms = events.filter((event) => event.kind === 'glp1Symptom')
  const avg = (items) =>
    items.length
      ? round(
          items.reduce((sum, event) => sum + (Number(event.score) || 0), 0) /
            items.length,
        )
      : null

  return {
    hungerAverage: avg(hunger),
    foodNoiseAverage: avg(foodNoise),
    cravings: [...new Set(cravings.map((event) => event.label).filter(Boolean))],
    glp1Symptoms,
    counts: {
      hunger: hunger.length,
      foodNoise: foodNoise.length,
      craving: cravings.length,
      glp1Symptom: glp1Symptoms.length,
    },
  }
}

const glp1Enabled = (settings) => Boolean(settings.glp1?.enabled)

const glp1ProteinFloor = (settings) =>
  Number(settings.glp1?.proteinFloorG) || 100

const glp1ProfileLine = (settings) => {
  const profile = settings.glp1 ?? {}
  return `${profile.medication || 'GLP-1'} ${
    profile.dose ? profile.dose : 'dose not set'
  }, ${profile.cadence || 'weekly'}${
    profile.cadence === 'weekly' && profile.doseDay
      ? ` on ${profile.doseDay}`
      : ''
  }`
}

const glp1DoseLines = (doses = []) => {
  if (!doses.length) return '- No GLP-1 dose logged in this period.'
  return sortGlp1DoseEvents(doses)
    .map(
      (event) =>
        `- ${event.date ?? ''} ${event.time} ${event.medication}: ${
          event.dose || 'dose not set'
        }${event.site ? `, site ${event.site}` : ''}`.trim(),
    )
    .join('\n')
}

const daysBetweenDateKeys = (fromDate, toDate) =>
  Math.max(
    0,
    Math.round(
      (parseDateKey(toDate).getTime() - parseDateKey(fromDate).getTime()) /
        86400000,
    ),
  )

const allGlp1DoseEventsFromDays = (days, fallbackDay) => {
  if (!days) return sortGlp1DoseEvents(fallbackDay?.glp1Doses ?? [])
  return sortGlp1DoseEvents(
    Object.values(days).flatMap((day) => day?.glp1Doses ?? []),
  )
}

const glp1DoseContext = (date, doses = [], settings) => {
  const sorted = sortGlp1DoseEvents(doses)
  const dosesToday = sorted.filter((event) => event.date === date)
  const latestDose = sorted.filter((event) => (event.date ?? '') <= date).at(-1)
  const usualDoseDay =
    settings.glp1?.cadence === 'weekly' &&
    settings.glp1?.doseDay === getWeekdayKey(date)

  return {
    daysSinceDose: latestDose?.date
      ? daysBetweenDateKeys(latestDose.date, date)
      : null,
    dosesToday,
    latestDose,
    usualDoseDay,
  }
}

const glp1DailyDoseContextLines = (day, settings, doses = []) => {
  const context = glp1DoseContext(day.date, doses, settings)
  const latestLine = context.latestDose
    ? `${context.latestDose.date} ${context.latestDose.time} ${
        context.latestDose.medication
      }${context.latestDose.dose ? ` ${context.latestDose.dose}` : ''}`
    : 'no prior dose logged'

  return `Jab day: ${
    context.dosesToday.length ? 'yes, dose logged today' : 'no logged dose today'
  }
Usual dose day: ${context.usualDoseDay ? 'yes' : 'no'}
Days since last logged dose: ${
    context.daysSinceDose === null ? 'not available' : context.daysSinceDose
  }
Latest logged dose: ${latestLine}`
}

const glp1SymptomEvents = (events = []) =>
  sortBodyEvents(events).filter((event) => event.kind === 'glp1Symptom')

const glp1SymptomSummaryLines = (events = []) => {
  const symptoms = glp1SymptomEvents(events)
  if (!symptoms.length) return '- No GLP-1 tolerability notes logged.'

  const counts = symptoms.reduce((summary, event) => {
    const label = event.label ?? event.symptom ?? 'GLP-1 note'
    const severity = event.severity ?? 'unspecified'
    const key = `${label} (${severity})`
    summary[key] = (summary[key] ?? 0) + 1
    return summary
  }, {})

  return Object.entries(counts)
    .map(([label, count]) => `- ${label}: ${count}`)
    .join('\n')
}

const average = (values = []) =>
  values.length
    ? values.reduce((sum, value) => sum + (Number(value) || 0), 0) /
      values.length
    : 0

const glp1ReportFlags = ({
  bodyEvents = [],
  bowelEvents = [],
  proteinValues = [],
  settings,
  waterValues = [],
}) => {
  const flags = []
  const proteinFloor = glp1ProteinFloor(settings)
  const missedProteinDays = proteinValues.filter(
    (value) => Number(value) < proteinFloor,
  ).length
  const symptoms = glp1SymptomEvents(bodyEvents)
  const strongSymptoms = symptoms.filter((event) => event.severity === 'strong')
  const vomitingEvents = symptoms.filter((event) => event.symptom === 'vomiting')
  const typeOneTwo = bowelEvents.filter((event) => Number(event.type) <= 2)
  const waterAverage = average(waterValues)

  if (proteinValues.length && missedProteinDays) {
    flags.push(
      `Protein floor missed on ${missedProteinDays} logged ${
        missedProteinDays === 1 ? 'day' : 'days'
      } (${proteinFloor}g floor).`,
    )
  }

  if (waterValues.length && waterAverage < settings.waterTargetMl * 0.8) {
    flags.push(
      `Fluid average below support anchor: ${round(waterAverage)}ml/day against ${settings.waterTargetMl}ml anchor.`,
    )
  }

  if (typeOneTwo.length >= 3 || (bowelEvents.length && typeOneTwo.length / bowelEvents.length >= 0.5)) {
    flags.push(
      `Constipation-pattern bowel signal: ${typeOneTwo.length} Type 1-2 events out of ${bowelEvents.length}.`,
    )
  }

  if (strongSymptoms.length) {
    flags.push(`Strong tolerability notes logged: ${strongSymptoms.length}.`)
  }

  if (vomitingEvents.length) {
    flags.push(`Vomiting logged: ${vomitingEvents.length} event(s).`)
  }

  if (strongSymptoms.length || vomitingEvents.length) {
    flags.push(
      'Medical check-in context: repeated vomiting, dehydration signs, severe abdominal pain, or persistent strong GI symptoms should be discussed with the prescriber.',
    )
  }

  return flags.length
    ? flags.map((flag) => `- ${flag}`).join('\n')
    : '- No GLP-1 report flags from logged data.'
}

const glp1DailySection = (day, totals, settings, days) => {
  if (!glp1Enabled(settings)) return ''
  const proteinFloor = glp1ProteinFloor(settings)
  const allDoses = allGlp1DoseEventsFromDays(days, day)
  return `
## GLP-1 Support
Medication profile: ${glp1ProfileLine(settings)}
Dose context:
${glp1DailyDoseContextLines(day, settings, allDoses)}
Protein floor: ${round(totals.nutrients.proteinG)}g / ${proteinFloor}g
Dose logs today:
${glp1DoseLines(totals.glp1Doses)}
Tolerability notes:
${glp1SymptomSummaryLines(totals.bodyEvents)}
Report flags:
${glp1ReportFlags({
    bodyEvents: totals.bodyEvents,
    bowelEvents: totals.bowelEvents,
    proteinValues: (day.events ?? []).length ? [totals.nutrients.proteinG] : [],
    settings,
    waterValues: (day.events ?? []).length ? [totals.waterMl] : [],
  })}`
}

const glp1PeriodSection = ({
  bodyEvents,
  bowelEvents,
  doses,
  label,
  proteinValues,
  settings,
  waterValues,
}) => {
  if (!glp1Enabled(settings)) return ''
  const proteinFloor = glp1ProteinFloor(settings)
  const metDays = proteinValues.filter((value) => Number(value) >= proteinFloor)
    .length
  const doseDates = new Set(doses.map((event) => event.date).filter(Boolean))
  return `
## GLP-1 Support
Medication profile: ${glp1ProfileLine(settings)}
${label} protein floor: ${metDays} / ${proteinValues.length} logged food days met ${proteinFloor}g
Dose days logged: ${doseDates.size}
Dose logs:
${glp1DoseLines(doses)}
Tolerability notes:
${glp1SymptomSummaryLines(bodyEvents)}
Report flags:
${glp1ReportFlags({
    bodyEvents,
    bowelEvents,
    proteinValues,
    settings,
    waterValues,
  })}`
}

const bowelDistributionLine = (distribution) =>
  BRISTOL_TYPE_IDS.map((id) => `T${id}:${distribution[id] ?? 0}`).join(' ')

const plantListLine = (plants = []) =>
  plants.length ? plants.join(', ') : 'none logged'

const REPORT_LENS =
  'Please analyse through a nutrition-first, body-neutral, anti-diet lens. Prioritise nourishment, consistency, symptoms, energy, digestion, satiation, hunger timing, inferred satiety patterns, curiosity, and self-knowledge over weight-loss judgement.'

const reportMetricLines = (metrics, fallback = '- Not enough logged days yet.') => {
  if (!metrics.count) return fallback

  return `- Protein avg: ${round(metrics.nutrientAverages.proteinG)}g/day
- Fibre avg: ${round(metrics.nutrientAverages.fibreG)}g/day
- Fluids avg: ${round(metrics.waterAverage)}ml/day
- Plant servings avg: ${round(metrics.plantServingsAverage)} servings/day
- Caffeine avg: ${round(metrics.caffeineAverage)}mg/day
- Alcohol avg: ${alcoholUnitsText(metrics.alcoholAverage)}/day
- Energy context avg: ${round(metrics.caloriesAverage)} kcal/day`
}

const todaySoFarLine = (item) => {
  if (!item) return '- Today is not part of this report week or has no food data yet.'
  return `- ${item.weekday} so far: ${round(
    item.totals.nutrients.proteinG,
  )}g protein, ${round(
    item.totals.nutrients.fibreG,
  )}g fibre, ${round(item.totals.waterMl)}ml fluids, ${round(
    item.totals.caloriesConsumed,
  )} kcal energy context`
}

const futureDaysLabel = (futureDays) => {
  if (!futureDays.length) return 'none'
  if (futureDays.length === 1) return futureDays[0].weekday
  return `${futureDays[0].weekday}-${futureDays.at(-1).weekday}`
}

const projectionLines = (week) => {
  if (!week.projectionMetrics.count) {
    return '- Not enough logged days to project the full week yet.'
  }

  return `- Projection source: ${week.projectionMetrics.count} logged ${
    week.projectionMetrics.count === 1 ? 'day' : 'days'
  }
- Projected protein: ${round(week.projectionMetrics.nutrientAverages.proteinG)}g/day
- Projected fibre: ${round(week.projectionMetrics.nutrientAverages.fibreG)}g/day
- Projected fluids: ${round(week.projectionMetrics.waterAverage)}ml/day
- Projected energy context: ${round(week.projectionMetrics.caloriesAverage * 7)} kcal/week`
}

const timeMinutes = (time = '') => {
  const [hours, minutes] = String(time).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const hasMixedDryLooseBowelSignal = (events = []) => {
  const sorted = sortBowelEvents(events)
  return sorted.some((event, index) => {
    const type = Number(event.type)
    if (type !== 1 && type !== 5) return false
    const eventMinutes = timeMinutes(event.time)

    return sorted.some((other, otherIndex) => {
      if (otherIndex === index || Number(other.type) !== (type === 1 ? 5 : 1)) {
        return false
      }
      if ((event.date ?? '') !== (other.date ?? '')) return false
      const otherMinutes = timeMinutes(other.time)
      if (eventMinutes === null || otherMinutes === null) return true
      return Math.abs(eventMinutes - otherMinutes) <= 8 * 60
    })
  })
}

const bowelSignalLine = (distribution, total, events = []) => {
  if (!total) return 'No bowel events logged.'
  if (hasMixedDryLooseBowelSignal(events)) {
    return `Mixed bowel pattern: Type 1 and Type 5 appeared close together (${distribution[1] ?? 0} Type 1, ${
      distribution[5] ?? 0
    } Type 5 out of ${total} events). Treat as a mixed transit signal rather than simple constipation or simple looseness.`
  }
  const dominant = BRISTOL_TYPE_IDS.reduce((best, id) => {
    const count = distribution[id] ?? 0
    return count > (distribution[best] ?? 0) ? id : best
  }, BRISTOL_TYPE_IDS[0])
  const count = distribution[dominant] ?? 0
  const label = getBristolType(dominant)?.label ?? 'unknown'
  const dominance = count / total >= 0.5 ? 'dominant pattern' : 'most common'
  return `Type ${dominant} ${dominance}: ${count} out of ${total} events (${label}).`
}

const periodEvents = (items) =>
  items.flatMap((item) => item.day?.events ?? [])

export const buildDailyReport = (day, settings, days = null) => {
  const nutrients = getNutrients(settings)
  const totals = getDayTotals(day, nutrients)
  const energyTarget = getEnergyTargetForDay(day, settings)
  const calorieTargets = { caloriesKcal: energyTarget }
  const calorieStreams = calorieStreamTotalsFromEvents(day.events ?? [])
  const plantCategories = collectPlantCategoriesFromEvents(day.events ?? [])
  const steeringSummary = buildSteeringSummary({
    averages: totals.nutrients,
    plantServingsAverage: totals.plantServings,
    uniquePlantCount: totals.uniquePlants.length,
    uniquePlantTarget: 0,
    waterAverage: totals.waterMl,
    settings,
    nutrients,
  })
  const events = (day.events ?? [])
    .map(
      (event) =>
        `- ${event.time} ${event.type}: ${event.name} (${round(
          event.nutrients.proteinG,
        )}g protein, ${round(
          event.nutrients.fibreG,
        )}g fibre${
          event.satietyScore ? `, satiation ${event.satietyScore}/10` : ''
        }${
          Number(event.plantServings)
            ? `, ${round(event.plantServings)} plant servings`
            : ''
        }${
          Number(event.caffeineMg) ? `, ${round(event.caffeineMg)}mg caffeine` : ''
        }${
          Number(event.alcoholUnits)
            ? `, ${alcoholUnitsText(event.alcoholUnits)} alcohol`
            : ''
        }, ${round(event.nutrients.caloriesKcal)} kcal energy context)`,
    )
    .join('\n')
  const bowelLines = bowelEventLines(totals.bowelEvents)
  const bodyLines = bodyEventLines(totals.bodyEvents)

  return `# WellFed Daily Report

Date: ${formatDate(day.date, { year: 'numeric' })}
Data status: ${dataStatusForDay({ date: day.date, day })}
Cycle day: ${day.cycleDay || 'not logged'}
Protein: ${round(totals.nutrients.proteinG)}g / ${
    settings.nutrientTargets.proteinG
  }g
Fibre: ${round(totals.nutrients.fibreG)}g / ${
    settings.nutrientTargets.fibreG
  }g
Fluids: ${round(totals.waterMl)}ml / ${settings.waterTargetMl}ml
Plants: ${round(totals.plantServings)} servings, ${
    totals.uniquePlants.length
  } unique
Plant foods logged: ${plantListLine(totals.uniquePlants)}
Caffeine: ${round(totals.caffeineMg)}mg
Alcohol: ${alcoholUnitsText(totals.alcoholUnits)}
Energy context: ${round(totals.caloriesConsumed)} / ${energyTarget} kcal
Calorie stream breakdown:
${calorieStreamLines(calorieStreams)}

## Steering Summary
${steeringSummary}

## Plant Diversity Split
${plantCategoryLines(plantCategories)}

## Events
${events || '- No events logged.'}

## Satiation and Hunger Timing
Meal satiation scores:
${mealSatiationLines(day.events ?? [])}
Hunger events timeline:
${hungerEventLines(totals.bodyEvents)}
Inferred satiety patterns:
${inferredSatietyLines(day.events ?? [], totals.bodyEvents)}

## Body Events
Bowel signal: ${bowelSignalLine(
    createBowelDistribution(totals.bowelEvents),
    totals.bowelEvents.length,
    totals.bowelEvents,
  )}
${bowelLines || '- No bowel events logged.'}
${bodyLines || '- No hunger or craving signals logged.'}
${glp1DailySection(day, totals, settings, days)}

## Nutrients
${nutrientLines(totals.nutrients, settings.nutrientTargets, nutrients, calorieTargets)}

## Food-Only Nutrients
${nutrientLines(totals.foodNutrients, settings.nutrientTargets, nutrients, calorieTargets)}

## Supplement-Only Nutrients
${nutrientLines(
    totals.supplementNutrients,
    settings.nutrientTargets,
    nutrients,
    calorieTargets,
  )}

## Notes for ChatGPT
${REPORT_LENS}
Please review this day for nutrition steering, patterns, and any useful adjustments.`
}

export const buildWeeklyReport = (days, settings, dateKey) => {
  const nutrients = getNutrients(settings)
  const week = getWeekSummary(days, settings, dateKey)
  const calorieTargets = { caloriesKcal: week.weeklyBudget / 7 }
  const reportEvents = periodEvents(week.daily)
  const calorieStreams = calorieStreamTotalsFromEvents(reportEvents)
  const plantCategories = collectPlantCategoriesFromEvents(reportEvents)
  const steeringSummary = buildSteeringSummary({
    averages: week.toDateMetrics.nutrientAverages,
    plantServingsAverage: week.toDateMetrics.plantServingsAverage,
    uniquePlantCount: week.uniquePlants.length,
    uniquePlantTarget: settings.weeklyUniquePlantsTarget,
    waterAverage: week.toDateMetrics.waterAverage,
    settings,
    nutrients,
  })
  const dayLines = week.daily
    .map(
      (item) =>
        `- ${item.weekday} ${item.date}: ${round(
          item.totals.nutrients.proteinG,
        )}g protein, ${round(item.totals.nutrients.fibreG)}g fibre, ${round(
          item.totals.waterMl,
        )}ml fluids, ${round(item.totals.caffeineMg)}mg caffeine, ${round(
          item.totals.alcoholUnits,
        )} alcohol units, ${round(item.totals.caloriesConsumed)}/${
          item.calorieTarget
        } kcal energy context [${dataStatusForDay(item, week.currentDate)}]`,
    )
    .join('\n')
  const mostCommon = week.mostCommonBowelType
    ? getBristolType(week.mostCommonBowelType)
    : null
  const bodySummary = bodyEventSummary(week.bodyEvents)
  const glp1ProteinValues = week.toDateLoggedDays.map(
    (item) => item.totals.nutrients.proteinG,
  )
  const glp1WaterValues = week.toDateLoggedDays.map(
    (item) => item.totals.waterMl,
  )

  return `# WellFed Weekly Report

Week: ${week.label}
Report mode summary: completed logged days are averaged separately from today so far. Future days are flagged, not averaged into week-to-date nutrition.
Protein average: ${round(week.nutrientAverages.proteinG)}g/day
Fibre average: ${round(week.nutrientAverages.fibreG)}g/day
Fluid average: ${round(week.waterAverage)}ml/day
Plants: ${week.uniquePlants.length} unique / ${
    settings.weeklyUniquePlantsTarget
  } anchor, ${round(week.plantServingsTotal)} servings total
Unique plant list: ${plantListLine(week.uniquePlants)}
Bowel events: ${week.bowelEvents.length} total, ${
    week.daysWithBowelEntries
  } days with entries
Bowel type distribution: ${bowelDistributionLine(week.bowelDistribution)}
Most common bowel type: ${
    mostCommon ? `Type ${mostCommon.id} (${mostCommon.label})` : 'not logged'
  }
Body events: hunger ${bodySummary.counts.hunger}, craving signals ${bodySummary.counts.craving}, GLP-1 notes ${bodySummary.counts.glp1Symptom}
Average hunger: ${
    bodySummary.hungerAverage === null
      ? 'not logged'
      : `${bodySummary.hungerAverage}/10`
  }
Craving signals: ${bodySummary.cravings.length ? bodySummary.cravings.join(', ') : 'none'}
Caffeine: ${round(week.caffeineTotal)}mg total, ${round(
    week.caffeineAverage,
  )}mg/day
Alcohol: ${alcoholUnitsText(week.alcoholTotal)} total, ${alcoholUnitsText(
    week.alcoholAverage,
  )}/day
Energy context: ${round(week.caloriesConsumed)} kcal logged / ${
    week.weeklyBudget
  } kcal weekly plan
Energy plan balance: ${energyBalanceText(week.caloriesRemaining)}
Calorie stream breakdown:
${calorieStreamLines(calorieStreams)}
Remaining planned energy ${futureDaysLabel(week.futureDays)}: ${round(
    week.futurePlannedBudget,
  )} kcal
Difference after planned allocations: ${energyBalanceText(
    week.remainingAfterFuturePlanned,
  )}

## Report Modes
### Week-to-date completed days only
${reportMetricLines(week.completedMetrics)}

### Week-to-date including today so far
${reportMetricLines(week.toDateMetrics)}
${todaySoFarLine(week.todayLoggedDay)}

### Full week projection
${projectionLines(week)}

## Steering Summary
${steeringSummary}

## Data Quality Flags
${dataFlagLines(week.daily, week.currentDate)}
Source confidence note: WellFed can flag partial, future, and no-data days. It does not currently distinguish backfilled estimates from fully logged days.

## Plant Diversity Split
${plantCategoryLines(plantCategories)}

## Bowel Signal
${bowelSignalLine(week.bowelDistribution, week.bowelEvents.length, week.bowelEvents)}
${glp1PeriodSection({
    bodyEvents: week.bodyEvents,
    bowelEvents: week.bowelEvents,
    doses: week.glp1Doses,
    label: 'Week-to-date',
    proteinValues: glp1ProteinValues,
    settings,
    waterValues: glp1WaterValues,
  })}

## Days
${dayLines}

## Nutrient Averages
${nutrientLines(week.nutrientAverages, settings.nutrientTargets, nutrients, calorieTargets)}

## Food-Only Nutrient Averages
${nutrientLines(
    week.foodNutrientAverages,
    settings.nutrientTargets,
    nutrients,
    calorieTargets,
  )}

## Supplement-Only Nutrient Averages
${nutrientLines(
    week.supplementNutrientAverages,
    settings.nutrientTargets,
    nutrients,
    calorieTargets,
  )}

## Notes for ChatGPT
${REPORT_LENS}
Please review this week for nutrition steering, consistency, and next-week support suggestions.`
}

export const buildMonthlyReport = (days, settings, monthKey) => {
  const nutrients = getNutrients(settings)
  const month = getMonthSummary(days, settings, monthKey)
  const calorieTargets = { caloriesKcal: month.calorieTargetAverage }
  const currentDate = todayKey()
  const monthEvents = month.dateKeys
    .filter((date) => date <= currentDate)
    .flatMap((date) => days[date]?.events ?? [])
  const calorieStreams = calorieStreamTotalsFromEvents(monthEvents)
  const plantCategories = collectPlantCategoriesFromEvents(monthEvents)
  const steeringSummary = buildSteeringSummary({
    averages: month.nutrientAverages,
    plantServingsAverage: month.plantServingsAverage,
    uniquePlantCount: month.uniquePlants.length,
    uniquePlantTarget: settings.weeklyUniquePlantsTarget,
    waterAverage: month.waterAverage,
    settings,
    nutrients,
  })
  const futureDaysInMonth = month.dateKeys.filter((date) => date > currentDate)
  const mostCommon = month.mostCommonBowelType
    ? getBristolType(month.mostCommonBowelType)
    : null
  const bodySummary = bodyEventSummary(month.bodyEvents)
  const loggedMonthItems = month.dateKeys
    .filter((date) => date <= currentDate && (days[date]?.events ?? []).length)
    .map((date) => ({
      date,
      totals: getDayTotals(days[date], nutrients),
    }))
  const glp1ProteinValues = loggedMonthItems.map(
    (item) => item.totals.nutrients.proteinG,
  )
  const glp1WaterValues = loggedMonthItems.map((item) => item.totals.waterMl)

  return `# WellFed Monthly Report

Month: ${month.label}
Logged food days: ${month.eventDays} / ${month.dateKeys.length}
Future days excluded from averages: ${futureDaysInMonth.length}
Protein average: ${round(month.nutrientAverages.proteinG)}g/day
Fibre average: ${round(month.nutrientAverages.fibreG)}g/day
Fluid average: ${round(month.waterAverage)}ml/day
Plant serving average: ${round(month.plantServingsAverage)} per day
Unique plants this month: ${month.uniquePlants.length}
Unique plant list: ${plantListLine(month.uniquePlants)}
Bowel events: ${month.bowelEvents.length} total, ${
    month.daysWithBowelEntries
  } days with entries
Bowel type distribution: ${bowelDistributionLine(month.bowelDistribution)}
Most common bowel type: ${
    mostCommon ? `Type ${mostCommon.id} (${mostCommon.label})` : 'not logged'
  }
Body events: hunger ${bodySummary.counts.hunger}, craving signals ${bodySummary.counts.craving}, GLP-1 notes ${bodySummary.counts.glp1Symptom}
Average hunger: ${
    bodySummary.hungerAverage === null
      ? 'not logged'
      : `${bodySummary.hungerAverage}/10`
  }
Craving signals: ${bodySummary.cravings.length ? bodySummary.cravings.join(', ') : 'none'}
Caffeine: ${round(month.caffeineTotal)}mg total, ${round(
    month.caffeineAverage,
  )}mg/day
Alcohol: ${alcoholUnitsText(month.alcoholTotal)} total, ${alcoholUnitsText(
    month.alcoholAverage,
  )}/day
Average energy plan: ${round(month.calorieTargetAverage)} kcal/day
Calorie stream breakdown:
${calorieStreamLines(calorieStreams)}

## Steering Summary
${steeringSummary}

## Data Coverage
- Averages use logged food days only, so future blank days do not dilute the month.
- Partial current day is included only if food has been logged.
- Source confidence note: WellFed does not currently distinguish backfilled estimates from fully logged days.

## Plant Diversity Split
${plantCategoryLines(plantCategories)}

## Bowel Signal
${bowelSignalLine(
    month.bowelDistribution,
    month.bowelEvents.length,
    month.bowelEvents,
  )}
${glp1PeriodSection({
    bodyEvents: month.bodyEvents,
    bowelEvents: month.bowelEvents,
    doses: month.glp1Doses,
    label: 'Month',
    proteinValues: glp1ProteinValues,
    settings,
    waterValues: glp1WaterValues,
  })}

## Nutrient Averages
${nutrientLines(month.nutrientAverages, settings.nutrientTargets, nutrients, calorieTargets)}

## Food-Only Nutrient Averages
${nutrientLines(
    month.foodNutrientAverages,
    settings.nutrientTargets,
    nutrients,
    calorieTargets,
  )}

## Supplement-Only Nutrient Averages
${nutrientLines(
    month.supplementNutrientAverages,
    settings.nutrientTargets,
    nutrients,
    calorieTargets,
  )}

## Notes for ChatGPT
${REPORT_LENS}
Please review this calendar month for nutrition steering, recurring gaps, and realistic support changes for the next month.`
}

const csvEscape = (value) => {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export const buildCsvExport = (days, settings) => {
  const nutrients = getNutrients(settings)
  const nutrientHeaders = nutrients.map((nutrient) => nutrient.id)
  const dailyHeaders = [
    'date',
    'cycleDay',
    'archived',
    'calorieTarget',
    'waterMl',
    'caffeineMg',
    'alcoholUnits',
    'plantServings',
    'uniquePlantCount',
    ...nutrientHeaders,
    ...nutrientHeaders.map((key) => `food_${key}`),
    ...nutrientHeaders.map((key) => `supplement_${key}`),
  ]
  const dailyRows = Object.values(days)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const totals = getDayTotals(day, nutrients)
      return [
        day.date,
        day.cycleDay,
        day.archived,
        day.calorieTarget,
        totals.waterMl,
        totals.caffeineMg,
        totals.alcoholUnits,
        totals.plantServings,
        totals.uniquePlants.length,
        ...nutrientHeaders.map((key) => round(totals.nutrients[key], 3)),
        ...nutrientHeaders.map((key) => round(totals.foodNutrients[key], 3)),
        ...nutrientHeaders.map((key) =>
          round(totals.supplementNutrients[key], 3),
        ),
      ]
    })

  const eventHeaders = [
    'date',
    'time',
    'type',
    'name',
    'satiationScore',
    'plantFoods',
    'plantServings',
    'caffeineMg',
    'alcoholUnits',
    'notes',
    ...nutrientHeaders,
  ]
  const eventRows = Object.values(days)
    .flatMap((day) =>
      (day.events ?? []).map((event) => [
        event.date,
        event.time,
        event.type,
        event.name,
        event.satietyScore ?? '',
        (event.plantFoods ?? []).join('; '),
        event.plantServings,
        event.caffeineMg ?? 0,
        event.alcoholUnits ?? 0,
        event.notes,
        ...nutrientHeaders.map((key) => round(event.nutrients?.[key], 3)),
      ]),
    )
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))

  const bowelHeaders = ['date', 'time', 'bristolType']
  const bowelRows = Object.values(days)
    .flatMap((day) =>
      (day.bowelEvents ?? []).map((event) => [
        event.date ?? day.date,
        event.time,
        event.type,
      ]),
    )
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))

  const bodyHeaders = [
    'date',
    'time',
    'kind',
    'score',
    'label',
    'symptom',
    'severity',
    'notes',
  ]
  const bodyRows = Object.values(days)
    .flatMap((day) =>
      (day.bodyEvents ?? []).map((event) => [
        event.date ?? day.date,
        event.time,
        event.kind,
        event.score ?? '',
        event.label ?? '',
        event.symptom ?? '',
        event.severity ?? '',
        event.notes ?? '',
      ]),
    )
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))

  const glp1Headers = ['date', 'time', 'medication', 'dose', 'site']
  const glp1Rows = Object.values(days)
    .flatMap((day) =>
      (day.glp1Doses ?? []).map((event) => [
        event.date ?? day.date,
        event.time,
        event.medication,
        event.dose ?? '',
        event.site ?? '',
      ]),
    )
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))

  const section = (title, headers, rows) =>
    [
      title,
      headers.map(csvEscape).join(','),
      ...rows.map((row) => row.map(csvEscape).join(',')),
    ].join('\n')

  return [
    section('Daily Summary', dailyHeaders, dailyRows),
    '',
    section('Food Events', eventHeaders, eventRows),
    '',
    section('Bowel Events', bowelHeaders, bowelRows),
    '',
    section('Body Events', bodyHeaders, bodyRows),
    '',
    section('GLP-1 Doses', glp1Headers, glp1Rows),
  ].join('\n')
}
