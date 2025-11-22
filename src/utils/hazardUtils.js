// Shared hazard utilities for consistent categorization and coloring
// Keeps PredictHazardsPage and HazardMapPage aligned

export const HAZARD_COLORS = {
  accident: '#FFD93D',
  roadwork: '#FF6B6B',
  construction: '#FF6B6B', // alias
  closure: '#DC143C',
  congestion: '#FFA500',
  weather: '#4ECDC4',
  lane: '#9370DB',
  incident: '#f6bd60',
  other: '#808080'
}

// Normalize any incoming event type / prediction label to a canonical category
export function normalizeHazardType(raw) {
  if (!raw) return 'other'
  const t = raw.toLowerCase()
  if (t.includes('accident') || t.includes('crash') || t.includes('collision')) return 'accident'
  if (t.includes('construct') || t.includes('work') || t.includes('repair')) return 'roadwork'
  if (t.includes('closure') || t.includes('closed') || t.includes('block')) return 'closure'
  if (t.includes('congestion') || t.includes('traffic') || t.includes('delay')) return 'congestion'
  if (t.includes('lane')) return 'lane'
  // Prediction specific hazard types map to weather or accident buckets
  if (t.includes('icy') || t.includes('ice') || t.includes('snow') || t.includes('wind') || t.includes('visibility') || t.includes('fog') || t.includes('flood') || t.includes('weather')) return 'weather'
  if (t.includes('incident') || t.includes('event')) return 'incident'
  // Accident likelihood prediction
  if (t.includes('accident likelihood')) return 'accident'
  return 'other'
}

export function getHazardColor(rawType) {
  const type = normalizeHazardType(rawType)
  return HAZARD_COLORS[type] || HAZARD_COLORS.other
}

// For displaying prediction hazard labels consistently next to map hazards
export function formatHazardLabel(rawType) {
  const type = normalizeHazardType(rawType)
  switch (type) {
    case 'roadwork': return 'Construction'
    case 'lane': return 'Lane Closure'
    case 'accident': return 'Accident'
    case 'closure': return 'Closure'
    case 'congestion': return 'Congestion'
    case 'weather': return 'Weather'
    case 'incident': return 'Incident'
    default: return 'Other'
  }
}
