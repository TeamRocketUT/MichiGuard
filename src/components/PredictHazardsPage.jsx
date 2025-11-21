import { useEffect, useRef, useState } from 'react'
import { analyzeTextWithWatson } from '../utils/watsonNLU'
import { getCurrentWeather, getWeatherForecast, assessHazardRisk, isWeatherAPIConfigured } from '../utils/weatherAPI'

// MDOT 511 real-time events fetch via local proxy (avoids CORS)
async function fetchMdotEvents() {
  const url = 'http://localhost:3001/api/mdot/events'
  console.log('📡 MDOT Hazard Fetch (proxy): Requesting', url)
  try {
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    
    if (!res.ok) {
      console.error('❌ Proxy MDOT fetch failed:', res.status, res.statusText)
      return []
    }
    const data = await res.json()
    console.log('📦 Proxy MDOT JSON response (raw):', data)
    if (!Array.isArray(data)) {
      console.warn('⚠️ Proxy MDOT response not an array. Raw:', data)
      return []
    }
    const normalized = data.map((evt, idx) => normalizeMdotEvent(evt, idx)).filter(e => e.lat && e.lng)
    console.log(`✅ Proxy MDOT events loaded: ${normalized.length}`)
    return normalized
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('⚠️ MDOT fetch timeout - continuing without hazard data')
    } else {
      console.error('❌ Proxy MDOT fetch error:', err)
    }
    return []
  }
}

function normalizeMdotEvent(evt, idx) {
  // Attempt multiple field name variants
  const lat = evt.latitude ?? evt.lat ?? evt.Location?.Latitude ?? evt.location?.lat ?? null
  const lng = evt.longitude ?? evt.lon ?? evt.Location?.Longitude ?? evt.location?.lng ?? null
  const eventType = (evt.eventType || evt.type || evt.category || 'other').toString().toLowerCase()
  const description = evt.description || evt.title || evt.text || eventType
  const impact = evt.impact || evt.delay || evt.effect || null
  const startDate = evt.startDate || evt.start || evt.startTime || null
  const endDate = evt.endDate || evt.end || evt.endTime || null
  return {
    id: evt.id || evt.eventId || `mdot-${idx}`,
    eventType,
    description,
    impact,
    startDate,
    endDate,
    lat: typeof lat === 'string' ? parseFloat(lat) : lat,
    lng: typeof lng === 'string' ? parseFloat(lng) : lng
  }
}

// Check if a hazard is near a location or route
function isHazardNearLocation(hazard, location, thresholdMiles = 10) {
  if (!hazard.lat || !hazard.lng || !location.lat || !location.lng) return false
  if (!window.google?.maps) return false
  
  const hazardPoint = new window.google.maps.LatLng(hazard.lat, hazard.lng)
  const locationPoint = new window.google.maps.LatLng(location.lat, location.lng)
  const distanceMeters = window.google.maps.geometry.spherical.computeDistanceBetween(hazardPoint, locationPoint)
  const distanceMiles = distanceMeters / 1609.34
  return distanceMiles <= thresholdMiles
}

// Check if hazards are near route points
function getHazardsNearRoute(hazards, routePath, thresholdMiles = 2) {
  if (!routePath || !Array.isArray(routePath) || routePath.length === 0) return []
  if (!window.google?.maps) return []
  
  const nearbyHazards = []
  const thresholdMeters = thresholdMiles * 1609.34
  
  hazards.forEach(hazard => {
    if (!hazard.lat || !hazard.lng) return
    
    const hazardPoint = new window.google.maps.LatLng(hazard.lat, hazard.lng)
    let minDistance = Infinity
    
    // Check distance to nearest route point
    for (let i = 0; i < routePath.length; i++) {
      const routePoint = routePath[i]
      let routeLatLng
      if (routePoint.lat && routePoint.lng) {
        routeLatLng = new window.google.maps.LatLng(routePoint.lat, routePoint.lng)
      } else if (Array.isArray(routePoint)) {
        // Handle [lng, lat] format
        routeLatLng = new window.google.maps.LatLng(routePoint[1], routePoint[0])
      } else if (typeof routePoint === 'object' && routePoint.lat && routePoint.lng) {
        routeLatLng = new window.google.maps.LatLng(routePoint.lat, routePoint.lng)
      } else continue
      
      const distance = window.google.maps.geometry.spherical.computeDistanceBetween(hazardPoint, routeLatLng)
      if (distance < minDistance) minDistance = distance
      
      if (distance <= thresholdMeters) {
        nearbyHazards.push({ ...hazard, distanceMiles: distance / 1609.34 })
        return
      }
    }
  })
  
  return nearbyHazards
}

// Enhanced route analysis with Google Maps Directions, real-time weather, and MDOT hazards
async function getRouteAnalysis(routeStart, routeDest, hazardType, geocoder, directionsService, liveHazards = []) {
  if (!geocoder || !directionsService) {
    return null
  }

  try {
    // Geocode start and destination with better error handling
    const geocodeAddress = (address) => {
      return new Promise((resolve, reject) => {
        geocoder.geocode(
          { address: address, region: 'us' }, // Add region hint for US addresses
          (results, status) => {
            if (status === 'OK' && results && results.length > 0) {
              resolve(results)
            } else {
              let errorMsg = 'Unknown error'
              switch (status) {
                case 'ZERO_RESULTS':
                  errorMsg = `No results found for "${address}"`
                  break
                case 'OVER_QUERY_LIMIT':
                  errorMsg = 'Geocoding quota exceeded. Please try again later.'
                  break
                case 'REQUEST_DENIED':
                  errorMsg = 'Geocoding request denied. Please check your API key.'
                  break
                case 'INVALID_REQUEST':
                  errorMsg = `Invalid address: "${address}"`
                  break
                default:
                  errorMsg = `Geocoding failed for "${address}" (${status})`
              }
              reject(new Error(errorMsg))
            }
          }
        )
      })
    }

    let startResults, destResults
    try {
      [startResults, destResults] = await Promise.all([
        geocodeAddress(routeStart),
        geocodeAddress(routeDest)
      ])
    } catch (error) {
      return { error: error.message || 'Could not find one or both locations. Please check the addresses and try again.' }
    }

    const startLoc = startResults[0].geometry.location
    const destLoc = destResults[0].geometry.location

    // Get route directions with better error handling
    const directionsResult = await new Promise((resolve, reject) => {
      directionsService.route(
        {
          origin: startLoc,
          destination: destLoc,
          travelMode: window.google.maps.TravelMode.DRIVING,
          region: 'us' // Add region hint
        },
        (result, status) => {
          if (status === 'OK' && result && result.routes && result.routes.length > 0) {
            resolve(result)
          } else {
            let errorMsg = 'Unknown error'
            switch (status) {
              case 'ZERO_RESULTS':
                errorMsg = 'No route found between the two locations.'
                break
              case 'NOT_FOUND':
                errorMsg = 'One or both locations could not be found.'
                break
              case 'OVER_QUERY_LIMIT':
                errorMsg = 'Directions quota exceeded. Please try again later.'
                break
              case 'REQUEST_DENIED':
                errorMsg = 'Directions request denied. Please check your API key.'
                break
              case 'INVALID_REQUEST':
                errorMsg = 'Invalid route request. Please check your addresses.'
                break
              default:
                errorMsg = `Directions failed: ${status}`
            }
            reject(new Error(errorMsg))
          }
        }
      )
    })

    const route = directionsResult.routes[0]
    const leg = route.legs[0]
    const path = route.overview_path

    // Sample weather data along the route (every 5 points for efficiency)
    const weatherPoints = []
    const sampleInterval = Math.max(1, Math.floor(path.length / 5))
    
    for (let i = 0; i < path.length; i += sampleInterval) {
      const point = path[i]
      try {
        const weather = await getCurrentWeather(point.lat(), point.lng())
        if (weather) {
          weatherPoints.push({
            lat: point.lat(),
            lng: point.lng(),
            weather: weather,
            risk: assessHazardRisk(weather, hazardType)
          })
        }
      } catch (e) {
        console.warn('Failed to fetch weather for route point:', e)
      }
    }

    // Get hazards near the route
    const routeHazards = getHazardsNearRoute(liveHazards, path, 2) // 2 miles threshold

    // Calculate overall route risk
    const totalRisk = weatherPoints.reduce((sum, p) => sum + p.risk.score, 0)
    const avgRisk = weatherPoints.length > 0 ? totalRisk / weatherPoints.length : 0
    const highRiskZones = weatherPoints.filter(p => p.risk.level === 'High').length
    const mediumRiskZones = weatherPoints.filter(p => p.risk.level === 'Medium').length

    // Build comprehensive analysis text for Watson NLU
    const hazardsText = routeHazards.length > 0
      ? `\n\nHazards Along Route:\n${routeHazards.map((h, idx) => 
          `${idx + 1}. ${h.eventType || 'Hazard'}: ${h.description || 'No description'}${h.impact ? ` (Impact: ${h.impact})` : ''}`
        ).join('\n')}`
      : '\n\nNo reported hazards along this route at this time.'

    const routeAnalysisText = `
      Route Analysis from ${routeStart} to ${routeDest}:
      
      Route Information:
      - Distance: ${leg.distance.text}
      - Estimated Duration: ${leg.duration.text}
      - Number of weather checkpoints: ${weatherPoints.length}
      - Reported hazards along route: ${routeHazards.length}
      
      Hazard Type: ${hazardType}
      
      Weather Conditions Along Route:
      ${weatherPoints.map((p, idx) => `
        Checkpoint ${idx + 1}:
        - Temperature: ${p.weather.temp}°F
        - Conditions: ${p.weather.description}
        - Wind: ${p.weather.windSpeed} mph
        - Visibility: ${p.weather.visibility || 'Unknown'} miles
        - Risk Level: ${p.risk.level} (${p.risk.score}%)
        - Risk Factors: ${p.risk.factors.join(', ')}
      `).join('\n')}
      
      Overall Route Assessment:
      - Average Risk Score: ${Math.round(avgRisk)}%
      - High Risk Zones: ${highRiskZones}
      - Medium Risk Zones: ${mediumRiskZones}
      - Low Risk Zones: ${weatherPoints.length - highRiskZones - mediumRiskZones}
      
      ${hazardsText}
      
      Analysis Request:
      Based on these real-time weather conditions${routeHazards.length > 0 ? ' and reported hazards' : ''} along the entire route, assess the overall safety for ${hazardType}.
      Identify the most dangerous segments, provide recommendations, and predict potential hazards.
      Consider the route distance, weather variability, risk distribution, and any existing hazards along the route.
      ${routeHazards.length > 0 ? 'Pay special attention to the reported hazards as they indicate current road conditions or incidents.' : ''}
    `.trim()

    // Analyze with Watson NLU
    const nluAnalysis = await analyzeTextWithWatson(routeAnalysisText, {
      features: {
        entities: { limit: 20, sentiment: true },
        keywords: { limit: 20, sentiment: true },
        sentiment: {},
        concepts: { limit: 10 }
      }
    })

    // Determine overall risk level
    let overallRiskLevel = 'Low'
    let overallRiskScore = Math.round(avgRisk)
    
    if (overallRiskScore >= 60 || highRiskZones >= 2) {
      overallRiskLevel = 'High'
    } else if (overallRiskScore >= 30 || highRiskZones >= 1 || mediumRiskZones >= 2) {
      overallRiskLevel = 'Medium'
    }

    // Adjust based on route hazards
    if (routeHazards.length > 0) {
      const criticalRouteHazards = routeHazards.filter(h => {
        const t = (h.eventType || '').toLowerCase()
        return t.includes('accident') || t.includes('closure') || t.includes('weather') || t.includes('flood')
      })
      overallRiskScore = Math.min(100, overallRiskScore + (routeHazards.length * 5) + (criticalRouteHazards.length * 15))
      if (overallRiskScore >= 60) overallRiskLevel = 'High'
      else if (overallRiskScore >= 30 && overallRiskLevel === 'Low') overallRiskLevel = 'Medium'
    }

    // Adjust based on NLU sentiment
    if (nluAnalysis?.sentiment?.document) {
      const sentiment = nluAnalysis.sentiment.document
      if (sentiment.label === 'negative') {
        overallRiskScore = Math.min(100, overallRiskScore + 10)
        if (overallRiskScore >= 60) overallRiskLevel = 'High'
      }
    }

    // Extract insights
    let keywords = nluAnalysis?.keywords?.filter(k => {
      const text = k.text.toLowerCase()
      return text.includes('hazard') || text.includes('risk') || text.includes('danger') ||
             text.includes('ice') || text.includes('snow') || text.includes('flood') ||
             text.includes('wind') || text.includes('visibility') || text.includes('caution') ||
             text.includes('accident') || text.includes('closure') || text.includes('incident')
    }).slice(0, 5).map(k => k.text) || []
    
    // Add hazard types from route hazards
    if (routeHazards.length > 0) {
      const hazardTypes = routeHazards
        .map(h => h.eventType)
        .filter(Boolean)
        .filter((type, idx, arr) => arr.indexOf(type) === idx) // unique
        .slice(0, 3)
      keywords = [...new Set([...keywords, ...hazardTypes])].slice(0, 8)
    }

    const locations = nluAnalysis?.entities?.filter(e => 
      e.type === 'Location' || e.type === 'GeographicFeature'
    ).map(e => e.text) || []

    // Generate explanation
    const explanation = generateRouteExplanation(
      overallRiskLevel,
      overallRiskScore,
      highRiskZones,
      mediumRiskZones,
      leg.distance.text,
      leg.duration.text,
      keywords,
      hazardType,
      routeHazards
    )

    return {
      riskLevel: overallRiskLevel,
      riskScore: overallRiskScore,
      locations: locations,
      keywords: keywords,
      sentiment: nluAnalysis?.sentiment?.document?.label || 'neutral',
      explanation: explanation,
      route: {
        path: path,
        distance: leg.distance.text,
        duration: leg.duration.text,
        startAddress: leg.start_address,
        endAddress: leg.end_address
      },
      weatherPoints: weatherPoints,
      highRiskZones: highRiskZones,
      mediumRiskZones: mediumRiskZones,
      routeHazards: routeHazards,
      directionsResult: directionsResult
    }
  } catch (error) {
    console.error('Route analysis error:', error)
    return { error: error.message || 'Failed to analyze route' }
  }
}

function generateRouteExplanation(riskLevel, riskScore, highRiskZones, mediumRiskZones, distance, duration, keywords, hazardType, routeHazards = []) {
  let explanation = `${riskLevel} risk (${riskScore}%) detected along your ${distance} route (${duration}). `
  
  if (routeHazards.length > 0) {
    const criticalHazards = routeHazards.filter(h => {
      const t = (h.eventType || '').toLowerCase()
      return t.includes('accident') || t.includes('closure') || t.includes('weather')
    })
    if (criticalHazards.length > 0) {
      explanation += `${routeHazards.length} reported hazard${routeHazards.length > 1 ? 's' : ''} along route, including ${criticalHazards.length} critical incident${criticalHazards.length > 1 ? 's' : ''}. `
    } else {
      explanation += `${routeHazards.length} reported hazard${routeHazards.length > 1 ? 's' : ''} along route. `
    }
  }
  
  if (highRiskZones > 0) {
    explanation += `${highRiskZones} high-risk weather zone${highRiskZones > 1 ? 's' : ''} identified. `
  }
  if (mediumRiskZones > 0) {
    explanation += `${mediumRiskZones} moderate-risk weather zone${mediumRiskZones > 1 ? 's' : ''} found. `
  }
  
  if (keywords.length > 0) {
    explanation += `Key concerns: ${keywords.slice(0, 3).join(', ')}. `
  }
  
  if (riskLevel === 'High') {
    explanation += `Consider delaying travel or finding an alternative route. ${hazardType} conditions are likely along significant portions of this route.`
    if (routeHazards.length > 0) {
      explanation += ` Multiple reported incidents along this route increase the risk.`
    }
  } else if (riskLevel === 'Medium') {
    explanation += `Exercise caution, especially in identified risk zones. Monitor conditions and drive defensively.`
    if (routeHazards.length > 0) {
      explanation += ` Be aware of reported hazards along the route.`
    }
  } else {
    explanation += `Conditions appear favorable. Normal driving precautions recommended.`
    if (routeHazards.length > 0) {
      explanation += ` However, be aware of reported hazards along the route.`
    }
  }
  
  return explanation
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function PredictHazardsPage({ onBack, embed = false }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const heatmapLayerRef = useRef(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [selectedHazard, setSelectedHazard] = useState(null) // No specific hazard selected - show all
  const [allHazardRisks, setAllHazardRisks] = useState({})
  const [showExplain, setShowExplain] = useState(false)
  const [explanationText, setExplanationText] = useState(null)
  const [loadingExplanation, setLoadingExplanation] = useState(false)
  const [routeStart, setRouteStart] = useState('')
  const [routeDest, setRouteDest] = useState('')
  const [routeResult, setRouteResult] = useState(null)
  const [loadingMap, setLoadingMap] = useState(true)
  const [error, setError] = useState(null)
  const [analyzingRoute, setAnalyzingRoute] = useState(false)
  const [aiInsights, setAiInsights] = useState(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [weatherData, setWeatherData] = useState(null)
  const [loadingWeather, setLoadingWeather] = useState(true)
  const [userLocation, setUserLocation] = useState(null)
  const [hazardRisk, setHazardRisk] = useState(null)
  const [locationInput, setLocationInput] = useState('')
  const [locationName, setLocationName] = useState('')
  const [geocoder, setGeocoder] = useState(null)
  const [directionsService, setDirectionsService] = useState(null)
  const [directionsRenderer, setDirectionsRenderer] = useState(null)
  const [routePath, setRoutePath] = useState(null)
  const [liveHazards, setLiveHazards] = useState([])
  const [nearbyHazards, setNearbyHazards] = useState([])
  const [loadingHazards, setLoadingHazards] = useState(false)
  const hazardMarkersRef = useRef([])

  // Initialize geocoder and directions service when maps load
  useEffect(() => {
    if (mapsLoaded && window.google && window.google.maps) {
      setGeocoder(new window.google.maps.Geocoder())
      setDirectionsService(new window.google.maps.DirectionsService())
      const renderer = new window.google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#f6bd60',
          strokeWeight: 5,
          strokeOpacity: 0.8
        }
      })
      setDirectionsRenderer(renderer)
    }
  }, [mapsLoaded])

  // Fetch MDOT hazards
  const fetchHazards = async () => {
    setLoadingHazards(true)
    try {
      const hazards = await fetchMdotEvents()
      setLiveHazards(hazards)
      
      // Filter hazards near user location
      if (userLocation) {
        const nearby = hazards.filter(h => isHazardNearLocation(h, userLocation, 10))
        setNearbyHazards(nearby)
      } else {
        setNearbyHazards([])
      }
    } catch (error) {
      console.error('Error fetching hazards:', error)
      setLiveHazards([])
      setNearbyHazards([])
    } finally {
      setLoadingHazards(false)
    }
  }

  // Function to update location and fetch weather
  const updateLocation = async (lat, lng, name = '') => {
    // Close any open explanations when location changes
    setShowExplain(false)
    setExplanationText(null)
    
    const loc = { lat, lng }
    setUserLocation(loc)
    setLocationName(name)
    setLoadingWeather(true)
    
    // Reset states to ensure fresh calculations (but keep userLocation set)
    setWeatherData(null)
    setHazardRisk(null)
    setAllHazardRisks({})
    setAiInsights(null)
    setLiveHazards([])
    setNearbyHazards([])
    
    try {
      // Fetch weather first and set it immediately - don't wait for hazards
      // This allows risk calculation to happen right away
      const weather = await getCurrentWeather(lat, lng)
      if (weather) {
        setWeatherData(weather)
      }
      setLoadingWeather(false) // Mark loading as done once weather is loaded
      
      // Fetch hazards in background - don't block the UI
      // This allows risk to be calculated immediately with just weather data
      fetchMdotEvents()
        .then(hazards => {
          if (Array.isArray(hazards)) {
            setLiveHazards(hazards)
            // Filter hazards near location (optimize by limiting check)
            // Only check first 50 hazards to avoid performance issues
            const hazardsToCheck = hazards.slice(0, 50)
            const nearby = hazardsToCheck.filter(h => isHazardNearLocation(h, loc, 10))
            setNearbyHazards(nearby)
          }
        })
        .catch(err => {
          console.warn('Hazards fetch failed (non-critical):', err)
          setLiveHazards([])
          setNearbyHazards([])
        })
    } catch (error) {
      console.error('Error updating location:', error)
      setWeatherData(null)
      setLiveHazards([])
      setNearbyHazards([])
      setLoadingWeather(false)
    }
  }

  // Get user location and fetch real-time weather on initial load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          await updateLocation(loc.lat, loc.lng, 'Your Location')
        },
        () => {
          // Fallback to Ann Arbor if geolocation fails
          updateLocation(42.2808, -83.7430, 'Ann Arbor, MI')
        },
        { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 }
      )
    } else {
      // Fallback to Ann Arbor
      updateLocation(42.2808, -83.7430, 'Ann Arbor, MI')
    }
    
    // Also fetch hazards independently
    fetchHazards()
  }, [])
  
  // Update nearby hazards when location changes
  useEffect(() => {
    if (userLocation && liveHazards.length > 0) {
      const nearby = liveHazards.filter(h => isHazardNearLocation(h, userLocation, 10))
      setNearbyHazards(nearby)
    }
  }, [userLocation, liveHazards])
  
  // Display hazard markers on map
  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !liveHazards.length) return
    
    // Clear existing markers
    hazardMarkersRef.current.forEach(marker => marker.setMap(null))
    hazardMarkersRef.current = []
    
    // Add markers for hazards
    liveHazards.forEach(hazard => {
      if (!hazard.lat || !hazard.lng) return
      
      const color = getHazardColor(hazard.eventType)
      const marker = new window.google.maps.Marker({
        position: { lat: hazard.lat, lng: hazard.lng },
        map: mapInstanceRef.current,
        title: hazard.eventType || 'Hazard',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 0.8,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      })
      
      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div style="padding:8px;max-width:240px;">
          <h3 style="margin:0 0 4px;color:#004e89;font-weight:600;font-size:13px;">${(hazard.eventType || '').toUpperCase()}</h3>
          <p style="margin:0;font-size:12px;color:#555;">${hazard.description || 'No description'}</p>
          ${hazard.impact ? `<p style="margin:4px 0 0;font-size:11px;color:#777;">Impact: ${hazard.impact}</p>` : ''}
        </div>`
      })
      
      marker.addListener('click', () => infoWindow.open(mapInstanceRef.current, marker))
      hazardMarkersRef.current.push(marker)
    })
  }, [mapsLoaded, liveHazards])

function getHazardColor(eventType) {
  const t = (eventType || '').toLowerCase()
  if (t.includes('accident') || t.includes('crash')) return '#FFD93D'
  if (t.includes('construct') || t.includes('work')) return '#FF6B6B'
  if (t.includes('closure') || t.includes('closed')) return '#DC143C'
  if (t.includes('congestion') || t.includes('traffic')) return '#FFA500'
  if (t.includes('weather')) return '#4ECDC4'
  if (t.includes('lane')) return '#9370DB'
  return '#808080'
}

  // Handle location search
  const handleLocationSearch = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const searchQuery = locationInput.trim()
    if (!searchQuery) return

    // Close any open explanations when searching new location
    setShowExplain(false)
    setExplanationText(null)
    
    // Ensure geocoder is available
    if (!geocoder) {
      if (window.google && window.google.maps) {
        const newGeocoder = new window.google.maps.Geocoder()
        setGeocoder(newGeocoder)
        // Wait a bit for state update, then retry
        setTimeout(() => {
          handleLocationSearch(e)
        }, 100)
        return
      } else {
        alert('Maps service is not ready yet. Please wait a moment and try again.')
        return
      }
    }

    setLoadingWeather(true)
    
    // Use the geocoder with proper error handling
    const geo = geocoder || (window.google?.maps ? new window.google.maps.Geocoder() : null)
    if (!geo) {
      setLoadingWeather(false)
      alert('Geocoding service not available. Please refresh the page.')
      return
    }
    
    geo.geocode({ address: searchQuery }, async (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location
        const name = results[0].formatted_address
        await updateLocation(loc.lat(), loc.lng(), name)
        setLocationInput('')
      } else {
        let errorMsg = 'Location not found.'
        if (status === 'ZERO_RESULTS') {
          errorMsg = 'No results found for this location. Please try a different address or city name.'
        } else if (status === 'OVER_QUERY_LIMIT') {
          errorMsg = 'Too many requests. Please wait a moment and try again.'
        } else if (status === 'REQUEST_DENIED') {
          errorMsg = 'Geocoding request denied. Please check your API key settings.'
        }
        alert(errorMsg)
        setLoadingWeather(false)
      }
    })
  }

  // Handle use current location button
  const handleUseCurrentLocation = () => {
    // Close any open explanations when changing location
    setShowExplain(false)
    setExplanationText(null)
    
    if (navigator.geolocation) {
      setLoadingWeather(true)
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await updateLocation(
            position.coords.latitude,
            position.coords.longitude,
            'Your Location'
          )
        },
        () => {
          alert('Unable to get your location. Please allow location access or search for a location.')
          setLoadingWeather(false)
        },
        { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 }
      )
    } else {
      alert('Geolocation is not supported by your browser.')
    }
  }

  // Analyze historical accident patterns from past hazards
  const analyzeHistoricalPatterns = (hazards, location, daysBack = 7) => {
    if (!hazards || hazards.length === 0) return { accidents: 0, patterns: [] }
    
    const now = new Date()
    const pastDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000))
    
    // Filter hazards within the location area and time period
    const historicalHazards = hazards.filter(h => {
      if (!h.startDate && !h.endDate) return false
      const hazardDate = h.startDate ? new Date(h.startDate) : new Date(h.endDate)
      return hazardDate >= pastDate && hazardDate <= now
    })
    
    // Count accidents by type
    const accidentTypes = {}
    const weatherConditions = {}
    
    historicalHazards.forEach(h => {
      const type = (h.eventType || '').toLowerCase()
      if (type.includes('accident') || type.includes('crash') || type.includes('incident')) {
        accidentTypes[type] = (accidentTypes[type] || 0) + 1
      }
      if (type.includes('weather') || type.includes('snow') || type.includes('ice') || type.includes('flood')) {
        weatherConditions[type] = (weatherConditions[type] || 0) + 1
      }
    })
    
    const patterns = []
    if (Object.keys(accidentTypes).length > 0) {
      patterns.push(`Past ${daysBack} days: ${historicalHazards.filter(h => 
        (h.eventType || '').toLowerCase().includes('accident')
      ).length} accidents reported`)
    }
    if (Object.keys(weatherConditions).length > 0) {
      patterns.push(`Historical weather incidents: ${Object.keys(weatherConditions).length} types`)
    }
    
    return {
      accidents: historicalHazards.filter(h => 
        (h.eventType || '').toLowerCase().includes('accident') || 
        (h.eventType || '').toLowerCase().includes('crash')
      ).length,
      weatherIncidents: Object.keys(weatherConditions).length,
      totalIncidents: historicalHazards.length,
      patterns: patterns
    }
  }

  // Update hazard risk assessment for all hazard types when weather changes
  useEffect(() => {
    // Only calculate if we have weather data and user location
    // Don't reset if weatherData is null during loading - wait for it to be set
    if (weatherData && userLocation) {
      const hazardTypes = ['Icy Roads', 'Flood Risk', 'Low Visibility', 'High Wind Risk', 'Accident Likelihood']
      const risks = {}
      hazardTypes.forEach(type => {
        risks[type] = assessHazardRisk(weatherData, type)
      })
      
      // Analyze historical patterns - always recalculate when location or hazards change
      const historical = analyzeHistoricalPatterns(liveHazards, userLocation, 7)
      
      // Adjust risk scores based on historical accident data
      if (historical.accidents > 0) {
        Object.keys(risks).forEach(type => {
          if (type === 'Accident Likelihood') {
            risks[type].score = Math.min(100, risks[type].score + (historical.accidents * 5))
            if (risks[type].score >= 60) risks[type].level = 'High'
            else if (risks[type].score >= 30) risks[type].level = 'Medium'
          }
        })
      }
      
      // Update all hazard risks first
      setAllHazardRisks(risks)
      
      // Calculate overall risk (average or highest)
      const riskScores = Object.values(risks).map(r => r.score)
      const avgScore = riskScores.reduce((a, b) => a + b, 0) / riskScores.length
      const maxRisk = Object.values(risks).find(r => r.score === Math.max(...riskScores))
      
      // Then update hazard risk
      setHazardRisk({
        level: maxRisk?.level || 'Low',
        score: Math.round(avgScore),
        factors: Object.values(risks).flatMap(r => r.factors).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5),
        historicalData: historical
      })
    }
    // Don't reset when weatherData is null - it might just be loading
    // Only reset if userLocation is cleared (which shouldn't happen during search)
  }, [weatherData, liveHazards, userLocation])

  // Update heatmap based on real weather data
  useEffect(() => {
    if (mapsLoaded && mapInstanceRef.current && weatherData && userLocation) {
      // Generate heatmap points based on weather conditions
      const riskScore = hazardRisk?.score || 0
      const baseWeight = riskScore / 100
      
      // Create heatmap points around user location with varying risk
      const points = []
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const lat = userLocation.lat + (i * 0.05)
          const lng = userLocation.lng + (j * 0.05)
          // Vary weight based on distance and risk
          const distance = Math.sqrt(i * i + j * j)
          const weight = Math.max(0, baseWeight * (1 - distance * 0.2))
          if (weight > 0.1) {
            points.push({ lat, lng, weight })
          }
        }
      }

      if (heatmapLayerRef.current && points.length > 0) {
        const weighted = points.map(p => ({
          location: new window.google.maps.LatLng(p.lat, p.lng),
          weight: p.weight
        }))
        heatmapLayerRef.current.setData(weighted)
      }
    }
  }, [mapsLoaded, weatherData, hazardRisk, userLocation])

  // Load Google Maps script dynamically if needed
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setError('Missing Google Maps API key (VITE_GOOGLE_MAPS_API_KEY).')
      setLoadingMap(false)
      return
    }
    if (window.google && window.google.maps && window.google.maps.visualization) {
      setMapsLoaded(true)
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=visualization,places`
    script.async = true
    script.defer = true
    script.onload = () => setMapsLoaded(true)
    script.onerror = () => {
      setError('Failed to load Google Maps API.')
      setLoadingMap(false)
    }
    document.head.appendChild(script)
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [])

  // Initialize map + heatmap
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return
    
    const center = userLocation || { lat: 42.2808, lng: -83.7430 }
    
    try {
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 10,
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] }
        ]
      })
      mapInstanceRef.current = map

      // Initialize empty heatmap (will be populated with real data)
      heatmapLayerRef.current = new window.google.maps.visualization.HeatmapLayer({
        data: [],
        map,
        radius: 40,
        opacity: 0.6,
        gradient: [
          'rgba(255,255,255,0)',
          'rgba(255,203,5,0.6)', // maize mid
          'rgba(255,100,0,0.7)',
          'rgba(255,0,0,0.85)' // high risk red
        ]
      })
      setLoadingMap(false)
    } catch (e) {
      setError('Map initialization failed: ' + e.message)
      setLoadingMap(false)
    }
  }, [mapsLoaded])

  // Update map center when location changes
  useEffect(() => {
    if (mapInstanceRef.current && userLocation) {
      mapInstanceRef.current.setCenter(userLocation)
      mapInstanceRef.current.setZoom(10)
    }
  }, [userLocation])


  // Generate AI insights using real weather data + Watson NLU for intelligent predictions
  // Note: This is debounced to avoid blocking the UI
  const insightsTimeoutRef = useRef(null)
  
  useEffect(() => {
    // Reset insights when location changes (before new data loads)
    if (!weatherData || !userLocation || Object.keys(allHazardRisks).length === 0) {
      setAiInsights(null)
      setLoadingInsights(false)
      // Clear any pending timeout
      if (insightsTimeoutRef.current) {
        clearTimeout(insightsTimeoutRef.current)
        insightsTimeoutRef.current = null
      }
      return
    }
    
    const generateInsights = async () => {
      setLoadingInsights(true)

      // Analyze historical accident patterns
      const historical = hazardRisk?.historicalData || analyzeHistoricalPatterns(liveHazards, userLocation, 7)
      
      // Build comprehensive analysis text with current and historical data
      const nearbyHazardsText = nearbyHazards.length > 0 
        ? `\nNearby Reported Hazards (within 10 miles):\n${nearbyHazards.slice(0, 5).map((h, idx) => 
          `${idx + 1}. ${h.eventType || 'Hazard'}: ${h.description || 'No description'}${h.impact ? ` (Impact: ${h.impact})` : ''}`
        ).join('\n')}`
        : '\nNo nearby reported hazards at this time.'
      
      const historicalText = historical.accidents > 0 || historical.totalIncidents > 0
        ? `\nHistorical Accident Data (past 7 days):\n- Total incidents: ${historical.totalIncidents}\n- Accidents: ${historical.accidents}\n- Weather-related incidents: ${historical.weatherIncidents}`
        : '\nNo recent historical accident data available for this area.'
      
      const allRisksText = Object.entries(allHazardRisks).map(([type, risk]) => 
        `- ${type}: ${risk.level} risk (${risk.score}%) - Factors: ${risk.factors.join(', ') || 'None'}`
      ).join('\n')
      
      const weatherContext = `
        Road Hazard Prediction Analysis:
        
        Current Weather:
        - Temperature: ${weatherData.temp}°F (feels like ${weatherData.feelsLike}°F)
        - Condition: ${weatherData.condition} - ${weatherData.description}
        - Wind: ${weatherData.windSpeed} mph
        - Humidity: ${weatherData.humidity}%
        - Visibility: ${weatherData.visibility ? weatherData.visibility + ' miles' : 'Unknown'}
        - Precipitation: ${weatherData.precipitation > 0 ? weatherData.precipitation.toFixed(2) + ' inches' : 'None'}
        
        Location: ${locationName || 'Michigan'}
        
        Current Risk Assessment:
        ${allRisksText}
        
        ${historicalText}
        
        ${nearbyHazardsText}
        
        Analysis Request:
        Using both current weather conditions and historical accident data from the past week, predict road hazard likelihood.
        Consider that ${historical.accidents} accidents were reported in this area recently.
        Current conditions show: ${Object.entries(allHazardRisks).filter(([type, risk]) => risk.level === 'High').map(([type]) => type).join(', ') || 'no high-risk hazards'}.
        Provide a clear, simple assessment of what drivers should expect.
      `.trim()

      // Use Watson NLU to analyze the comprehensive weather context
      const analysis = await analyzeTextWithWatson(weatherContext, {
        features: {
          entities: {
            limit: 15,
            sentiment: true
          },
          keywords: {
            limit: 15,
            sentiment: true
          },
          sentiment: {},
          categories: {},
          concepts: {
            limit: 10
          }
        }
      })
      
      if (analysis) {
        // Extract key insights from NLU analysis
        const keywords = analysis.keywords || []
        const entities = analysis.entities || []
        const concepts = analysis.concepts || []
        const sentiment = analysis.sentiment?.document
        
        // Prioritize hazard-related keywords, including nearby reported hazards
        let hazardKeywords = keywords
          .filter(k => {
            const text = k.text.toLowerCase()
            return text.includes('ice') || text.includes('snow') || text.includes('freez') ||
                   text.includes('flood') || text.includes('water') || text.includes('rain') ||
                   text.includes('wind') || text.includes('visibility') || text.includes('fog') ||
                   text.includes('hazard') || text.includes('risk') || text.includes('danger') ||
                   text.includes('slippery') || text.includes('wet') || text.includes('storm') ||
                   text.includes('accident') || text.includes('closure') || text.includes('incident')
          })
          .slice(0, 5)
          .map(k => k.text)
        
        // Add nearby hazard types if available
        if (nearbyHazards.length > 0) {
          const hazardTypes = nearbyHazards.map(h => h.eventType).filter(Boolean)
          hazardKeywords = [...new Set([...hazardKeywords, ...hazardTypes.slice(0, 3)])]
        }

        // Get location entities
        const locations = entities
          .filter(e => e.type === 'Location' || e.type === 'GeographicFeature')
          .map(e => e.text)

        // Calculate confidence based on NLU sentiment, risk score, nearby hazards, and historical data
        let confidence = hazardRisk ? hazardRisk.score : 50
        
        // Adjust for historical accidents (past data is a strong predictor)
        const historicalData = hazardRisk?.historicalData || analyzeHistoricalPatterns(liveHazards, userLocation, 7)
        if (historicalData.accidents > 0) {
          // Each past accident in the area increases confidence by 8-12%
          confidence = Math.min(100, confidence + (historicalData.accidents * 10))
          if (historicalData.accidents >= 3) {
            // High historical accident rate is a major indicator
            confidence = Math.min(100, confidence + 15)
          }
        }
        
        // Adjust for nearby hazards
        if (nearbyHazards.length > 0) {
          const criticalHazards = nearbyHazards.filter(h => {
            const t = (h.eventType || '').toLowerCase()
            return t.includes('accident') || t.includes('closure') || t.includes('weather') || t.includes('flood')
          })
          confidence = Math.min(100, confidence + (nearbyHazards.length * 5) + (criticalHazards.length * 10))
        }
        
        if (sentiment) {
          // Adjust confidence based on sentiment
          if (sentiment.label === 'negative') {
            confidence = Math.min(100, confidence + (Math.abs(sentiment.score) * 20))
          } else if (sentiment.label === 'positive') {
            confidence = Math.max(0, confidence - (Math.abs(sentiment.score) * 15))
          }
        }

        // Generate prediction time window (next 2-4 hours based on conditions)
        const now = new Date()
        const predictionHours = weatherData.temp <= 32 ? 4 : 2
        const predictionTime = new Date(now.getTime() + predictionHours * 60 * 60 * 1000)
        const timeWindow = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} - ${predictionTime.getHours()}:${String(predictionTime.getMinutes()).padStart(2, '0')}`

        // Build intelligent prediction text for all hazards using current and historical data
        const highRiskHazards = Object.entries(allHazardRisks).filter(([type, risk]) => risk.level === 'High')
        const mediumRiskHazards = Object.entries(allHazardRisks).filter(([type, risk]) => risk.level === 'Medium')
        
        let predictionText = ''
        if (highRiskHazards.length > 0) {
          const hazardNames = highRiskHazards.map(([type]) => type.toLowerCase()).join(', ')
          predictionText = `High risk of ${hazardNames} based on current conditions`
          if (historicalData.accidents > 0) {
            predictionText += ` and ${historicalData.accidents} recent accident${historicalData.accidents > 1 ? 's' : ''} in this area`
          }
          predictionText += `. Drive with extreme caution.`
        } else if (mediumRiskHazards.length > 0) {
          const hazardNames = mediumRiskHazards.map(([type]) => type.toLowerCase()).join(', ')
          predictionText = `Moderate risk of ${hazardNames}`
          if (historicalData.accidents > 0) {
            predictionText += `. Note: ${historicalData.accidents} accident${historicalData.accidents > 1 ? 's' : ''} reported nearby in the past week`
          }
          predictionText += `. Exercise caution while driving.`
        } else {
          predictionText = `Low risk conditions. Normal driving precautions recommended.`
          if (historicalData.accidents > 0) {
            predictionText += ` However, ${historicalData.accidents} accident${historicalData.accidents > 1 ? 's were' : ' was'} reported in this area recently, so stay alert.`
          }
        }

        // Determine overall risk level from all hazards
        const overallRiskLevel = highRiskHazards.length > 0 ? 'High' : 
                                mediumRiskHazards.length > 0 ? 'Medium' : 'Low'

        setAiInsights({
          keywords: hazardKeywords.length > 0 ? hazardKeywords : keywords.slice(0, 5).map(k => k.text),
          sentiment: sentiment?.label || 'neutral',
          confidence: Math.round(confidence),
          prediction: predictionText,
          timeWindow: timeWindow,
          locations: locations,
          concepts: concepts.slice(0, 3).map(c => c.text),
          riskLevel: overallRiskLevel,
          factors: hazardRisk?.factors || [],
          allHazardRisks: allHazardRisks
        })
      } else {
        // Fallback using real weather data only
        const confidence = hazardRisk ? hazardRisk.score : 50
        const fallbackHighRisks = Object.entries(allHazardRisks).filter(([type, risk]) => risk.level === 'High')
        const fallbackMediumRisks = Object.entries(allHazardRisks).filter(([type, risk]) => risk.level === 'Medium')
        const overallLevel = fallbackHighRisks.length > 0 ? 'High' : 
                           fallbackMediumRisks.length > 0 ? 'Medium' : 'Low'
        
        setAiInsights({
          keywords: hazardRisk?.factors || ['weather conditions', 'road safety'],
          sentiment: 'neutral',
          confidence: confidence,
          prediction: overallLevel === 'High' ? 'High risk conditions detected' : 
                     overallLevel === 'Medium' ? 'Moderate risk conditions' : 
                     'Low risk conditions',
          timeWindow: 'Next 2-4 hours',
          locations: [],
          concepts: [],
          riskLevel: overallLevel,
          factors: hazardRisk?.factors || [],
          allHazardRisks: allHazardRisks
        })
      }
      setLoadingInsights(false)
    }

    // Debounce AI insights generation - don't block UI, generate in background
    // Wait 1 second after data is ready to avoid rapid calls
    if (insightsTimeoutRef.current) {
      clearTimeout(insightsTimeoutRef.current)
    }
    
    insightsTimeoutRef.current = setTimeout(() => {
      if (weatherData && Object.keys(allHazardRisks).length > 0) {
        generateInsights()
      } else {
        // Reset insights if data is not ready
        setAiInsights(null)
        setLoadingInsights(false)
      }
      insightsTimeoutRef.current = null
    }, 1000) // 1 second debounce - allows UI to render first
    
    return () => {
      if (insightsTimeoutRef.current) {
        clearTimeout(insightsTimeoutRef.current)
        insightsTimeoutRef.current = null
      }
    }
  }, [weatherData, hazardRisk, locationName, allHazardRisks, nearbyHazards, userLocation])

  const submitRouteRisk = async (e) => {
    e.preventDefault()
    if (!routeStart || !routeDest) {
      setRouteResult({ level: 'Unknown', zones: 0, msg: 'Please provide both start and destination.' })
      return
    }
    
    // Wait for map services to be ready
    if (!mapsLoaded || !window.google || !window.google.maps) {
      setRouteResult({ 
        level: 'Error', 
        zones: 0, 
        msg: 'Google Maps is still loading. Please wait a moment and try again.' 
      })
      return
    }
    
    // Initialize services if not already done
    let geo = geocoder
    let dirService = directionsService
    
    if (!geo || !dirService) {
      if (window.google && window.google.maps) {
        geo = new window.google.maps.Geocoder()
        dirService = new window.google.maps.DirectionsService()
        setGeocoder(geo)
        setDirectionsService(dirService)
      } else {
        setRouteResult({ 
          level: 'Error', 
          zones: 0, 
          msg: 'Map services not available. Please refresh the page.' 
        })
        return
      }
    }
    
    setAnalyzingRoute(true)
    setRouteResult(null)
    
    // Clear previous route
    if (directionsRenderer) {
      directionsRenderer.setMap(null)
    }
    
    // Ensure directions renderer is initialized
    let dirRenderer = directionsRenderer
    if (!dirRenderer && mapInstanceRef.current) {
      dirRenderer = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#f6bd60',
          strokeWeight: 5,
          strokeOpacity: 0.8
        }
      })
      setDirectionsRenderer(dirRenderer)
    }
    
    try {
      // Analyze route for general hazards (we'll use "Accident Likelihood" as it's the most comprehensive)
      const analysis = await getRouteAnalysis(routeStart, routeDest, 'Accident Likelihood', geo, dirService, liveHazards)
      
      if (analysis.error) {
        setRouteResult({ 
          level: 'Error', 
          zones: 0, 
          msg: analysis.error 
        })
        setAnalyzingRoute(false)
        return
      }
      
      if (analysis) {
        // Display route on map
        if (dirRenderer && mapInstanceRef.current && analysis.directionsResult) {
          dirRenderer.setMap(mapInstanceRef.current)
          dirRenderer.setDirections(analysis.directionsResult)
          
          // Fit map to route
          if (analysis.directionsResult.routes[0].bounds) {
            mapInstanceRef.current.fitBounds(analysis.directionsResult.routes[0].bounds)
          }
        }
        
        // Update heatmap with route weather points and hazards
        if (heatmapLayerRef.current) {
          const heatmapData = []
          
          // Add weather risk points
          if (analysis.weatherPoints.length > 0) {
            analysis.weatherPoints.forEach(p => {
              heatmapData.push({
            location: new window.google.maps.LatLng(p.lat, p.lng),
            weight: p.risk.score / 100
              })
            })
          }
          
          // Add hazard points with higher weight
          if (analysis.routeHazards && analysis.routeHazards.length > 0) {
            analysis.routeHazards.forEach(hazard => {
              if (hazard.lat && hazard.lng) {
                const criticalHazard = (hazard.eventType || '').toLowerCase().includes('accident') ||
                                      (hazard.eventType || '').toLowerCase().includes('closure') ||
                                      (hazard.eventType || '').toLowerCase().includes('weather')
                heatmapData.push({
                  location: new window.google.maps.LatLng(hazard.lat, hazard.lng),
                  weight: criticalHazard ? 0.9 : 0.7 // Higher weight for critical hazards
                })
              }
            })
          }
          
          if (heatmapData.length > 0) {
          heatmapLayerRef.current.setData(heatmapData)
          }
        }
        
        // Display route hazard markers
        if (analysis.routeHazards && analysis.routeHazards.length > 0 && mapInstanceRef.current) {
          // Clear existing route hazard markers (keep general hazard markers)
          // We'll add route-specific markers
          analysis.routeHazards.forEach(hazard => {
            if (hazard.lat && hazard.lng) {
              const color = getHazardColor(hazard.eventType)
              const marker = new window.google.maps.Marker({
                position: { lat: hazard.lat, lng: hazard.lng },
                map: mapInstanceRef.current,
                title: `Route Hazard: ${hazard.eventType || 'Hazard'}`,
                icon: {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 12,
                  fillColor: color,
                  fillOpacity: 0.9,
                  strokeColor: '#ffffff',
                  strokeWeight: 3
                },
                zIndex: 1000 // Ensure route hazards appear above other markers
              })
              
              const infoWindow = new window.google.maps.InfoWindow({
                content: `<div style="padding:8px;max-width:240px;">
                  <h3 style="margin:0 0 4px;color:#004e89;font-weight:600;font-size:13px;">ROUTE HAZARD: ${(hazard.eventType || '').toUpperCase()}</h3>
                  <p style="margin:0;font-size:12px;color:#555;">${hazard.description || 'No description'}</p>
                  ${hazard.impact ? `<p style="margin:4px 0 0;font-size:11px;color:#777;">Impact: ${hazard.impact}</p>` : ''}
                  <p style="margin:4px 0 0;font-size:11px;color:#dc143c;font-weight:600;">⚠️ On your route</p>
                </div>`
              })
              
              marker.addListener('click', () => infoWindow.open(mapInstanceRef.current, marker))
              hazardMarkersRef.current.push(marker)
            }
          })
        }
        
        setRoutePath(analysis.route?.path || null)
        setRouteResult({
          level: analysis.riskLevel,
          zones: analysis.highRiskZones + analysis.mediumRiskZones,
          highRiskZones: analysis.highRiskZones,
          mediumRiskZones: analysis.mediumRiskZones,
          msg: analysis.explanation,
          locations: analysis.locations,
          keywords: analysis.keywords,
          riskScore: analysis.riskScore,
          distance: analysis.route?.distance,
          duration: analysis.route?.duration,
          startAddress: analysis.route?.startAddress,
          endAddress: analysis.route?.endAddress,
          weatherPoints: analysis.weatherPoints,
          routeHazards: analysis.routeHazards || []
        })
      }
    } catch (error) {
      console.error('Route analysis failed:', error)
      setRouteResult({ 
        level: 'Error', 
        zones: 0, 
        msg: 'Failed to analyze route. Please check your addresses and try again.' 
      })
    }
    
    setAnalyzingRoute(false)
  }

  return (
    <div className={`${embed ? 'relative h-full rounded-xl overflow-hidden' : 'fixed inset-0'} flex flex-col bg-transparent overflow-hidden`}>
      {/* Header row matching Live Weather Alerts */}
      <div className="px-4 pt-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#004e89]">Predict Road Hazards</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="px-4 pt-2 pb-4 max-w-6xl mx-auto w-full flex-1 overflow-hidden flex flex-col min-h-0">
        
        {/* Location Selector */}
        <div className="mb-4 bg-white rounded-xl shadow border border-gray-100 p-3 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-[#004e89] whitespace-nowrap">Location:</label>
            <form 
              onSubmit={(e) => {
                e.preventDefault()
                handleLocationSearch(e)
              }} 
              className="flex-1 flex gap-2"
            >
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!loadingWeather && locationInput.trim()) {
                      handleLocationSearch(e)
                    }
                  }
                }}
                placeholder="Search city or address (e.g., Detroit, MI or 123 Main St)"
                className="flex-1 border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold"
                disabled={loadingWeather}
              />
              <button
                type="submit"
                disabled={loadingWeather || !locationInput.trim()}
                className="px-4 py-2 bg-[#004e89] text-white font-semibold rounded-lg hover:bg-[#003d6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {loadingWeather ? 'Searching...' : 'Search'}
              </button>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={loadingWeather}
                className="px-4 py-2 bg-michigan-gold text-[#004e89] font-semibold rounded-lg hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                title="Use your current location"
              >
                📍 Use My Location
              </button>
            </form>
          </div>
          {locationName && (
            <p className="mt-2 text-sm text-gray-600">
              Current location: <span className="font-semibold text-[#004e89]">{locationName}</span>
            </p>
          )}
        </div>

        {/* Top Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow hover:shadow-lg transition p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-[#004e89] uppercase tracking-wide">Current Weather</h3>
            {loadingWeather ? (
              <p className="mt-2 text-gray-500 text-sm">Loading...</p>
            ) : weatherData ? (
              <>
                <p className="mt-2 text-gray-700 text-sm">
                  Temp: <span className="font-semibold">{weatherData.temp}°F</span>
                  {weatherData.feelsLike !== weatherData.temp && (
                    <span className="text-gray-500 text-xs ml-1">(feels like {weatherData.feelsLike}°F)</span>
                  )}
                </p>
                <p className="text-gray-700 text-sm capitalize">{weatherData.description}</p>
                {weatherData.precipitation > 0 && (
                  <p className="text-gray-700 text-xs mt-1">Precipitation: {weatherData.precipitation.toFixed(2)}"</p>
                )}
                {!isWeatherAPIConfigured() && (
                  <p className="text-xs text-yellow-600 mt-1">⚠️ Add VITE_OPENWEATHER_API_KEY to .env for real-time data</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-gray-500 text-sm">Weather data unavailable</p>
            )}
          </div>
          <div className="bg-white rounded-xl shadow hover:shadow-lg transition p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-[#004e89] uppercase tracking-wide">Hazard Risk</h3>
            {hazardRisk ? (
              <>
                <p className="mt-2 text-gray-700 text-sm">
                  Level: <span className={`font-semibold ${
                    hazardRisk.level === 'High' ? 'text-red-600' :
                    hazardRisk.level === 'Medium' ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>{hazardRisk.level}</span>
                </p>
                <p className="text-gray-700 text-sm">Score: {hazardRisk.score}%</p>
                {hazardRisk.factors.length > 0 && (
                  <p className="text-gray-600 text-xs mt-1">{hazardRisk.factors[0]}</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-gray-500 text-sm">Calculating...</p>
            )}
          </div>
          <div className="bg-white rounded-xl shadow hover:shadow-lg transition p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-[#004e89] uppercase tracking-wide">Conditions</h3>
            {weatherData ? (
              <>
                <p className="mt-2 text-gray-700 text-sm">
                  Wind: <span className="font-semibold">{weatherData.windSpeed} mph</span>
                </p>
                {weatherData.visibility && (
                  <p className="text-gray-700 text-sm">Visibility: {weatherData.visibility} mi</p>
                )}
                <p className="text-gray-700 text-sm">Humidity: {weatherData.humidity}%</p>
              </>
            ) : (
              <p className="mt-2 text-gray-500 text-sm">Loading conditions...</p>
            )}
          </div>
        </div>

        {/* Map & Insights Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Map */}
          <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden relative h-full">
            <div ref={mapRef} className="absolute inset-0 w-full h-full" />
            {loadingMap && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <div className="text-center">
                  <div className="text-3xl mb-2">🗺️</div>
                  <p className="text-gray-700 font-semibold">Loading map...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm max-w-sm">
                  {error}
                </div>
              </div>
            )}
            <div className="absolute top-4 left-4 bg-[#004e89] text-white px-3 py-2 rounded-md text-xs shadow">
              {locationName || (userLocation ? `Lat: ${userLocation.lat.toFixed(4)}, Lng: ${userLocation.lng.toFixed(4)}` : 'Center: Ann Arbor')}
            </div>
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg px-3 py-2 text-xs shadow border border-gray-200">
              <p className="font-semibold text-[#004e89]">Heatmap Legend</p>
              <p className="text-gray-600">Red: High risk • Yellow: Medium risk</p>
            </div>
          </div>

          {/* AI Insights */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="bg-[#004e89] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-sm tracking-wide">Hazard Prediction</h3>
              <span className="text-[10px] font-semibold bg-michigan-gold text-[#004e89] px-2 py-1 rounded">AI</span>
            </div>
            
            {/* Content */}
            <div className="flex-1 p-3 pb-4 space-y-3 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                {loadingInsights ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004e89] mx-auto mb-2"></div>
                      <p className="text-sm text-gray-500">Analyzing conditions...</p>
                    </div>
                  </div>
                ) : aiInsights ? (
                  <>
                    {/* Main Prediction Card */}
                    <div className={`rounded-lg p-3 border-2 ${
                      aiInsights.riskLevel === 'High' ? 'bg-red-50 border-red-300' :
                      aiInsights.riskLevel === 'Medium' ? 'bg-yellow-50 border-yellow-300' :
                      'bg-green-50 border-green-300'
                    }`}>
                      <p className="text-sm text-gray-800 leading-relaxed mb-2">
                        {aiInsights.prediction || `Overall risk assessment: ${aiInsights.confidence}%`}
                        {locationName && (
                          <span className="block mt-1 text-xs text-gray-600">
                            Location: <span className="font-semibold">{locationName.split(',')[0]}</span>
                          </span>
                        )}
                        {aiInsights.timeWindow && (
                          <span className="block mt-1 text-xs text-gray-600">
                            Time: <span className="font-semibold">{aiInsights.timeWindow}</span>
                          </span>
                        )}
                      </p>
                      <div className="mt-2 pt-2 border-t border-gray-300">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">Confidence</span>
                          <span className="text-base font-bold text-[#004e89]">{aiInsights.confidence}%</span>
                        </div>
                      </div>
                    </div>

                    {/* All Hazard Types Summary */}
                    {aiInsights.allHazardRisks && (
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                        <h5 className="font-bold text-xs text-gray-800 mb-1.5 flex items-center">
                          <span className="mr-2">📊</span>
                          Hazard Type Summary
                        </h5>
                        <div className="space-y-1.5">
                          {Object.entries(aiInsights.allHazardRisks).map(([type, risk]) => (
                            <div key={type} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-gray-200">
                              <span className="text-xs font-medium text-gray-700">{type}:</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                risk.level === 'High' ? 'bg-red-100 text-red-700' :
                                risk.level === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {risk.level} ({risk.score}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Risk Factors */}
                    {aiInsights.factors.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                        <h5 className="font-bold text-xs text-gray-800 mb-1.5 flex items-center">
                          <span className="mr-2">⚠️</span>
                          Risk Factors
                        </h5>
                        <ul className="space-y-1">
                          {aiInsights.factors.slice(0, 3).map((factor, idx) => (
                            <li key={idx} className="flex items-start space-x-2 text-xs text-gray-700">
                              <span className="text-[#004e89] mt-0.5 font-bold">•</span>
                              <span>{factor}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Detected Conditions */}
                    {aiInsights.keywords.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                        <h5 className="font-bold text-xs text-gray-800 mb-1.5 flex items-center">
                          <span className="mr-2">🔍</span>
                          Detected Conditions
                        </h5>
                        <div className="flex flex-wrap gap-1.5">
                          {aiInsights.keywords.slice(0, 5).map((keyword, idx) => (
                            <span key={idx} className="px-2 py-1 bg-white rounded text-xs text-[#004e89] border border-gray-300 font-medium">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Nearby Reported Hazards */}
                    {nearbyHazards.length > 0 && (
                      <div className="bg-orange-50 rounded-lg p-2 border border-orange-200">
                        <h5 className="font-bold text-xs text-gray-800 mb-1.5 flex items-center">
                          <span className="mr-2">⚠️</span>
                          Nearby Reported Hazards ({nearbyHazards.length})
                        </h5>
                        <ul className="space-y-1 max-h-24 overflow-y-auto">
                          {nearbyHazards.slice(0, 3).map((hazard, idx) => (
                            <li key={hazard.id || idx} className="flex items-start space-x-2 text-xs text-gray-700">
                              <span className="text-orange-600 mt-0.5 font-bold">•</span>
                              <div className="flex-1">
                                <span className="font-semibold capitalize">{hazard.eventType || 'Hazard'}:</span>
                                <span className="ml-1">{hazard.description?.substring(0, 50) || 'No description'}{hazard.description?.length > 50 ? '...' : ''}</span>
                              </div>
                            </li>
                          ))}
                          {nearbyHazards.length > 3 && (
                            <li className="text-xs text-gray-500 italic">
                              + {nearbyHazards.length - 3} more hazards nearby
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-sm text-gray-500 mb-1">Loading weather data...</p>
                    <p className="text-xs text-gray-400">Hazard prediction will appear here</p>
                  </div>
                )}
                
                {/* Explanation Button */}
                {aiInsights && (
                  <button
                    onClick={async () => {
                      if (showExplain) {
                        setShowExplain(false)
                        return
                      }
                      
                      setShowExplain(true)
                      setLoadingExplanation(true)
                      
                      // Generate natural language explanation
                      try {
                        const historicalAnalysis = hazardRisk?.historicalData || analyzeHistoricalPatterns(liveHazards, userLocation, 7)
                        const explanationPrompt = `
                          Based on the following hazard prediction data, provide a clear, simple explanation (3-4 sentences) of what drivers should know:
                          
                          Current Weather:
                          - Temperature: ${weatherData?.temp}°F (feels like ${weatherData?.feelsLike}°F)
                          - Condition: ${weatherData?.description || 'Unknown'}
                          - Wind: ${weatherData?.windSpeed || 0} mph
                          - Visibility: ${weatherData?.visibility || 'Unknown'} miles
                          - Precipitation: ${weatherData?.precipitation || 0} inches
                          
                          Past Accident Data (last 7 days):
                          ${historicalAnalysis.accidents > 0 ? `- ${historicalAnalysis.accidents} accidents reported in this area\n- ${historicalAnalysis.totalIncidents} total incidents` : '- No recent accidents reported'}
                          
                          Current Risk Assessment:
                          ${Object.entries(allHazardRisks || {}).map(([type, risk]) => 
                            `- ${type}: ${risk.level} risk`
                          ).join('\n')}
                          
                          ${nearbyHazards.length > 0 ? `Active Hazards Nearby: ${nearbyHazards.length} incidents including ${nearbyHazards.slice(0, 3).map(h => h.eventType).join(', ')}` : 'No active hazards nearby'}
                          
                          Overall: ${aiInsights.riskLevel} risk (${aiInsights.confidence}% confidence)
                          
                          Explain in simple, everyday language what this means for drivers right now. Keep it clear and easy to understand.
                        `
                        
                        const analysis = await analyzeTextWithWatson(explanationPrompt, {
                          features: {
                            keywords: { limit: 10 },
                            sentiment: {},
                            concepts: { limit: 5 }
                          }
                        })
                        
                        // Generate simple, human-friendly summary using historical data
                        const highRiskHazards = Object.entries(allHazardRisks || {}).filter(([type, risk]) => risk.level === 'High')
                        const mediumRiskHazards = Object.entries(allHazardRisks || {}).filter(([type, risk]) => risk.level === 'Medium')
                        
                        // Build simple, conversational summary
                        let summary = ''
                        
                        // Start with current conditions
                        if (highRiskHazards.length > 0) {
                          const hazardNames = highRiskHazards.map(([type]) => type.toLowerCase()).join(', ')
                          summary += `Right now, the weather is creating dangerous conditions. We're seeing a high risk of ${hazardNames}. `
                          
                          // Add specific weather context
                          if (weatherData.temp <= 32 && highRiskHazards.some(([type]) => type.includes('Ice'))) {
                            summary += `It's below freezing (${weatherData.temp}°F), so ice is likely on the roads. `
                          }
                          if (weatherData.precipitation > 0) {
                            summary += `There's ${weatherData.precipitation.toFixed(2)} inches of precipitation, making roads slippery. `
                          }
                          if (weatherData.visibility && weatherData.visibility < 3) {
                            summary += `Visibility is low at ${weatherData.visibility} miles, making it hard to see hazards ahead. `
                          }
                        } else if (mediumRiskHazards.length > 0) {
                          const hazardNames = mediumRiskHazards.map(([type]) => type.toLowerCase()).join(', ')
                          summary += `Conditions are moderately risky. There's a chance of ${hazardNames}. `
                          summary += `Be extra careful and drive slower than usual. `
                        } else {
                          summary += `The weather looks good right now. Risk is low across all hazard types, so driving conditions should be normal. `
                        }
                        
                        // Add historical context from past accident data
                        if (historicalAnalysis.accidents > 0) {
                          summary += `Looking at the past week, there were ${historicalAnalysis.accidents} accident${historicalAnalysis.accidents > 1 ? 's' : ''} reported in this area, which suggests this location can be risky when weather conditions are poor. `
                        }
                        
                        // Add nearby hazards
                        if (nearbyHazards.length > 0) {
                          summary += `There ${nearbyHazards.length === 1 ? 'is' : 'are'} also ${nearbyHazards.length} active incident${nearbyHazards.length > 1 ? 's' : ''} nearby that drivers should be aware of. `
                        }
                        
                        // Add recommendation
                        if (highRiskHazards.length > 0) {
                          summary += `Our recommendation: if possible, delay your trip or take extra precautions. Slow down significantly, increase following distance, and be prepared to stop suddenly.`
                        } else if (mediumRiskHazards.length > 0) {
                          summary += `Our recommendation: drive cautiously, reduce your speed, and stay alert for changing conditions.`
                        } else {
                          summary += `Our recommendation: normal driving precautions are sufficient, but always stay alert for changing weather conditions.`
                        }
                        
                        setExplanationText(summary)
                      } catch (error) {
                        console.error('Error generating explanation:', error)
                        setExplanationText('Error generating explanation. Please try again.')
                      } finally {
                        setLoadingExplanation(false)
                      }
                    }}
                    disabled={loadingExplanation}
                    className="w-full text-xs font-semibold bg-michigan-gold text-[#004e89] px-3 py-1.5 rounded-md shadow hover:brightness-95 transition mt-1 disabled:opacity-50"
                  >
                    {loadingExplanation ? 'Generating...' : showExplain ? 'Hide Details' : 'Show How This Works'}
                  </button>
                )}
                {showExplain && aiInsights && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    {loadingExplanation ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#004e89] mx-auto mb-2"></div>
                        <p className="text-xs text-gray-500">Generating explanation...</p>
                        </div>
                    ) : explanationText ? (
                            <div>
                        <h5 className="font-bold text-sm text-[#004e89] mb-2">How This Prediction Works</h5>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          {explanationText}
                          </p>
                        </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-xs text-gray-500">Click the button above to generate explanation</p>
                      </div>
                    )}
                  </div>
                )}
              
              {/* Route Hazard Check */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <h3 className="font-bold text-[#004e89] text-xs mb-2">Route Analysis</h3>
                <form onSubmit={submitRouteRisk} className="space-y-2 mb-3">
                  <div className="flex flex-col space-y-1">
                    <label className="text-xs font-semibold text-[#004e89]">Start</label>
                    <input
                      type="text"
                      value={routeStart}
                      onChange={(e) => setRouteStart(e.target.value)}
                      placeholder="e.g. Detroit, MI"
                      className="border-2 border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-michigan-gold"
                    />
                  </div>
                  <div className="flex flex-col space-y-1">
                    <label className="text-xs font-semibold text-[#004e89]">Destination</label>
                    <input
                      type="text"
                      value={routeDest}
                      onChange={(e) => setRouteDest(e.target.value)}
                      placeholder="e.g. Ann Arbor, MI"
                      className="border-2 border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-michigan-gold"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={analyzingRoute || !mapsLoaded}
                    className="w-full text-xs font-semibold bg-[#004e89] text-white px-3 py-1.5 rounded-md shadow hover:bg-[#003d6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {!mapsLoaded ? 'Loading...' : analyzingRoute ? 'Analyzing...' : 'Analyze Route'}
                  </button>
                </form>
                {analyzingRoute && (
                  <div className="text-xs bg-blue-50 border border-blue-200 rounded-md p-2">
                    <p className="text-blue-700">🤖 Analyzing route...</p>
                  </div>
                )}
                {routeResult && !analyzingRoute && (
                  <div className="text-xs bg-white border border-gray-200 rounded-md p-2 space-y-1.5">
                    {routeResult.startAddress && (
                      <div className="pb-1.5 border-b border-gray-300">
                        <p className="font-semibold text-[#004e89] text-xs">📍 Route:</p>
                        <p className="text-gray-600 text-xs mt-0.5">From: {routeResult.startAddress}</p>
                        <p className="text-gray-600 text-xs">To: {routeResult.endAddress}</p>
                        {routeResult.distance && (
                          <p className="text-gray-600 text-xs">{routeResult.distance} • {routeResult.duration}</p>
                        )}
                      </div>
                    )}
                    <p>
                      <span className="font-semibold">Risk:</span> 
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                        routeResult.level === 'High' ? 'bg-red-100 text-red-700' :
                        routeResult.level === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                        routeResult.level === 'Error' ? 'bg-gray-100 text-gray-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {routeResult.level}
                      </span>
                      {routeResult.riskScore && (
                        <span className="ml-1 text-gray-500">({routeResult.riskScore}%)</span>
                      )}
                    </p>
                    {routeResult.highRiskZones !== undefined && (
                      <p className="text-xs">
                        <span className="font-semibold">Zones:</span> 
                        {routeResult.highRiskZones > 0 && (
                          <span className="ml-1 text-red-600">{routeResult.highRiskZones} high-risk</span>
                        )}
                        {routeResult.mediumRiskZones > 0 && (
                          <span className="ml-1 text-yellow-600">{routeResult.mediumRiskZones} moderate</span>
                        )}
                        {routeResult.highRiskZones === 0 && routeResult.mediumRiskZones === 0 && (
                          <span className="ml-1 text-green-600">No significant risk</span>
                        )}
                      </p>
                    )}
                    {routeResult.routeHazards && routeResult.routeHazards.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-300">
                        <p className="text-xs font-semibold text-[#004e89] mb-1">⚠️ Hazards Along Route ({routeResult.routeHazards.length}):</p>
                        <ul className="space-y-1 max-h-20 overflow-y-auto">
                          {routeResult.routeHazards.slice(0, 3).map((hazard, idx) => (
                            <li key={hazard.id || idx} className="text-xs text-gray-600">
                              <span className="font-semibold capitalize">{hazard.eventType || 'Hazard'}:</span>
                              <span className="ml-1">{hazard.description?.substring(0, 40) || 'No description'}{hazard.description?.length > 40 ? '...' : ''}</span>
                            </li>
                          ))}
                          {routeResult.routeHazards.length > 3 && (
                            <li className="text-xs text-gray-500 italic">
                              + {routeResult.routeHazards.length - 3} more hazards
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    {routeResult.locations && routeResult.locations.length > 0 && (
                      <p className="text-xs"><span className="font-semibold">Locations:</span> {routeResult.locations.slice(0, 3).join(', ')}</p>
                    )}
                    {routeResult.keywords && routeResult.keywords.length > 0 && (
                      <p className="text-xs"><span className="font-semibold">Concerns:</span> {routeResult.keywords.slice(0, 3).join(', ')}</p>
                    )}
                    {routeResult.msg && (
                      <p className="text-gray-600 text-xs mt-1 pt-1 border-t border-gray-300">{routeResult.msg}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PredictHazardsPage
