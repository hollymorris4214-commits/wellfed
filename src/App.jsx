import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import coffeeIconUrl from './assets/transparent_coffee_icon.svg'
import {
  BREATH_RELAXATION_OPTIONS,
  BRISTOL_TYPE_IDS,
  BRISTOL_TYPES,
  EMPTYING_QUALITY_OPTIONS,
  TOILET_TIME_OPTIONS,
  YES_NO_OPTIONS,
  bowelEventDetailText,
  bowelMechanicsText,
  bowelQualitySignalLine,
  getBristolType,
  getBowelEventQuality,
  summariseBowelQuality,
} from './data/bowel'
import {
  PCOS_DIGESTION_ISSUES,
  PCOS_EATING_DRIVERS,
  PCOS_INSULIN_RESISTANCE_OPTIONS,
  PCOS_PHASES,
  PCOS_POST_MEAL_RESPONSES,
  PCOS_PRIORITIES,
  PCOS_STRESS_PATTERNS,
  PCOS_SYMPTOMS,
  normalisePcosEventContext,
  pcosCheckinLine,
  pcosEventContextLine,
} from './data/pcos'
import {
  CALORIE_STREAMS,
  CALORIE_STREAM_IDS,
  NUTRIENT_GROUPS,
  WEEKDAY_KEYS,
  createCustomNutrient,
  getNutrients,
} from './data/nutrients'
import {
  addDays,
  dateKeyFromDate,
  formatDate,
  formatMonth,
  getMonthDates,
  getMonthKey,
  getWeekdayKey,
  parseDateKey,
  timeNow,
  todayKey,
} from './utils/date'
import {
  archiveStaleDays,
  clearRestoreSafetyBackup,
  createId,
  ensureDay,
  exportBackup,
  loadDays,
  loadRestoreSafetyBackup,
  loadSettings,
  normalizeBackup,
  saveDays,
  saveRestoreSafetyBackup,
  saveSettings,
} from './utils/storage'
import {
  buildTemplatePrompt,
  parseWellFedEvent,
  serializeEventToTemplate,
} from './utils/parser'
import {
  buildCsvExport,
  buildDailyReport,
  buildMonthlyReport,
  buildWeeklyReport,
  getDayTotals,
  getMonthSummary,
  getWeekSummary,
} from './utils/reports'

const TABS = ['dashboard', 'today', 'week', 'month', 'pantry', 'settings']
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('en-AU', { month: 'long' }).format(
    new Date(2026, index, 1),
  ),
)
const CRAVING_OPTIONS = [
  'sweet',
  'salty',
  'crunchy',
  'cold',
  'hot',
  'oily',
  'soda',
  'bread',
  'tangy',
  'sour',
]
const GLP1_MEDICATIONS = ['Ozempic', 'Wegovy', 'Mounjaro']
const GLP1_CADENCES = ['weekly', 'daily']
const GLP1_INJECTION_SITES = ['abdomen', 'thigh', 'upper arm', 'other']
const GLP1_SEVERITIES = ['mild', 'moderate', 'strong']
const GLP1_SYMPTOMS = [
  { id: 'nausea', label: 'Nausea' },
  { id: 'reflux', label: 'Reflux / heartburn' },
  { id: 'vomiting', label: 'Vomiting' },
  { id: 'diarrhoea', label: 'Diarrhoea' },
  { id: 'constipation', label: 'Constipation discomfort' },
  { id: 'dizzy', label: 'Lightheaded / dizzy' },
  { id: 'injectionSite', label: 'Injection site reaction' },
]
const BREAKDOWN_NUTRIENT_IDS = new Set([
  ...CALORIE_STREAM_IDS,
  'animalProteinG',
  'plantProteinG',
  'solubleFibreG',
  'insolubleFibreG',
  'saturatedFatG',
  'monounsaturatedFatG',
  'polyunsaturatedFatG',
  'transFatG',
  'omega3AlaG',
  'omega3EpaG',
  'omega3DhaG',
  'preformedVitaminAUg',
  'provitaminACarotenoidsUg',
  'hemeIronMg',
  'nonhemeIronMg',
])

const initialiseApp = () => {
  let settings = loadSettings()
  const loadedDays = loadDays()
  const archived = archiveStaleDays(loadedDays)
  const current = todayKey()
  const nextDays = {
    ...archived.days,
    [current]: ensureDay(archived.days, current, settings),
  }

  if (!settings.pantryBackfilledAt) {
    settings = {
      ...backfillPantryFromDays(settings, nextDays),
      pantryBackfilledAt: new Date().toISOString(),
    }
  }

  return {
    settings,
    days: nextDays,
    archivedDates: archived.archivedDates,
  }
}

const createBackupSummary = (days = {}, settings = {}) => {
  const dayRecords = Object.values(days ?? {})
  return {
    bodyEvents: dayRecords.reduce(
      (total, day) =>
        total +
        (day.bodyEvents?.length ?? 0) +
        (day.bowelEvents?.length ?? 0) +
        (day.glp1Doses?.length ?? 0),
      0,
    ),
    customNutrients: settings.customNutrients?.length ?? 0,
    days: dayRecords.length,
    foodEvents: dayRecords.reduce(
      (total, day) => total + (day.events?.length ?? 0),
      0,
    ),
    pantryItems: settings.pantryItems?.length ?? 0,
    supplementPresets: settings.supplementPresets?.length ?? 0,
  }
}

const formatBackupTime = (timestamp) => {
  const exportedAt = timestamp ? new Date(timestamp) : null
  if (!exportedAt || Number.isNaN(exportedAt.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(exportedAt)
}

const formatAmount = (value, digits = 0) => {
  const number = Number(value) || 0
  return new Intl.NumberFormat('en-AU', {
    maximumFractionDigits: digits,
  }).format(number)
}

const formatNutrientAmount = (value, unit = '', digits = 1) => {
  const cleanUnit = String(unit ?? '').trim()
  return `${formatAmount(value, digits)}${cleanUnit ? ` ${cleanUnit}` : ''}`
}

const formatSignedAmount = (value, digits = 0) => {
  const number = Number(value) || 0
  return `${number > 0 ? '+' : ''}${formatAmount(number, digits)}`
}

const formatUnitCount = (value) => {
  const number = Number(value) || 0
  return `${formatAmount(number, 1)} ${number === 1 ? 'unit' : 'units'}`
}

const calorieBalanceText = (consumed, target) => {
  const delta = (Number(consumed) || 0) - (Number(target) || 0)
  if (delta > 0) return `${formatAmount(delta)} kcal above plan`
  if (delta < 0) return `${formatAmount(Math.abs(delta))} kcal room in plan`
  return 'on plan'
}

const calorieBalanceClass = (consumed, target) => {
  const delta = (Number(consumed) || 0) - (Number(target) || 0)
  if (delta > 0) return 'over'
  if (delta < 0) return 'under'
  return 'even'
}

const energyTargetForDay = (day, settings) => {
  if (Number(day?.calorieTarget)) return Number(day.calorieTarget)
  const weekdayTarget = Number(
    day?.date ? settings.dailyCalorieGoals?.[getWeekdayKey(day.date)] : 0,
  )
  if (weekdayTarget) return weekdayTarget
  return Number(settings.nutrientTargets?.caloriesKcal) || 0
}

const percentOf = (value, target) => {
  if (!target) return 0
  return Math.max(0, Math.min(100, (Number(value) / Number(target)) * 100))
}

const normalizeTrackerText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const trackerKeywordMatches = (text, keyword) => {
  const normalizedKeyword = normalizeTrackerText(keyword)
  if (!normalizedKeyword) return false
  if (normalizedKeyword.includes(' ')) return text.includes(normalizedKeyword)
  return new RegExp(`(^|\\s)${normalizedKeyword}(\\s|$)`).test(text)
}

const eventMatchesCola = (event, keywords = []) => {
  const text = normalizeTrackerText(
    [event.name, event.notes, event.rawText].filter(Boolean).join(' '),
  )
  return keywords.some((keyword) => trackerKeywordMatches(text, keyword))
}

const dayHasFoodEntries = (day) => (day?.events ?? []).length > 0

const dayHasColaEvent = (day, keywords) =>
  (day?.events ?? []).some((event) => eventMatchesCola(event, keywords))

const colaTrackerLevel = (count) => {
  if (count >= 30) return 'tree'
  if (count >= 14) return 'bloom'
  if (count >= 7) return 'plant'
  if (count >= 3) return 'sprout'
  if (count >= 1) return 'seed'
  return 'rest'
}

const buildColaStretch = (days, dateKey, settings) => {
  const tracker = settings.colaStretch ?? {}
  const keywords = tracker.keywords?.length
    ? tracker.keywords
    : ['coca-cola', 'coca cola', 'coke', 'cola']
  const currentDate = todayKey()
  const selectedDay = days[dateKey]
  const selectedHasFood = dayHasFoodEntries(selectedDay)
  const selectedHasCola = dayHasColaEvent(selectedDay, keywords)
  let cursor = dateKey
  let count = 0

  for (let step = 0; step < 370; step += 1) {
    if (parseDateKey(cursor).getTime() > parseDateKey(currentDate).getTime()) {
      break
    }

    const day = days[cursor]
    if (!dayHasFoodEntries(day)) {
      if (cursor === dateKey && cursor === currentDate) {
        cursor = addDays(cursor, -1)
        continue
      }
      break
    }

    if (dayHasColaEvent(day, keywords)) break
    count += 1
    cursor = addDays(cursor, -1)
  }

  const loggedDates = Object.values(days)
    .filter((day) => day?.date && dayHasFoodEntries(day))
    .filter(
      (day) => parseDateKey(day.date).getTime() <= parseDateKey(dateKey).getTime(),
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  let best = 0
  let run = 0
  let previousDate = ''
  loggedDates.forEach((day) => {
    if (previousDate && day.date !== addDays(previousDate, 1)) {
      run = 0
    }
    run = dayHasColaEvent(day, keywords) ? 0 : run + 1
    best = Math.max(best, run)
    previousDate = day.date
  })

  return {
    best,
    count,
    dateKey,
    isToday: dateKey === currentDate,
    level: colaTrackerLevel(count),
    selectedHasCola,
    selectedHasFood,
  }
}

const sortEvents = (events) =>
  [...events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

const sortDoses = (events) =>
  [...events].sort((a, b) =>
    `${a.date ?? ''}${a.time}`.localeCompare(`${b.date ?? ''}${b.time}`),
  )

const getCalendarCells = (monthKey) => {
  const dates = getMonthDates(monthKey)
  const firstDate = parseDateKey(dates[0])
  const day = firstDate.getDay()
  const leadingDays = day === 0 ? 6 : day - 1
  const cells = []

  for (let index = leadingDays; index > 0; index -= 1) {
    cells.push({
      date: addDays(dates[0], -index),
      outside: true,
    })
  }

  dates.forEach((date) => cells.push({ date, outside: false }))

  while (cells.length % 7 !== 0) {
    cells.push({
      date: addDays(cells.at(-1).date, 1),
      outside: true,
    })
  }

  return cells
}

const downloadTextFile = (filename, text, type) => {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, 1000)
}

const formatShortTimestamp = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const formatPantryDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'saved'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

const normalizePantryText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const normalizePantryPlants = (plants = []) =>
  [
    ...new Set(
      (Array.isArray(plants) ? plants : [])
        .map((plant) => normalizePantryText(plant))
        .filter(Boolean),
    ),
  ].sort()

const pantryKeyForEvent = (event, nutrients) =>
  JSON.stringify({
    type: normalizePantryText(event.type || 'meal'),
    name: normalizePantryText(event.name),
    plantFoods: normalizePantryPlants(event.plantFoods),
    plantServings: Number(event.plantServings) || 0,
    caffeineMg: Number(event.caffeineMg) || 0,
    alcoholUnits: Number(event.alcoholUnits) || 0,
    nutrients: nutrients.map((nutrient) => [
      nutrient.id,
      Number(event.nutrients?.[nutrient.id]) || 0,
    ]),
  })

const pantryKeyCandidatesForItem = (item, nutrients) =>
  [
    item.key,
    pantryKeyForEvent(item, nutrients),
  ].filter(Boolean)

const pantryItemFromEvent = (event, nutrients, now = new Date().toISOString()) => ({
  id: createId(),
  key: pantryKeyForEvent(event, nutrients),
  type: event.type || 'meal',
  name: event.name,
  plantFoods: [
    ...new Set(
      (event.plantFoods ?? [])
        .map((plant) => String(plant).trim())
        .filter(Boolean),
    ),
  ],
  plantServings: Number(event.plantServings) || 0,
  caffeineMg: Number(event.caffeineMg) || 0,
  alcoholUnits: Number(event.alcoholUnits) || 0,
  nutrients: nutrients.reduce((values, nutrient) => {
    values[nutrient.id] = Number(event.nutrients?.[nutrient.id]) || 0
    return values
  }, {}),
  notes: event.notes ?? '',
  sourceEventId: event.id,
  timesLogged: 1,
  createdAt: now,
  updatedAt: now,
})

const backfillPantryFromDays = (settings, days) => {
  const nutrients = getNutrients(settings)
  const existingItems = Array.isArray(settings.pantryItems)
    ? settings.pantryItems
    : []
  const pantryItems = [...existingItems]
  const keys = new Map()
  pantryItems.forEach((item, index) => {
    pantryKeyCandidatesForItem(item, nutrients).forEach((key) => {
      keys.set(key, index)
    })
  })
  const events = Object.values(days)
    .flatMap((day) => day?.events ?? [])
    .sort((a, b) =>
      `${a.date ?? ''}${a.time ?? ''}`.localeCompare(
        `${b.date ?? ''}${b.time ?? ''}`,
      ),
    )

  events.forEach((event) => {
    const key = pantryKeyForEvent(event, nutrients)
    const existingIndex = keys.get(key)
    const timestamp = event.updatedAt || event.createdAt || new Date().toISOString()

    if (existingIndex !== undefined) {
      pantryItems[existingIndex] = {
        ...pantryItems[existingIndex],
        key,
        timesLogged: (Number(pantryItems[existingIndex].timesLogged) || 1) + 1,
        updatedAt: timestamp,
      }
      return
    }

    pantryItems.push(pantryItemFromEvent(event, nutrients, timestamp))
    keys.set(key, pantryItems.length - 1)
  })

  return {
    ...settings,
    pantryItems: pantryItems.sort((a, b) =>
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    ),
  }
}

function App() {
  const [initial] = useState(initialiseApp)
  const [settings, setSettings] = useState(initial.settings)
  const [days, setDays] = useState(initial.days)
  const [restoreSafetyBackup, setRestoreSafetyBackup] = useState(
    loadRestoreSafetyBackup,
  )
  const [activeTab, setActiveTab] = useState('dashboard')
  const [draft, setDraft] = useState('')
  const [editingEvent, setEditingEvent] = useState(null)
  const [parserError, setParserError] = useState('')
  const [toast, setToast] = useState(
    initial.archivedDates.length
      ? `${initial.archivedDates.length} past day archived.`
      : '',
  )
  const [templatePreview, setTemplatePreview] = useState(null)
  const [reportPreview, setReportPreview] = useState(null)
  const [backupPreview, setBackupPreview] = useState(null)
  const [flyNonce, setFlyNonce] = useState(0)
  const [presetDraft, setPresetDraft] = useState('')
  const [bodyPickerMode, setBodyPickerMode] = useState(null)
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [duplicateDraft, setDuplicateDraft] = useState(null)
  const [foodEntryOpen, setFoodEntryOpen] = useState(false)
  const [reportCopied, setReportCopied] = useState(false)
  const [attentionTarget, setAttentionTarget] = useState(null)
  const [updatedMetric, setUpdatedMetric] = useState(null)
  const [templateFeedback, setTemplateFeedback] = useState('')
  const templatePreviewRef = useRef(null)
  const reportPreviewRef = useRef(null)
  const nutrients = useMemo(() => getNutrients(settings), [settings])
  const currentDate = selectedDate
  const realToday = todayKey()
  const isViewingToday = currentDate === realToday
  const canGoForward = currentDate < realToday
  const currentMonth = getMonthKey(currentDate)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveDays(days)
  }, [days])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!attentionTarget) return undefined
    const timeout = setTimeout(() => setAttentionTarget(null), 1800)
    return () => clearTimeout(timeout)
  }, [attentionTarget])

  useEffect(() => {
    if (!updatedMetric) return undefined
    const timeout = setTimeout(() => setUpdatedMetric(null), 1300)
    return () => clearTimeout(timeout)
  }, [updatedMetric])

  useEffect(() => {
    if (!reportPreview || !reportPreviewRef.current) return
    setReportCopied(false)
    reportPreviewRef.current.focus()
    reportPreviewRef.current.select()
  }, [reportPreview])

  const today = useMemo(
    () => ensureDay(days, currentDate, settings),
    [currentDate, days, settings],
  )
  const backupSummary = useMemo(
    () => createBackupSummary(days, settings),
    [days, settings],
  )
  const restoreSafetySummary = useMemo(
    () =>
      restoreSafetyBackup
        ? createBackupSummary(
            restoreSafetyBackup.days,
            restoreSafetyBackup.settings,
          )
        : null,
    [restoreSafetyBackup],
  )
  const todayTotals = useMemo(
    () => getDayTotals(today, nutrients),
    [nutrients, today],
  )
  const week = useMemo(
    () => getWeekSummary(days, settings, currentDate),
    [currentDate, days, settings],
  )
  const dashboardDay = useMemo(
    () => ensureDay(days, realToday, settings),
    [days, realToday, settings],
  )
  const dashboardTotals = useMemo(
    () => getDayTotals(dashboardDay, nutrients),
    [dashboardDay, nutrients],
  )
  const dashboardWeek = useMemo(
    () => getWeekSummary(days, settings, realToday),
    [days, realToday, settings],
  )

  const selectDate = (dateKey) => {
    setSelectedDate(dateKey)
    setBodyPickerMode(null)
    setTemplatePreview(null)
    setTemplateFeedback('')
    setParserError('')
    setFoodEntryOpen(false)
  }

  const goToPreviousDay = () => {
    selectDate(addDays(currentDate, -1))
  }

  const goToNextDay = () => {
    const nextDate = addDays(currentDate, 1)
    selectDate(nextDate > todayKey() ? todayKey() : nextDate)
  }

  const goToToday = () => {
    selectDate(todayKey())
  }

  const updateDay = (date, updater) => {
    setDays((previous) => {
      const existing = ensureDay(previous, date, settings)
      const updated = updater(existing)
      return {
        ...previous,
        [date]: {
          ...updated,
          date,
        },
      }
    })
  }

  const fallbackCopyText = (text) => {
    let eventCopied = false
    const copyHandler = (event) => {
      event.clipboardData?.setData('text/plain', text)
      event.preventDefault()
      eventCopied = true
    }

    document.addEventListener('copy', copyHandler)
    const commandCopied = document.execCommand('copy')
    document.removeEventListener('copy', copyHandler)
    if (commandCopied && eventCopied) {
      return true
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-1000px'
    textarea.style.left = '-1000px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  }

  const copyText = async (
    text,
    message,
    fallbackMessage = 'Copy is blocked. Select the visible text.',
    options = {},
  ) => {
    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        copied = true
      }
    } catch {
      copied = false
    }

    if (!copied) {
      try {
        copied = fallbackCopyText(text)
      } catch {
        copied = false
      }
    }

    if (options.toast !== false) {
      setToast(copied ? message : fallbackMessage)
    }
    return copied
  }

  const copyTemplateForDate = (
    eventType,
    date = currentDate,
    message = `${eventType} template copied.`,
    fallbackMessage,
  ) => {
    const dayForTemplate = ensureDay(days, date, settings)
    const weekForTemplate = getWeekSummary(days, settings, date)
    const template = buildTemplatePrompt({
      date,
      time: timeNow(),
      cycleDay: dayForTemplate.cycleDay,
      eventType,
      nutrients,
      weeklyPlants: weekForTemplate.uniquePlants,
      weekLabel: weekForTemplate.label,
    })
    setFoodEntryOpen(true)
    setTemplatePreview({
      title: `${eventType[0].toUpperCase()}${eventType.slice(1)} template`,
      text: template,
    })
    setTemplateFeedback(`${eventType[0].toUpperCase()}${eventType.slice(1)} template ready.`)
    copyText(template, message, fallbackMessage, { toast: false }).then((copied) => {
      setTemplateFeedback(
        copied
          ? `${eventType[0].toUpperCase()}${eventType.slice(1)} template copied.`
          : `${eventType[0].toUpperCase()}${eventType.slice(1)} template ready. Use Copy again or Select text if clipboard access is blocked.`,
      )
    })
  }

  const copyTemplate = (eventType) => {
    copyTemplateForDate(eventType, currentDate)
  }

  const openTodayJournal = () => {
    setSelectedDate(realToday)
    setActiveTab('today')
  }

  const openTodayWithTemplate = (eventType) => {
    setSelectedDate(realToday)
    setActiveTab('today')
    setBodyPickerMode(null)
    setAttentionTarget({ id: Date.now(), target: 'food' })
    copyTemplateForDate(
      eventType,
      realToday,
      `${eventType[0].toUpperCase()}${eventType.slice(1)} template ready.`,
      `${eventType[0].toUpperCase()}${eventType.slice(1)} template ready. Select the visible text if copy is blocked.`,
    )
  }

  const addDashboardWater = () => {
    updateDay(realToday, (day) => ({
      ...day,
      waterMl: Math.max(0, (Number(day.waterMl) || 0) + 250),
    }))
    setUpdatedMetric('fluids')
    setToast('Added 250ml fluids.')
  }

  const openTodayBodyNote = () => {
    setSelectedDate(realToday)
    setActiveTab('today')
    setBodyPickerMode('menu')
    setAttentionTarget({ id: Date.now(), target: 'body' })
    setToast('Body note ready.')
  }

  const markReportCopied = () => {
    setReportCopied(true)
    window.setTimeout(() => setReportCopied(false), 1400)
  }

  const copyVisibleReport = async () => {
    if (!reportPreview) return
    if (reportPreviewRef.current) {
      reportPreviewRef.current.focus()
      reportPreviewRef.current.select()
      try {
        if (document.execCommand('copy')) {
          setToast(`${reportPreview.title} copied.`)
          markReportCopied()
          return
        }
      } catch {
        // Fall through to the async clipboard attempt below.
      }
    }
    const copied = await copyText(reportPreview.text, `${reportPreview.title} copied.`)
    if (copied) markReportCopied()
  }

  const downloadVisibleReport = () => {
    if (!reportPreview) return
    const slug = reportPreview.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadTextFile(
      `wellfed-${slug}-${currentDate}.txt`,
      reportPreview.text,
      'text/plain',
    )
    setToast(`${reportPreview.title} downloaded.`)
  }

  const removeEventFromDay = (sourceDays, date, eventId) => {
    const day = sourceDays[date]
    if (!day) return sourceDays
    return {
      ...sourceDays,
      [date]: {
        ...day,
        events: (day.events ?? []).filter((event) => event.id !== eventId),
      },
    }
  }

  const upsertEvent = (event, previousEvent) => {
    setDays((previous) => {
      let next = previousEvent
        ? removeEventFromDay(previous, previousEvent.date, previousEvent.id)
        : previous
      const targetDay = ensureDay(next, event.date, settings)
      const nextEvents = sortEvents([...(targetDay.events ?? []), event])

      next = {
        ...next,
        [event.date]: {
          ...targetDay,
          cycleDay: event.cycleDay || targetDay.cycleDay,
          events: nextEvents,
        },
      }

      return next
    })
  }

  const archiveEventToPantry = (event) => {
    const key = pantryKeyForEvent(event, nutrients)
    const now = new Date().toISOString()

    setSettings((previous) => {
      const pantryItems = Array.isArray(previous.pantryItems)
        ? previous.pantryItems
        : []
      const existingIndex = pantryItems.findIndex(
        (item) => pantryKeyCandidatesForItem(item, nutrients).includes(key),
      )

      if (existingIndex >= 0) {
        const existing = pantryItems[existingIndex]
        const updated = {
          ...existing,
          key,
          sourceEventId: event.id,
          notes: event.notes ?? existing.notes ?? '',
          timesLogged: (Number(existing.timesLogged) || 1) + 1,
          updatedAt: now,
        }
        return {
          ...previous,
          pantryItems: [
            updated,
            ...pantryItems.filter((_, index) => index !== existingIndex),
          ],
        }
      }

      return {
        ...previous,
        pantryItems: [pantryItemFromEvent(event, nutrients, now), ...pantryItems],
      }
    })
  }

  const logPantryItem = (item) => {
    const now = new Date().toISOString()
    const event = {
      id: createId(),
      type: item.type || 'meal',
      name: item.name,
      date: currentDate,
      time: timeNow(),
      cycleDay: today.cycleDay,
      plantFoods: [...(item.plantFoods ?? [])],
      plantServings: Number(item.plantServings) || 0,
      satietyScore: '',
      caffeineMg: Number(item.caffeineMg) || 0,
      alcoholUnits: Number(item.alcoholUnits) || 0,
      nutrients: nutrients.reduce((values, nutrient) => {
        values[nutrient.id] = Number(item.nutrients?.[nutrient.id]) || 0
        return values
      }, {}),
      notes: item.notes ?? 'Logged from pantry.',
      rawText: '',
      createdAt: now,
      updatedAt: now,
    }

    event.rawText = serializeEventToTemplate(event, nutrients)
    upsertEvent(event)
    archiveEventToPantry(event)
    setFlyNonce(Date.now())
    setSelectedDate(event.date)
    setActiveTab('today')
    setToast(`${event.name} logged from pantry.`)
  }

  const removePantryItem = (itemId) => {
    setSettings((previous) => ({
      ...previous,
      pantryItems: (previous.pantryItems ?? []).filter(
        (item) => item.id !== itemId,
      ),
    }))
    setToast('Pantry item removed.')
  }

  const logEventFromDraft = () => {
    try {
      const parsed = parseWellFedEvent(draft, nutrients)
      const event = {
        ...parsed,
        ...(editingEvent?.pcosContext
          ? { pcosContext: editingEvent.pcosContext }
          : {}),
        id: editingEvent?.id ?? createId(),
        createdAt: editingEvent?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      upsertEvent(event, editingEvent)
      archiveEventToPantry(event)
      setDraft('')
      setEditingEvent(null)
      setParserError('')
      setFlyNonce(Date.now())
      selectDate(event.date)
      setFoodEntryOpen(true)
      setToast(editingEvent ? 'Event updated.' : 'Event logged.')
    } catch (error) {
      setParserError(error.message)
    }
  }

  const editEvent = (event) => {
    setEditingEvent(event)
    setDraft(serializeEventToTemplate(event, nutrients))
    setParserError('')
    setSelectedDate(event.date)
    setActiveTab('today')
    setFoodEntryOpen(true)
    setToast('Event loaded for editing.')
  }

  const deleteEvent = (event) => {
    setDays((previous) => removeEventFromDay(previous, event.date, event.id))
    if (editingEvent?.id === event.id) {
      setEditingEvent(null)
      setDraft('')
      setFoodEntryOpen(false)
    }
    setToast('Event deleted.')
  }

  const openDuplicateEvent = (event) => {
    const date = todayKey()
    setDuplicateDraft({
      date,
      event,
      monthKey: getMonthKey(date),
      time: timeNow(),
    })
  }

  const closeDuplicateEvent = () => {
    setDuplicateDraft(null)
  }

  const updateDuplicateDraft = (updates) => {
    setDuplicateDraft((previous) =>
      previous
        ? {
            ...previous,
            ...updates,
          }
        : previous,
    )
  }

  const duplicateEventToDate = () => {
    if (!duplicateDraft?.event) return

    const now = new Date().toISOString()
    const destinationDay = ensureDay(days, duplicateDraft.date, settings)
    const event = {
      ...duplicateDraft.event,
      id: createId(),
      date: duplicateDraft.date,
      time: duplicateDraft.time,
      cycleDay: destinationDay.cycleDay || '',
      plantFoods: [...(duplicateDraft.event.plantFoods ?? [])],
      nutrients: { ...(duplicateDraft.event.nutrients ?? {}) },
      rawText: '',
      satietyScore: '',
      createdAt: now,
      updatedAt: now,
    }
    delete event.pcosContext

    event.rawText = serializeEventToTemplate(event, nutrients)
    upsertEvent(event)
    archiveEventToPantry(event)
    selectDate(event.date)
    setActiveTab('today')
    setDuplicateDraft(null)
    setToast(`${event.name} duplicated.`)
  }

  const logSupplementPreset = (preset) => {
    const event = {
      id: createId(),
      type: 'supplement',
      name: preset.name,
      date: currentDate,
      time: timeNow(),
      cycleDay: today.cycleDay,
      plantFoods: [],
      plantServings: 0,
      caffeineMg: Number(preset.caffeineMg) || 0,
      alcoholUnits: Number(preset.alcoholUnits) || 0,
      nutrients: preset.nutrients,
      notes: preset.notes ?? 'Logged from supplement preset.',
      rawText: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    event.rawText = serializeEventToTemplate(event, nutrients)
    upsertEvent(event)
    archiveEventToPantry(event)
    setFlyNonce(Date.now())
    setToast(`${preset.name} logged.`)
  }

  const saveSupplementPreset = () => {
    try {
      const parsed = parseWellFedEvent(presetDraft, nutrients)
      if (parsed.type !== 'supplement') {
        throw new Error('Supplement presets must use type: supplement.')
      }
      const preset = {
        id: createId(),
        name: parsed.name,
        caffeineMg: parsed.caffeineMg,
        alcoholUnits: parsed.alcoholUnits,
        nutrients: parsed.nutrients,
        notes: parsed.notes,
        rawText: parsed.rawText,
      }
      setSettings((previous) => ({
        ...previous,
        supplementPresets: [...previous.supplementPresets, preset],
      }))
      setPresetDraft('')
      setToast('Supplement preset saved.')
    } catch (error) {
      setToast('Preset not saved.')
      setParserError(error.message)
    }
  }

  const removeSupplementPreset = (presetId) => {
    setSettings((previous) => ({
      ...previous,
      supplementPresets: previous.supplementPresets.filter(
        (preset) => preset.id !== presetId,
      ),
    }))
    setToast('Supplement preset removed.')
  }

  const updateSettings = (updater) => {
    setSettings((previous) => updater(previous))
  }

  const addCustomNutrient = (draft) => {
    try {
      const nutrient = createCustomNutrient(draft)
      const existing = getNutrients(settings)
      if (
        existing.some(
          (item) =>
            item.id === nutrient.id || item.templateKey === nutrient.templateKey,
        )
      ) {
        setToast('That nutrient already exists.')
        return false
      }

      const target = Number(draft.target) || 0
      setSettings((previous) => ({
        ...previous,
        customNutrients: [...(previous.customNutrients ?? []), nutrient],
        nutrientTargets: {
          ...previous.nutrientTargets,
          [nutrient.id]: target,
        },
      }))
      setToast(`${nutrient.label} added.`)
      return true
    } catch (error) {
      setToast(error.message)
      return false
    }
  }

  const removeCustomNutrient = (nutrientId) => {
    setSettings((previous) => {
      const nextTargets = { ...previous.nutrientTargets }
      delete nextTargets[nutrientId]
      return {
        ...previous,
        customNutrients: (previous.customNutrients ?? []).filter(
          (nutrient) => nutrient.id !== nutrientId,
        ),
        nutrientTargets: nextTargets,
      }
    })
    setToast('Custom nutrient removed.')
  }

  const updateCalorieGoalForDate = (date, value) => {
    const calorieTarget = Number(value) || 0
    updateDay(date, (day) => ({
      ...day,
      calorieTarget,
    }))
  }

  const updateFoodEventTime = (event, time) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return

    updateDay(event.date, (day) => {
      const updatedEvents = (day.events ?? []).map((item) => {
        if (item.id !== event.id) return item
        const updated = {
          ...item,
          time,
          updatedAt: new Date().toISOString(),
        }
        return {
          ...updated,
          rawText: serializeEventToTemplate(updated, nutrients),
        }
      })

      return {
        ...day,
        events: sortEvents(updatedEvents),
      }
    })
    setToast('Food time updated.')
  }

  const updateFoodEventSatiety = (event, value) => {
    const satietyScore = value === '' ? '' : Number(value)
    if (
      satietyScore !== '' &&
      (!Number.isInteger(satietyScore) || satietyScore < 1 || satietyScore > 10)
    ) {
      return
    }

    updateDay(event.date, (day) => {
      const updatedEvents = (day.events ?? []).map((item) => {
        if (item.id !== event.id) return item
        const updated = {
          ...item,
          satietyScore,
          updatedAt: new Date().toISOString(),
        }
        return {
          ...updated,
          rawText: serializeEventToTemplate(updated, nutrients),
        }
      })

      return {
        ...day,
        events: sortEvents(updatedEvents),
      }
    })
    setToast(
      satietyScore === ''
        ? 'Satiation cleared.'
        : `Satiation ${satietyScore}/10 saved.`,
    )
  }

  const updateFoodEventPcosContext = (event, context) => {
    const pcosContext = normalisePcosEventContext(context)
    updateDay(event.date, (day) => ({
      ...day,
      events: sortEvents(
        (day.events ?? []).map((item) =>
          item.id === event.id
            ? {
                ...item,
                pcosContext,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      ),
    }))
    setToast('PCOS context saved.')
  }

  const logBowelEvent = (details) => {
    const payload =
      typeof details === 'object' && details !== null ? details : { type: details }
    const mechanics = Object.entries(payload.mechanics ?? {}).reduce(
      (summary, [key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          summary[key] = value
        }
        return summary
      },
      {},
    )
    const bowelEvent = {
      id: createId(),
      date: currentDate,
      time: timeNow(),
      type: Number(payload.type),
      ...(payload.strainScore !== undefined && payload.strainScore !== ''
        ? { strainScore: Number(payload.strainScore) }
        : {}),
      ...(payload.painScore !== undefined && payload.painScore !== ''
        ? { painScore: Number(payload.painScore) }
        : {}),
      ...(payload.emptyingQuality ? { emptyingQuality: payload.emptyingQuality } : {}),
      ...(payload.toiletTime ? { toiletTime: payload.toiletTime } : {}),
      ...(payload.repeatTrips === 'yes'
        ? { repeatTrips: true }
        : payload.repeatTrips === 'no'
          ? { repeatTrips: false }
          : {}),
      ...(payload.notes?.trim() ? { notes: payload.notes.trim() } : {}),
      ...(Object.keys(mechanics).length ? { mechanics } : {}),
      createdAt: new Date().toISOString(),
    }
    updateDay(currentDate, (day) => ({
      ...day,
      bowelEvents: [...(day.bowelEvents ?? []), bowelEvent].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    }))
    setBodyPickerMode(null)
    setToast(`Type ${payload.type} appearance and evacuation note logged.`)
  }

  const updateBowelEventTime = (eventId, time) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return

    updateDay(currentDate, (day) => ({
      ...day,
      bowelEvents: (day.bowelEvents ?? [])
        .map((event) =>
          event.id === eventId
            ? {
                ...event,
                time,
                updatedAt: new Date().toISOString(),
              }
            : event,
        )
        .sort((a, b) => a.time.localeCompare(b.time)),
    }))
    setToast('Body time updated.')
  }

  const deleteBowelEvent = (eventId) => {
    updateDay(currentDate, (day) => ({
      ...day,
      bowelEvents: (day.bowelEvents ?? []).filter((event) => event.id !== eventId),
    }))
    setToast('Bowel event deleted.')
  }

  const logBodyScoreEvent = (kind, score, notes = '') => {
    const cleanNotes = notes.trim()
    const event = {
      id: createId(),
      date: currentDate,
      time: timeNow(),
      kind,
      score,
      notes: cleanNotes,
      createdAt: new Date().toISOString(),
    }
    updateDay(currentDate, (day) => ({
      ...day,
      bodyEvents: [...(day.bodyEvents ?? []), event].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    }))
    setBodyPickerMode(null)
    setToast(`${bodyEventKindLabel(kind)} ${score}/10 logged.`)
  }

  const logCravingEvent = (craving) => {
    const label = craving.trim()
    if (!label) return
    const event = {
      id: createId(),
      date: currentDate,
      time: timeNow(),
      kind: 'craving',
      label,
      createdAt: new Date().toISOString(),
    }
    updateDay(currentDate, (day) => ({
      ...day,
      bodyEvents: [...(day.bodyEvents ?? []), event].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    }))
    setBodyPickerMode(null)
    setToast(`${label} craving logged.`)
  }

  const logGlp1SymptomEvent = (symptomId, severity) => {
    const symptom = GLP1_SYMPTOMS.find((item) => item.id === symptomId)
    if (!symptom || !GLP1_SEVERITIES.includes(severity)) return
    const event = {
      id: createId(),
      date: currentDate,
      time: timeNow(),
      kind: 'glp1Symptom',
      symptom: symptom.id,
      label: symptom.label,
      severity,
      createdAt: new Date().toISOString(),
    }
    updateDay(currentDate, (day) => ({
      ...day,
      bodyEvents: [...(day.bodyEvents ?? []), event].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    }))
    setBodyPickerMode(null)
    setToast(`${symptom.label} (${severity}) logged.`)
  }

  const logPcosContextEvent = ({
    irregularityNote = '',
    notes = '',
    periodActive = '',
    phase = '',
    symptoms = [],
  }) => {
    const event = {
      id: createId(),
      date: currentDate,
      time: timeNow(),
      kind: 'pcosContext',
      periodActive,
      phase,
      symptoms: [...symptoms],
      irregularityNote: irregularityNote.trim(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    }
    updateDay(currentDate, (day) => ({
      ...day,
      bodyEvents: [...(day.bodyEvents ?? []), event].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    }))
    setBodyPickerMode(null)
    setToast('PCOS context noted.')
  }

  const logGlp1Dose = ({ dose, site }) => {
    const profile = settings.glp1 ?? {}
    const event = {
      id: createId(),
      date: currentDate,
      time: timeNow(),
      medication: profile.medication || 'Wegovy',
      dose: String(dose || profile.dose || '').trim(),
      site: String(site || '').trim(),
      createdAt: new Date().toISOString(),
    }
    updateDay(currentDate, (day) => ({
      ...day,
      glp1Doses: sortDoses([...(day.glp1Doses ?? []), event]),
    }))
    setToast(`${event.medication} dose logged.`)
  }

  const updateGlp1DoseTime = (eventId, time) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return

    updateDay(currentDate, (day) => ({
      ...day,
      glp1Doses: sortDoses(
        (day.glp1Doses ?? []).map((event) =>
          event.id === eventId
            ? {
                ...event,
                time,
                updatedAt: new Date().toISOString(),
              }
            : event,
        ),
      ),
    }))
    setToast('Dose time updated.')
  }

  const deleteGlp1Dose = (eventId) => {
    updateDay(currentDate, (day) => ({
      ...day,
      glp1Doses: (day.glp1Doses ?? []).filter((event) => event.id !== eventId),
    }))
    setToast('Dose log removed.')
  }

  const updateBodyEventTime = (eventId, time) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return

    updateDay(currentDate, (day) => ({
      ...day,
      bodyEvents: (day.bodyEvents ?? [])
        .map((event) =>
          event.id === eventId
            ? {
                ...event,
                time,
                updatedAt: new Date().toISOString(),
              }
            : event,
        )
        .sort((a, b) => a.time.localeCompare(b.time)),
    }))
    setToast('Body event time updated.')
  }

  const deleteBodyEvent = (eventId) => {
    updateDay(currentDate, (day) => ({
      ...day,
      bodyEvents: (day.bodyEvents ?? []).filter((event) => event.id !== eventId),
    }))
    setToast('Body event deleted.')
  }

  const copyReport = (type) => {
    const reportLabels = {
      daily: 'Daily report',
      weekly: 'Weekly report',
      monthly: 'Monthly report',
    }
    let text = ''

    if (type === 'daily') {
      text = buildDailyReport(today, settings, days)
    }
    if (type === 'weekly') {
      text = buildWeeklyReport(days, settings, currentDate)
    }
    if (type === 'monthly') {
      text = buildMonthlyReport(days, settings, currentMonth)
    }
    if (!text) return

    const title = reportLabels[type] ?? 'Report'
    setReportPreview({
      generatedAt: new Date().toISOString(),
      text,
      title,
      type,
    })
    copyText(text, `${title} copied.`).then((copied) => {
      if (copied) markReportCopied()
    })
  }

  const createBackupPayload = () => ({
    filename: `wellfed-backup-${currentDate}.json`,
    generatedAt: new Date().toISOString(),
    text: JSON.stringify(exportBackup(days, settings), null, 2),
  })

  const ensureBackupPreview = () => {
    const payload = backupPreview ?? createBackupPayload()
    setBackupPreview(payload)
    return payload
  }

  const exportJson = () => {
    const payload = createBackupPayload()
    setBackupPreview(payload)
    downloadTextFile(
      payload.filename,
      payload.text,
      'application/json;charset=utf-8',
    )
    setToast('Backup prepared. If no file appears, use Copy or Share.')
  }

  const copyBackupJson = () => {
    const payload = ensureBackupPreview()
    copyText(
      payload.text,
      'Backup copied.',
      'Copy is blocked. The backup text is visible below.',
    )
  }

  const shareBackupJson = async () => {
    const payload = ensureBackupPreview()

    if (!navigator.share) {
      setToast('Share is not available here. Use Copy backup text.')
      return
    }

    try {
      const backupFile =
        typeof File !== 'undefined'
          ? new File([payload.text], payload.filename, {
              type: 'application/json',
            })
          : null

      if (backupFile && navigator.canShare?.({ files: [backupFile] })) {
        await navigator.share({
          files: [backupFile],
          title: 'WellFed backup',
        })
      } else {
        await navigator.share({
          text: payload.text,
          title: 'WellFed backup',
        })
      }

      setToast('Backup shared.')
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setToast('Share was blocked. Use Copy backup text.')
      }
    }
  }

  const exportCsv = () => {
    downloadTextFile(
      `wellfed-export-${currentDate}.csv`,
      buildCsvExport(days, settings),
      'text/csv',
    )
  }

  const restoreBackupObject = (
    incomingBackup,
    successMessage = 'Backup restored. Undo copy saved.',
  ) => {
    try {
      const backup = normalizeBackup(incomingBackup)
      const importedSettings = backup.settings.pantryBackfilledAt
        ? backup.settings
        : {
            ...backfillPantryFromDays(backup.settings, backup.days),
            pantryBackfilledAt: new Date().toISOString(),
          }
      const safetyBackup = exportBackup(days, settings)
      saveRestoreSafetyBackup(safetyBackup)
      setRestoreSafetyBackup(safetyBackup)
      setSettings(importedSettings)
      setDays(backup.days)
      setToast(successMessage)
      return true
    } catch (error) {
      setToast(error.message)
      return false
    }
  }

  const importBackupText = (text) => {
    if (!text.trim()) {
      setToast('Paste backup text first.')
      return false
    }

    try {
      return restoreBackupObject(JSON.parse(text))
    } catch (error) {
      setToast(error.message)
      return false
    }
  }

  const importJson = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      importBackupText(text)
    } catch {
      setToast('Could not read that backup file.')
    }
  }

  const undoLastRestore = () => {
    const savedBackup = loadRestoreSafetyBackup()
    if (!savedBackup) {
      setToast('No restore undo copy found.')
      setRestoreSafetyBackup(null)
      return
    }

    try {
      const backup = normalizeBackup(savedBackup)
      setSettings(backup.settings)
      setDays(backup.days)
      clearRestoreSafetyBackup()
      setRestoreSafetyBackup(null)
      setToast('Restore undone.')
    } catch (error) {
      setToast(error.message)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup" aria-label="WellFed">
          <img
            alt=""
            aria-hidden="true"
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}wellfed-icon.svg`}
          />
          <div>
            <h1>WellFed</h1>
            <p>{formatDate(currentDate, { year: 'numeric' })}</p>
          </div>
        </div>
        <div className="header-actions">
          <span
            className="save-indicator"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            Saved locally
          </span>
          <nav className="tab-nav" aria-label="WellFed sections">
            {TABS.map((tab) => (
              <button
                className={activeTab === tab ? 'active' : ''}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {toast && <div className="toast">{toast}</div>}
      {duplicateDraft && (
        <DuplicateEventModal
          draft={duplicateDraft}
          onClose={closeDuplicateEvent}
          onDuplicate={duplicateEventToDate}
          updateDraft={updateDuplicateDraft}
        />
      )}

      <main>
        {reportPreview && (
          <section className="report-preview-panel wide-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Report ready</p>
                <h2>{reportPreview.title}</h2>
                {reportPreview.generatedAt && (
                  <p className="quiet">
                    Generated {formatShortTimestamp(reportPreview.generatedAt)}.
                    Ready for your nutrition chat.
                  </p>
                )}
              </div>
              <div className="button-row">
                <button onClick={copyVisibleReport} type="button">
                  {reportCopied ? 'Copied' : 'Copy report'}
                </button>
                <button onClick={downloadVisibleReport} type="button">
                  Download .txt
                </button>
                <button onClick={() => setReportPreview(null)} type="button">
                  Hide
                </button>
              </div>
            </div>
            <textarea
              aria-label={reportPreview.title}
              onFocus={(event) => event.target.select()}
              readOnly
              ref={reportPreviewRef}
              value={reportPreview.text}
            />
          </section>
        )}
        {activeTab === 'dashboard' && (
          <DashboardView
            day={dashboardDay}
            onAddWater={addDashboardWater}
            onBodyNote={openTodayBodyNote}
            onLogMeal={() => openTodayWithTemplate('meal')}
            onOpenToday={openTodayJournal}
            onSupplement={() => openTodayWithTemplate('supplement')}
            settings={settings}
            totals={dashboardTotals}
            updatedMetric={updatedMetric}
            week={dashboardWeek}
          />
        )}
        {activeTab === 'today' && (
          <TodayView
            attentionTarget={attentionTarget}
            copyReport={copyReport}
            copyTemplate={copyTemplate}
            canGoForward={canGoForward}
            days={days}
            deleteEvent={deleteEvent}
            deleteBowelEvent={deleteBowelEvent}
            deleteBodyEvent={deleteBodyEvent}
            deleteGlp1Dose={deleteGlp1Dose}
            draft={draft}
            editEvent={editEvent}
            editingEvent={editingEvent}
            foodEntryOpen={foodEntryOpen}
            flyNonce={flyNonce}
            goToNextDay={goToNextDay}
            goToPreviousDay={goToPreviousDay}
            goToToday={goToToday}
            bodyPickerMode={bodyPickerMode}
            isViewingToday={isViewingToday}
            logBowelEvent={logBowelEvent}
            logBodyScoreEvent={logBodyScoreEvent}
            logCravingEvent={logCravingEvent}
            logEventFromDraft={logEventFromDraft}
            logGlp1Dose={logGlp1Dose}
            logGlp1SymptomEvent={logGlp1SymptomEvent}
            logPcosContextEvent={logPcosContextEvent}
            logPantryItem={logPantryItem}
            logSupplementPreset={logSupplementPreset}
            openDuplicateEvent={openDuplicateEvent}
            pantryItems={settings.pantryItems ?? []}
            parserError={parserError}
            setDraft={setDraft}
            setEditingEvent={setEditingEvent}
            setFoodEntryOpen={setFoodEntryOpen}
            setParserError={setParserError}
            settings={settings}
            nutrients={nutrients}
            selectVisibleTemplate={() => {
              if (!templatePreviewRef.current) return
              templatePreviewRef.current.focus()
              templatePreviewRef.current.select()
              setTemplateFeedback('Template text selected.')
            }}
            templateFeedback={templateFeedback}
            templatePreview={templatePreview}
            templatePreviewRef={templatePreviewRef}
            today={today}
            todayTotals={todayTotals}
            updateCalorieGoalForDate={updateCalorieGoalForDate}
            updateDay={updateDay}
            updateFoodEventTime={updateFoodEventTime}
            updateFoodEventSatiety={updateFoodEventSatiety}
            updateFoodEventPcosContext={updateFoodEventPcosContext}
            updateBowelEventTime={updateBowelEventTime}
            updateBodyEventTime={updateBodyEventTime}
            updateGlp1DoseTime={updateGlp1DoseTime}
            week={week}
            setBodyPickerMode={setBodyPickerMode}
            clearTemplatePreview={() => {
              setTemplatePreview(null)
              setTemplateFeedback('')
            }}
            copyVisibleTemplate={() => {
              if (!templatePreview) return
              copyText(
                templatePreview.text,
                'Template copied again.',
                'Copy is blocked. Use Select text, then copy manually.',
                { toast: false },
              ).then((copied) => {
                setTemplateFeedback(
                  copied
                    ? 'Template copied.'
                    : 'Copy is blocked. Use Select text, then copy manually.',
                )
              })
            }}
          />
        )}
        {activeTab === 'week' && (
          <WeekView
            copyReport={copyReport}
            currentDate={currentDate}
            days={days}
            settings={settings}
            updateCalorieGoalForDate={updateCalorieGoalForDate}
          />
        )}
        {activeTab === 'month' && (
          <MonthView
            copyReport={copyReport}
            currentMonth={currentMonth}
            days={days}
            settings={settings}
          />
        )}
        {activeTab === 'pantry' && (
          <PantryView
            logPantryItem={logPantryItem}
            nutrients={nutrients}
            pantryItems={settings.pantryItems ?? []}
            removePantryItem={removePantryItem}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            backupPreview={backupPreview}
            backupSummary={backupSummary}
            clearBackupPreview={() => setBackupPreview(null)}
            copyBackupJson={copyBackupJson}
            copyTemplate={copyTemplate}
            exportCsv={exportCsv}
            exportJson={exportJson}
            importBackupText={importBackupText}
            importJson={importJson}
            addCustomNutrient={addCustomNutrient}
            nutrients={nutrients}
            parserError={parserError}
            presetDraft={presetDraft}
            removeSupplementPreset={removeSupplementPreset}
            removeCustomNutrient={removeCustomNutrient}
            saveSupplementPreset={saveSupplementPreset}
            setParserError={setParserError}
            setPresetDraft={setPresetDraft}
            settings={settings}
            restoreSafetyBackup={restoreSafetyBackup}
            restoreSafetySummary={restoreSafetySummary}
            shareBackupJson={shareBackupJson}
            undoLastRestore={undoLastRestore}
            updateSettings={updateSettings}
          />
        )}
      </main>
    </div>
  )
}

const dashboardCareStatuses = ({ day, settings, totals }) => {
  const foodCount = (day.events ?? []).length
  const energyTarget = energyTargetForDay(day, settings)
  const proteinTarget = Number(settings.nutrientTargets.proteinG) || 0
  const fibreTarget = Number(settings.nutrientTargets.fibreG) || 0
  const waterTarget = Number(settings.waterTargetMl) || 0
  const plantTarget = Number(settings.dailyPlantServingsTarget) || 0
  const calories = Number(totals.caloriesConsumed) || 0
  const protein = Number(totals.nutrients.proteinG) || 0
  const fibre = Number(totals.nutrients.fibreG) || 0
  const fluids = Number(totals.waterMl) || 0
  const plants = Number(totals.plantServings) || 0

  const careStatus = (variant, label, value, unit, target, phrase, notice) => ({
    label,
    notice,
    phrase,
    target,
    unit,
    value,
    valueText: `${formatAmount(value, unit === 'servings' ? 1 : 0)} ${unit}`,
    variant,
  })

  let energyPhrase = 'Quiet so far'
  let energyNotice = 'Energy is quiet so far'
  if (!foodCount) {
    energyPhrase = 'No food logged yet'
    energyNotice = 'No food logged yet'
  } else if (energyTarget && calories >= energyTarget * 0.85) {
    energyPhrase = 'Well filled'
    energyNotice = 'Energy is well filled'
  } else if (calories > 0) {
    energyPhrase = 'Has started'
    energyNotice = 'Energy has started'
  }

  let proteinPhrase = protein > 0 ? 'Has started' : 'Quiet so far'
  let proteinNotice = protein > 0 ? 'Protein has started' : 'Protein is quiet so far'
  if (proteinTarget && protein < proteinTarget * 0.35) {
    proteinPhrase = 'Still quiet'
    proteinNotice = 'Protein is still quiet'
  } else if (proteinTarget && protein >= proteinTarget * 0.85) {
    proteinPhrase = 'Well represented'
    proteinNotice = 'Protein is well represented'
  } else if (proteinTarget && protein >= proteinTarget * 0.5) {
    proteinPhrase = 'Steady base'
    proteinNotice = 'Protein has a steady base'
  }

  let fibrePhrase = fibre > 0 ? 'Building' : 'Quiet so far'
  let fibreNotice = fibre > 0 ? 'Fibre is building' : 'Fibre is quiet so far'
  if (fibreTarget && fibre < fibreTarget * 0.35 && foodCount) {
    fibrePhrase = 'Just beginning'
    fibreNotice = 'Fibre is just beginning'
  } else if (fibreTarget && fibre >= fibreTarget * 0.75) {
    fibrePhrase = 'Steady base'
    fibreNotice = 'Fibre has a steady base'
  }

  let fluidPhrase = fluids > 0 ? 'Building' : 'Quiet so far'
  let fluidNotice = fluids > 0 ? 'Fluids are building' : 'Fluids are quiet so far'
  if (waterTarget && fluids < waterTarget * 0.4) {
    fluidPhrase = 'Could use a top-up'
    fluidNotice = 'Hydration could use a top-up'
  } else if (waterTarget && fluids >= waterTarget * 0.75) {
    fluidPhrase = 'Nearly there'
    fluidNotice = 'Fluids are nearly there'
  }

  let plantPhrase = plants > 0 ? 'Started' : 'Quiet so far'
  let plantNotice = plants > 0 ? 'Plants are started' : 'Plants are quiet so far'
  if (plantTarget && plants <= 0 && foodCount) {
    plantPhrase = 'Not started yet'
    plantNotice = 'Plants have not started yet'
  } else if (plantTarget && plants >= plantTarget * 0.75) {
    plantPhrase = 'Lively today'
    plantNotice = 'Plants are lively today'
  }

  return [
    careStatus('energy', 'Energy', calories, 'kcal', energyTarget, energyPhrase, energyNotice),
    careStatus('protein', 'Protein', protein, 'g', proteinTarget, proteinPhrase, proteinNotice),
    careStatus('fibre', 'Fibre', fibre, 'g', fibreTarget, fibrePhrase, fibreNotice),
    careStatus('fluids', 'Fluids', fluids, 'ml', waterTarget, fluidPhrase, fluidNotice),
    careStatus('plants', 'Plants', plants, 'servings', plantTarget, plantPhrase, plantNotice),
  ]
}

function DashboardView({
  day,
  onAddWater,
  onBodyNote,
  onLogMeal,
  onSupplement,
  settings,
  totals,
  updatedMetric,
}) {
  const careStatuses = dashboardCareStatuses({ day, settings, totals })
  const insights = careStatuses.map((status) => status.notice).filter(Boolean)
  const noticeSignature = insights.join('|')
  const [noticeIndex, setNoticeIndex] = useState(0)
  const [selectedMetric, setSelectedMetric] = useState(null)
  const currentNotice = insights[noticeIndex % insights.length] ?? 'Today is taking shape'
  const selectedStatus = careStatuses.find((status) => status.variant === selectedMetric)

  useEffect(() => {
    if (insights.length < 2) return undefined
    const timeout = window.setInterval(() => {
      setNoticeIndex((index) => (index + 1) % insights.length)
    }, 3600)

    return () => window.clearInterval(timeout)
  }, [insights.length, noticeSignature])

  return (
    <div className="screen-grid dashboard-grid">
      <section className="dashboard-home-base dashboard-care-stage">
        <span className="dashboard-scene-sun" aria-hidden="true" />
        <div className="home-base-header care-stage-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>{formatDate(day.date, { year: 'numeric' })}</h2>
            <p className="home-base-subtitle">
              A sunlit plate for today&apos;s nourishment markers.
            </p>
          </div>
        </div>

        <div className="care-stage-main">
          <div className="care-plate-shell" aria-label="Quick input and care markers">
          <button
              aria-label="Log meal"
              className="dashboard-action dashboard-action-meal primary-action rim-action rim-action-meal"
              onClick={onLogMeal}
              title="Log meal"
              type="button"
          >
            <span className="dashboard-action-object" aria-hidden="true">
              <MealIcon />
            </span>
            <span className="sr-only">Log meal</span>
          </button>
          <button
              aria-label="Add water"
              className="dashboard-action dashboard-action-water rim-action rim-action-water"
              onClick={onAddWater}
              title="Add water"
              type="button"
          >
            <span className="dashboard-action-object" aria-hidden="true">
              <WaterGlass percent={percentOf(totals.waterMl, settings.waterTargetMl)} />
            </span>
            <span className="sr-only">Add water</span>
          </button>
          <button
              aria-label="Body note"
              className="dashboard-action dashboard-action-body rim-action rim-action-body"
              onClick={onBodyNote}
              title="Body note"
              type="button"
          >
            <span className="dashboard-action-object" aria-hidden="true">
              <BodyIcon />
            </span>
            <span className="sr-only">Body note</span>
          </button>
          <button
              aria-label="Supplement"
              className="dashboard-action dashboard-action-supplement rim-action rim-action-supplement"
              onClick={onSupplement}
              title="Supplement"
              type="button"
          >
            <span className="dashboard-action-object" aria-hidden="true">
              <TabletIcon />
            </span>
            <span className="sr-only">Supplement</span>
          </button>

            <div className="care-plate" aria-label="Today at a glance">
              <span className="care-plate-aura" aria-hidden="true" />
              <span className="care-plate-rim" aria-hidden="true" />
              <div className={`care-plate-center ${selectedStatus ? 'has-selected-care' : ''}`}>
                <p className="eyebrow">So far today</p>
                {selectedStatus ? (
                  <div aria-live="polite" className="selected-care-status" key={selectedStatus.variant}>
                    <span className="care-status-label">{selectedStatus.label}</span>
                    <strong>
                      {formatAmount(selectedStatus.value, selectedStatus.unit === 'servings' ? 1 : 0)}
                      <small>{` ${selectedStatus.unit}`}</small>
                    </strong>
                    <span className="care-status-phrase">{selectedStatus.phrase}</span>
                  </div>
                ) : (
                  <strong aria-live="polite" className="rotating-notice" key={currentNotice}>
                    {currentNotice}
                  </strong>
                )}
              </div>
              <div className="care-plate-markers">
                {careStatuses.map((status) => (
                  <DashboardMetric
                    key={status.variant}
                    label={status.label}
                    onSelect={() => {
                      setSelectedMetric((current) => (
                        current === status.variant ? null : status.variant
                      ))
                    }}
                    phrase={status.phrase}
                    selected={selectedMetric === status.variant}
                    target={status.target}
                    unit={status.unit}
                    value={status.value}
                    valueText={status.valueText}
                    variant={status.variant}
                    updated={updatedMetric === status.variant}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function DashboardMetric({
  label,
  onSelect,
  phrase,
  selected = false,
  streamTotals = null,
  target,
  unit,
  updated = false,
  value,
  valueText,
  variant,
}) {
  const markerFill = `${percentOf(value, target)}%`
  const accessibleValue = valueText ?? `${formatAmount(value, unit === 'servings' ? 1 : 0)} ${unit}`
  const metricIcon = {
    energy: <EnergyMarkerIcon />,
    fibre: <WheatIcon />,
    fluids: <FluidMarkerIcon />,
    plants: <PlantMarkerIcon />,
    protein: <MeatBoneIcon />,
  }[variant]

  return (
    <button
      aria-label={`${label}: ${accessibleValue}. ${phrase}`}
      aria-pressed={selected}
      className={`dashboard-metric ${variant} ${selected ? 'selected' : ''} ${updated ? 'metric-updated' : ''}`}
      onClick={onSelect}
      style={{ '--marker-fill': markerFill }}
      title={`${label}: ${accessibleValue}. ${phrase}`}
      type="button"
    >
      <span className="metric-object" aria-hidden="true">
        {metricIcon}
      </span>
      <span className="metric-fill" aria-hidden="true">
        <span />
      </span>
      <span className="metric-label sr-only">{`${label}: ${accessibleValue}. ${phrase}`}</span>
      <ProgressBar target={target} unit={unit} value={value} />
      {streamTotals && <CalorieStreamBar totals={streamTotals} />}
    </button>
  )
}

function CalorieStreamBar({ totals = {} }) {
  const trueTotal = Number(totals.caloriesKcal ?? totals.total) || 0
  const streamValues = CALORIE_STREAMS.map((stream) => ({
    ...stream,
    value: Number(totals[stream.id]) || 0,
  }))
  const streamTotal = streamValues.reduce((sum, stream) => sum + stream.value, 0)
  const denominator = Math.max(trueTotal, streamTotal, 1)

  return (
    <div className="calorie-stream-bar" aria-label="Calorie stream breakdown">
      <div className="calorie-stream-track">
        {streamValues.map((stream) => (
          <span
            className={`calorie-stream-segment ${stream.id}`}
            key={stream.id}
            style={{ width: `${(stream.value / denominator) * 100}%` }}
            title={`${stream.label}: ${formatAmount(stream.value)} kcal`}
          />
        ))}
      </div>
      <div className="calorie-stream-legend">
        {streamValues.map((stream) => (
          <span key={stream.id}>
            {stream.shortLabel} {formatAmount(stream.value)} kcal
          </span>
        ))}
      </div>
    </div>
  )
}

function TodayView({
  attentionTarget,
  copyReport,
  copyTemplate,
  copyVisibleTemplate,
  clearTemplatePreview,
  bodyPickerMode,
  canGoForward,
  days,
  deleteEvent,
  deleteBowelEvent,
  deleteBodyEvent,
  deleteGlp1Dose,
  draft,
  editEvent,
  editingEvent,
  foodEntryOpen,
  flyNonce,
  goToNextDay,
  goToPreviousDay,
  goToToday,
  isViewingToday,
  logBowelEvent,
  logBodyScoreEvent,
  logCravingEvent,
  logEventFromDraft,
  logGlp1Dose,
  logGlp1SymptomEvent,
  logPcosContextEvent,
  logPantryItem,
  logSupplementPreset,
  nutrients,
  openDuplicateEvent,
  pantryItems,
  parserError,
  selectVisibleTemplate,
  setDraft,
  setEditingEvent,
  setFoodEntryOpen,
  setParserError,
  settings,
  templateFeedback,
  templatePreview,
  templatePreviewRef,
  today,
  todayTotals,
  updateCalorieGoalForDate,
  updateDay,
  updateFoodEventTime,
  updateFoodEventSatiety,
  updateFoodEventPcosContext,
  updateBowelEventTime,
  updateBodyEventTime,
  updateGlp1DoseTime,
  week,
  setBodyPickerMode,
}) {
  const proteinTarget = settings.nutrientTargets.proteinG
  const fibreTarget = settings.nutrientTargets.fibreG
  const calorieTarget = energyTargetForDay(today, settings)
  const caloriesConsumed = Number(todayTotals.caloriesConsumed) || 0
  const waterPercent = percentOf(todayTotals.waterMl, settings.waterTargetMl)
  const weekRemaining = Number(week.caloriesRemaining) || 0
  const weekBankLabel =
    weekRemaining >= 0
      ? `${formatAmount(weekRemaining)} kcal room in plan`
      : `${formatAmount(Math.abs(weekRemaining))} kcal above plan`
  const allEvents = Object.values(days).flatMap((day) => day.events ?? [])
  const todayEvents = sortEvents(today.events ?? [])
  const todayBowelEvents = todayTotals.bowelEvents
  const todayBodyEvents = todayTotals.bodyEvents
  const visibleTodayBodyEvents = settings.pcos?.enabled
    ? todayBodyEvents
    : todayBodyEvents.filter((event) => event.kind !== 'pcosContext')
  const colaStretch = settings.colaStretch?.enabled
    ? buildColaStretch(days, today.date, settings)
    : null
  const [homeSectionsOpen, setHomeSectionsOpen] = useState({
    bank: false,
    body: Boolean(bodyPickerMode),
    nutrients: false,
    timeline: false,
  })
  const [pantryPickerOpen, setPantryPickerOpen] = useState(false)
  const foodEntryRef = useRef(null)
  const bodyPanelRef = useRef(null)
  const attentionKind = attentionTarget?.target

  useEffect(() => {
    if (!attentionTarget) return undefined
    const timeout = window.setTimeout(() => {
      const bodyPicker = bodyPanelRef.current?.querySelector('.body-event-picker')
      const element =
        attentionKind === 'body'
          ? bodyPicker ?? bodyPanelRef.current
          : foodEntryRef.current
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      element?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })

      if (attentionKind === 'food') {
        const copyButton = foodEntryRef.current?.querySelector(
          '.template-copy-button',
        )
        copyButton?.focus({ preventScroll: true })
      }

      if (attentionKind === 'body') {
        bodyPicker
          ?.querySelector('.body-event-menu button')
          ?.focus({ preventScroll: true })
      }
    }, 120)

    return () => window.clearTimeout(timeout)
  }, [attentionKind, attentionTarget, templatePreviewRef])

  const toggleHomeSection = (section) => {
    setHomeSectionsOpen((previous) => ({
      ...previous,
      [section]: !previous[section],
    }))
    if (section === 'body' && homeSectionsOpen.body) {
      setBodyPickerMode(null)
    }
  }
  const adjustDailyMetric = (field, amount) => {
    updateDay(today.date, (day) => ({
      ...day,
      [field]: Math.max(0, (Number(day[field]) || 0) + amount),
    }))
  }

  return (
    <div className="screen-grid today-grid">
      <section
        className={`focus-panel hero-panel ${
          colaStretch ? 'has-cola-tracker' : ''
        }`}
      >
        <div className="hero-copy">
          <div className="day-nav-row">
            <button
              aria-label="Previous day"
              className="date-arrow"
              onClick={goToPreviousDay}
              type="button"
            >
              {'<'}
            </button>
            <p className="eyebrow">{isViewingToday ? 'Today' : 'Selected day'}</p>
            {!isViewingToday && (
              <button className="today-jump" onClick={goToToday} type="button">
                Today
              </button>
            )}
            {canGoForward && (
              <button
                aria-label="Next day"
                className="date-arrow"
                onClick={goToNextDay}
                type="button"
              >
                {'>'}
              </button>
            )}
          </div>
          <h2>{formatDate(today.date, { year: 'numeric' })}</h2>
          <div className="mini-form">
            <label>
              <span>Energy plan</span>
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) =>
                  updateCalorieGoalForDate(today.date, event.target.value)
                }
                type="number"
                value={today.calorieTarget}
              />
            </label>
          </div>
        </div>
        {colaStretch && <ColaStretchCard stretch={colaStretch} />}
        <div className="focus-rings">
          <CycleMoon
            day={today.cycleDay}
            onChange={(value) =>
              updateDay(today.date, (day) => ({
                ...day,
                cycleDay: value,
              }))
            }
          />
          <FocusRing
            label="Protein"
            target={proteinTarget}
            unit="g"
            value={todayTotals.nutrients.proteinG}
          />
          <FocusRing
            label="Fibre"
            target={fibreTarget}
            unit="g"
            value={todayTotals.nutrients.fibreG}
          />
        </div>
      </section>

      <section className="visual-panel intake-panel">
        <div className="intake-grid">
          <IntakeMetric
            actions={[250, 500, 750, -250]}
            icon={<WaterGlass percent={waterPercent} />}
            label="Fluids"
            onAdjust={(amount) => adjustDailyMetric('waterMl', amount)}
            value={`${formatAmount(todayTotals.waterMl)} / ${
              settings.waterTargetMl
            } ml`}
          />
          <IntakeMetric
            icon={<CappuccinoIcon />}
            label="Caffeine"
            value={`${formatAmount(todayTotals.caffeineMg)} mg`}
          />
          <IntakeMetric
            icon={<WineGlassIcon />}
            label="Alcohol"
            value={formatUnitCount(todayTotals.alcoholUnits)}
          />
        </div>
      </section>

      <section className="visual-panel plant-panel">
        <div>
          <p className="eyebrow">Plants</p>
          <p className="quiet">
            {isViewingToday ? 'Current Mon-Sun week' : 'Selected Mon-Sun week'}
          </p>
          <strong>
            {formatAmount(todayTotals.plantServings, 1)} /{' '}
            {settings.dailyPlantServingsTarget} servings
          </strong>
        </div>
        <p className="quiet">
          {week.uniquePlants.length} / {settings.weeklyUniquePlantsTarget}{' '}
          unique this week
        </p>
        <PlantTreeMeter
          plants={week.uniquePlants}
          target={settings.weeklyUniquePlantsTarget}
        />
      </section>

      <HomeCollapsePanel
        className="visual-panel bank-panel"
        eyebrow="Context"
        icon={<BankIcon />}
        isOpen={homeSectionsOpen.bank}
        onToggle={() => toggleHomeSection('bank')}
        summary={weekBankLabel}
        title="Energy context"
      >
        <strong>
          Weekly plan: {weekBankLabel} / {formatAmount(week.weeklyBudget)} kcal
        </strong>
        <ProgressBar
          target={week.weeklyBudget}
          value={Math.max(0, weekRemaining)}
          variant="bank"
        />
        <p className="quiet">
          {isViewingToday ? 'Today' : 'Selected day'}{' '}
          energy context: {formatAmount(caloriesConsumed)} / {calorieTarget} kcal -{' '}
          {calorieBalanceText(caloriesConsumed, calorieTarget)}
        </p>
      </HomeCollapsePanel>

      <HomeCollapsePanel
        actions={
          <button
            className="icon-action"
            onClick={() =>
              setBodyPickerMode((mode) => (mode ? null : 'menu'))
            }
            type="button"
          >
            <BodyIcon />
            <span>Log</span>
          </button>
        }
        className={`body-panel wide-panel ${
          attentionKind === 'body' ? 'panel-arrival' : ''
        }`}
        eyebrow="Body events"
        icon={<BodyIcon />}
        isOpen={homeSectionsOpen.body}
        onToggle={() => toggleHomeSection('body')}
        panelRef={bodyPanelRef}
        summary={`${todayBowelEvents.length + visibleTodayBodyEvents.length} logged`}
        title="Body Event"
      >
        {settings.glp1?.enabled && (
          <Glp1SupportCard
            deleteGlp1Dose={deleteGlp1Dose}
            doses={today.glp1Doses ?? []}
            logGlp1Dose={logGlp1Dose}
            proteinToday={todayTotals.nutrients.proteinG}
            settings={settings}
            updateGlp1DoseTime={updateGlp1DoseTime}
          />
        )}
        {bodyPickerMode && (
          <BodyEventPicker
            glp1Enabled={settings.glp1?.enabled}
            pcosEnabled={settings.pcos?.enabled}
            logBowelEvent={logBowelEvent}
            logBodyScoreEvent={logBodyScoreEvent}
            logCravingEvent={logCravingEvent}
            logGlp1SymptomEvent={logGlp1SymptomEvent}
            logPcosContextEvent={logPcosContextEvent}
            mode={bodyPickerMode}
            setMode={setBodyPickerMode}
          />
        )}
        <BowelTodayTimeline
          deleteBowelEvent={deleteBowelEvent}
          events={todayBowelEvents}
          updateBowelEventTime={updateBowelEventTime}
        />
        <BodyEventTimeline
          deleteBodyEvent={deleteBodyEvent}
          events={visibleTodayBodyEvents}
          updateBodyEventTime={updateBodyEventTime}
        />
      </HomeCollapsePanel>

      <section
        className={`entry-panel ${foodEntryOpen ? 'open' : 'collapsed'} ${
          attentionKind === 'food' ? 'panel-arrival' : ''
        }`}
        ref={foodEntryRef}
      >
        <div className="section-heading food-entry-heading">
          <button
            aria-expanded={foodEntryOpen}
            className="food-entry-title"
            onClick={() => setFoodEntryOpen((open) => !open)}
            type="button"
          >
            <MealIcon />
            <span>
              <span className="eyebrow">Log</span>
              <h2>Food Event</h2>
            </span>
          </button>
          {foodEntryOpen && (
            <div className="button-row">
              <button
                className="food-entry-pantry-button"
                onClick={() => setPantryPickerOpen((open) => !open)}
                type="button"
              >
                <PantryIcon />
                <span>Log from pantry</span>
              </button>
              <button onClick={() => copyTemplate('meal')} type="button">
                Meal template
              </button>
              <button onClick={() => copyTemplate('supplement')} type="button">
                Supplement
              </button>
            </div>
          )}
        </div>
        {foodEntryOpen && (
          <div className="food-entry-content">
            {editingEvent && <p className="quiet">Editing loaded event</p>}
            {pantryPickerOpen && (
              <PantryQuickPicker
                logPantryItem={(item) => {
                  logPantryItem(item)
                  setPantryPickerOpen(false)
                }}
                nutrients={nutrients}
                onClose={() => setPantryPickerOpen(false)}
                pantryItems={pantryItems}
              />
            )}
            {templatePreview && (
              <div className="template-preview">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Template ready</p>
                    <h3>{templatePreview.title}</h3>
                  </div>
                  <div className="button-row">
                    <button
                      className="template-copy-button"
                      onClick={copyVisibleTemplate}
                      type="button"
                    >
                      Copy again
                    </button>
                    <button onClick={selectVisibleTemplate} type="button">
                      Select text
                    </button>
                    <button onClick={clearTemplatePreview} type="button">
                      Hide
                    </button>
                  </div>
                </div>
                <p className="template-preview-guide">
                  Send this prompt to your nutrition chat. Paste back only the
                  returned WELLFED_EVENT_V1 block into Food Event below.
                </p>
                <div className="template-flow-hint" aria-hidden="true">
                  <span>Prompt to send</span>
                  <span>Returned block to paste back</span>
                </div>
                {templateFeedback && (
                  <p className="template-feedback" aria-live="polite">
                    {templateFeedback}
                  </p>
                )}
                <textarea
                  aria-label="Visible WellFed template"
                  readOnly
                  ref={templatePreviewRef}
                  value={templatePreview.text}
                />
              </div>
            )}
            <textarea
              aria-label="WellFed event template"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Paste a completed WELLFED_EVENT_V1 block here"
              spellCheck="false"
              value={draft}
            />
            {parserError && <pre className="error-box">{parserError}</pre>}
            <div className="submit-row">
              <button
                className="primary-action"
                onClick={logEventFromDraft}
                type="button"
              >
                {editingEvent ? 'Update event' : 'Log event'}
                {flyNonce > 0 && <span className="flying-bite" key={flyNonce} />}
              </button>
              {editingEvent && (
                <button
                  onClick={() => {
                    setEditingEvent(null)
                    setDraft('')
                    setParserError('')
                    setFoodEntryOpen(false)
                  }}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
            {settings.supplementPresets.length > 0 && (
              <div className="preset-strip">
                {settings.supplementPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => logSupplementPreset(preset)}
                    type="button"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <HomeCollapsePanel
        actions={
          <button onClick={() => copyReport('daily')} type="button">
            Generate daily
          </button>
        }
        className="timeline-panel"
        eyebrow="Timeline"
        icon={<ClockIcon />}
        isOpen={homeSectionsOpen.timeline}
        onToggle={() => toggleHomeSection('timeline')}
        summary={`${todayEvents.length} events`}
        title="Timeline"
      >
        <VineTimeline
          deleteEvent={deleteEvent}
          editEvent={editEvent}
          events={todayEvents}
          openDuplicateEvent={openDuplicateEvent}
          pcosEnabled={settings.pcos?.enabled}
          updateFoodEventPcosContext={updateFoodEventPcosContext}
          updateFoodEventTime={updateFoodEventTime}
          updateFoodEventSatiety={updateFoodEventSatiety}
        />
        {allEvents.length === 0 && (
          <p className="empty-note">No food events yet. Start with one note.</p>
        )}
      </HomeCollapsePanel>

      <HomeCollapsePanel
        className="nutrient-panel"
        eyebrow="Totals"
        icon={<NutrientIcon />}
        isOpen={homeSectionsOpen.nutrients}
        onToggle={() => toggleHomeSection('nutrients')}
        summary={`${formatAmount(todayTotals.nutrients.proteinG, 1)}g protein, ${formatAmount(todayTotals.nutrients.fibreG, 1)}g fibre`}
        title="Nutrients"
      >
        <NutrientGroups
          foodTotals={todayTotals.foodNutrients}
          nutrients={nutrients}
          settings={settings}
          supplementTotals={todayTotals.supplementNutrients}
          targetOverrides={{ caloriesKcal: calorieTarget }}
          totals={todayTotals.nutrients}
        />
      </HomeCollapsePanel>
    </div>
  )
}

function HomeCollapsePanel({
  actions = null,
  children,
  className = '',
  eyebrow,
  icon,
  isOpen,
  onToggle,
  panelRef = null,
  summary,
  title,
}) {
  return (
    <section
      className={`home-collapse-panel ${className} ${
        isOpen ? 'open' : 'collapsed'
      }`}
      ref={panelRef}
    >
      <div className="home-collapse-heading">
        <button
          aria-expanded={isOpen}
          className="home-collapse-toggle"
          onClick={onToggle}
          type="button"
        >
          <span className="home-collapse-icon">{icon}</span>
          <span>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            {summary && <small>{summary}</small>}
          </span>
          <span className="collapse-chevron" aria-hidden="true" />
        </button>
        {isOpen && actions}
      </div>
      {isOpen && <div className="home-collapse-content">{children}</div>}
    </section>
  )
}

function WeekView({
  copyReport,
  currentDate,
  days,
  settings,
  updateCalorieGoalForDate,
}) {
  const week = getWeekSummary(days, settings, currentDate)
  const nutrients = getNutrients(settings)
  const weekRemaining = Number(week.caloriesRemaining) || 0
  const remainingPercent = percentOf(Math.max(0, weekRemaining), week.weeklyBudget)
  const weekBankLabel =
    weekRemaining >= 0
      ? `${formatAmount(weekRemaining)} kcal room in plan`
      : `${formatAmount(Math.abs(weekRemaining))} kcal above plan`

  return (
    <div className="screen-grid week-grid">
      <section className="focus-panel wide-panel">
        <div>
          <p className="eyebrow">Week of</p>
          <h2>{week.label}</h2>
        </div>
        <div className={`bank-number ${weekRemaining < 0 ? 'over' : ''}`}>
          <span>{formatAmount(Math.abs(weekRemaining))}</span>
          <small>{weekRemaining < 0 ? 'kcal above plan' : 'kcal room in plan'}</small>
        </div>
        <ProgressBar
          target={100}
          value={remainingPercent}
          variant={weekRemaining < 0 ? 'bank over-target' : 'bank'}
        />
        <p className="quiet">{weekBankLabel}</p>
      </section>

      <section className="week-days-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Energy context</p>
            <h2>Energy rhythm</h2>
          </div>
          <button onClick={() => copyReport('weekly')} type="button">
            Generate week
          </button>
        </div>
        <div className="day-rhythm">
          {week.daily.map((item) => {
            const consumed = Number(item.totals.caloriesConsumed) || 0
            const target = Number(item.calorieTarget) || 0
            const isFutureDay = item.date > week.currentDate
            const isTodayDay = item.date === week.currentDate
            const hasFoodEvents = Boolean(item.day?.events?.length)
            const balanceClass = isFutureDay
              ? 'future'
              : calorieBalanceClass(consumed, target)
            const balanceText = isFutureDay
              ? 'Not started'
              : !hasFoodEvents && !isTodayDay
                ? 'No food logged'
                : calorieBalanceText(consumed, target)
            const progressLabel = isFutureDay
              ? 'Planned'
              : isTodayDay
                ? 'Today so far'
                : 'Logged'

            return (
              <div
                className={`day-row ${balanceClass} ${
                  isTodayDay ? 'today' : ''
                }`}
                key={item.date}
              >
                <div>
                  <strong>{item.weekday}</strong>
                  <span>{formatDate(item.date, { weekday: null })}</span>
                  <span className={`calorie-balance ${balanceClass}`}>
                    {balanceText}
                  </span>
                </div>
                <ProgressBar
                  label={progressLabel}
                  target={target || 1}
                  unit=" kcal"
                  value={isFutureDay ? 0 : consumed}
                  variant={balanceClass === 'over' ? 'over-target' : ''}
                />
                <label>
                  <input
                    inputMode="numeric"
                    min="0"
                    onChange={(event) =>
                      updateCalorieGoalForDate(item.date, event.target.value)
                    }
                    type="number"
                    value={target}
                  />
                  energy plan
                </label>
              </div>
            )
          })}
        </div>
      </section>

      <section className="visual-panel">
        <p className="eyebrow">Protein avg</p>
        <FocusRing
          label="Protein"
          target={settings.nutrientTargets.proteinG}
          unit="g"
          value={week.nutrientAverages.proteinG}
        />
      </section>

      <section className="visual-panel">
        <p className="eyebrow">Fibre avg</p>
        <FocusRing
          label="Fibre"
          target={settings.nutrientTargets.fibreG}
          unit="g"
          value={week.nutrientAverages.fibreG}
        />
      </section>

      <section className="visual-panel plant-panel">
        <p className="eyebrow">Unique plants</p>
        <p className="quiet">Current Mon-Sun week</p>
        <strong>
          {week.uniquePlants.length} / {settings.weeklyUniquePlantsTarget}
        </strong>
        <PlantTreeMeter
          plants={week.uniquePlants}
          target={settings.weeklyUniquePlantsTarget}
        />
      </section>

      <section className="visual-panel bowel-summary-panel">
        <p className="eyebrow">Body events</p>
        <BowelWeekPanel
          pcosEnabled={settings.pcos?.enabled}
          week={week}
        />
      </section>

      <section className="nutrient-panel wide-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Week-to-date average</p>
            <h2>Nutrient coverage</h2>
          </div>
        </div>
        <NutrientGroups
          foodTotals={week.foodNutrientAverages}
          nutrients={nutrients}
          settings={settings}
          supplementTotals={week.supplementNutrientAverages}
          targetOverrides={{ caloriesKcal: week.weeklyBudget / 7 }}
          totals={week.nutrientAverages}
        />
      </section>
    </div>
  )
}

function MonthView({ copyReport, currentMonth, days, settings }) {
  const month = getMonthSummary(days, settings, currentMonth)
  const nutrients = getNutrients(settings)

  return (
    <div className="screen-grid month-grid">
      <section className="focus-panel wide-panel">
        <div>
          <p className="eyebrow">Calendar month</p>
          <h2>{formatMonth(currentMonth)}</h2>
        </div>
        <div className="bank-number">
          <span>{month.eventDays}</span>
          <small>days logged</small>
        </div>
        <button onClick={() => copyReport('monthly')} type="button">
          Generate month
        </button>
      </section>

      <section className="visual-panel">
        <p className="eyebrow">Protein avg</p>
        <FocusRing
          label="Protein"
          target={settings.nutrientTargets.proteinG}
          unit="g"
          value={month.nutrientAverages.proteinG}
        />
      </section>

      <section className="visual-panel">
        <p className="eyebrow">Fibre avg</p>
        <FocusRing
          label="Fibre"
          target={settings.nutrientTargets.fibreG}
          unit="g"
          value={month.nutrientAverages.fibreG}
        />
      </section>

      <section className="visual-panel">
        <p className="eyebrow">Fluid avg</p>
        <WaterGlass
          percent={percentOf(month.waterAverage, settings.waterTargetMl)}
        />
        <strong>{formatAmount(month.waterAverage)} ml/day</strong>
      </section>

      <section className="visual-panel plant-panel">
        <p className="eyebrow">Plant average</p>
        <strong>
          {formatAmount(month.plantServingsAverage, 1)} servings/day
        </strong>
        <LeafMeter
          count={month.plantServingsAverage}
          target={settings.dailyPlantServingsTarget}
        />
      </section>

      <section className="bowel-month-panel wide-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Body events</p>
            <h2>Calendar pattern</h2>
          </div>
        </div>
        <BowelMonthPanel
          days={days}
          month={month}
          pcosEnabled={settings.pcos?.enabled}
        />
      </section>

      <section className="nutrient-panel wide-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Report card</p>
            <h2>Nutrient averages</h2>
          </div>
        </div>
        <NutrientGroups
          foodTotals={month.foodNutrientAverages}
          nutrients={nutrients}
          settings={settings}
          supplementTotals={month.supplementNutrientAverages}
          targetOverrides={{ caloriesKcal: month.calorieTargetAverage }}
          totals={month.nutrientAverages}
        />
      </section>
    </div>
  )
}

const filterPantryItems = (pantryItems, query) => {
  const term = normalizePantryText(query)
  if (!term) return pantryItems

  return pantryItems.filter((item) => {
    const haystack = [
      item.name,
      item.type,
      item.notes,
      ...(item.plantFoods ?? []),
    ]
      .map(normalizePantryText)
      .join(' ')
    return haystack.includes(term)
  })
}

function PantryView({
  logPantryItem,
  nutrients,
  pantryItems,
  removePantryItem,
}) {
  const [query, setQuery] = useState('')
  const filteredItems = filterPantryItems(pantryItems, query)
  const hasQuery = Boolean(normalizePantryText(query))
  const recentItems = pantryItems.slice(0, 4)
  const recentIds = new Set(recentItems.map((item) => item.id))
  const frequentItems = [...pantryItems]
    .filter((item) => !recentIds.has(item.id))
    .sort((a, b) => {
      const countDelta = (Number(b.timesLogged) || 1) - (Number(a.timesLogged) || 1)
      if (countDelta) return countDelta
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
    })
    .slice(0, 4)

  return (
    <div className="screen-grid pantry-screen">
      <section className="pantry-panel wide-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Archive</p>
            <h2>Pantry</h2>
            <p className="quiet">
              {pantryItems.length} reusable {pantryItems.length === 1 ? 'item' : 'items'} saved
            </p>
          </div>
          <span className="pantry-feature-icon" aria-hidden="true">
            <PantryIcon />
          </span>
        </div>
        {pantryItems.length > 0 && (
          <label className="pantry-search">
            <span>Search pantry</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Coffee, oats, magnesium..."
              type="search"
              value={query}
            />
          </label>
        )}
        {!hasQuery && pantryItems.length > 0 && (
          <div className="pantry-shelf-stack">
            <PantryShelf
              items={recentItems}
              logPantryItem={logPantryItem}
              nutrients={nutrients}
              title="Recently nourished"
            />
            {frequentItems.length > 0 && (
              <PantryShelf
                items={frequentItems}
                logPantryItem={logPantryItem}
                nutrients={nutrients}
                title="Easy repeats"
              />
            )}
          </div>
        )}
        {pantryItems.length > 0 && (
          <div className="pantry-library-heading">
            <div>
              <p className="eyebrow">Library</p>
              <h3>{hasQuery ? 'Search results' : 'All pantry'}</h3>
            </div>
            <span>{filteredItems.length} shown</span>
          </div>
        )}
        <div className="pantry-card-grid">
          {filteredItems.map((item) => (
            <PantryItemCard
              item={item}
              key={item.id}
              logPantryItem={logPantryItem}
              nutrients={nutrients}
              removePantryItem={removePantryItem}
            />
          ))}
        </div>
        {pantryItems.length === 0 && (
          <p className="empty-note">
            Food and supplement logs will collect here automatically for reuse.
          </p>
        )}
        {pantryItems.length > 0 && filteredItems.length === 0 && (
          <p className="empty-note">No pantry items match that search.</p>
        )}
      </section>
    </div>
  )
}

function PantryShelf({ items, logPantryItem, nutrients, title }) {
  if (!items.length) return null

  return (
    <div className="pantry-shelf">
      <div className="pantry-shelf-header">
        <h3>{title}</h3>
        <span>{items.length} quick picks</span>
      </div>
      <div className="pantry-shelf-grid">
        {items.map((item) => (
          <PantryItemCard
            compact
            item={item}
            key={item.id}
            logPantryItem={logPantryItem}
            nutrients={nutrients}
          />
        ))}
      </div>
    </div>
  )
}

function PantryQuickPicker({
  logPantryItem,
  nutrients,
  onClose,
  pantryItems,
}) {
  const [query, setQuery] = useState('')
  const filteredItems = filterPantryItems(pantryItems, query)

  return (
    <div className="pantry-picker">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pantry</p>
          <h3>Log from pantry</h3>
        </div>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
      {pantryItems.length > 0 && (
        <label className="pantry-search">
          <span>Find item</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved foods"
            type="search"
            value={query}
          />
        </label>
      )}
      <div className="pantry-picker-grid">
        {filteredItems.map((item) => (
          <PantryItemCard
            compact
            item={item}
            key={item.id}
            logPantryItem={logPantryItem}
            nutrients={nutrients}
          />
        ))}
      </div>
      {pantryItems.length === 0 && (
        <p className="empty-note">
          No pantry favourites yet. Saved meals and supplements will live here.
        </p>
      )}
      {pantryItems.length > 0 && filteredItems.length === 0 && (
        <p className="empty-note">Nothing in the pantry matches that search.</p>
      )}
    </div>
  )
}

function PantryItemCard({
  compact = false,
  item,
  logPantryItem,
  nutrients,
  removePantryItem,
}) {
  const calories = Number(item.nutrients?.caloriesKcal) || 0
  const protein = Number(item.nutrients?.proteinG) || 0
  const fibre = Number(item.nutrients?.fibreG) || 0
  const caffeine = Number(item.caffeineMg) || 0
  const alcohol = Number(item.alcoholUnits) || 0
  const plantServings = Number(item.plantServings) || 0
  const nutrientCount = nutrients.filter(
    (nutrient) => Number(item.nutrients?.[nutrient.id]) > 0,
  ).length
  const timesLogged = Number(item.timesLogged) || 1

  return (
    <article className={`pantry-item-card ${compact ? 'compact' : ''}`}>
      <div className="pantry-card-header">
        <div>
          <strong>{item.name}</strong>
          <span>
            {timesLogged === 1 ? 'Logged once' : `Logged ${timesLogged} times`} -{' '}
            last {formatPantryDate(item.updatedAt)}
          </span>
        </div>
        <span className="pantry-type-pill">{item.type || 'meal'}</span>
      </div>
      <div className="event-chips">
        <span>{formatAmount(protein, 1)}g protein</span>
        <span>{formatAmount(fibre, 1)}g fibre</span>
        {plantServings > 0 && (
          <span>{formatAmount(plantServings, 1)} plants</span>
        )}
        {caffeine > 0 && <span>{formatAmount(caffeine)}mg caffeine</span>}
        {alcohol > 0 && <span>{formatUnitCount(alcohol)} alcohol</span>}
        {!compact && <span>{formatAmount(calories)} kcal</span>}
        {!compact && <span>{nutrientCount} nutrients</span>}
      </div>
      {!compact && item.plantFoods?.length > 0 && (
        <p className="quiet">{item.plantFoods.join(', ')}</p>
      )}
      <div className="pantry-card-actions">
        <button
          className="primary-action"
          onClick={() => logPantryItem(item)}
          type="button"
        >
          Log
        </button>
        {removePantryItem && (
          <button
            className="quiet-danger"
            onClick={() => removePantryItem(item.id)}
            type="button"
          >
            Remove
          </button>
        )}
      </div>
    </article>
  )
}

function SettingsAccordion({
  actions = null,
  children,
  defaultOpen = false,
  eyebrow,
  summary,
  title,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <section
      className={`settings-panel settings-accordion ${
        isOpen ? 'open' : 'collapsed'
      }`}
    >
      <div className="settings-accordion-heading">
        <button
          aria-expanded={isOpen}
          className="settings-accordion-toggle"
          onClick={() => setIsOpen((previous) => !previous)}
          type="button"
        >
          <span>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            {summary && <small>{summary}</small>}
          </span>
          <span className="collapse-chevron" aria-hidden="true" />
        </button>
        {isOpen && actions}
      </div>
      {isOpen && <div className="settings-accordion-content">{children}</div>}
    </section>
  )
}

function SelectableChipGroup({
  label,
  multiple = false,
  onChange,
  options,
  value,
}) {
  const values = multiple ? value ?? [] : [value]
  const toggle = (optionId) => {
    if (!multiple) {
      onChange(optionId)
      return
    }
    onChange(
      values.includes(optionId)
        ? values.filter((id) => id !== optionId)
        : [...values, optionId],
    )
  }

  return (
    <fieldset className="selectable-chip-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => {
          const selected = values.includes(option.id)
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'selected' : ''}
              key={option.id}
              onClick={() => toggle(option.id)}
              type="button"
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function SettingsView({
  addCustomNutrient,
  backupPreview,
  backupSummary,
  clearBackupPreview,
  copyBackupJson,
  copyTemplate,
  exportCsv,
  exportJson,
  importBackupText,
  importJson,
  nutrients,
  parserError,
  presetDraft,
  removeCustomNutrient,
  removeSupplementPreset,
  saveSupplementPreset,
  setParserError,
  setPresetDraft,
  settings,
  restoreSafetyBackup,
  restoreSafetySummary,
  shareBackupJson,
  undoLastRestore,
  updateSettings,
}) {
  const [customDraft, setCustomDraft] = useState({
    group: 'vitamins',
    label: '',
    target: '',
    unit: 'mg',
  })
  const [restoreDraft, setRestoreDraft] = useState('')
  const grouped = NUTRIENT_GROUPS.map((group) => ({
    ...group,
    nutrients: nutrients
      .filter(
        (nutrient) => nutrient.group === group.id || group.id === 'macros',
      )
      .filter((nutrient) =>
        group.id === 'macros'
          ? nutrient.group === 'energy' || nutrient.group === 'macros'
          : true,
      )
      .sort((a, b) => {
        if (a.id === 'caloriesKcal') return 1
        if (b.id === 'caloriesKcal') return -1
        return 0
      }),
  }))

  return (
    <div className="screen-grid settings-grid">
      <SettingsAccordion
        defaultOpen
        eyebrow="Defaults"
        summary="Fluids, plants, and weekly diversity"
        title="Nourishment anchors"
      >
        <div className="settings-grid-inner">
          <label>
            <span>Fluid support ml</span>
            <input
              min="0"
              onChange={(event) =>
                updateSettings((previous) => ({
                  ...previous,
                  waterTargetMl: Number(event.target.value) || 0,
                }))
              }
              type="number"
              value={settings.waterTargetMl}
            />
          </label>
          <label>
            <span>Daily plant servings</span>
            <input
              min="0"
              onChange={(event) =>
                updateSettings((previous) => ({
                  ...previous,
                  dailyPlantServingsTarget: Number(event.target.value) || 0,
                }))
              }
              type="number"
              value={settings.dailyPlantServingsTarget}
            />
          </label>
          <label>
            <span>Weekly unique plants</span>
            <input
              min="0"
              onChange={(event) =>
                updateSettings((previous) => ({
                  ...previous,
                  weeklyUniquePlantsTarget: Number(event.target.value) || 0,
                }))
              }
              type="number"
              value={settings.weeklyUniquePlantsTarget}
            />
          </label>
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        eyebrow="Optional lens"
        summary={
          settings.pcos?.enabled
            ? 'PCOS-aware coaching on'
            : 'Meal timing and appetite context'
        }
        title="PCOS mode"
      >
        <div className="pcos-settings">
          <label className="toggle-row">
            <span>
              <strong>PCOS coaching lens</strong>
              <small>
                Adds optional context prompts and PCOS-aware report insights.
                It does not diagnose, predict ovulation, or replace medical care.
              </small>
            </span>
            <input
              checked={Boolean(settings.pcos?.enabled)}
              onChange={(event) =>
                updateSettings((previous) => ({
                  ...previous,
                  pcos: {
                    ...previous.pcos,
                    enabled: event.target.checked,
                  },
                }))
              }
              type="checkbox"
            />
          </label>

          {settings.pcos?.enabled && (
            <div className="pcos-settings-content">
              <SelectableChipGroup
                label="Priorities"
                multiple
                onChange={(priorities) =>
                  updateSettings((previous) => ({
                    ...previous,
                    pcos: {
                      ...previous.pcos,
                      priorities,
                    },
                  }))
                }
                options={PCOS_PRIORITIES}
                value={settings.pcos?.priorities ?? []}
              />
              <div className="pcos-settings-grid">
                <label>
                  <span>Known insulin resistance</span>
                  <select
                    onChange={(event) =>
                      updateSettings((previous) => ({
                        ...previous,
                        pcos: {
                          ...previous.pcos,
                          insulinResistance: event.target.value,
                        },
                      }))
                    }
                    value={settings.pcos?.insulinResistance ?? 'unsure'}
                  >
                    {PCOS_INSULIN_RESISTANCE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Cycle tracking elsewhere</span>
                  <select
                    onChange={(event) =>
                      updateSettings((previous) => ({
                        ...previous,
                        pcos: {
                          ...previous.pcos,
                          cycleTrackingElsewhere: event.target.value,
                        },
                      }))
                    }
                    value={settings.pcos?.cycleTrackingElsewhere ?? 'yes'}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label>
                  <span>Typical digestion context</span>
                  <select
                    onChange={(event) =>
                      updateSettings((previous) => ({
                        ...previous,
                        pcos: {
                          ...previous.pcos,
                          digestionIssue: event.target.value,
                        },
                      }))
                    }
                    value={settings.pcos?.digestionIssue ?? ''}
                  >
                    {PCOS_DIGESTION_ISSUES.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Stress-eating pattern</span>
                  <select
                    onChange={(event) =>
                      updateSettings((previous) => ({
                        ...previous,
                        pcos: {
                          ...previous.pcos,
                          stressEatingPattern: event.target.value,
                        },
                      }))
                    }
                    value={settings.pcos?.stressEatingPattern ?? ''}
                  >
                    {PCOS_STRESS_PATTERNS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="pcos-profile-notes">
                <span>Current PCOS medicines or supplements, if useful</span>
                <textarea
                  onChange={(event) =>
                    updateSettings((previous) => ({
                      ...previous,
                      pcos: {
                        ...previous.pcos,
                        medicationsSupplements: event.target.value,
                      },
                    }))
                  }
                  placeholder="Optional context for reports"
                  value={settings.pcos?.medicationsSupplements ?? ''}
                />
              </label>
            </div>
          )}
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        eyebrow="Medication"
        summary={
          settings.glp1?.enabled
            ? `${settings.glp1.medication} support on`
            : 'Optional GLP-1 support mode'
        }
        title="GLP-1 support"
      >
        <div className="glp1-settings">
          <label className="toggle-row">
            <span>
              <strong>GLP-1 support mode</strong>
              <small>Report flags only; daily UI adds dose and symptom logging.</small>
            </span>
            <input
              checked={Boolean(settings.glp1?.enabled)}
              onChange={(event) =>
                updateSettings((previous) => ({
                  ...previous,
                  glp1: {
                    ...previous.glp1,
                    enabled: event.target.checked,
                  },
                }))
              }
              type="checkbox"
            />
          </label>

          <div className="glp1-settings-grid">
            <label>
              <span>Medication</span>
              <select
                onChange={(event) =>
                  updateSettings((previous) => ({
                    ...previous,
                    glp1: {
                      ...previous.glp1,
                      medication: event.target.value,
                    },
                  }))
                }
                value={settings.glp1?.medication ?? 'Wegovy'}
              >
                {GLP1_MEDICATIONS.map((medication) => (
                  <option key={medication} value={medication}>
                    {medication}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Dose</span>
              <input
                onChange={(event) =>
                  updateSettings((previous) => ({
                    ...previous,
                    glp1: {
                      ...previous.glp1,
                      dose: event.target.value,
                    },
                  }))
                }
                placeholder="e.g. 0.5mg"
                type="text"
                value={settings.glp1?.dose ?? ''}
              />
            </label>
            <label>
              <span>Cadence</span>
              <select
                onChange={(event) =>
                  updateSettings((previous) => ({
                    ...previous,
                    glp1: {
                      ...previous.glp1,
                      cadence: event.target.value,
                    },
                  }))
                }
                value={settings.glp1?.cadence ?? 'weekly'}
              >
                {GLP1_CADENCES.map((cadence) => (
                  <option key={cadence} value={cadence}>
                    {cadence}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Usual dose day</span>
              <select
                onChange={(event) =>
                  updateSettings((previous) => ({
                    ...previous,
                    glp1: {
                      ...previous.glp1,
                      doseDay: event.target.value,
                    },
                  }))
                }
                value={settings.glp1?.doseDay ?? 'Mon'}
              >
                {WEEKDAY_KEYS.map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {weekday}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Protein floor g</span>
              <input
                min="0"
                onChange={(event) =>
                  updateSettings((previous) => ({
                    ...previous,
                    glp1: {
                      ...previous.glp1,
                      proteinFloorG: Number(event.target.value) || 0,
                    },
                  }))
                }
                type="number"
                value={settings.glp1?.proteinFloorG ?? 100}
              />
            </label>
          </div>

          <label className="toggle-row compact">
            <span>
              <strong>Track injection site</strong>
              <small>Abdomen, thigh, upper arm, or other when logging a dose.</small>
            </span>
            <input
              checked={settings.glp1?.trackInjectionSite ?? true}
              onChange={(event) =>
                updateSettings((previous) => ({
                  ...previous,
                  glp1: {
                    ...previous.glp1,
                    trackInjectionSite: event.target.checked,
                  },
                }))
              }
              type="checkbox"
            />
          </label>
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        eyebrow="Optional"
        summary={
          settings.colaStretch?.enabled
            ? 'Coca-Cola pause visible'
            : 'Coca-Cola pause hidden'
        }
        title="Gentle trackers"
      >
        <label className="toggle-row">
          <span>
            <strong>Show Coca-Cola pause counter</strong>
            <small>
              Counts logged days without Coca-Cola, Coke, or cola in food-event
              names.
            </small>
          </span>
          <input
            checked={settings.colaStretch?.enabled ?? true}
            onChange={(event) =>
              updateSettings((previous) => ({
                ...previous,
                colaStretch: {
                  ...previous.colaStretch,
                  enabled: event.target.checked,
                },
              }))
            }
            type="checkbox"
          />
        </label>
      </SettingsAccordion>

      <SettingsAccordion
        eyebrow="Monday start"
        summary="Quiet weekly energy planning"
        title="Energy rhythm"
      >
        <div className="weekday-grid">
          {WEEKDAY_KEYS.map((weekday) => (
            <label key={weekday}>
              <span>{weekday}</span>
              <input
                min="0"
                onChange={(event) =>
                  updateSettings((previous) => ({
                    ...previous,
                    dailyCalorieGoals: {
                      ...previous.dailyCalorieGoals,
                      [weekday]: Number(event.target.value) || 0,
                    },
                  }))
                }
                type="number"
                value={settings.dailyCalorieGoals[weekday]}
              />
            </label>
          ))}
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        actions={
          <button onClick={() => copyTemplate('supplement')} type="button">
            Copy template
          </button>
        }
        eyebrow="Reusable"
        summary={`${settings.supplementPresets.length} saved`}
        title="Supplement presets"
      >
        <div className="preset-list">
          {settings.supplementPresets.map((preset) => (
            <div className="preset-item" key={preset.id}>
              <strong>{preset.name}</strong>
              <button
                onClick={() => removeSupplementPreset(preset.id)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
          {settings.supplementPresets.length === 0 && (
            <p className="empty-note">
              No supplement presets yet. Saved supplements will appear here.
            </p>
          )}
        </div>
        <textarea
          aria-label="Supplement preset template"
          onChange={(event) => {
            setPresetDraft(event.target.value)
            setParserError('')
          }}
          placeholder="Paste a completed type: supplement block to save as a preset"
          spellCheck="false"
          value={presetDraft}
        />
        {parserError && <pre className="error-box">{parserError}</pre>}
        <button className="primary-action" onClick={saveSupplementPreset} type="button">
          Save preset
        </button>
      </SettingsAccordion>

      <SettingsAccordion
        eyebrow="Custom fields"
        summary={`${(settings.customNutrients ?? []).length} added`}
        title="Vitamins and minerals"
      >
        <div className="custom-nutrient-form">
          <label>
            <span>Name</span>
            <input
              onChange={(event) =>
                setCustomDraft((previous) => ({
                  ...previous,
                  label: event.target.value,
                }))
              }
              placeholder="e.g. Myo-inositol"
              type="text"
              value={customDraft.label}
            />
          </label>
          <label>
            <span>Group</span>
            <select
              onChange={(event) =>
                setCustomDraft((previous) => ({
                  ...previous,
                  group: event.target.value,
                }))
              }
              value={customDraft.group}
            >
              <option value="vitamins">Vitamin</option>
              <option value="minerals">Mineral</option>
            </select>
          </label>
          <label>
            <span>Measurement</span>
            <input
              onChange={(event) =>
                setCustomDraft((previous) => ({
                  ...previous,
                  unit: event.target.value,
                }))
              }
              placeholder="mg"
              type="text"
              value={customDraft.unit}
            />
          </label>
          <label>
            <span>Target</span>
            <input
              min="0"
              onChange={(event) =>
                setCustomDraft((previous) => ({
                  ...previous,
                  target: event.target.value,
                }))
              }
              step="any"
              type="number"
              value={customDraft.target}
            />
          </label>
          <button
            className="primary-action"
            onClick={() => {
              if (addCustomNutrient(customDraft)) {
                setCustomDraft({
                  group: 'vitamins',
                  label: '',
                  target: '',
                  unit: 'mg',
                })
              }
            }}
            type="button"
          >
            Add field
          </button>
        </div>
        <div className="custom-nutrient-list">
          {(settings.customNutrients ?? []).map((nutrient) => (
            <div className="custom-nutrient-item" key={nutrient.id}>
              <div>
                <strong>{nutrient.label}</strong>
                <span>
                  {nutrient.group === 'minerals' ? 'Mineral' : 'Vitamin'} -{' '}
                  {nutrient.unit}
                </span>
              </div>
              <button onClick={() => removeCustomNutrient(nutrient.id)} type="button">
                Remove
              </button>
            </div>
          ))}
          {(settings.customNutrients ?? []).length === 0 && (
            <p className="empty-note">
              No custom fields yet. Add one when there is something you want to watch.
            </p>
          )}
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        eyebrow="All nutrients"
        summary="Advanced reference values"
        title="Reference values"
      >
        {grouped.map((group) => (
          <div className="target-group" key={group.id}>
            <h3>{group.label}</h3>
            <div className="target-grid">
              {group.nutrients.map((nutrient) => (
                <label key={nutrient.id}>
                  <span>
                    {nutrient.label} ({nutrient.unit})
                  </span>
                  <input
                    min="0"
                    onChange={(event) =>
                      updateSettings((previous) => ({
                        ...previous,
                        nutrientTargets: {
                          ...previous.nutrientTargets,
                          [nutrient.id]: Number(event.target.value) || 0,
                        },
                      }))
                    }
                    step="any"
                    type="number"
                    value={settings.nutrientTargets[nutrient.id]}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </SettingsAccordion>

      <SettingsAccordion
        defaultOpen
        eyebrow="Data"
        summary="Move devices, undo restores, or export spreadsheets"
        title="Backup and restore"
      >
        <div className="backup-safety-panel">
          <div className="backup-safety-copy">
            <h3>Full local backup</h3>
            <p>
              JSON backup includes your food logs, body notes, water, settings,
              pantry, supplement presets, custom nutrients, and reports source
              data. Use this to move WellFed between laptop and phone.
            </p>
          </div>

          <div className="backup-summary-grid" aria-label="Current local data summary">
            <span>
              <strong>{backupSummary.days}</strong>
              <small>days</small>
            </span>
            <span>
              <strong>{backupSummary.foodEvents}</strong>
              <small>food events</small>
            </span>
            <span>
              <strong>{backupSummary.bodyEvents}</strong>
              <small>body notes</small>
            </span>
            <span>
              <strong>{backupSummary.pantryItems}</strong>
              <small>pantry</small>
            </span>
          </div>

          <div className="button-row">
            <button className="primary-action" onClick={exportJson} type="button">
              Download full backup
            </button>
            <button onClick={copyBackupJson} type="button">
              Copy backup text
            </button>
            <button onClick={shareBackupJson} type="button">
              Share backup
            </button>
            <button onClick={exportCsv} type="button">
              CSV spreadsheet export
            </button>
          </div>

          {backupPreview && (
            <div className="backup-text-panel">
              <div>
                <h3>Backup text</h3>
                <p>
                  If the download button is blocked, copy this text into Notes,
                  email, or a file, then restore it on the other device.
                </p>
              </div>
              <textarea
                aria-label="WellFed JSON backup text"
                readOnly
                spellCheck="false"
                value={backupPreview.text}
              />
              <div className="button-row">
                <button onClick={copyBackupJson} type="button">
                  Copy again
                </button>
                <button onClick={clearBackupPreview} type="button">
                  Hide backup text
                </button>
              </div>
            </div>
          )}

          <div className="restore-safety-card">
            <div>
              <h3>Restore from backup</h3>
              <p>
                Restoring replaces this browser&apos;s local WellFed data. Before
                it replaces anything, WellFed saves an undo copy in this browser.
              </p>
            </div>
            <div className="button-row">
              <label className="file-button">
                Restore JSON backup
                <input
                  accept="application/json"
                  onChange={(event) => {
                    importJson(event.target.files?.[0])
                    event.target.value = ''
                  }}
                  type="file"
                />
              </label>
              <button
                disabled={!restoreSafetyBackup}
                onClick={undoLastRestore}
                type="button"
              >
                Undo last restore
              </button>
            </div>
            <div className="restore-text-panel">
              <label>
                <span>Paste backup text</span>
                <textarea
                  onChange={(event) => setRestoreDraft(event.target.value)}
                  placeholder="Paste the full WellFed JSON backup text here"
                  spellCheck="false"
                  value={restoreDraft}
                />
              </label>
              <button
                className="primary-action"
                onClick={() => {
                  if (importBackupText(restoreDraft)) {
                    setRestoreDraft('')
                  }
                }}
                type="button"
              >
                Restore pasted backup
              </button>
            </div>
            {restoreSafetyBackup && restoreSafetySummary && (
              <p className="restore-undo-note">
                Undo copy saved from {formatBackupTime(restoreSafetyBackup.exportedAt)}:{' '}
                {restoreSafetySummary.days} days, {restoreSafetySummary.foodEvents}{' '}
                food events.
              </p>
            )}
          </div>
        </div>
      </SettingsAccordion>
    </div>
  )
}

function DuplicateEventModal({ draft, onClose, onDuplicate, updateDraft }) {
  const monthDate = parseDateKey(`${draft.monthKey}-01`)
  const monthIndex = monthDate.getMonth()
  const year = monthDate.getFullYear()
  const years = Array.from({ length: 9 }, (_, index) => year - 4 + index)
  const calendarCells = getCalendarCells(draft.monthKey)
  const timeIsValid = /^\d{2}:\d{2}$/.test(draft.time)

  const updateCalendarMonth = (nextYear, nextMonthIndex) => {
    const selected = parseDateKey(draft.date)
    const lastDay = new Date(nextYear, nextMonthIndex + 1, 0).getDate()
    const nextDate = dateKeyFromDate(
      new Date(nextYear, nextMonthIndex, Math.min(selected.getDate(), lastDay)),
    )

    updateDraft({
      date: nextDate,
      monthKey: getMonthKey(nextDate),
    })
  }

  const selectDate = (date) => {
    updateDraft({
      date,
      monthKey: getMonthKey(date),
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-label={`Duplicate ${draft.event.name}`}
        aria-modal="true"
        className="duplicate-modal"
        role="dialog"
      >
        <div className="duplicate-modal-header">
          <div>
            <p className="eyebrow">Duplicate log</p>
            <h2>{draft.event.name}</h2>
            <span>{formatDate(draft.date, { year: 'numeric' })}</span>
          </div>
          <button aria-label="Close duplicate dialog" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="calendar-shell">
          <div className="calendar-selectors">
            <label>
              <span>Month</span>
              <select
                onChange={(event) =>
                  updateCalendarMonth(year, Number(event.target.value))
                }
                value={monthIndex}
              >
                {MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index}>
                    {monthName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Year</span>
              <select
                onChange={(event) =>
                  updateCalendarMonth(Number(event.target.value), monthIndex)
                }
                value={year}
              >
                {years.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="calendar-grid" aria-label="Duplicate date picker">
            {WEEKDAY_KEYS.map((weekday) => (
              <span className="calendar-weekday" key={weekday}>
                {weekday}
              </span>
            ))}
            {calendarCells.map((cell) => (
              <button
                aria-pressed={cell.date === draft.date}
                className={[
                  'calendar-day',
                  cell.outside ? 'outside' : '',
                  cell.date === draft.date ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={cell.date}
                onClick={() => selectDate(cell.date)}
                type="button"
              >
                {Number(cell.date.slice(-2))}
              </button>
            ))}
          </div>
        </div>

        <div className="duplicate-time-row">
          <label>
            <span>Time</span>
            <input
              onChange={(event) => updateDraft({ time: event.target.value })}
              type="time"
              value={draft.time}
            />
          </label>
          <p>Satiation will be blank on the duplicate.</p>
        </div>

        <div className="duplicate-actions">
          <button onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-action"
            disabled={!timeIsValid}
            onClick={onDuplicate}
            type="button"
          >
            Duplicate
          </button>
        </div>
      </section>
    </div>
  )
}

function IntakeMetric({
  actionDigits = 0,
  actions = [],
  icon,
  label,
  onAdjust,
  value,
}) {
  const hasActions = actions.length > 0 && onAdjust
  return (
    <div className={`intake-card ${hasActions ? '' : 'read-only'}`}>
      <div>
        <p className="eyebrow">{label}</p>
        <strong>{value}</strong>
      </div>
      <div className="intake-icon-wrap">{icon}</div>
      {hasActions && (
        <div className="intake-actions">
          {actions.map((amount) => (
            <button key={amount} onClick={() => onAdjust(amount)} type="button">
              {formatSignedAmount(amount, actionDigits)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CappuccinoIcon() {
  return (
    <img
      aria-hidden="true"
      alt=""
      className="cappuccino-icon"
      src={coffeeIconUrl}
    />
  )
}

function WineGlassIcon() {
  return (
    <svg aria-hidden="true" className="wine-icon" viewBox="0 0 86 112">
      <path
        className="wine-bowl"
        d="M21 9h44c9 28 10 52-10 64-5 3-8 8-8 17v8H39v-8c0-9-3-14-8-17C11 61 12 37 21 9Z"
      />
      <path
        className="wine-fill"
        d="M19 50c12 7 22 5 34-1 8-4 13-5 20-3-1 12-6 21-18 28-5 3-8 8-8 17H39c0-9-3-14-8-17-9-5-14-13-16-24 2-1 3-1 4 0Z"
      />
      <path className="wine-stem" d="M43 92v15" />
      <path className="wine-base" d="M25 107h36" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" className="clock-icon" viewBox="0 0 64 64">
      <circle className="clock-face" cx="32" cy="32" r="24" />
      <path className="clock-hand" d="M32 18v16l11 7" />
      <path className="clock-spark" d="M17 10l4 5m26-5-4 5" />
    </svg>
  )
}

function BankIcon() {
  return (
    <svg aria-hidden="true" className="bank-icon" viewBox="0 0 74 66">
      <path className="bank-roof" d="M9 24 37 8l28 16H9Z" />
      <path className="bank-base" d="M13 54h48M17 46h40" />
      <path className="bank-column" d="M20 25v21m12-21v21m12-21v21m12-21v21" />
    </svg>
  )
}

function NutrientIcon() {
  return (
    <svg aria-hidden="true" className="nutrient-icon" viewBox="0 0 70 70">
      <circle className="nutrient-node main" cx="35" cy="35" r="12" />
      <circle className="nutrient-node" cx="18" cy="20" r="7" />
      <circle className="nutrient-node" cx="54" cy="18" r="7" />
      <circle className="nutrient-node" cx="52" cy="54" r="7" />
      <path className="nutrient-link" d="M25 25 32 31m12-11-6 15m8 11-9-8" />
      <path className="nutrient-pill" d="M16 51c6-6 14-6 20 0-6 6-14 6-20 0Z" />
    </svg>
  )
}

function TabletIcon() {
  return (
    <svg aria-hidden="true" className="tablet-icon" viewBox="0 0 64 64">
      <path className="tablet-capsule" d="M12 41c-5-5-5-13 0-18l4-4c5-5 13-5 18 0s5 13 0 18l-4 4c-5 5-13 5-18 0Z" />
      <path className="tablet-capsule-split" d="m20 27 12 12" />
      <circle className="tablet-round" cx="45" cy="39" r="10" />
      <path className="tablet-shine" d="M19 19c3-1 7 0 10 3" />
    </svg>
  )
}

function EnergyMarkerIcon() {
  return (
    <svg aria-hidden="true" className="energy-marker-icon" viewBox="0 0 64 64">
      <circle className="energy-marker-core" cx="32" cy="32" r="15" />
      <path className="energy-marker-rays" d="M32 8v8m0 32v8M8 32h8m32 0h8M15 15l6 6m22 22 6 6m0-34-6 6M21 43l-6 6" />
      <circle className="energy-marker-glow" cx="26" cy="26" r="5" />
    </svg>
  )
}

function MeatBoneIcon() {
  return (
    <svg aria-hidden="true" className="meat-bone-icon" viewBox="0 0 64 64">
      <path className="meat-bone-bone" d="M42 33h8c1-4 5-7 9-5 4 2 4 7 1 10 3 3 1 8-3 9-4 1-7-1-8-5h-9" />
      <path className="meat-bone-cut" d="M9 31c0-13 10-23 24-23 12 0 22 10 22 23 0 15-14 26-29 22C15 50 9 41 9 31Z" />
      <path className="meat-bone-center" d="M22 30c0-6 5-11 12-11 6 0 11 5 11 11 0 8-7 14-15 13-5-1-8-6-8-13Z" />
      <path className="meat-bone-shine" d="M18 22c4-5 9-7 16-7" />
    </svg>
  )
}

function WheatIcon() {
  return (
    <svg aria-hidden="true" className="wheat-icon" viewBox="0 0 64 64">
      <path className="wheat-stem" d="M32 56V13" />
      <path className="wheat-grain" d="M31 19c-9-2-14 2-15 10 8 1 14-2 15-10Z" />
      <path className="wheat-grain" d="M33 18c9-3 15 1 17 9-8 2-14-1-17-9Z" />
      <path className="wheat-grain" d="M31 30c-8-1-14 3-15 11 8 1 13-3 15-11Z" />
      <path className="wheat-grain" d="M33 29c8-2 14 2 16 10-8 2-13-2-16-10Z" />
      <path className="wheat-grain" d="M32 41c-7 0-12 4-13 11 7 0 12-4 13-11Z" />
      <path className="wheat-grain" d="M34 40c7-1 12 3 14 10-7 1-12-3-14-10Z" />
    </svg>
  )
}

function FluidMarkerIcon() {
  return (
    <svg aria-hidden="true" className="fluid-marker-icon" viewBox="0 0 64 64">
      <path className="fluid-drop" d="M32 8c12 15 18 26 18 35 0 10-8 17-18 17s-18-7-18-17c0-9 6-20 18-35Z" />
      <path className="fluid-wave" d="M18 43c6 4 12 4 18 0s11-4 15 0" />
      <path className="fluid-shine" d="M25 26c-3 5-4 10-3 15" />
    </svg>
  )
}

function PlantMarkerIcon() {
  return (
    <svg aria-hidden="true" className="plant-marker-icon" viewBox="0 0 64 64">
      <path className="plant-stem" d="M32 55V24" />
      <path className="plant-leaf left" d="M31 33c-11-1-18-7-20-17 11-1 18 5 20 17Z" />
      <path className="plant-leaf right" d="M33 28c11-3 19 1 23 11-11 3-19-1-23-11Z" />
      <circle className="plant-seed" cx="32" cy="18" r="6" />
    </svg>
  )
}

function MealIcon() {
  return (
    <svg
      aria-hidden="true"
      className="meal-icon"
      viewBox="0 0 64 64"
    >
      <circle className="meal-ring" cx="32" cy="32" r="28" />
      <circle className="meal-well" cx="32" cy="32" r="23" />
      <path
        className="meal-fork"
        d="M21 17v13m6-13v13m6-13v13M21 30c0 5 3 8 9 8v13"
      />
      <path
        className="meal-knife"
        d="M43 17c6 7 7 19 1 28v7"
      />
    </svg>
  )
}

function PantryIcon() {
  return (
    <svg aria-hidden="true" className="pantry-icon" viewBox="0 0 70 70">
      <path
        className="pantry-frame"
        d="M16 61V15c0-4 3-7 7-7h26c4 0 7 3 7 7v46H16Z"
      />
      <path
        className="pantry-door"
        d="M24 61V18c0-3 2-5 5-5h20c3 0 5 2 5 5v43H24Z"
      />
      <path className="pantry-shelf" d="M29 27h20M29 39h20M29 51h20" />
      <circle className="pantry-knob" cx="47" cy="35" r="3" />
      <path className="pantry-base" d="M12 61h50" />
    </svg>
  )
}

function BodyIcon() {
  return (
    <svg aria-hidden="true" className="body-icon" viewBox="0 0 64 72">
      <circle className="body-head" cx="32" cy="16" r="9" />
      <path
        className="body-shape"
        d="M16 63V48c0-12 7-21 16-21s16 9 16 21v15H16Z"
      />
      <path className="body-neck" d="M24 31c2 4 5 6 8 6s6-2 8-6" />
      <path
        className="body-heart"
        d="M32 53c-6-5-10-8-10-13 0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 5-4 8-14 13Z"
      />
      <path className="body-spine" d="M32 54v5" />
    </svg>
  )
}

function BristolTypeShape({ type }) {
  const meta = getBristolType(type)
  const shapeCounts = {
    1: 6,
    2: 5,
    3: 4,
    4: 1,
    5: 6,
    6: 7,
    7: 5,
  }
  return (
    <span className={`bristol-shape ${meta.className}`} aria-hidden="true">
      {Array.from({ length: shapeCounts[type] ?? 3 }).map((_, index) => (
        <span key={index} />
      ))}
    </span>
  )
}

function ScoreAllocator({ help, label, onChange, value }) {
  return (
    <label className="score-allocator">
      <span>
        <strong>{label}</strong>
        <em>{value}/10</em>
      </span>
      <input
        aria-label={`${label} ${value} out of 10`}
        max="10"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        step="1"
        type="range"
        value={value}
      />
      <small>{help}</small>
    </label>
  )
}

function ChoiceButtonGroup({ label, onChange, options, value }) {
  return (
    <fieldset className="choice-button-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.id}
            className={value === option.id ? 'selected' : ''}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            <strong>{option.label}</strong>
            {option.detail && <small>{option.detail}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function MechanicsChoiceGroup({ label, onChange, options, value }) {
  return (
    <ChoiceButtonGroup
      label={label}
      onChange={onChange}
      options={options}
      value={value}
    />
  )
}

function BristolPicker({ logBowelEvent, onClose }) {
  const [selectedType, setSelectedType] = useState(null)
  const [strainScore, setStrainScore] = useState(0)
  const [painScore, setPainScore] = useState(0)
  const [emptyingQuality, setEmptyingQuality] = useState('')
  const [toiletTime, setToiletTime] = useState('')
  const [repeatTrips, setRepeatTrips] = useState('')
  const [notes, setNotes] = useState('')
  const [mechanics, setMechanics] = useState({
    footstool: '',
    leanedForward: '',
    breathRelaxation: '',
    hardDry: '',
    outletIssue: '',
    tensionNotes: '',
  })
  const selectedMeta = selectedType ? getBristolType(selectedType) : null
  const canSave = selectedType && emptyingQuality && toiletTime && repeatTrips
  const updateMechanics = (key, value) =>
    setMechanics((current) => ({ ...current, [key]: value }))
  const saveEvent = () => {
    if (!canSave) return
    logBowelEvent({
      type: selectedType,
      strainScore,
      painScore,
      emptyingQuality,
      toiletTime,
      repeatTrips,
      notes,
      mechanics,
    })
  }

  if (selectedType) {
    return (
      <div className="bristol-picker bowel-detail-picker">
        <div className="picker-header">
          <strong>Evacuation details</strong>
          <button onClick={() => setSelectedType(null)} type="button">
            Back
          </button>
        </div>
        <div className={`selected-bristol-card ${selectedMeta.className}`}>
          <BristolTypeShape type={selectedType} />
          <span>
            <strong>Appearance: Type {selectedType}</strong>
            <small>{selectedMeta.label}</small>
          </span>
        </div>
        <div className="bowel-detail-form">
          <ScoreAllocator
            help="0 = no strain, 10 = extreme strain."
            label="Strain"
            onChange={setStrainScore}
            value={strainScore}
          />
          <ScoreAllocator
            help="0 = no pain, 10 = severe pain."
            label="Pain"
            onChange={setPainScore}
            value={painScore}
          />
          <ChoiceButtonGroup
            label="Emptying quality"
            onChange={setEmptyingQuality}
            options={EMPTYING_QUALITY_OPTIONS}
            value={emptyingQuality}
          />
          <ChoiceButtonGroup
            label="Time on toilet"
            onChange={setToiletTime}
            options={TOILET_TIME_OPTIONS}
            value={toiletTime}
          />
          <ChoiceButtonGroup
            label="Repeat trips"
            onChange={setRepeatTrips}
            options={YES_NO_OPTIONS}
            value={repeatTrips}
          />
          {strainScore > 5 && (
            <div className="mechanics-context-panel">
              <p className="eyebrow">Mechanics context</p>
              <div className="mechanics-grid">
                <MechanicsChoiceGroup
                  label="Used footstool / knees elevated"
                  onChange={(value) => updateMechanics('footstool', value)}
                  options={YES_NO_OPTIONS}
                  value={mechanics.footstool}
                />
                <MechanicsChoiceGroup
                  label="Leaned forward"
                  onChange={(value) => updateMechanics('leanedForward', value)}
                  options={YES_NO_OPTIONS}
                  value={mechanics.leanedForward}
                />
                <MechanicsChoiceGroup
                  label="Breath/relaxation helped"
                  onChange={(value) => updateMechanics('breathRelaxation', value)}
                  options={BREATH_RELAXATION_OPTIONS}
                  value={mechanics.breathRelaxation}
                />
                <MechanicsChoiceGroup
                  label="Felt hard/dry"
                  onChange={(value) => updateMechanics('hardDry', value)}
                  options={YES_NO_OPTIONS}
                  value={mechanics.hardDry}
                />
                <MechanicsChoiceGroup
                  label="Outlet/coordination feel despite soft stool"
                  onChange={(value) => updateMechanics('outletIssue', value)}
                  options={YES_NO_OPTIONS}
                  value={mechanics.outletIssue}
                />
              </div>
              <label className="mechanics-notes">
                <span>Pelvic, hip, jaw, or body tension noticed</span>
                <input
                  onChange={(event) =>
                    updateMechanics('tensionNotes', event.target.value)
                  }
                  placeholder="Optional"
                  type="text"
                  value={mechanics.tensionNotes}
                />
              </label>
            </div>
          )}
          <label className="bowel-notes-field">
            <span>Notes optional</span>
            <input
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Context, timing, anything useful..."
              type="text"
              value={notes}
            />
          </label>
        </div>
        <div className="bowel-detail-actions">
          <button onClick={onClose} type="button">
            Close
          </button>
          <button
            className="primary-action"
            disabled={!canSave}
            onClick={saveEvent}
            type="button"
          >
            Save bowel note
          </button>
        </div>
        {!canSave && (
          <p className="quiet">
            Choose emptying, time, and repeat trips to save the evacuation note.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bristol-picker">
      <div className="picker-header">
        <strong>Bristol appearance</strong>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
      <div className="bristol-options">
        {BRISTOL_TYPES.map((type) => (
          <button
            className={`bristol-option ${type.className}`}
            key={type.id}
            onClick={() => setSelectedType(type.id)}
            type="button"
          >
            <BristolTypeShape type={type.id} />
            <span className="bristol-text">
              <strong>Type {type.id}</strong>
              <span>{type.label}</span>
              <small>{type.tone}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function bodyEventKindLabel(kind) {
  if (kind === 'hunger') return 'Hunger'
  if (kind === 'foodNoise') return 'Food noise'
  if (kind === 'craving') return 'Craving'
  if (kind === 'glp1Symptom') return 'GLP-1'
  if (kind === 'pcosContext') return 'PCOS context'
  return kind
}

function Glp1SupportCard({
  deleteGlp1Dose,
  doses,
  logGlp1Dose,
  proteinToday,
  settings,
  updateGlp1DoseTime,
}) {
  const profile = settings.glp1 ?? {}
  const [dose, setDose] = useState(profile.dose ?? '')
  const [site, setSite] = useState(GLP1_INJECTION_SITES[0])
  const proteinFloor = Number(profile.proteinFloorG) || 100
  const proteinMet = Number(proteinToday) >= proteinFloor

  return (
    <div className="glp1-card">
      <div className="glp1-card-header">
        <div>
          <p className="eyebrow">Medication support</p>
          <h3>{profile.medication || 'GLP-1'} mode</h3>
          <p className="quiet">
            Protein floor {formatAmount(proteinFloor)}g -{' '}
            {proteinMet ? 'met today' : 'still gathering'}
          </p>
        </div>
        <span className={`support-pill ${proteinMet ? 'met' : ''}`}>
          {formatAmount(proteinToday, 1)}g protein
        </span>
      </div>

      <div className="glp1-dose-form">
        <label>
          <span>Dose</span>
          <input
            onChange={(event) => setDose(event.target.value)}
            placeholder="e.g. 0.5mg"
            type="text"
            value={dose}
          />
        </label>
        {profile.trackInjectionSite && (
          <label>
            <span>Site</span>
            <select
              onChange={(event) => setSite(event.target.value)}
              value={site}
            >
              {GLP1_INJECTION_SITES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="primary-action"
          onClick={() => logGlp1Dose({ dose, site })}
          type="button"
        >
          Log dose
        </button>
      </div>

      <div className="glp1-dose-strip">
        {doses.length ? (
          doses.map((event) => (
            <div className="glp1-dose-chip" key={event.id}>
              <input
                aria-label={`Time for ${event.medication} dose`}
                className="time-inline-input"
                onChange={(inputEvent) =>
                  updateGlp1DoseTime(event.id, inputEvent.target.value)
                }
                onInput={(inputEvent) =>
                  updateGlp1DoseTime(event.id, inputEvent.currentTarget.value)
                }
                type="time"
                value={event.time}
              />
              <span>
                <strong>{event.medication}</strong>
                <small>
                  {event.dose || 'dose'}{event.site ? `, ${event.site}` : ''}
                </small>
              </span>
              <button
                aria-label={`Delete ${event.medication} dose`}
                onClick={() => deleteGlp1Dose(event.id)}
                type="button"
              >
                x
              </button>
            </div>
          ))
        ) : (
          <p className="quiet">No dose logged for this day yet.</p>
        )}
      </div>
    </div>
  )
}

function PcosContextPicker({ logPcosContextEvent, setMode }) {
  const [periodActive, setPeriodActive] = useState('')
  const [phase, setPhase] = useState('')
  const [symptoms, setSymptoms] = useState([])
  const [irregularityNote, setIrregularityNote] = useState('')
  const [notes, setNotes] = useState('')
  const hasContext =
    periodActive || phase || symptoms.length || irregularityNote.trim() || notes.trim()

  return (
    <div className="body-event-picker pcos-checkin-picker">
      <div className="picker-header">
        <div>
          <strong>PCOS context</strong>
          <small>Optional nutrition context, not cycle prediction.</small>
        </div>
        <button onClick={() => setMode('menu')} type="button">
          Back
        </button>
      </div>
      <SelectableChipGroup
        label="Period active"
        onChange={setPeriodActive}
        options={[
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
          { id: 'unsure', label: 'Unsure' },
        ]}
        value={periodActive}
      />
      <label>
        <span>Approximate phase, if useful</span>
        <select onChange={(event) => setPhase(event.target.value)} value={phase}>
          {PCOS_PHASES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <SelectableChipGroup
        label="Symptoms worth noting"
        multiple
        onChange={setSymptoms}
        options={PCOS_SYMPTOMS}
        value={symptoms}
      />
      <label>
        <span>Cycle irregularity note</span>
        <input
          onChange={(event) => setIrregularityNote(event.target.value)}
          placeholder="Optional"
          type="text"
          value={irregularityNote}
        />
      </label>
      <label>
        <span>Other context</span>
        <input
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional"
          type="text"
          value={notes}
        />
      </label>
      <button
        className="primary-action"
        disabled={!hasContext}
        onClick={() =>
          logPcosContextEvent({
            irregularityNote,
            notes,
            periodActive,
            phase,
            symptoms,
          })
        }
        type="button"
      >
        Save context
      </button>
    </div>
  )
}

function BodyEventPicker({
  glp1Enabled,
  pcosEnabled,
  logBowelEvent,
  logBodyScoreEvent,
  logCravingEvent,
  logGlp1SymptomEvent,
  logPcosContextEvent,
  mode,
  setMode,
}) {
  const scoreButtons = Array.from({ length: 10 }, (_, index) => index + 1)
  const [hungerNotes, setHungerNotes] = useState('')

  if (mode === 'menu') {
    return (
      <div className="body-event-picker">
        <div className="picker-header">
          <strong>Log body event</strong>
          <button onClick={() => setMode(null)} type="button">
            Close
          </button>
        </div>
        <div className="body-event-menu">
          <button
            aria-label="Log hunger"
            onClick={() => setMode('hunger')}
            type="button"
          >
            <span aria-hidden="true" className="body-event-mark">
              H
            </span>
            <strong>Hunger</strong>
          </button>
          <button
            aria-label="Log bowel movement"
            onClick={() => setMode('bowel')}
            type="button"
          >
            <BodyIcon />
            <strong>Bowel movement</strong>
          </button>
          <button
            aria-label="Log craving"
            onClick={() => setMode('craving')}
            type="button"
          >
            <span aria-hidden="true" className="body-event-mark">
              C
            </span>
            <strong>Craving</strong>
          </button>
          {glp1Enabled && (
            <button
              aria-label="Log GLP-1 note"
              onClick={() => setMode('glp1Symptom')}
              type="button"
            >
              <span aria-hidden="true" className="body-event-mark glp1">
                G
              </span>
              <strong>GLP-1 note</strong>
            </button>
          )}
          {pcosEnabled && (
            <button
              aria-label="Log PCOS context"
              onClick={() => setMode('pcosContext')}
              type="button"
            >
              <span aria-hidden="true" className="body-event-mark pcos">
                P
              </span>
              <strong>PCOS context</strong>
            </button>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'bowel') {
    return (
      <BristolPicker
        logBowelEvent={logBowelEvent}
        onClose={() => setMode(null)}
      />
    )
  }

  if (mode === 'craving') {
    return (
      <div className="body-event-picker">
        <div className="picker-header">
          <strong>Craving</strong>
          <button onClick={() => setMode('menu')} type="button">
            Back
          </button>
        </div>
        <div className="craving-option-grid">
          {CRAVING_OPTIONS.map((craving) => (
            <button
              key={craving}
              onClick={() => logCravingEvent(craving)}
              type="button"
            >
              {craving}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (mode === 'glp1Symptom') {
    return (
      <div className="body-event-picker">
        <div className="picker-header">
          <strong>GLP-1 tolerability</strong>
          <button onClick={() => setMode('menu')} type="button">
            Back
          </button>
        </div>
        <div className="glp1-symptom-grid">
          {GLP1_SYMPTOMS.map((symptom) => (
            <button
              key={symptom.id}
              onClick={() => setMode(`glp1Severity:${symptom.id}`)}
              type="button"
            >
              {symptom.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (mode === 'pcosContext') {
    return (
      <PcosContextPicker
        logPcosContextEvent={logPcosContextEvent}
        setMode={setMode}
      />
    )
  }

  if (mode.startsWith('glp1Severity:')) {
    const symptomId = mode.split(':')[1]
    const symptom = GLP1_SYMPTOMS.find((item) => item.id === symptomId)
    return (
      <div className="body-event-picker">
        <div className="picker-header">
          <strong>{symptom?.label ?? 'GLP-1 note'}</strong>
          <button onClick={() => setMode('glp1Symptom')} type="button">
            Back
          </button>
        </div>
        <div className="severity-option-grid">
          {GLP1_SEVERITIES.map((severity) => (
            <button
              key={severity}
              onClick={() => logGlp1SymptomEvent(symptomId, severity)}
              type="button"
            >
              {severity}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="body-event-picker">
      <div className="picker-header">
        <strong>Hunger</strong>
        <button onClick={() => setMode('menu')} type="button">
          Back
        </button>
      </div>
      <p className="quiet">
        1 zero appetite, 5 noticeable, 7 strong, 10 painful or shaky.
      </p>
      <label className="body-note-field">
        <span>Notes optional</span>
        <input
          onChange={(event) => setHungerNotes(event.target.value)}
          placeholder="Context, sensations, what was happening..."
          type="text"
          value={hungerNotes}
        />
      </label>
      <div className="score-option-grid">
        {scoreButtons.map((score) => (
          <button
            key={score}
            onClick={() => logBodyScoreEvent('hunger', score, hungerNotes)}
            type="button"
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  )
}

function BowelTodayTimeline({ deleteBowelEvent, events, updateBowelEventTime }) {
  if (!events.length) {
    return (
      <div className="bowel-empty">
        <BodyIcon />
        <p className="empty-note">
          No bowel notes yet. Add one when there is something worth noticing.
        </p>
      </div>
    )
  }

  return (
    <div className="bowel-timeline" aria-label="Bowel movement timeline">
      {events.map((event) => {
        const meta = getBristolType(event.type)
        const quality = getBowelEventQuality(event)
        const detailText = bowelEventDetailText(event)
        const mechanicsText = bowelMechanicsText(event)
        return (
          <div
            className={`bowel-chip ${meta.className} quality-${quality.id}`}
            key={event.id}
          >
            <BristolTypeShape type={event.type} />
            <span className="bowel-chip-copy">
              <input
                aria-label={`Time for Type ${event.type}`}
                className="time-inline-input"
                onChange={(inputEvent) =>
                  updateBowelEventTime(event.id, inputEvent.target.value)
                }
                onInput={(inputEvent) =>
                  updateBowelEventTime(event.id, inputEvent.currentTarget.value)
                }
                type="time"
                value={event.time}
              />
              <small>
                <strong>Type {event.type}</strong>
                <em>{quality.label}</em>
              </small>
              <small>{detailText}</small>
              {mechanicsText && <small>{mechanicsText}</small>}
              {event.notes && <small>{event.notes}</small>}
            </span>
            <button
              aria-label={`Delete Type ${event.type} at ${event.time}`}
              onClick={() => deleteBowelEvent(event.id)}
              type="button"
            >
              x
            </button>
          </div>
        )
      })}
    </div>
  )
}

function BodyEventTimeline({ deleteBodyEvent, events, updateBodyEventTime }) {
  if (!events.length) {
    return (
      <p className="empty-note">
        No hunger, craving, or GLP-1 notes yet.
      </p>
    )
  }

  return (
    <div className="body-event-timeline" aria-label="Body event timeline">
      {events.map((event) => (
        <div className={`body-event-chip ${event.kind}`} key={event.id}>
          <span aria-hidden="true" className="body-event-mark">
            {bodyEventKindLabel(event.kind)[0]}
          </span>
          <span>
            <input
              aria-label={`Time for ${bodyEventKindLabel(event.kind)}`}
              className="time-inline-input"
              onChange={(inputEvent) =>
                updateBodyEventTime(event.id, inputEvent.target.value)
              }
              onInput={(inputEvent) =>
                updateBodyEventTime(event.id, inputEvent.currentTarget.value)
              }
              type="time"
              value={event.time}
            />
            <small>
              {event.kind === 'craving'
                ? event.label
                : event.kind === 'glp1Symptom'
                  ? `${event.label} ${event.severity}`
                  : event.kind === 'pcosContext'
                    ? pcosCheckinLine(event)
                  : `${bodyEventKindLabel(event.kind)} ${event.score}/10`}
              {event.notes ? ` - ${event.notes}` : ''}
            </small>
          </span>
          <button
            aria-label={`Delete ${bodyEventKindLabel(event.kind)} at ${event.time}`}
            onClick={() => deleteBodyEvent(event.id)}
            type="button"
          >
            x
          </button>
        </div>
      ))}
    </div>
  )
}

function BowelDistributionBars({ distribution }) {
  const max = Math.max(1, ...BRISTOL_TYPE_IDS.map((id) => distribution[id] ?? 0))

  return (
    <div className="bowel-distribution" aria-label="Bristol appearance distribution">
      {BRISTOL_TYPE_IDS.map((id) => {
        const count = distribution[id] ?? 0
        const meta = getBristolType(id)
        return (
          <div className={`distribution-bar ${meta.className}`} key={id}>
            <span
              className="distribution-fill"
              style={{ height: `${Math.max(8, (count / max) * 100)}%` }}
            />
            <small>T{id}</small>
            <strong>{count}</strong>
          </div>
        )
      })}
    </div>
  )
}

function ColaStretchCard({ stretch }) {
  const daysLabel = stretch.count === 1 ? 'day' : 'days'
  const levelLabels = {
    rest: 'Ready',
    seed: 'Seed',
    sprout: 'Sprout',
    plant: 'Plant',
    bloom: 'Bloom',
    tree: 'Tree',
  }
  const message = stretch.selectedHasCola
    ? 'Coca-Cola logged on this day. A new stretch can begin with the next logged day.'
    : !stretch.selectedHasFood
      ? stretch.isToday
        ? 'No food logged yet today.'
        : 'No food logged on this day.'
      : stretch.isToday
        ? 'No Coca-Cola logged today so far.'
        : 'No Coca-Cola logged on this day.'

  return (
    <aside
      aria-label="Coca-Cola pause tracker"
      className={`cola-stretch-card level-${stretch.level}`}
    >
      <div className="cola-stretch-scene" aria-hidden="true">
        <div className="cola-can">
          <span />
        </div>
        <div className="stretch-soil" />
        <div className="stretch-plant">
          <span className="leaf leaf-left" />
          <span className="leaf leaf-right" />
          <span className="leaf leaf-top" />
          <span className="bloom-dot" />
        </div>
      </div>
      <div className="cola-stretch-copy">
        <p className="eyebrow">Coca-Cola pause</p>
        <strong>
          {stretch.count} <span>{daysLabel}</span>
        </strong>
        <p>{message}</p>
        <small>
          {levelLabels[stretch.level]} marker
          {stretch.best > 0 ? ` · best ${stretch.best} ${stretch.best === 1 ? 'day' : 'days'}` : ''}
        </small>
      </div>
    </aside>
  )
}

function summariseBodyEvents(events = []) {
  const hunger = events.filter((event) => event.kind === 'hunger')
  const foodNoise = events.filter((event) => event.kind === 'foodNoise')
  const cravings = events.filter((event) => event.kind === 'craving')
  const glp1Symptoms = events.filter((event) => event.kind === 'glp1Symptom')
  const pcosContexts = events.filter((event) => event.kind === 'pcosContext')
  const avg = (items) =>
    items.length
      ? Math.round(
          (items.reduce((sum, event) => sum + (Number(event.score) || 0), 0) /
            items.length) *
            10,
        ) / 10
      : null

  return {
    hungerAverage: avg(hunger),
    foodNoiseAverage: avg(foodNoise),
    cravings: [...new Set(cravings.map((event) => event.label).filter(Boolean))],
    glp1Symptoms,
    pcosContexts,
    total: events.length,
  }
}

function BowelWeekPanel({ pcosEnabled, week }) {
  const mostCommon = week.mostCommonBowelType
    ? getBristolType(week.mostCommonBowelType)
    : null
  const visibleBodyEvents = pcosEnabled
    ? week.bodyEvents
    : week.bodyEvents.filter((event) => event.kind !== 'pcosContext')
  const bodySummary = summariseBodyEvents(visibleBodyEvents)
  const bowelQualitySummary = summariseBowelQuality(week.bowelEvents)

  return (
    <div className="bowel-week-content">
      <div className="bowel-week-summary">
        <strong>{week.bowelEvents.length}</strong>
        <span>
          total, {week.daysWithBowelEntries} / 7 days
          {mostCommon ? `, appearance mode T${mostCommon.id}` : ''}
        </span>
      </div>
      <p className="bowel-quality-line">
        {bowelQualitySignalLine(week.bowelEvents)}
      </p>
      <div className="body-summary-strip">
        <span>{bowelQualitySummary.detailsLogged} with evacuation detail</span>
        <span>{bowelQualitySummary.incompleteEvents} incomplete signals</span>
        <span>{bowelQualitySummary.repeatTripEvents} repeat-trip notes</span>
      </div>
      <div className="bowel-week-strip" aria-label="Seven day bowel pattern">
        {week.daily.map((item) => (
          <div className="bowel-week-day" key={item.date}>
            <strong>{item.weekday}</strong>
            <div>
              {item.totals.bowelEvents.length ? (
                item.totals.bowelEvents.map((event) => {
                  const meta = getBristolType(event.type)
                  const quality = getBowelEventQuality(event)
                  return (
                    <span
                      className={`bowel-dot ${meta.className} quality-${quality.id}`}
                      key={event.id}
                      title={`${event.time} Type ${event.type}: ${quality.label}`}
                    >
                      {event.type}
                    </span>
                  )
                })
              ) : (
                <span className="bowel-dot empty" />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="body-summary-strip">
        <span>Hunger {bodySummary.hungerAverage ?? '-'}/10</span>
        <span>{bodySummary.cravings.length} craving signals</span>
        {bodySummary.glp1Symptoms.length > 0 && (
          <span>{bodySummary.glp1Symptoms.length} GLP-1 notes</span>
        )}
        {bodySummary.pcosContexts.length > 0 && (
          <span>{bodySummary.pcosContexts.length} PCOS notes</span>
        )}
      </div>
      {bodySummary.cravings.length > 0 && (
        <div className="craving-chip-list">
          {bodySummary.cravings.map((craving) => (
            <span key={craving}>{craving}</span>
          ))}
        </div>
      )}
      <BowelDistributionBars distribution={week.bowelDistribution} />
    </div>
  )
}

function BowelMonthPanel({ days, month, pcosEnabled }) {
  const mostCommon = month.mostCommonBowelType
    ? getBristolType(month.mostCommonBowelType)
    : null
  const visibleBodyEvents = pcosEnabled
    ? month.bodyEvents
    : month.bodyEvents.filter((event) => event.kind !== 'pcosContext')
  const bodySummary = summariseBodyEvents(visibleBodyEvents)
  const bowelQualitySummary = summariseBowelQuality(month.bowelEvents)

  return (
    <div className="bowel-month-content">
      <div className="month-stats">
        <div>
          <strong>{month.bowelEvents.length}</strong>
          <span>total</span>
        </div>
        <div>
          <strong>{month.daysWithBowelEntries}</strong>
          <span>days</span>
        </div>
        <div>
          <strong>{mostCommon ? `T${mostCommon.id}` : '-'}</strong>
          <span>appearance</span>
        </div>
        <div>
          <strong>{bodySummary.glp1Symptoms.length}</strong>
          <span>GLP-1 notes</span>
        </div>
        {bodySummary.pcosContexts.length > 0 && (
          <div>
            <strong>{bodySummary.pcosContexts.length}</strong>
            <span>PCOS notes</span>
          </div>
        )}
      </div>
      <p className="bowel-quality-line">
        {bowelQualitySignalLine(month.bowelEvents)}
      </p>
      <div className="body-summary-strip">
        <span>{bowelQualitySummary.detailsLogged} with evacuation detail</span>
        <span>{bowelQualitySummary.incompleteEvents} incomplete signals</span>
        <span>{bowelQualitySummary.repeatTripEvents} repeat-trip notes</span>
      </div>
      {bodySummary.cravings.length > 0 && (
        <div className="craving-chip-list">
          {bodySummary.cravings.map((craving) => (
            <span key={craving}>{craving}</span>
          ))}
        </div>
      )}
      <div className="bowel-month-grid" aria-label="Monthly bowel calendar">
        {month.dateKeys.map((date) => {
          const events = days[date]?.bowelEvents ?? []
          return (
            <div className="month-day" key={date}>
              <span>{Number(date.slice(-2))}</span>
              <div>
                {events.slice(0, 3).map((event) => {
                  const meta = getBristolType(event.type)
                  const quality = getBowelEventQuality(event)
                  return (
                    <span
                      className={`bowel-dot ${meta.className} quality-${quality.id}`}
                      key={event.id}
                      title={`${formatDate(date, { weekday: null })} ${event.time} Type ${event.type}: ${quality.label}`}
                    >
                      {event.type}
                    </span>
                  )
                })}
                {events.length > 3 && <small>+{events.length - 3}</small>}
              </div>
            </div>
          )
        })}
      </div>
      <BowelDistributionBars distribution={month.bowelDistribution} />
    </div>
  )
}

function FocusRing({ label, target, unit, value }) {
  const percent = percentOf(value, target)
  return (
    <div className="focus-ring" style={{ '--pct': `${percent}%` }}>
      <div>
        <strong>{formatAmount(value, 1)}</strong>
        <span>{unit}</span>
      </div>
      <p>{label}</p>
    </div>
  )
}

function CycleMoon({ day, onChange }) {
  const numericDay = Number(day) || 0
  const boundedDay = Math.max(0, Math.min(28, numericDay))
  const percent = percentOf(boundedDay, 28)
  const phaseClass =
    boundedDay >= 15 && boundedDay <= 21
      ? 'full'
      : boundedDay >= 22
        ? 'half-waning'
        : boundedDay >= 8
          ? 'half-waxing'
          : 'new'

  return (
    <label className="cycle-orb" style={{ '--pct': `${percent}%` }}>
      <span className={`cycle-moon ${phaseClass}`} aria-hidden="true">
        <span />
      </span>
      <span className="cycle-day-entry">
        <input
          aria-label="Cycle day"
          inputMode="numeric"
          min="1"
          onChange={(event) => onChange(event.target.value)}
          placeholder="day"
          type="number"
          value={day}
        />
        <small>/ 28</small>
      </span>
      <p>Cycle</p>
    </label>
  )
}

function WaterGlass({ percent }) {
  return (
    <div className="water-glass" style={{ '--water': `${percent}%` }}>
      <span className="water-fill" />
      <span className="water-shine" />
    </div>
  )
}

function LeafMeter({ count, target }) {
  const total = Math.max(1, Math.min(12, Math.ceil(target)))
  return (
    <div className="leaf-meter" aria-label={`${count} of ${target}`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          className={index < Math.round(count) ? 'leaf active' : 'leaf'}
          key={index}
        />
      ))}
    </div>
  )
}

function formatPlantName(plant) {
  return plant
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}

function PlantLedger({ plants }) {
  if (!plants.length) {
    return <p className="empty-note">No weekly plants logged yet.</p>
  }

  return (
    <div className="plant-ledger" aria-label="Unique plants this week">
      {plants.map((plant) => (
        <span key={plant}>{formatPlantName(plant)}</span>
      ))}
    </div>
  )
}

function PlantTreeMeter({ plants, target }) {
  const [isOpen, setIsOpen] = useState(false)
  const applePositions = [
    [79, 56],
    [105, 70],
    [59, 77],
    [121, 96],
    [72, 106],
    [96, 42],
  ]
  const appleCount =
    plants.length > 0
      ? Math.min(applePositions.length, Math.ceil(plants.length / 5))
      : 0

  return (
    <div className="plant-tree-meter">
      <button
        aria-expanded={isOpen}
        aria-label={`${plants.length} of ${target} unique weekly plants`}
        className="plant-tree-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <svg aria-hidden="true" className="plant-tree" viewBox="0 0 180 176">
          <path
            className="tree-ground"
            d="M43 151c23 9 72 9 95 0"
          />
          <path
            className="tree-trunk"
            d="M83 146c5-29 4-56-6-83h27c-10 27-11 54-6 83H83Z"
          />
          <path className="tree-branch" d="M91 88c-18-4-31-15-40-31" />
          <path className="tree-branch" d="M91 82c19-5 34-18 46-39" />
          <path
            className="tree-canopy tree-canopy-back"
            d="M50 94c-29-4-39-42-13-58 8-27 45-27 57-5 24-9 53 10 48 39 23 13 10 49-20 48-14 22-50 20-62-2-12 4-27-4-10-22Z"
          />
          <path
            className="tree-canopy"
            d="M60 103c-25-12-19-47 7-51 7-22 37-26 51-7 24 2 38 28 24 48 13 22-10 47-34 36-15 18-43 14-51-8-14 2-25-8-27-18 9 3 19 3 30 0Z"
          />
          {applePositions.slice(0, appleCount).map(([cx, cy]) => (
            <g className="tree-apple" key={`${cx}-${cy}`}>
              <circle cx={cx} cy={cy} r="8" />
              <path d={`M${cx + 1} ${cy - 8}c5-8 12-7 15-2-5 2-10 2-15 2Z`} />
            </g>
          ))}
        </svg>
      </button>
      {isOpen && <PlantLedger plants={plants} />}
    </div>
  )
}

function PcosFoodContextDialog({ event, onClose, onSave }) {
  const initialContext = normalisePcosEventContext(event.pcosContext)
  const [eatingDriver, setEatingDriver] = useState(initialContext.eatingDriver)
  const [postMealResponses, setPostMealResponses] = useState(
    initialContext.postMealResponses,
  )
  const [treatSatisfactionScore, setTreatSatisfactionScore] = useState(
    initialContext.treatSatisfactionScore,
  )
  const [cravingContinued, setCravingContinued] = useState(
    initialContext.cravingContinued,
  )
  const [notes, setNotes] = useState(initialContext.notes)
  const isTreat =
    (Number(event.nutrients?.upfDiscretionaryCaloriesKcal) || 0) > 0

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (keyEvent) => {
      if (keyEvent.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop pcos-context-backdrop" role="presentation">
      <section
        aria-label={`PCOS context for ${event.name}`}
        aria-modal="true"
        className="pcos-context-dialog"
        role="dialog"
      >
        <div className="pcos-context-header">
          <div>
            <p className="eyebrow">Optional context</p>
            <h2>{event.name}</h2>
            <p>Pattern notes, not judgement.</p>
          </div>
          <button aria-label="Close PCOS context" onClick={onClose} type="button">
            x
          </button>
        </div>
        <SelectableChipGroup
          label="What mainly shaped this food choice?"
          onChange={setEatingDriver}
          options={PCOS_EATING_DRIVERS}
          value={eatingDriver}
        />
        <SelectableChipGroup
          label="What did you notice afterwards?"
          multiple
          onChange={setPostMealResponses}
          options={PCOS_POST_MEAL_RESPONSES}
          value={postMealResponses}
        />
        {isTreat && (
          <div className="pcos-treat-context">
            <label>
              <span>Treat satisfaction</span>
              <select
                onChange={(inputEvent) =>
                  setTreatSatisfactionScore(inputEvent.target.value)
                }
                value={treatSatisfactionScore}
              >
                <option value="">Not noted</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map(
                  (score) => (
                    <option key={score} value={score}>
                      {score}/10
                    </option>
                  ),
                )}
              </select>
            </label>
            <SelectableChipGroup
              label="Did the craving continue?"
              onChange={setCravingContinued}
              options={[
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ]}
              value={cravingContinued}
            />
          </div>
        )}
        <label className="pcos-context-notes">
          <span>Anything else worth remembering?</span>
          <input
            onChange={(inputEvent) => setNotes(inputEvent.target.value)}
            placeholder="Optional"
            type="text"
            value={notes}
          />
        </label>
        <div className="pcos-context-actions">
          <button onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-action"
            onClick={() =>
              onSave({
                cravingContinued,
                eatingDriver,
                notes,
                postMealResponses,
                treatSatisfactionScore,
              })
            }
            type="button"
          >
            Save context
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function VineTimeline({
  deleteEvent,
  editEvent,
  events,
  openDuplicateEvent,
  pcosEnabled,
  updateFoodEventPcosContext,
  updateFoodEventSatiety,
  updateFoodEventTime,
}) {
  const [pcosEvent, setPcosEvent] = useState(null)
  if (events.length === 0) {
    return <p className="empty-note">No food events yet. Start with one note.</p>
  }

  return (
    <>
      <div className="vine-scroll">
        <ol className="vine-list" aria-label="Food event vine timeline">
          {events.map((event, index) => (
            <li
              className={`vine-event ${event.type} ${
                index % 2 === 0 ? 'above' : 'below'
              }`}
              key={event.id}
            >
              <div className="event-body">
                <div>
                  <input
                    aria-label={`Time for ${event.name}`}
                    className="event-time-input"
                    onChange={(inputEvent) =>
                      updateFoodEventTime(event, inputEvent.target.value)
                    }
                    onInput={(inputEvent) =>
                      updateFoodEventTime(event, inputEvent.currentTarget.value)
                    }
                    type="time"
                    value={event.time}
                  />
                  <strong>{event.name}</strong>
                  <small>{event.type}</small>
                </div>
                <div className="event-chips">
                  <span>{formatAmount(event.nutrients.proteinG, 1)}g protein</span>
                  <span>{formatAmount(event.nutrients.fibreG, 1)}g fibre</span>
                  {event.satietyScore && (
                    <span>satiation {event.satietyScore}/10</span>
                  )}
                  {event.plantServings > 0 && (
                    <span>{formatAmount(event.plantServings, 1)} plants</span>
                  )}
                  {Number(event.caffeineMg) > 0 && (
                    <span>{formatAmount(event.caffeineMg)}mg caffeine</span>
                  )}
                  {Number(event.alcoholUnits) > 0 && (
                    <span>{formatUnitCount(event.alcoholUnits)} alcohol</span>
                  )}
                  <span>{formatAmount(event.nutrients.caloriesKcal)} kcal</span>
                  {CALORIE_STREAMS.map((stream) => {
                    const value = Number(event.nutrients?.[stream.id]) || 0
                    return value > 0 ? (
                      <span key={stream.id}>
                        {formatAmount(value)} {stream.shortLabel.toLowerCase()} kcal
                      </span>
                    ) : null
                  })}
                  {pcosEnabled && pcosEventContextLine(event) && (
                    <span className="pcos-context-chip">
                      {pcosEventContextLine(event)}
                    </span>
                  )}
                </div>
                <div className="event-actions">
                  <label className="satiety-control">
                    <span>Satiation</span>
                    <select
                      onChange={(inputEvent) =>
                        updateFoodEventSatiety(event, inputEvent.target.value)
                      }
                      value={event.satietyScore ?? ''}
                    >
                      <option value="">-</option>
                      {Array.from(
                        { length: 10 },
                        (_, scoreIndex) => scoreIndex + 1,
                      ).map((score) => (
                        <option key={score} value={score}>
                          {score}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button onClick={() => editEvent(event)} type="button">
                    Edit
                  </button>
                  <button onClick={() => openDuplicateEvent(event)} type="button">
                    Duplicate
                  </button>
                  {pcosEnabled && event.type !== 'supplement' && (
                    <button onClick={() => setPcosEvent(event)} type="button">
                      PCOS note
                    </button>
                  )}
                  <button onClick={() => deleteEvent(event)} type="button">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {pcosEvent && (
        <PcosFoodContextDialog
          event={pcosEvent}
          onClose={() => setPcosEvent(null)}
          onSave={(context) => {
            updateFoodEventPcosContext(pcosEvent, context)
            setPcosEvent(null)
          }}
        />
      )}
    </>
  )
}

function ProgressBar({ label, target, unit = '', value, variant = '' }) {
  const percent = percentOf(value, target)
  const hasTarget = Number(target) > 0
  return (
    <div className={`progress-wrap ${hasTarget ? 'with-target' : 'tracked-only'} ${variant}`}>
      {label && (
        <div className="progress-label">
          <span>{label}</span>
          <span>
            {hasTarget
              ? `${formatNutrientAmount(value, unit)} / ${formatNutrientAmount(
                  target,
                  unit,
                )}`
              : `${formatNutrientAmount(value, unit)} tracked`}
          </span>
        </div>
      )}
      {hasTarget && (
        <div className="progress-track">
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

function NutrientGroups({
  foodTotals = {},
  nutrients,
  settings,
  supplementTotals = {},
  targetOverrides = {},
  totals,
}) {
  return (
    <div className="nutrient-groups">
      {NUTRIENT_GROUPS.map((group) => {
        const groupNutrients = nutrients
          .filter((nutrient) =>
            group.id === 'macros'
              ? nutrient.group === 'energy' || nutrient.group === 'macros'
              : nutrient.group === group.id,
          )
          .sort((a, b) => {
            if (a.id === 'caloriesKcal') return 1
            if (b.id === 'caloriesKcal') return -1
            return 0
          })
        const rowsWithValues = groupNutrients.filter(
          (nutrient) => Number(totals?.[nutrient.id]) > 0,
        ).length

        return (
          <details className="nutrient-group" key={group.id} open>
            <summary>
              <h3>{group.label}</h3>
              <span>
                {rowsWithValues
                  ? `${rowsWithValues} with values`
                  : 'waiting for logs'}
              </span>
            </summary>
            <div className="nutrient-bars">
              {groupNutrients.map((nutrient) => {
                const foodValue = foodTotals[nutrient.id] ?? 0
                const supplementValue = supplementTotals[nutrient.id] ?? 0
                const totalValue = Number(totals?.[nutrient.id]) || 0
                const target =
                  targetOverrides[nutrient.id] ??
                  settings.nutrientTargets[nutrient.id]
                const hasTarget = Number(target) > 0
                const isBreakdown = BREAKDOWN_NUTRIENT_IDS.has(nutrient.id)
                const isZeroValue =
                  totalValue === 0 &&
                  Number(foodValue) === 0 &&
                  Number(supplementValue) === 0

                return (
                  <div
                    className={[
                      'nutrient-row',
                      hasTarget ? '' : 'tracked-only',
                      isBreakdown ? 'breakdown-detail' : '',
                      isZeroValue ? 'zero-value' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={nutrient.id}
                  >
                    <ProgressBar
                      label={nutrient.label}
                      target={target}
                      unit={nutrient.unit}
                      value={totalValue}
                      variant={[
                        nutrient.focus ? 'focus' : '',
                        !hasTarget ? 'tracked-only' : '',
                        isBreakdown ? 'breakdown-detail' : '',
                        hasTarget && totalValue > Number(target)
                          ? 'over-target'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                    {nutrient.id === 'caloriesKcal' && (
                      <CalorieStreamBar totals={totals} />
                    )}
                    <div className="nutrient-source-split">
                      <span>
                        Food {formatNutrientAmount(foodValue, nutrient.unit)}
                      </span>
                      <span>
                        Supplements{' '}
                        {formatNutrientAmount(supplementValue, nutrient.unit)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}

export default App
