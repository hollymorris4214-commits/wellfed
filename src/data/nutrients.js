export const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const CALORIE_STREAMS = [
  {
    id: 'coreCaloriesKcal',
    label: 'Core/budgeted calories',
    shortLabel: 'Core',
  },
  {
    id: 'standaloneWholeProduceCaloriesKcal',
    label: 'Standalone whole produce calories',
    shortLabel: 'Produce',
  },
  {
    id: 'upfDiscretionaryCaloriesKcal',
    label: 'UPF/discretionary calories',
    shortLabel: 'UPF',
  },
]

export const CALORIE_STREAM_IDS = CALORIE_STREAMS.map((stream) => stream.id)

export const NUTRIENTS = [
  {
    id: 'caloriesKcal',
    templateKey: 'total_calories_kcal',
    legacyTemplateKeys: ['calories_kcal'],
    label: 'Total energy',
    unit: 'kcal',
    group: 'energy',
  },
  {
    id: 'coreCaloriesKcal',
    templateKey: 'core_calories_kcal',
    label: 'Core/budgeted energy',
    unit: 'kcal',
    group: 'energy',
  },
  {
    id: 'standaloneWholeProduceCaloriesKcal',
    templateKey: 'standalone_whole_produce_calories_kcal',
    label: 'Standalone whole produce energy',
    unit: 'kcal',
    group: 'energy',
  },
  {
    id: 'upfDiscretionaryCaloriesKcal',
    templateKey: 'upf_discretionary_calories_kcal',
    label: 'UPF/discretionary energy',
    unit: 'kcal',
    group: 'energy',
  },
  {
    id: 'proteinG',
    templateKey: 'protein_g',
    label: 'Total protein',
    unit: 'g',
    group: 'macros',
    focus: true,
  },
  {
    id: 'animalProteinG',
    templateKey: 'animal_protein_g',
    label: 'Animal protein',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'plantProteinG',
    templateKey: 'plant_protein_g',
    label: 'Plant protein',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'carbohydratesG',
    templateKey: 'carbohydrates_g',
    label: 'Carbs',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'fibreG',
    templateKey: 'fibre_g',
    label: 'Total fibre',
    unit: 'g',
    group: 'macros',
    focus: true,
  },
  {
    id: 'solubleFibreG',
    templateKey: 'soluble_fibre_g',
    label: 'Soluble fibre',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'insolubleFibreG',
    templateKey: 'insoluble_fibre_g',
    label: 'Insoluble fibre',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'fatG',
    templateKey: 'fat_g',
    label: 'Total fat',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'saturatedFatG',
    templateKey: 'saturated_fat_g',
    label: 'Saturated fat',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'monounsaturatedFatG',
    templateKey: 'monounsaturated_fat_g',
    label: 'Monounsaturated fat',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'polyunsaturatedFatG',
    templateKey: 'polyunsaturated_fat_g',
    label: 'Polyunsaturated fat',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'transFatG',
    templateKey: 'trans_fat_g',
    label: 'Trans fat',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'sugarG',
    templateKey: 'total_sugar_g',
    legacyTemplateKeys: ['sugar_g'],
    label: 'Total sugar',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'freeSugarG',
    templateKey: 'free_sugar_g',
    label: 'Free sugar',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'omega3G',
    templateKey: 'total_omega3_g',
    legacyTemplateKeys: ['omega3_g'],
    label: 'Total omega-3',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'omega3AlaG',
    templateKey: 'omega3_ala_g',
    label: 'Omega-3 ALA',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'omega3EpaG',
    templateKey: 'omega3_epa_g',
    label: 'Omega-3 EPA',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'omega3DhaG',
    templateKey: 'omega3_dha_g',
    label: 'Omega-3 DHA',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'omega6G',
    templateKey: 'omega6_g',
    label: 'Omega-6',
    unit: 'g',
    group: 'macros',
  },
  {
    id: 'vitaminAUg',
    templateKey: 'vitamin_a_ug',
    label: 'Total vitamin A',
    unit: 'ug RAE',
    group: 'vitamins',
  },
  {
    id: 'preformedVitaminAUg',
    templateKey: 'preformed_vitamin_a_ug_rae',
    label: 'Preformed vitamin A',
    unit: 'ug RAE',
    group: 'vitamins',
  },
  {
    id: 'provitaminACarotenoidsUg',
    templateKey: 'provitamin_a_carotenoids_ug_rae',
    label: 'Provitamin A carotenoids',
    unit: 'ug RAE',
    group: 'vitamins',
  },
  {
    id: 'vitaminDUg',
    templateKey: 'vitamin_d_ug',
    label: 'Vitamin D',
    unit: 'ug',
    group: 'vitamins',
  },
  {
    id: 'vitaminEMg',
    templateKey: 'vitamin_e_mg',
    label: 'Vitamin E',
    unit: 'mg',
    group: 'vitamins',
  },
  {
    id: 'vitaminKUg',
    templateKey: 'vitamin_k_ug',
    label: 'Vitamin K',
    unit: 'ug',
    group: 'vitamins',
  },
  {
    id: 'vitaminCMg',
    templateKey: 'vitamin_c_mg',
    label: 'Vitamin C',
    unit: 'mg',
    group: 'vitamins',
  },
  {
    id: 'vitaminB1Mg',
    templateKey: 'vitamin_b1_mg',
    label: 'B1',
    unit: 'mg',
    group: 'vitamins',
  },
  {
    id: 'vitaminB2Mg',
    templateKey: 'vitamin_b2_mg',
    label: 'B2',
    unit: 'mg',
    group: 'vitamins',
  },
  {
    id: 'vitaminB3Mg',
    templateKey: 'vitamin_b3_mg',
    label: 'B3',
    unit: 'mg',
    group: 'vitamins',
  },
  {
    id: 'vitaminB5Mg',
    templateKey: 'vitamin_b5_mg',
    label: 'B5',
    unit: 'mg',
    group: 'vitamins',
  },
  {
    id: 'vitaminB6Mg',
    templateKey: 'vitamin_b6_mg',
    label: 'B6',
    unit: 'mg',
    group: 'vitamins',
  },
  {
    id: 'vitaminB7Ug',
    templateKey: 'vitamin_b7_ug',
    label: 'B7',
    unit: 'ug',
    group: 'vitamins',
  },
  {
    id: 'vitaminB9Ug',
    templateKey: 'vitamin_b9_ug',
    label: 'B9',
    unit: 'ug',
    group: 'vitamins',
  },
  {
    id: 'vitaminB12Ug',
    templateKey: 'vitamin_b12_ug',
    label: 'B12',
    unit: 'ug',
    group: 'vitamins',
  },
  {
    id: 'calciumMg',
    templateKey: 'calcium_mg',
    label: 'Calcium',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'ironMg',
    templateKey: 'iron_mg',
    label: 'Total iron',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'hemeIronMg',
    templateKey: 'heme_iron_mg',
    label: 'Heme iron',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'nonhemeIronMg',
    templateKey: 'nonheme_iron_mg',
    label: 'Non-heme iron',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'magnesiumMg',
    templateKey: 'magnesium_mg',
    label: 'Magnesium',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'zincMg',
    templateKey: 'zinc_mg',
    label: 'Zinc',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'potassiumMg',
    templateKey: 'potassium_mg',
    label: 'Potassium',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'sodiumMg',
    templateKey: 'sodium_mg',
    label: 'Sodium',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'phosphorusMg',
    templateKey: 'phosphorus_mg',
    label: 'Phosphorus',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'iodineUg',
    templateKey: 'iodine_ug',
    label: 'Iodine',
    unit: 'ug',
    group: 'minerals',
  },
  {
    id: 'seleniumUg',
    templateKey: 'selenium_ug',
    label: 'Selenium',
    unit: 'ug',
    group: 'minerals',
  },
  {
    id: 'copperMg',
    templateKey: 'copper_mg',
    label: 'Copper',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'manganeseMg',
    templateKey: 'manganese_mg',
    label: 'Manganese',
    unit: 'mg',
    group: 'minerals',
  },
  {
    id: 'molybdenumUg',
    templateKey: 'molybdenum_ug',
    label: 'Molybdenum',
    unit: 'ug',
    group: 'minerals',
  },
]

export const NUTRIENT_GROUPS = [
  { id: 'macros', label: 'Macros' },
  { id: 'vitamins', label: 'Vitamins' },
  { id: 'minerals', label: 'Minerals' },
]

export const TEMPLATE_KEY_TO_NUTRIENT_ID = NUTRIENTS.reduce((map, nutrient) => {
  map[nutrient.templateKey] = nutrient.id
  ;(nutrient.legacyTemplateKeys ?? []).forEach((key) => {
    map[key] = nutrient.id
  })
  return map
}, {})

const slugify = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const createCustomNutrient = ({ group, label, unit }) => {
  const cleanLabel = String(label ?? '').trim()
  const cleanUnit = String(unit ?? '').trim()
  const groupId = group === 'minerals' ? 'minerals' : 'vitamins'
  const slug = slugify(cleanLabel)
  const unitSlug = slugify(cleanUnit || 'unit')

  if (!cleanLabel || !slug) {
    throw new Error('Custom nutrient name is required.')
  }

  if (!cleanUnit || !unitSlug) {
    throw new Error('Measurement unit is required.')
  }

  return {
    id: `custom_${slug}_${unitSlug}`,
    templateKey: `custom_${slug}_${unitSlug}`,
    label: cleanLabel,
    unit: cleanUnit,
    group: groupId,
    custom: true,
  }
}

export const normalizeCustomNutrients = (customNutrients = []) =>
  (Array.isArray(customNutrients) ? customNutrients : [])
    .map((nutrient) => {
      try {
        const normalized = createCustomNutrient(nutrient)
        return {
          ...normalized,
          id: nutrient.id || normalized.id,
          templateKey: nutrient.templateKey || normalized.templateKey,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)

export const getNutrients = (settings) => [
  ...NUTRIENTS,
  ...normalizeCustomNutrients(settings?.customNutrients),
]

export const createTemplateKeyMap = (nutrients = NUTRIENTS) =>
  nutrients.reduce((map, nutrient) => {
    map[nutrient.templateKey] = nutrient.id
    ;(nutrient.legacyTemplateKeys ?? []).forEach((key) => {
      map[key] = nutrient.id
    })
    return map
  }, {})

export const defaultTargets = {
  caloriesKcal: 1900,
  coreCaloriesKcal: 0,
  standaloneWholeProduceCaloriesKcal: 0,
  upfDiscretionaryCaloriesKcal: 0,
  proteinG: 150,
  animalProteinG: 0,
  plantProteinG: 0,
  carbohydratesG: 260,
  fibreG: 30,
  solubleFibreG: 0,
  insolubleFibreG: 0,
  fatG: 70,
  saturatedFatG: 20,
  monounsaturatedFatG: 0,
  polyunsaturatedFatG: 0,
  transFatG: 0,
  sugarG: 50,
  freeSugarG: 30,
  omega3G: 1.1,
  omega3AlaG: 0,
  omega3EpaG: 0,
  omega3DhaG: 0,
  omega6G: 0,
  vitaminAUg: 600,
  preformedVitaminAUg: 0,
  provitaminACarotenoidsUg: 0,
  vitaminDUg: 10,
  vitaminEMg: 12,
  vitaminKUg: 75,
  vitaminCMg: 40,
  vitaminB1Mg: 0.8,
  vitaminB2Mg: 1.1,
  vitaminB3Mg: 13,
  vitaminB5Mg: 5,
  vitaminB6Mg: 1.2,
  vitaminB7Ug: 30,
  vitaminB9Ug: 200,
  vitaminB12Ug: 1.5,
  calciumMg: 700,
  ironMg: 14.8,
  hemeIronMg: 0,
  nonhemeIronMg: 0,
  magnesiumMg: 270,
  zincMg: 7,
  potassiumMg: 3500,
  sodiumMg: 2300,
  phosphorusMg: 550,
  iodineUg: 140,
  seleniumUg: 60,
  copperMg: 1.2,
  manganeseMg: 3,
  molybdenumUg: 50,
}

export const defaultSettings = {
  waterTargetMl: 2500,
  dailyPlantServingsTarget: 5,
  weeklyUniquePlantsTarget: 30,
  dailyCalorieGoals: {
    Mon: 1850,
    Tue: 1900,
    Wed: 1850,
    Thu: 2000,
    Fri: 1900,
    Sat: 2050,
    Sun: 1750,
  },
  nutrientTargets: defaultTargets,
  supplementPresets: [],
  pantryItems: [],
  pantryBackfilledAt: '',
  customNutrients: [],
  colaStretch: {
    enabled: true,
    keywords: ['coca-cola', 'coca cola', 'coke', 'cola'],
  },
  glp1: {
    enabled: false,
    medication: 'Wegovy',
    dose: '',
    cadence: 'weekly',
    doseDay: 'Mon',
    proteinFloorG: 100,
    trackInjectionSite: true,
  },
}
