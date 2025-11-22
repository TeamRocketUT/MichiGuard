import { useEffect, useMemo, useState } from 'react'
import { analyzeTextWithWatson, isWatsonNLUConfigured } from '../utils/watsonNLU'
import { getCurrentWeather, isWeatherAPIConfigured } from '../utils/weatherAPI'

// National Weather Service API base URL
const NWS_API_BASE = 'https://api.weather.gov'

// Enhanced alert summarization using Watson NLU
async function summarizeAlert(alertText) {
  if (!alertText) return alertText

  // If Watson NLU is not configured, return original text
  if (!isWatsonNLUConfigured()) {
    return alertText
  }

  try {
    const analysis = await analyzeTextWithWatson(alertText, {
      features: {
        keywords: {
          limit: 5,
          sentiment: true
        },
        sentiment: {},
        categories: {}
      }
    })
    if (!analysis) return alertText

    // Extract key information from Watson NLU analysis
    const keywords = analysis.keywords || []
    const sentiment = analysis.sentiment?.document || {}

    // Build a concise summary using key terms
    if (keywords.length > 0) {
      const keyTerms = keywords.slice(0, 3).map(k => k.text).join(', ')
      const sentimentLabel = sentiment.label || 'neutral'
      
      // Create a more concise summary
      let summary = alertText
      
      // If the alert is long, try to create a shorter version
      if (alertText.length > 150) {
        summary = `${keyTerms}. ${sentimentLabel === 'negative' ? '⚠️ ' : ''}${alertText.substring(0, 120)}...`
      }
      
      return summary
    }

    return alertText
  } catch (error) {
    console.error('Error summarizing alert with Watson NLU:', error)
    return alertText
  }
}

// Helper: format ISO date into readable local string
function fmt(dt) {
  try {
    return new Date(dt).toLocaleString()
  } catch {
    return dt
  }
}

// Geocode a city/ZIP to lat/lon using NWS-compatible geocoding
async function geocodeLocation(query) {
  try {
    // Use a free geocoding service (Nominatim OpenStreetMap)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: {
          'User-Agent': 'MichiGuard/1.0' // Required by Nominatim
        }
      }
    )
    
    if (!response.ok) return null
    
    const data = await response.json()
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
      }
    }
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

// Map NWS severity to our severity levels
function mapSeverity(nwsSeverity) {
  const severity = (nwsSeverity || '').toLowerCase()
  if (severity.includes('extreme')) return 'Severe'
  if (severity.includes('severe')) return 'Severe'
  if (severity.includes('moderate')) return 'Moderate'
  if (severity.includes('minor') || severity.includes('unknown')) return 'Minor'
  return 'Moderate'
}

// Normalize NWS alert data to our format
function normalizeNWSAlert(alert) {
  const properties = alert.properties || {}
  const geocode = properties.geocode || {}
  
  // Prefer human-readable area description over zone codes
  let areaName = properties.areaDesc || 'Unknown Area'
  
  // If areaDesc is very long or not available, try to extract a cleaner name
  if (areaName && areaName.length > 100) {
    // Use first part if it's too long
    areaName = areaName.split(';')[0].trim()
  }
  
  // Fallback to zone code if no description available
  if (!areaName || areaName === 'Unknown Area') {
    const areas = geocode.SAME || geocode.UGC || []
    if (areas.length > 0) {
      areaName = areas[0]
    }
  }
  
  return {
    id: alert.id || properties.id || `nws-${Date.now()}-${Math.random()}`,
    title: properties.event || properties.headline || 'Weather Alert',
    severity: mapSeverity(properties.severity),
    start: properties.onset || properties.effective || new Date().toISOString(),
    end: properties.expires || new Date(Date.now() + 3600000).toISOString(),
    description: properties.description || properties.summary || properties.headline || 'No description available.',
    area: areaName,
    instruction: properties.instruction || null,
    sender: properties.senderName || 'National Weather Service',
    urgency: properties.urgency || 'Unknown',
    certainty: properties.certainty || 'Unknown'
  }
}

// Fetch real-time weather alerts from NWS API by coordinates
async function fetchAlertsByCoordinates(lat, lon) {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Invalid coordinates')
    }

    // Step 1: Get the grid point for the coordinates
    const pointsResponse = await fetch(
      `${NWS_API_BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      {
        headers: {
          'User-Agent': 'MichiGuard/1.0',
          'Accept': 'application/json'
        }
      }
    )

    if (!pointsResponse.ok) {
      if (pointsResponse.status === 404) {
        console.warn('NWS: No grid point found for coordinates')
        return []
      }
      throw new Error(`NWS points API failed: ${pointsResponse.status}`)
    }

    const pointsData = await pointsResponse.json()
    const forecastZone = pointsData.properties?.forecastZone
    if (!forecastZone) {
      console.warn('NWS: No forecast zone found')
      return []
    }

    // Extract zone ID from URL (e.g., "https://api.weather.gov/zones/forecast/MIZ049" -> "MIZ049")
    const zoneId = forecastZone.split('/').pop()

    // Step 2: Get active alerts for this zone
    const alertsResponse = await fetch(
      `${NWS_API_BASE}/alerts/active/zone/${zoneId}`,
      {
        headers: {
          'User-Agent': 'MichiGuard/1.0',
          'Accept': 'application/geo+json'
        }
      }
    )

    if (!alertsResponse.ok) {
      if (alertsResponse.status === 404) {
        // No active alerts is a valid response
        return []
      }
      throw new Error(`NWS alerts API failed: ${alertsResponse.status}`)
    }

    const alertsData = await alertsResponse.json()
    const features = alertsData.features || []

    // Normalize alerts to our format
    return features.map(normalizeNWSAlert)
  } catch (error) {
    console.error('Error fetching alerts from NWS:', error)
    throw error
  }
}

// Fetch alerts by city/ZIP search
async function fetchAlertsBySearch(query) {
  try {
    const q = (query || '').trim()
    if (!q) return []

    // Geocode the search query
    const location = await geocodeLocation(q)
    if (!location) {
      throw new Error('Location not found')
    }

    // Fetch alerts for the geocoded location
    return await fetchAlertsByCoordinates(location.lat, location.lon)
  } catch (error) {
    console.error('Error fetching alerts by search:', error)
    throw error
  }
}

export default function LiveWeatherAlerts({ embed = false }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [usingSearch, setUsingSearch] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [locationName, setLocationName] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Fetch weather data for a location
  const loadWeatherForLocation = async (lat, lon, locationDisplayName = null) => {
    if (!isWeatherAPIConfigured()) {
      setWeather(null)
      return
    }

    setWeatherLoading(true)
    try {
      const weatherData = await getCurrentWeather(lat, lon)
      setWeather(weatherData)
      if (locationDisplayName && !locationName) {
        setLocationName(locationDisplayName)
      }
    } catch (e) {
      console.error('Error loading weather:', e)
      setWeather(null)
    } finally {
      setWeatherLoading(false)
    }
  }

  // Fetch alerts for a given location
  const loadAlertsForLocation = async (lat, lon, locationDisplayName = null) => {
    setLoading(true)
    setError(null)
    try {
      // Fetch alerts and weather in parallel
      const [res, weatherData] = await Promise.all([
        fetchAlertsByCoordinates(lat, lon),
        isWeatherAPIConfigured() ? getCurrentWeather(lat, lon) : Promise.resolve(null)
      ])
      
      setAlerts(res)
      setWeather(weatherData)
      setCurrentLocation({ lat, lon })
      if (locationDisplayName) {
        setLocationName(locationDisplayName)
      }
      setLastUpdate(new Date())
      setError(null)
    } catch (e) {
      console.error('Error loading alerts:', e)
      setError(e.message || 'Failed to fetch alerts for this location.')
      setAlerts([])
      // Still try to load weather even if alerts fail
      if (isWeatherAPIConfigured()) {
        loadWeatherForLocation(lat, lon, locationDisplayName)
      }
    } finally {
      setLoading(false)
    }
  }

  // On mount: request location and fetch alerts by coordinates
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      setLocationName('Ann Arbor, MI')
      // Load default location
      const defaultLat = 42.2808
      const defaultLon = -83.7430
      loadAlertsForLocation(defaultLat, defaultLon, 'Ann Arbor, MI')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return
        // Try to get location name from reverse geocoding
        try {
          const reverseGeoResponse = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
            {
              headers: {
                'User-Agent': 'MichiGuard/1.0'
              }
            }
          )
          if (reverseGeoResponse.ok) {
            const reverseData = await reverseGeoResponse.json()
            const displayName = reverseData.display_name || 
                              `${reverseData.address?.city || reverseData.address?.town || ''}, ${reverseData.address?.state || ''}`.trim()
            await loadAlertsForLocation(pos.coords.latitude, pos.coords.longitude, displayName || null)
          } else {
            await loadAlertsForLocation(pos.coords.latitude, pos.coords.longitude)
          }
        } catch (e) {
          // If reverse geocoding fails, just load alerts without location name
          await loadAlertsForLocation(pos.coords.latitude, pos.coords.longitude)
        }
      },
      (err) => {
        if (cancelled) return
        // Fallback to Ann Arbor, MI if geolocation fails
        const defaultLat = 42.2808
        const defaultLon = -83.7430
        setError('Location unavailable: Using default location (Ann Arbor, MI).')
        setLocationName('Ann Arbor, MI')
        loadAlertsForLocation(defaultLat, defaultLon, 'Ann Arbor, MI')
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    )
    return () => { cancelled = true }
  }, [])

  // Derived empty state
  const hasNoAlerts = useMemo(() => !loading && (!alerts || alerts.length === 0), [loading, alerts])

  // Search handlers
  const handleSubmit = async (e) => {
    e.preventDefault()
    const q = search.trim()
    if (!q) {
      setUsingSearch(false)
      return
    }
    setLoading(true)
    setWeatherLoading(true)
    setUsingSearch(true)
    setError(null)
    try {
      // Geocode the search query to get location
      const location = await geocodeLocation(q)
      if (!location) {
        throw new Error('Location not found. Please try a different search.')
      }

      // Fetch alerts and weather for the geocoded location
      const [res, weatherData] = await Promise.all([
        fetchAlertsByCoordinates(location.lat, location.lon),
        isWeatherAPIConfigured() ? getCurrentWeather(location.lat, location.lon) : Promise.resolve(null)
      ])
      
      setAlerts(res)
      setWeather(weatherData)
      setLocationName(location.displayName)
      setCurrentLocation({ lat: location.lat, lon: location.lon })
      setLastUpdate(new Date())
    } catch (e) {
      console.error('Search error:', e)
      setError(e.message || 'Failed to fetch alerts for search query.')
      setAlerts([])
      setWeather(null)
    } finally {
      setLoading(false)
      setWeatherLoading(false)
    }
  }

  const clearSearch = async () => {
    setSearch('')
    setUsingSearch(false)
    if (currentLocation) {
      // Reload alerts for current location
      await loadAlertsForLocation(currentLocation.lat, currentLocation.lon)
    } else {
      // Fallback to Ann Arbor
      await loadAlertsForLocation(42.2808, -83.7430)
    }
  }

  const refreshAlerts = async () => {
    if (usingSearch && search.trim()) {
      // Refresh search results
      const location = await geocodeLocation(search.trim())
      if (location) {
        await loadAlertsForLocation(location.lat, location.lon, location.displayName)
      } else {
        setError('Location not found. Please try a different search.')
      }
    } else if (currentLocation) {
      // Refresh current location
      await loadAlertsForLocation(currentLocation.lat, currentLocation.lon, locationName)
    } else {
      // Re-request geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await loadAlertsForLocation(pos.coords.latitude, pos.coords.longitude)
          },
          (err) => {
            setError('Location unavailable: ' + (err?.message || 'Permission denied'))
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        )
      }
    }
  }

  return (
    <div className={`${embed ? 'relative h-full rounded-xl overflow-hidden' : 'fixed inset-0'} flex flex-col bg-transparent overflow-hidden`}>
      {/* Header row */}
      <div className="px-4 pt-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#004e89]">Live Weather Alerts</h1>
          <div className="flex items-stretch gap-2 w-full md:w-auto">
            <form onSubmit={handleSubmit} className="flex items-stretch gap-2 flex-1 md:flex-none md:w-auto">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search city or ZIP..."
                className="w-full md:w-64 bg-white border-2 border-[#004e89] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-[#004e89] text-white font-semibold hover:bg-[#003d6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                title="Search"
              >
                Search
              </button>
              {usingSearch && (
                <button
                  type="button"
                  onClick={clearSearch}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg bg-gray-100 text-[#004e89] font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm"
                  title="Clear search"
                >
                  Clear
                </button>
              )}
            </form>
            <button
              type="button"
              onClick={refreshAlerts}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-michigan-gold text-[#004e89] font-semibold hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              title="Refresh alerts"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
        {locationName && (
          <p className="text-sm text-[#004e89] font-semibold mb-2">
            📍 {locationName}
          </p>
        )}
        {lastUpdate && (
          <p className="text-xs text-gray-600 mb-4">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="px-4 pt-2 pb-4 max-w-6xl mx-auto w-full flex-1 overflow-y-auto">
        {/* Inline error/notice */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

      {/* Weather Display */}
      {weather && (
        <div className="mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl shadow-lg border border-blue-300 overflow-hidden">
          <div className="p-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {weather.icon && (
                  <img 
                    src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                    alt={weather.description}
                    className="w-20 h-20"
                  />
                )}
                <div>
                  <div className="text-4xl font-bold">{weather.temp}°F</div>
                  <div className="text-sm opacity-90">Feels like {weather.feelsLike}°F</div>
                  <div className="text-lg font-semibold capitalize mt-1">{weather.description}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white/20 rounded-lg p-2 text-center">
                  <div className="text-xs opacity-90">Wind</div>
                  <div className="font-bold">{weather.windSpeed} mph</div>
                </div>
                <div className="bg-white/20 rounded-lg p-2 text-center">
                  <div className="text-xs opacity-90">Humidity</div>
                  <div className="font-bold">{weather.humidity}%</div>
                </div>
                {weather.visibility && (
                  <div className="bg-white/20 rounded-lg p-2 text-center">
                    <div className="text-xs opacity-90">Visibility</div>
                    <div className="font-bold">{weather.visibility} mi</div>
                  </div>
                )}
                {weather.precipitation > 0 && (
                  <div className="bg-white/20 rounded-lg p-2 text-center">
                    <div className="text-xs opacity-90">Precipitation</div>
                    <div className="font-bold">{weather.precipitation.toFixed(2)} in</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {weatherLoading && (
        <div className="mb-4 bg-blue-50 rounded-xl shadow border border-blue-200 p-4 text-sm text-blue-700">
          Loading current weather...
        </div>
      )}

      {!isWeatherAPIConfigured() && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm">
          <p className="font-semibold mb-1">Weather Data Unavailable</p>
          <p>Add <code className="bg-yellow-100 px-1 rounded">VITE_OPENWEATHER_API_KEY</code> to your <code className="bg-yellow-100 px-1 rounded">.env</code> file to see current weather conditions.</p>
        </div>
      )}

      {/* Status */}
      {loading && (
        <div className="bg-white rounded-xl shadow border border-gray-200 p-5 text-sm text-gray-700">Loading alerts...</div>
      )}

      {hasNoAlerts && (
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-[#004e89] font-semibold">No active weather alerts. Roads are clear!</p>
        </div>
      )}

        {/* Alerts Grid */}
        {!loading && alerts && alerts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SeverityBadge({ level }) {
  const tone = (level || '').toLowerCase()
  const cls =
    tone === 'severe' ? 'bg-red-100 text-red-700 border-red-300' :
    tone === 'moderate' ? 'bg-yellow-50 text-[#004e89] border-michigan-gold' :
    'bg-gray-100 text-gray-700 border-gray-300'
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold border ${cls}`}>
      {level || 'Unknown'}
    </span>
  )
}

function AlertCard({ alert }) {
  const [summary, setSummary] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const text = await summarizeAlert(alert.description)
      if (!cancelled) setSummary(text)
    })()
    return () => { cancelled = true }
  }, [alert])

  const isActive = new Date(alert.end) > new Date()
  const urgency = alert.urgency || ''
  const certainty = alert.certainty || ''

  return (
    <div className="bg-white rounded-xl shadow hover:shadow-lg transition border border-gray-200 overflow-hidden">
      <div className="bg-[#004e89] text-white px-4 py-3 flex items-center justify-between">
        <h3 className="font-bold text-sm tracking-wide line-clamp-1">{alert.title}</h3>
        <SeverityBadge level={alert.severity} />
      </div>
      <div className="p-4 text-sm text-gray-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-gray-600">Area</div>
          <div className="font-semibold text-[#004e89] text-right max-w-[60%] truncate" title={alert.area}>
            {alert.area}
          </div>
        </div>
        {alert.sender && (
          <div className="flex items-center justify-between">
            <div className="text-gray-600">Source</div>
            <div className="font-medium text-xs">{alert.sender}</div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-gray-600">Starts</div>
          <div className="font-medium text-xs">{fmt(alert.start)}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-gray-600">Ends</div>
          <div className="font-medium text-xs">{fmt(alert.end)}</div>
        </div>
        {(urgency || certainty) && (
          <div className="flex items-center gap-2 text-xs">
            {urgency && (
              <span className={`px-2 py-1 rounded ${
                urgency.toLowerCase() === 'immediate' ? 'bg-red-100 text-red-700' :
                urgency.toLowerCase() === 'expected' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {urgency}
              </span>
            )}
            {certainty && (
              <span className={`px-2 py-1 rounded ${
                certainty.toLowerCase() === 'observed' ? 'bg-red-100 text-red-700' :
                certainty.toLowerCase() === 'likely' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {certainty}
              </span>
            )}
          </div>
        )}
        <div className="pt-2 border-t border-gray-200">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Description</div>
          <p className="leading-relaxed text-gray-800 text-xs">{summary || alert.description}</p>
        </div>
        {alert.instruction && (
          <div className="pt-2 border-t border-gray-200">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Instructions</div>
            <p className="leading-relaxed text-gray-800 text-xs font-medium text-[#004e89]">
              {alert.instruction}
            </p>
          </div>
        )}
      </div>
      <div className="px-4 pb-4 flex items-center justify-between">
        <span className={`text-[10px] font-semibold px-2 py-1 rounded shadow ${
          isActive 
            ? 'bg-green-600 text-white' 
            : 'bg-gray-400 text-white'
        }`}>
          {isActive ? '● Live' : 'Expired'}
        </span>
      </div>
    </div>
  )
}
