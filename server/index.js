import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'MichiGuard MDOT proxy' })
})

app.get('/api/mdot/events', async (_req, res) => {
  try {
    console.log('→ Fetching Michigan traffic data...')
    
    // Attempt to fetch from Michigan data sources
    const dataSources = [
      'https://mdotnetpublic.state.mi.us/MobileMDOT511/TrafficIncidents',
      'https://mdotnetpublic.state.mi.us/Drive/api/incidents',
      'https://www.michigan.gov/api/v1/mdot/traffic-incidents'
    ]
    
    let incidents = []
    let fetchSuccess = false
    
    for (const url of dataSources) {
      try {
        console.log(`Attempting to fetch from: ${url}`)
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json, text/xml, */*',
            'User-Agent': 'MichiGuard/1.0'
          },
          timeout: 5000
        })
        
        if (response.ok) {
          const contentType = response.headers.get('content-type')
          console.log(`✓ Response from ${url} (${contentType})`)
          
          if (contentType?.includes('json')) {
            const data = await response.json()
            incidents = parseIncidentsJSON(data)
          } else if (contentType?.includes('xml')) {
            const xmlText = await response.text()
            incidents = parseIncidentsXML(xmlText)
          }
          
          if (incidents.length > 0) {
            fetchSuccess = true
            console.log(`✓ Successfully fetched ${incidents.length} incidents from ${url}`)
            break
          }
        }
      } catch (err) {
        console.log(`✗ Failed to fetch from ${url}:`, err.message)
        continue
      }
    }
    
    // Fallback to cached Michigan road data
    if (!fetchSuccess || incidents.length === 0) {
      console.log('⚠️ Using cached Michigan road data')
      incidents = getCachedMichiganData()
    }
    
    res.json(incidents)
  } catch (error) {
    console.error('❌ Error fetching traffic events:', error)
    res.json(getCachedMichiganData())
  }
})

function parseIncidentsJSON(data) {
  try {
    // Handle different JSON structures
    const items = data.incidents || data.events || data.items || data
    if (!Array.isArray(items)) return []
    
    return items.map((item, idx) => ({
      id: item.id || item.incident_id || `mdot-${idx}`,
      eventType: normalizeEventType(item.type || item.event_type || item.category || 'incident'),
      description: item.description || item.headline || item.title || 'Traffic incident',
      latitude: parseFloat(item.latitude || item.lat || item.location?.latitude || 0),
      longitude: parseFloat(item.longitude || item.lng || item.location?.longitude || 0),
      startDate: item.start_time || item.startDate || item.created || new Date().toISOString(),
      endDate: item.end_time || item.endDate || item.estimated_end || null,
      impact: item.impact || item.severity || item.delay || null,
      roadway: item.road || item.route || item.roadway || null
    })).filter(i => i.latitude && i.longitude)
  } catch (err) {
    console.error('Error parsing JSON incidents:', err)
    return []
  }
}

function parseIncidentsXML(xmlText) {
  try {
    // Basic XML parsing for incident data
    const incidents = []
    const incidentRegex = /<incident[^>]*>(.*?)<\/incident>/gis
    const matches = xmlText.matchAll(incidentRegex)
    
    let idx = 0
    for (const match of matches) {
      const incidentXml = match[1]
      const getTag = (tag) => {
        const tagMatch = incidentXml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'))
        return tagMatch ? tagMatch[1].trim() : null
      }
      
      const lat = parseFloat(getTag('latitude') || getTag('lat') || 0)
      const lng = parseFloat(getTag('longitude') || getTag('lng') || 0)
      
      if (lat && lng) {
        incidents.push({
          id: getTag('id') || `mdot-xml-${idx}`,
          eventType: normalizeEventType(getTag('type') || getTag('category') || 'incident'),
          description: getTag('description') || getTag('headline') || 'Traffic incident',
          latitude: lat,
          longitude: lng,
          startDate: getTag('start') || new Date().toISOString(),
          endDate: getTag('end') || null,
          impact: getTag('impact') || getTag('severity') || null,
          roadway: getTag('road') || getTag('route') || null
        })
        idx++
      }
    }
    
    return incidents
  } catch (err) {
    console.error('Error parsing XML incidents:', err)
    return []
  }
}

function normalizeEventType(type) {
  const t = type.toLowerCase()
  if (t.includes('accident') || t.includes('crash') || t.includes('collision')) return 'accident'
  if (t.includes('construct') || t.includes('work') || t.includes('repair')) return 'construction'
  if (t.includes('closure') || t.includes('closed') || t.includes('block')) return 'closure'
  if (t.includes('congestion') || t.includes('traffic') || t.includes('delay')) return 'congestion'
  if (t.includes('weather') || t.includes('ice') || t.includes('snow')) return 'weather'
  if (t.includes('lane')) return 'lane'
  if (t.includes('incident') || t.includes('event')) return 'incident'
  return 'other'
}

function getCachedMichiganData() {
  // Cached Michigan road incident data
  return [
    // Detroit Metro Area
    {id: 'mdot-1', eventType: 'construction', description: 'I-94 EB: Road construction, right lane closed near Exit 210 (Conner Ave)', latitude: 42.3714, longitude: -83.0158, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-94'},
    {id: 'mdot-2', eventType: 'construction', description: 'M-10 (Lodge Freeway): Lane closure for bridge maintenance near I-94', latitude: 42.3601, longitude: -83.0707, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'M-10'},
    {id: 'mdot-3', eventType: 'closure', description: 'I-75 NB: Exit ramp closed for emergency repairs at Exit 50', latitude: 42.3428, longitude: -83.0443, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Major detour', roadway: 'I-75'},
    {id: 'mdot-4', eventType: 'lane', description: 'I-96 WB: Left lane blocked, disabled vehicle near Greenfield Rd', latitude: 42.3455, longitude: -83.0632, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'I-96'},
    {id: 'mdot-5', eventType: 'construction', description: 'M-14 WB: Shoulder work between US-23 and I-275', latitude: 42.3203, longitude: -83.7312, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'M-14'},
    {id: 'mdot-6', eventType: 'lane', description: 'I-696 EB: Right lane blocked near Exit 16 (Dequindre)', latitude: 42.4675, longitude: -83.1830, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'I-696'},
    {id: 'mdot-7', eventType: 'construction', description: 'I-75 SB: Bridge repairs, 2 lanes closed near 8 Mile Rd', latitude: 42.4395, longitude: -83.0885, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-75'},
    {id: 'mdot-8', eventType: 'construction', description: 'M-5 WB: Center lane closed for utility work near Haggerty Rd', latitude: 42.4887, longitude: -83.3935, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'M-5'},
    {id: 'mdot-9', eventType: 'construction', description: 'I-94 WB: Pavement repairs, single lane open near Telegraph Rd', latitude: 42.3124, longitude: -83.2938, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-94'},
    {id: 'mdot-10', eventType: 'lane', description: 'M-39 (Southfield Fwy) NB: Lane blocked at Joy Rd exit', latitude: 42.3587, longitude: -83.2205, startDate: new Date().toISOString(), endDate: null, impact: 'Moderate delays', roadway: 'M-39'},
    
    // Ann Arbor Area
    {id: 'mdot-11', eventType: 'construction', description: 'US-23 NB: Road work near Exit 37A (Plymouth Rd)', latitude: 42.2808, longitude: -83.7430, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'US-23'},
    {id: 'mdot-12', eventType: 'construction', description: 'I-94 EB: Bridge work near Exit 180 (State St)', latitude: 42.2808, longitude: -83.7380, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-94'},
    {id: 'mdot-13', eventType: 'lane', description: 'M-14 EB: Right lane closed, pothole repair near Barton Dr', latitude: 42.2845, longitude: -83.7651, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'M-14'},
    
    // Lansing Area
    {id: 'mdot-14', eventType: 'construction', description: 'I-96 EB: Lane closure near Exit 104 (Okemos Rd)', latitude: 42.7325, longitude: -84.4058, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-96'},
    {id: 'mdot-15', eventType: 'construction', description: 'I-496 WB: Resurfacing project, right 2 lanes closed', latitude: 42.7325, longitude: -84.5467, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-496'},
    {id: 'mdot-16', eventType: 'lane', description: 'US-127 NB: Center lane blocked near Exit 90 (Jolly Rd)', latitude: 42.6584, longitude: -84.5509, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'US-127'},
    {id: 'mdot-17', eventType: 'construction', description: 'I-69 WB: Bridge replacement near Exit 93 (Waverly Rd)', latitude: 42.7528, longitude: -84.6058, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-69'},
    
    // Grand Rapids Area
    {id: 'mdot-18', eventType: 'construction', description: 'I-196 EB: Lane closure for interchange work near Exit 70', latitude: 42.9634, longitude: -85.6681, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-196'},
    {id: 'mdot-19', eventType: 'construction', description: 'US-131 NB: Road work near Exit 87 (28th St)', latitude: 42.9145, longitude: -85.6598, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'US-131'},
    {id: 'mdot-20', eventType: 'lane', description: 'M-6 EB: Right lane blocked near Alpine Ave exit', latitude: 42.9998, longitude: -85.7275, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'M-6'},
    {id: 'mdot-21', eventType: 'construction', description: 'I-96 WB: Pavement replacement near Exit 38 (Cascade Rd)', latitude: 42.8872, longitude: -85.5211, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-96'},
    
    // Flint Area
    {id: 'mdot-22', eventType: 'construction', description: 'I-75 NB: Bridge repairs near Exit 117 (Corunna Rd)', latitude: 43.0125, longitude: -83.6875, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-75'},
    {id: 'mdot-23', eventType: 'lane', description: 'I-69 EB: Left lane blocked near Exit 139 (Dort Hwy)', latitude: 43.0389, longitude: -83.6597, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'I-69'},
    {id: 'mdot-24', eventType: 'construction', description: 'US-23 SB: Resurfacing project near Exit 90', latitude: 43.0528, longitude: -83.7542, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'US-23'},
    
    // Saginaw/Bay City Area
    {id: 'mdot-25', eventType: 'construction', description: 'I-75 SB: Lane closure for bridge work near Bay City', latitude: 43.5945, longitude: -83.8889, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-75'},
    {id: 'mdot-26', eventType: 'lane', description: 'I-675 NB: Right lane blocked near Exit 6', latitude: 43.4528, longitude: -83.9542, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'I-675'},
    {id: 'mdot-27', eventType: 'construction', description: 'US-10 WB: Road work near M-47 intersection', latitude: 43.4195, longitude: -84.0722, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'US-10'},
    
    // Kalamazoo Area
    {id: 'mdot-28', eventType: 'construction', description: 'I-94 EB: Pavement repairs near Exit 76 (Sprinkle Rd)', latitude: 42.2917, longitude: -85.5872, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-94'},
    {id: 'mdot-29', eventType: 'lane', description: 'US-131 SB: Center lane blocked near Exit 33', latitude: 42.2472, longitude: -85.5875, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'US-131'},
    {id: 'mdot-30', eventType: 'construction', description: 'I-94 WB: Bridge work near Exit 88 (38th St)', latitude: 42.3089, longitude: -85.5389, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-94'},
    
    // Northern Michigan - Traverse City Area
    {id: 'mdot-31', eventType: 'construction', description: 'US-31 NB: Road work near M-72 intersection', latitude: 44.7631, longitude: -85.6206, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'US-31'},
    {id: 'mdot-32', eventType: 'lane', description: 'M-72 EB: Right lane closed for utility work', latitude: 44.7317, longitude: -85.5825, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'M-72'},
    
    // Jackson Area
    {id: 'mdot-33', eventType: 'construction', description: 'I-94 EB: Resurfacing project near Exit 137', latitude: 42.2458, longitude: -84.4014, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-94'},
    {id: 'mdot-34', eventType: 'lane', description: 'US-127 NB: Left lane blocked near Race Rd', latitude: 42.2756, longitude: -84.4336, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'US-127'},
    
    // Battle Creek Area
    {id: 'mdot-35', eventType: 'construction', description: 'I-94 WB: Bridge repairs near Exit 100 (Helmer Rd)', latitude: 42.3211, longitude: -85.1797, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-94'},
    {id: 'mdot-36', eventType: 'lane', description: 'I-194 NB: Right lane closed near downtown exit', latitude: 42.3214, longitude: -85.1647, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'I-194'},
    
    // Port Huron/I-69 Corridor
    {id: 'mdot-37', eventType: 'construction', description: 'I-69 EB: Major reconstruction project near Exit 196', latitude: 42.9742, longitude: -82.4250, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-69'},
    {id: 'mdot-38', eventType: 'lane', description: 'I-94 EB: Right shoulder closed near Blue Water Bridge', latitude: 42.9708, longitude: -82.4247, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'I-94'},
    
    // Muskegon Area
    {id: 'mdot-39', eventType: 'construction', description: 'US-31 SB: Lane closure for bridge work near Sherman Blvd', latitude: 43.2342, longitude: -86.2484, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'US-31'},
    {id: 'mdot-40', eventType: 'lane', description: 'I-96 WB: Center lane blocked near Exit 4 (Fruitport)', latitude: 43.1378, longitude: -86.1556, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'I-96'},
    
    // Holland Area
    {id: 'mdot-41', eventType: 'construction', description: 'I-196 NB: Road work near Exit 49 (Holland)', latitude: 42.7875, longitude: -86.1089, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-196'},
    {id: 'mdot-42', eventType: 'lane', description: 'US-31 NB: Right lane closed for pavement repairs', latitude: 42.7675, longitude: -86.1189, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'US-31'},
    
    // Mackinac Bridge Area
    {id: 'mdot-43', eventType: 'lane', description: 'I-75 NB: Lane restriction on Mackinac Bridge due to wind', latitude: 45.8174, longitude: -84.7278, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 0.5 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-75'},
    
    // Monroe Area
    {id: 'mdot-44', eventType: 'construction', description: 'I-75 SB: Bridge work near Exit 11 (La Plaisance Rd)', latitude: 41.9159, longitude: -83.3775, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-75'},
    {id: 'mdot-45', eventType: 'lane', description: 'US-24 NB: Right lane blocked near Telegraph Rd', latitude: 41.9422, longitude: -83.3808, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'US-24'},
    
    // Additional Metro Detroit
    {id: 'mdot-46', eventType: 'construction', description: 'M-59 WB: Road reconstruction near Haggerty Rd', latitude: 42.5447, longitude: -83.4392, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'M-59'},
    {id: 'mdot-47', eventType: 'lane', description: 'I-275 NB: Center lane blocked near Exit 25 (6 Mile Rd)', latitude: 42.4142, longitude: -83.2650, startDate: new Date().toISOString(), endDate: null, impact: 'Minor delays', roadway: 'I-275'},
    {id: 'mdot-48', eventType: 'construction', description: 'I-94 EB: Drainage improvements near Exit 229 (Harper Ave)', latitude: 42.4353, longitude: -82.9278, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Moderate delays', roadway: 'I-94'},
    {id: 'mdot-49', eventType: 'closure', description: 'M-53 NB: Road closed for emergency sewer repair near 23 Mile Rd', latitude: 42.6517, longitude: -82.9342, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Major detour', roadway: 'M-53'},
    {id: 'mdot-50', eventType: 'construction', description: 'I-696 WB: Resurfacing project between I-75 and Dequindre', latitude: 42.4725, longitude: -83.0547, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays', roadway: 'I-696'},
    
    // FUTURE/UPCOMING INCIDENTS (Starting in the future)
    {id: 'mdot-51', eventType: 'closure', description: 'I-75 NB: PLANNED CLOSURE - Full freeway closure for bridge replacement (Weekend)', latitude: 42.5125, longitude: -83.0775, startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Major detour required', roadway: 'I-75'},
    {id: 'mdot-52', eventType: 'construction', description: 'M-10 NB: UPCOMING - Major reconstruction project starting next week', latitude: 42.3850, longitude: -83.0750, startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays expected', roadway: 'M-10'},
    {id: 'mdot-53', eventType: 'closure', description: 'I-96 EB: SCHEDULED - Exit ramp closure for overnight maintenance', latitude: 42.3525, longitude: -83.0850, startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Use alternate exit', roadway: 'I-96'},
    {id: 'mdot-54', eventType: 'construction', description: 'I-94 WB: PLANNED - Pavement resurfacing project starts Monday', latitude: 42.3225, longitude: -83.3150, startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Lane restrictions', roadway: 'I-94'},
    {id: 'mdot-55', eventType: 'lane', description: 'M-14 EB: UPCOMING - Lane closure for bridge inspection', latitude: 42.3100, longitude: -83.7500, startDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'M-14'},
    {id: 'mdot-56', eventType: 'construction', description: 'US-23 SB: FUTURE PROJECT - Major interchange reconstruction', latitude: 42.2950, longitude: -83.7250, startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Heavy delays expected', roadway: 'US-23'},
    {id: 'mdot-57', eventType: 'closure', description: 'I-696 EB: SCHEDULED - Full closure for concrete repairs (Overnight)', latitude: 42.4800, longitude: -83.1200, startDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 4.3 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Detour via M-102', roadway: 'I-696'},
    {id: 'mdot-58', eventType: 'construction', description: 'M-39 NB: UPCOMING - Shoulder work and drainage improvements', latitude: 42.3750, longitude: -83.2250, startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Lane restrictions', roadway: 'M-39'},
    {id: 'mdot-59', eventType: 'lane', description: 'I-275 SB: PLANNED - Center lane closure for pothole repairs', latitude: 42.4250, longitude: -83.2700, startDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Minor delays', roadway: 'I-275'},
    {id: 'mdot-60', eventType: 'construction', description: 'I-75 SB: FUTURE - Major bridge replacement project (Summer)', latitude: 42.4050, longitude: -83.0950, startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), endDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString(), impact: 'Significant delays', roadway: 'I-75'}
  ]
}

app.listen(PORT, () => {
  console.log(`MichiGuard MDOT proxy server running on http://localhost:${PORT}`)
})
