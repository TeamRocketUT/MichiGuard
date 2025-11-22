import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

// MDOT RIDE API Configuration
// Once you receive your API credentials, add them to your .env file:
// MDOT_RIDE_API_KEY=your_api_key_here
// MDOT_RIDE_API_URL=https://ride.mdot.state.mi.us/api (or the URL provided by MDOT)
const MDOT_RIDE_API_KEY = process.env.MDOT_RIDE_API_KEY
const MDOT_RIDE_API_URL = process.env.MDOT_RIDE_API_URL || 'https://ride.mdot.state.mi.us/api'

app.use(cors())
app.use(express.json())

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'MichiGuard MDOT proxy' })
})

app.get('/api/mdot/events', async (_req, res) => {
  try {
    console.log('→ Fetching Michigan traffic data...')
    
    // FREE OPTIONS AVAILABLE:
    // 1. MDOT RIDE (Real-Time Data Exchange) - FREE but requires MiLogin for Business account
    //    - Sign up at: https://www.michigan.gov/mdot/travel/safety/efforts/its/its-data
    //    - Create MiLogin for Business account and search for "MDOT RIDE"
    // 2. MDOT Open Data Portal - FREE datasets available
    //    - Visit: https://www.michigan.gov/mdot/business/open-data
    // 3. National Weather Service API - FREE weather-related hazards
    //    - No API key required: https://api.weather.gov
    
    // Attempt to fetch from available sources
    const dataSources = []
    
    // National Weather Service - FREE, no API key required, includes weather-related road hazards
    dataSources.push({ url: 'https://api.weather.gov/alerts/active?area=MI', parser: 'nws' })
    
    // MDOT RIDE API - Add when you receive API credentials
    // To get endpoints:
    // 1. Create MiLogin for Business: https://milogin.michigan.gov/
    // 2. Request access: https://www.michigan.gov/mdot/travel/safety/efforts/its/its-data
    // 3. Search for "MDOT RIDE" in Discover Online Services
    // 4. Contact: MDOT-ITS-Data@Michigan.gov for API documentation
    if (MDOT_RIDE_API_KEY) {
      console.log('✓ MDOT RIDE API key found - attempting to fetch real-time traffic data')
      // Add the actual endpoint URL provided by MDOT (examples below)
      // Common endpoints might be:
      // - /incidents or /traffic-incidents
      // - /workzones or /work-zones
      // - /events or /traffic-events
      // - /alerts
      dataSources.push({ 
        url: `${MDOT_RIDE_API_URL}/incidents`, 
        parser: 'json',
        headers: {
          'Authorization': `Bearer ${MDOT_RIDE_API_KEY}`,
          // Common auth methods (check MDOT docs):
          // 'Authorization': `Bearer ${MDOT_RIDE_API_KEY}`
          // 'X-API-Key': MDOT_RIDE_API_KEY
          // 'apikey': MDOT_RIDE_API_KEY
        }
      })
      // Add other RIDE endpoints when you know them:
      // dataSources.push({ url: `${MDOT_RIDE_API_URL}/workzones`, parser: 'json', headers: {...} })
      // dataSources.push({ url: `${MDOT_RIDE_API_URL}/events`, parser: 'json', headers: {...} })
    } else {
      console.log('ℹ️ MDOT RIDE API key not configured. Add MDOT_RIDE_API_KEY to .env file when you receive credentials.')
    }
    
    // MDOT Open Data Portal endpoints
    // To find endpoints:
    // 1. Visit: https://www.michigan.gov/mdot/business/open-data
    // 2. Browse datasets (traffic incidents, work zones, etc.)
    // 3. Click on a dataset → Look for "API" or "Export" option
    // 4. Socrata format: https://data.michigan.gov/resource/DATASET-ID.json
    // Example (replace with actual dataset ID):
    // dataSources.push({ url: 'https://data.michigan.gov/resource/xxxx-xxxx.json', parser: 'json' })
    
    // Fallback: Try MDOT endpoints (may not work without auth)
    dataSources.push({ url: 'https://mdotnetpublic.state.mi.us/MobileMDOT511/TrafficIncidents', parser: 'json' })
    dataSources.push({ url: 'https://mdotnetpublic.state.mi.us/Drive/api/incidents', parser: 'json' })
    
    let incidents = []
    let fetchSuccess = false
    
    for (const source of dataSources) {
      try {
        const url = typeof source === 'string' ? source : source.url
        const parser = typeof source === 'string' ? 'json' : (source.parser || 'json')
        const customHeaders = typeof source === 'object' && source.headers ? source.headers : {}
        
        console.log(`Attempting to fetch from: ${url}`)
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json, application/geo+json, text/xml, */*',
            'User-Agent': 'MichiGuard/1.0 (https://github.com/TeamRocketUT/MichiGuard)',
            ...customHeaders // Merge any custom headers (like API keys)
          },
          timeout: 10000
        })
        
        if (response.ok) {
          const contentType = response.headers.get('content-type')
          console.log(`✓ Response from ${url} (${contentType})`)
          
          if (parser === 'nws' || contentType?.includes('application/geo+json')) {
            // National Weather Service GeoJSON format
            const data = await response.json()
            incidents = parseNWSAlerts(data)
          } else if (contentType?.includes('json')) {
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
        } else {
          console.log(`✗ HTTP ${response.status} from ${url}`)
        }
      } catch (err) {
        console.log(`✗ Failed to fetch from ${url}:`, err.message)
        continue
      }
    }
    
    // Return empty array if no real data found
    if (!fetchSuccess || incidents.length === 0) {
      console.log('⚠️ No real traffic data available from MDOT sources')
    }
    
    res.json(incidents)
  } catch (error) {
    console.error('❌ Error fetching traffic events:', error)
    res.json([])
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
  if (t.includes('weather') || t.includes('ice') || t.includes('snow') || t.includes('wind') || t.includes('flood') || t.includes('storm')) return 'weather'
  if (t.includes('lane')) return 'lane'
  if (t.includes('incident') || t.includes('event')) return 'incident'
  return 'other'
}

// Parse National Weather Service alerts (FREE API, no key required)
function parseNWSAlerts(data) {
  try {
    if (!data || !data.features || !Array.isArray(data.features)) return []
    
    const incidents = []
    data.features.forEach((feature, idx) => {
      if (!feature.properties || !feature.geometry) return
      
      const props = feature.properties
      const geometry = feature.geometry
      
      // Extract coordinates (NWS uses GeoJSON format)
      let lat = null
      let lng = null
      
      if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
        // Point: [lng, lat]
        lng = geometry.coordinates[0]
        lat = geometry.coordinates[1]
      } else if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
        // Polygon: calculate centroid from first ring
        const ring = geometry.coordinates[0]
        if (Array.isArray(ring) && ring.length > 0) {
          let sumLat = 0, sumLng = 0
          ring.forEach(coord => {
            if (Array.isArray(coord) && coord.length >= 2) {
              sumLng += coord[0]
              sumLat += coord[1]
            }
          })
          lng = sumLng / ring.length
          lat = sumLat / ring.length
        }
      }
      
      if (!lat || !lng) return
      
      // Map NWS alert types to hazard types
      const eventType = normalizeEventType(props.event || props.headline || 'weather')
      const description = props.headline || props.description || props.event || 'Weather alert'
      
      incidents.push({
        id: props.id || `nws-${idx}`,
        eventType: eventType,
        description: description.substring(0, 200), // Truncate long descriptions
        latitude: lat,
        longitude: lng,
        startDate: props.effective || props.onset || new Date().toISOString(),
        endDate: props.expires || props.ends || null,
        impact: props.severity || props.urgency || null,
        roadway: props.areaDesc || null
      })
    })
    
    return incidents.filter(i => i.latitude && i.longitude)
  } catch (err) {
    console.error('Error parsing NWS alerts:', err)
    return []
  }
}


app.listen(PORT, () => {
  console.log(`MichiGuard MDOT proxy server running on http://localhost:${PORT}`)
})
