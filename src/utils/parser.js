import { NUTRIENTS, createTemplateKeyMap } from '../data/nutrients'

const EVENT_TYPES = ['meal', 'snack', 'supplement']

const parseNumber = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null
  }
  const number = Number(String(value).replaceAll(',', '').trim())
  return Number.isFinite(number) ? number : null
}

const parseFields = (text) => {
  const fields = {}
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/)
    if (match) {
      fields[match[1].toLowerCase()] = match[2].trim()
    }
  })
  return fields
}

const fieldForNutrient = (fields, nutrient) =>
  [nutrient.templateKey, ...(nutrient.legacyTemplateKeys ?? [])].find(
    (key) => fields[key] !== undefined,
  )

export const parseWellFedEvent = (text, nutrients = NUTRIENTS) => {
  const rawText = text.trim()
  const firstLine = rawText.split(/\r?\n/).find((line) => line.trim())

  if (firstLine !== 'WELLFED_EVENT_V1') {
    throw new Error('The first line must be WELLFED_EVENT_V1.')
  }

  const fields = parseFields(rawText)
  const type = (fields.type ?? '').toLowerCase()
  const name = fields.name ?? ''
  const date = fields.date ?? ''
  const time = fields.time ?? ''
  const cycleDay =
    fields.cycle_day && parseNumber(fields.cycle_day) !== null
      ? parseNumber(fields.cycle_day)
      : ''
  const plantFoods = (fields.plant_foods ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const plantServings = parseNumber(fields.plant_servings)
  const satiationField = fields.satiation_score ?? fields.satiety_score
  const satietyScore =
    satiationField && parseNumber(satiationField) !== null
      ? parseNumber(satiationField)
      : ''
  const caffeineMg = parseNumber(fields.caffeine_mg)
  const alcoholUnits = parseNumber(fields.alcohol_units)

  const errors = []

  if (!EVENT_TYPES.includes(type)) {
    errors.push('type must be meal, snack, or supplement.')
  }
  if (!name) errors.push('name is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push('date must be YYYY-MM-DD.')
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    errors.push('time must be HH:MM.')
  }
  if (plantServings === null) {
    errors.push('plant_servings must be a number. Use 0 if none.')
  }
  if (plantServings > 0 && plantFoods.length === 0) {
    errors.push('plant_foods is required when plant_servings is above 0.')
  }
  if (caffeineMg === null) {
    errors.push('caffeine_mg is required and must be a number. Use 0 if none.')
  }
  if (alcoholUnits === null) {
    errors.push('alcohol_units is required and must be a number. Use 0 if none.')
  }
  if (plantFoods.some((plant) => !/[a-z]/i.test(plant))) {
    errors.push('plant_foods must contain names, not numbers or counts.')
  }
  if (
    satietyScore !== '' &&
    (!Number.isInteger(satietyScore) || satietyScore < 1 || satietyScore > 10)
  ) {
    errors.push('satiation_score must be blank or a whole number from 1 to 10.')
  }

  const nutrientValues = {}
  nutrients.forEach((nutrient) => {
    const fieldKey = fieldForNutrient(fields, nutrient)
    const value = parseNumber(fieldKey ? fields[fieldKey] : undefined)
    if (value === null) {
      errors.push(`${nutrient.templateKey} is required and must be a number.`)
    } else {
      nutrientValues[nutrient.id] = value
    }
  })

  if (errors.length) {
    throw new Error(errors.join('\n'))
  }

  return {
    type,
    name,
    date,
    time,
    cycleDay,
    plantFoods,
    plantServings,
    satietyScore,
    caffeineMg,
    alcoholUnits,
    nutrients: nutrientValues,
    notes: fields.notes ?? '',
    rawText,
  }
}

export const buildTemplatePrompt = ({
  date,
  time,
  cycleDay,
  eventType = 'meal',
  weeklyPlants = [],
  weekLabel = 'the current Monday-start week',
  nutrients = NUTRIENTS,
}) => {
  const nutrientLines = nutrients.map(
    (nutrient) => `${nutrient.templateKey}:`,
  ).join('\n')
  const plantContext = weeklyPlants.length
    ? weeklyPlants.join(', ')
    : 'no plant names logged yet'

  return `Please convert our discussed food or supplement into this exact WellFed template.
Return only the completed block. Use numeric values only. Fill every nutrient field, using 0 where none applies.
For plant_foods, list plant food NAMES ONLY, separated by commas. Do not put numbers, portions, or serving counts in plant_foods.
Put the total plant serving count for this event in plant_servings.
Put caffeine in caffeine_mg and UK alcohol units in alcohol_units. Use 0 where none applies. Do not include fluids or water.
Use total_calories_kcal for true total calories.
Split total calories across core_calories_kcal, standalone_whole_produce_calories_kcal, and upf_discretionary_calories_kcal.
Core/budgeted calories are normal meals, snacks, ingredients, recipes, protein powders, dairy, meat, fish, eggs, grains, oils, sauces, nuts, seeds, cooked meals, and mixed foods.
Standalone whole produce calories are only unmodified whole fruit or vegetables eaten on their own, such as a banana, apple, or carrot sticks by themselves. If produce is blended, cooked in fat, baked, or part of a meal/recipe, count it as core/budgeted.
UPF/discretionary calories are Coca-Cola, chocolate bars, crisps, sweets, biscuits, pastries, desserts, and similar highly processed snack foods/drinks.
Use satiation_score for immediate fullness after eating, blank if not known.
Use protein_g for total protein, then split that amount into animal_protein_g and plant_protein_g.
Use fibre_g for total fibre, then estimate soluble_fibre_g and insoluble_fibre_g where possible.
Use fat_g for total fat, then split known fat types into saturated_fat_g, monounsaturated_fat_g, polyunsaturated_fat_g, trans_fat_g, omega3 fields, and omega6_g where possible.
Use total_omega3_g for total omega-3, then split into omega3_ala_g, omega3_epa_g, and omega3_dha_g where possible.
Use vitamin_a_ug for total vitamin A in mcg RAE, then split into preformed_vitamin_a_ug_rae and provitamin_a_carotenoids_ug_rae where possible.
Use iron_mg for total iron, then split into heme_iron_mg and nonheme_iron_mg where possible.
Use total_sugar_g for all sugars. Use free_sugar_g for added/free sugars such as sugar, syrups, honey, juice, smoothies, sweetened drinks, or confectionery. Whole intact fruit contributes to total_sugar_g but not free_sugar_g.
List every plant food in this event, not only new weekly plants. WellFed dedupes the weekly list.
Current WellFed week (${weekLabel}) plant names already counted: ${plantContext}.

WELLFED_EVENT_V1
type: ${eventType}
name:
date: ${date}
time: ${time}
cycle_day: ${cycleDay ?? ''}
plant_foods:
plant_servings:
satiation_score:
caffeine_mg:
alcohol_units:

${nutrientLines}

notes:`
}

export const serializeEventToTemplate = (event, nutrients = NUTRIENTS) => {
  const nutrientLines = nutrients.map((nutrient) => {
    const value = event.nutrients?.[nutrient.id] ?? 0
    return `${nutrient.templateKey}: ${value}`
  }).join('\n')

  return `WELLFED_EVENT_V1
type: ${event.type}
name: ${event.name}
date: ${event.date}
time: ${event.time}
cycle_day: ${event.cycleDay ?? ''}
plant_foods: ${(event.plantFoods ?? []).join(', ')}
plant_servings: ${event.plantServings ?? 0}
satiation_score: ${event.satietyScore ?? ''}
caffeine_mg: ${event.caffeineMg ?? 0}
alcohol_units: ${event.alcoholUnits ?? 0}

${nutrientLines}

notes: ${event.notes ?? ''}`
}

export const nutrientIdForTemplateKey = (templateKey, nutrients = NUTRIENTS) =>
  createTemplateKeyMap(nutrients)[templateKey]
