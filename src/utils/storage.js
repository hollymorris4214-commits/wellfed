import { defaultSettings, normalizeCustomNutrients } from '../data/nutrients'
import {
  PCOS_DIGESTION_ISSUES,
  PCOS_INSULIN_RESISTANCE_OPTIONS,
  PCOS_PRIORITIES,
  PCOS_STRESS_PATTERNS,
} from '../data/pcos'
import { getWeekdayKey, isBeforeDateKey, todayKey } from './date'

const SETTINGS_KEY = 'wellfed_settings_v1'
const DAYS_KEY = 'wellfed_days_v1'
const RESTORE_SAFETY_KEY = 'wellfed_restore_safety_backup_v1'

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

const normalizeGlp1Settings = (settings = {}) => ({
  ...defaultSettings.glp1,
  ...(settings.glp1 ?? {}),
  enabled: Boolean(settings.glp1?.enabled),
  medication: ['Ozempic', 'Wegovy', 'Mounjaro'].includes(settings.glp1?.medication)
    ? settings.glp1.medication
    : defaultSettings.glp1.medication,
  proteinFloorG:
    Number(settings.glp1?.proteinFloorG) || defaultSettings.glp1.proteinFloorG,
  trackInjectionSite:
    settings.glp1?.trackInjectionSite ?? defaultSettings.glp1.trackInjectionSite,
})

const normalizeColaStretchSettings = (settings = {}) => ({
  ...defaultSettings.colaStretch,
  ...(settings.colaStretch ?? {}),
  enabled: settings.colaStretch?.enabled ?? defaultSettings.colaStretch.enabled,
  keywords: Array.isArray(settings.colaStretch?.keywords)
    ? settings.colaStretch.keywords
        .map((keyword) => String(keyword).trim())
        .filter(Boolean)
    : defaultSettings.colaStretch.keywords,
})

const normalizePcosSettings = (settings = {}) => {
  const source = settings.pcos ?? {}
  return {
    ...defaultSettings.pcos,
    ...source,
    enabled: Boolean(source.enabled),
    priorities: Array.isArray(source.priorities)
      ? source.priorities.filter((id) =>
          PCOS_PRIORITIES.some((option) => option.id === id),
        )
      : [],
    medicationsSupplements: String(source.medicationsSupplements ?? '').trim(),
    insulinResistance: PCOS_INSULIN_RESISTANCE_OPTIONS.some(
      (option) => option.id === source.insulinResistance,
    )
      ? source.insulinResistance
      : defaultSettings.pcos.insulinResistance,
    cycleTrackingElsewhere:
      source.cycleTrackingElsewhere === 'no' ? 'no' : 'yes',
    digestionIssue: PCOS_DIGESTION_ISSUES.some(
      (option) => option.id === source.digestionIssue,
    )
      ? source.digestionIssue
      : '',
    stressEatingPattern: PCOS_STRESS_PATTERNS.some(
      (option) => option.id === source.stressEatingPattern,
    )
      ? source.stressEatingPattern
      : '',
  }
}

export const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const loadSettings = () => {
  const saved = safeJsonParse(localStorage.getItem(SETTINGS_KEY), {})
  const customNutrients = normalizeCustomNutrients(saved.customNutrients)
  const customTargets = customNutrients.reduce((targets, nutrient) => {
    targets[nutrient.id] = Number(saved.nutrientTargets?.[nutrient.id]) || 0
    return targets
  }, {})

  return {
    ...defaultSettings,
    ...saved,
    customNutrients,
    dailyCalorieGoals: {
      ...defaultSettings.dailyCalorieGoals,
      ...(saved.dailyCalorieGoals ?? {}),
    },
    nutrientTargets: {
      ...defaultSettings.nutrientTargets,
      ...customTargets,
      ...(saved.nutrientTargets ?? {}),
    },
    supplementPresets: Array.isArray(saved.supplementPresets)
      ? saved.supplementPresets
      : [],
    pantryItems: Array.isArray(saved.pantryItems) ? saved.pantryItems : [],
    colaStretch: normalizeColaStretchSettings(saved),
    glp1: normalizeGlp1Settings(saved),
    pcos: normalizePcosSettings(saved),
  }
}

export const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export const loadDays = () =>
  safeJsonParse(localStorage.getItem(DAYS_KEY), {})

export const saveDays = (days) => {
  localStorage.setItem(DAYS_KEY, JSON.stringify(days))
}

export const createDayRecord = (dateKey, settings) => ({
  date: dateKey,
  cycleDay: '',
  waterMl: 0,
  caffeineMg: 0,
  alcoholUnits: 0,
  calorieTarget:
    settings.dailyCalorieGoals[getWeekdayKey(dateKey)] ??
    settings.nutrientTargets.caloriesKcal,
  events: [],
  bowelEvents: [],
  bodyEvents: [],
  glp1Doses: [],
  archived: false,
})

export const ensureDay = (days, dateKey, settings) => {
  if (days[dateKey]) {
    return days[dateKey]
  }
  return createDayRecord(dateKey, settings)
}

export const archiveStaleDays = (days) => {
  const current = todayKey()
  const nextDays = { ...days }
  const archivedDates = []

  Object.values(nextDays).forEach((day) => {
    if (day?.date && !day.archived && isBeforeDateKey(day.date, current)) {
      nextDays[day.date] = { ...day, archived: true }
      archivedDates.push(day.date)
    }
  })

  return { days: nextDays, archivedDates }
}

export const exportBackup = (days, settings) => ({
  app: 'WellFed',
  version: 1,
  exportedAt: new Date().toISOString(),
  days,
  settings,
})

export const loadRestoreSafetyBackup = () => {
  const saved = safeJsonParse(localStorage.getItem(RESTORE_SAFETY_KEY), null)
  if (!saved || saved.app !== 'WellFed' || saved.version !== 1) return null
  return saved
}

export const saveRestoreSafetyBackup = (backup) => {
  localStorage.setItem(RESTORE_SAFETY_KEY, JSON.stringify(backup))
}

export const clearRestoreSafetyBackup = () => {
  localStorage.removeItem(RESTORE_SAFETY_KEY)
}

export const normalizeBackup = (backup) => {
  if (!backup || backup.app !== 'WellFed' || backup.version !== 1) {
    throw new Error('That file does not look like a WellFed backup.')
  }

  const customNutrients = normalizeCustomNutrients(backup.settings?.customNutrients)
  const customTargets = customNutrients.reduce((targets, nutrient) => {
    targets[nutrient.id] = Number(backup.settings?.nutrientTargets?.[nutrient.id]) || 0
    return targets
  }, {})

  return {
    days: backup.days && typeof backup.days === 'object' ? backup.days : {},
    settings: {
      ...loadSettings(),
      ...(backup.settings ?? {}),
      customNutrients,
      dailyCalorieGoals: {
        ...defaultSettings.dailyCalorieGoals,
        ...(backup.settings?.dailyCalorieGoals ?? {}),
      },
      nutrientTargets: {
        ...defaultSettings.nutrientTargets,
        ...customTargets,
        ...(backup.settings?.nutrientTargets ?? {}),
      },
      supplementPresets: Array.isArray(backup.settings?.supplementPresets)
        ? backup.settings.supplementPresets
        : [],
      pantryItems: Array.isArray(backup.settings?.pantryItems)
        ? backup.settings.pantryItems
        : [],
      pantryBackfilledAt: backup.settings?.pantryBackfilledAt ?? '',
      colaStretch: normalizeColaStretchSettings(backup.settings ?? {}),
      glp1: normalizeGlp1Settings(backup.settings ?? {}),
      pcos: normalizePcosSettings(backup.settings ?? {}),
    },
  }
}
