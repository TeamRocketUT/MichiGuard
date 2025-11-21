import { useState, useEffect, useRef } from 'react'

// API Keys from environment variables
const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY
// TomTom key removed (no longer needed)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Hazard icon colors (TomTom categories / generalized types)
const HAZARD_COLORS = {
  accident: '#FFD93D',
  roadwork: '#FF6B6B',
  closure: '#DC143C',
  congestion: '#FFA500',
  weather: '#4ECDC4',
  lane: '#9370DB',
  incident: '#f6bd60',
  other: '#808080'
}

/**
 * Fetch driving directions from OpenRouteService
 * @param {Object} origin - {lat, lng}
 * @param {Object} destination - {lat, lng}
 * @returns {Promise<Object>} - Route data with geometry and segments
 */
async function getDirections(origin, destination) {
  console.log('🚗 CALLING ORS API...')
  console.log('Origin:', origin, 'Destination:', destination)
  console.log('ORS Key present:', !!ORS_API_KEY, 'Length:', ORS_API_KEY?.length)
  
  if (!ORS_API_KEY) {
    throw new Error('ORS API key not configured. Add VITE_ORS_API_KEY to .env file.')
  }

  const url = 'https://api.openrouteservice.org/v2/directions/driving-car'
  
  const body = {
    coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]],
    format: 'geojson',
    instructions: true,
    preference: 'fastest'
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ ORS API Error:', response.status, response.statusText)
      console.error('ORS Error body:', errorText)
      if (response.status === 401 || response.status === 403) {
        console.error('⚠️ ORS Authorization failed. Check if key is valid and not base64 encoded.')
      }
      throw new Error(`ORS API failed: ${response.status} - ${response.statusText}`)
    }

    const data = await response.json()
    console.log('✅ ORS API raw response:', JSON.stringify(data))

    const features = data?.features
    if (!Array.isArray(features) || features.length === 0) {
      console.warn('ORS: no features returned. Full response:', data)
      throw new Error('No route found for given origin/destination')
    }
    const feature = features[0]
    const geom = feature?.geometry
    let coords = []
    if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) {
      coords = geom.coordinates
    } else if (geom?.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      // Flatten multi-line into single array
      coords = geom.coordinates.flat().filter(pair => Array.isArray(pair) && pair.length >= 2)
    } else {
      console.error('ORS unexpected geometry type:', geom?.type, geom)
      throw new Error('Unsupported route geometry type from ORS')
    }
    if (coords.length === 0) {
      throw new Error('Route geometry empty from ORS')
    }
    // Compute bbox if missing or malformed
    let bbox = Array.isArray(data?.bbox) && data.bbox.length === 4 ? data.bbox : null
    if (!bbox) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
      coords.forEach(([lng, lat]) => {
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      })
      bbox = [minLng, minLat, maxLng, maxLat]
    }
    return {
      geometry: coords,
      segments: feature?.properties?.segments || [],
      summary: feature?.properties?.summary || null,
      bbox
    }
  } catch (error) {
    console.error('❌ Error fetching directions:', error)
    throw error
  }
}

// Google Directions fallback (returns same shape as ORS getDirections)
function getGoogleDirections(origin, destination) {
  console.log('🔁 CALLING GOOGLE DIRECTIONS FALLBACK...')
  console.log('Google origin:', origin, 'destination:', destination)
  return new Promise((resolve, reject) => {
    if (!window.google?.maps) {
      console.error('❌ Google Maps not loaded')
      return reject(new Error('Google Maps not loaded'))
    }
    const svc = new window.google.maps.DirectionsService()
    svc.route(
      {
        origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        console.log('Google Directions status:', status)
        if (status !== 'OK' || !result?.routes?.[0]) {
          console.error('❌ Google Directions failed:', status)
          return reject(new Error('Google Directions failed: ' + status))
        }
        const overviewPath = result.routes[0].overview_path || []
        const geometry = overviewPath.map(p => [p.lng(), p.lat()])
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
        geometry.forEach(([lng, lat]) => {
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
        })
        resolve({
          geometry,
          segments: [],
          summary: null,
          bbox: [minLng, minLat, maxLng, maxLat],
          _googleResult: result
        })
      }
    )
  })
}

// MDOT 511 real-time events fetch via local proxy (avoids CORS)
async function fetchMdotEvents() {
  const url = 'http://localhost:3001/api/mdot/events'
  console.log('📡 MDOT Hazard Fetch (proxy): Requesting', url)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error('❌ Proxy MDOT fetch failed:', res.status, res.statusText)
      throw new Error('Proxy MDOT events fetch failed: ' + res.status)
    }
    const data = await res.json()
    console.log('📦 Proxy MDOT JSON response (raw):', data)
    if (!Array.isArray(data)) {
      console.warn('⚠️ Proxy MDOT response not an array. Raw:', data)
      return []
    }
    const normalized = data.map((evt, idx) => normalizeMdotEvent(evt, idx)).filter(e => e.lat && e.lng)
    console.log(`✅ Proxy MDOT events loaded: ${normalized.length}`)
    if (normalized[0]) console.log('🔍 Sample MDOT event via proxy:', normalized[0])
    return normalized
  } catch (err) {
    console.error('❌ Proxy MDOT fetch error:', err)
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

function getEventColor(type) {
  const t = type.toLowerCase()
  if (t.includes('accident') || t.includes('crash')) return HAZARD_COLORS.accident
  if (t.includes('construct') || t.includes('work')) return HAZARD_COLORS.roadwork
  if (t.includes('closure') || t.includes('closed') || t.includes('block')) return HAZARD_COLORS.closure
  if (t.includes('congestion') || t.includes('traffic')) return HAZARD_COLORS.congestion
  if (t.includes('weather')) return HAZARD_COLORS.weather
  if (t.includes('lane')) return HAZARD_COLORS.lane
  if (t.includes('incident') || t.includes('event')) return HAZARD_COLORS.incident
  return HAZARD_COLORS.other
}

/**
 * Check if a point is within a certain distance of a route line
 * @param {Object} point - {lat, lng}
 * @param {Array} routeCoordinates - Array of [lng, lat]
 * @param {number} thresholdMeters - Distance threshold in meters
 * @returns {boolean}
 */
function isPointNearRoute(point, routeCoordinates, thresholdMeters = 1609.34) { // 1 mile default
  if (!window.google) return false
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length === 0) return false
  const pointLatLng = new window.google.maps.LatLng(point.lat, point.lng)
  let minDistance = Infinity
  for (let i = 0; i < routeCoordinates.length; i++) {
    const seg = routeCoordinates[i]
    if (!Array.isArray(seg) || seg.length < 2) continue
    const routePoint = new window.google.maps.LatLng(seg[1], seg[0])
    const distance = window.google.maps.geometry.spherical.computeDistanceBetween(pointLatLng, routePoint)
    if (distance < minDistance) minDistance = distance
    if (distance <= thresholdMeters) {
      return true
    }
  }
  return false
}

function HazardMapPage({ onBack, embed = false }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const userMarkerRef = useRef(null)
  const autocompleteRef = useRef(null)
  const searchInputRef = useRef(null)
  const geocoderRef = useRef(null)
  const routePolylineRef = useRef(null)
  const hazardMarkersRef = useRef([])

  const [userLocation, setUserLocation] = useState(null)
  const [destination, setDestination] = useState('')
  const [routeActive, setRouteActive] = useState(false)
  const [routeGeometry, setRouteGeometry] = useState(null)
  const [liveHazards, setLiveHazards] = useState([])
  const [filteredHazards, setFilteredHazards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [showHazards, setShowHazards] = useState(true)
  // Removed demo hazards toggle; always using live MDOT feed
  const [routeError, setRouteError] = useState(null)
  const [pendingAddress, setPendingAddress] = useState(null)

  // Load Google Maps Script
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setError('Google Maps API key missing. Add VITE_GOOGLE_MAPS_API_KEY to .env.local and restart dev server.')
      setLoading(false)
      return
    }

    if (window.google && window.google.maps) {
      setMapsLoaded(true)
      return
    }

    const script = document.createElement('script')
    // Load superset of libraries so other pages (e.g., heatmaps) work too
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry,visualization`
    script.async = true
    script.defer = true
    
    script.onload = () => {
      setMapsLoaded(true)
    }
    
    script.onerror = () => {
      setError('Failed to load Google Maps. Please check your API key and billing settings.')
      setLoading(false)
    }
    
    document.head.appendChild(script)

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  // Initialize Google Maps after script loads
  useEffect(() => {
    if (!mapsLoaded) return

    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          setUserLocation(userPos)
          initializeMap(userPos)
        },
        (error) => {
          console.error('Geolocation error:', error)
          // Default to Detroit if location fails
          const defaultPos = { lat: 42.3314, lng: -83.0458 }
          setUserLocation(defaultPos)
          initializeMap(defaultPos)
        }
      )
    } else {
      const defaultPos = { lat: 42.3314, lng: -83.0458 }
      setUserLocation(defaultPos)
      initializeMap(defaultPos)
    }
  }, [mapsLoaded])

  // Process pending address once userLocation resolves
  useEffect(() => {
    if (userLocation && pendingAddress) {
      geocodeAndRoute(pendingAddress)
      setPendingAddress(null)
    }
  }, [userLocation, pendingAddress])

  // (Navigation UI removed for TomTom integration simplification)

  const initializeMap = async (center) => {
    if (!mapRef.current || !window.google) {
      setError('Map container not ready')
      setLoading(false)
      return
    }

    try {
      // Create map
      const map = new window.google.maps.Map(mapRef.current, {
        center: center,
        zoom: 14,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      })
      mapInstanceRef.current = map

      // Add user location marker
      userMarkerRef.current = new window.google.maps.Marker({
        position: center,
        map: map,
        title: 'Your Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3
        }
      })

      // Initialize autocomplete
      if (searchInputRef.current) {
        autocompleteRef.current = new window.google.maps.places.Autocomplete(
          searchInputRef.current,
          { componentRestrictions: { country: 'us' } }
        )

        autocompleteRef.current.addListener('place_changed', handlePlaceSelect)

        // Add Enter key fallback for manual typing (geocode if user presses Enter without selecting dropdown)
        searchInputRef.current.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const value = searchInputRef.current.value.trim()
            if (value) {
              geocodeAndRoute(value)
            }
          }
        })
      }

      geocoderRef.current = new window.google.maps.Geocoder()

      // After map init, load MDOT hazards immediately (not route-filtered yet)
      const events = await fetchMdotEvents()
      setLiveHazards(events)
      displayHazards(events, false) // show all before route selection
      setLoading(false)
    } catch (err) {
      setError('Failed to initialize map: ' + err.message)
      setLoading(false)
    }
  }

  const clearHazardMarkers = () => {
    hazardMarkersRef.current.forEach(m => m.setMap(null))
    hazardMarkersRef.current = []
  }

  // Display hazards (all or filtered by route proximity depending on routeActive flag)
  const displayHazards = (hazards, routeFiltering = routeActive) => {
    console.log('🗺️ MDOT displayHazards called. total:', hazards.length, 'routeFiltering:', routeFiltering)
    clearHazardMarkers()
    if (!showHazards || !mapInstanceRef.current) {
      console.log('🗺️ Skipping hazard display (showHazards or map missing).', { showHazards, hasMap: !!mapInstanceRef.current })
      setFilteredHazards([])
      return
    }
    let toRender = hazards
    if (routeFiltering && Array.isArray(routeGeometry) && routeGeometry.length) {
      toRender = hazards.filter(h => h.lat && h.lng && isPointNearRoute({ lat: h.lat, lng: h.lng }, routeGeometry))
      console.log(`📏 Hazards near route (≤1 mile): ${toRender.length}`)
      setFilteredHazards(toRender)
    } else {
      setFilteredHazards([]) // not showing alert card until route active
    }
    toRender.forEach(h => {
      const color = getEventColor(h.eventType || h.type || '')
      const marker = new window.google.maps.Marker({
        position: { lat: h.lat, lng: h.lng },
        map: mapInstanceRef.current,
        title: h.eventType,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 3
        }
      })
      const startStr = h.startDate ? new Date(h.startDate).toLocaleString() : 'N/A'
      const endStr = h.endDate ? new Date(h.endDate).toLocaleString() : 'N/A'
      const impactStr = h.impact ? `<p style="margin:2px 0 0;font-size:11px;color:#555;">Impact: ${h.impact}</p>` : ''
      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div style="padding:8px;max-width:240px;">
          <h3 style="margin:0 0 4px;color:#004e89;font-weight:600;">${(h.eventType || '').toUpperCase()}</h3>
          <p style="margin:0;font-size:12px;color:#555;">${h.description || 'No description'}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#777;">Start: ${startStr}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#777;">End: ${endStr}</p>
          ${impactStr}
        </div>`
      })
      marker.addListener('click', () => infoWindow.open(mapInstanceRef.current, marker))
      hazardMarkersRef.current.push(marker)
    })
    console.log('🗺️ Rendered hazard markers:', hazardMarkersRef.current.length)
  }

  const handlePlaceSelect = () => {
    const place = autocompleteRef.current.getPlace()
    if (place.geometry && userLocation) {
      setDestination(place.formatted_address)
      fetchRouteAndHazards(place.geometry.location)
    } else if (searchInputRef.current?.value) {
      // Fallback: user hit enter without selecting suggestion
      geocodeAndRoute(searchInputRef.current.value.trim())
    }
  }

  const geocodeAndRoute = (address) => {
    if (!geocoderRef.current || !address) return
    // If user location not ready yet, queue address
    if (!userLocation) {
      setPendingAddress(address)
      return
    }
    geocoderRef.current.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        setDestination(results[0].formatted_address)
        fetchRouteAndHazards(results[0].geometry.location)
      } else {
        setRouteError('Geocode failed: ' + status)
      }
    })
  }

  const handleSearchClick = () => {
    if (!searchInputRef.current) return
    const value = searchInputRef.current.value.trim()
    if (!value) {
      setRouteError('Please enter a destination')
      return
    }
    setRouteError(null)
    geocodeAndRoute(value)
  }

  const fetchRouteAndHazards = async (destinationLocation) => {
    if (!userLocation || !mapInstanceRef.current) return
    setRouteError(null)
    const dest = { lat: destinationLocation.lat(), lng: destinationLocation.lng() }
    try {
      let routeSource = 'ORS'
      let route
      try {
        route = await getDirections(userLocation, dest)
      } catch (orsErr) {
        console.warn('ORS failed, attempting Google fallback:', orsErr.message)
        routeSource = 'Google'
        route = await getGoogleDirections(userLocation, dest)
      }
      console.log(`✅ Using ${routeSource} route; points: ${route.geometry.length}`)
      setRouteGeometry(route.geometry)
      drawRoutePolyline(route.geometry)
      setRouteActive(true)
      // Fit bounds
      const bounds = new window.google.maps.LatLngBounds()
      if (Array.isArray(route.geometry)) {
        route.geometry.forEach(([lng, lat]) => bounds.extend(new window.google.maps.LatLng(lat, lng)))
      }
      mapInstanceRef.current.fitBounds(bounds)
      // Hazards - create smaller bbox segments to respect TomTom's 10,000km² limit
      if (Array.isArray(route.geometry) && route.geometry.length > 0) {
        console.log('📡 MDOT Hazard Fetch: refreshing after route build')
        const events = await fetchMdotEvents()
        console.log('📡 MDOT hazards total (pre-route filter):', events.length)
        setLiveHazards(events)
        // display with route filtering
        displayHazards(events, true)
      } else {
        console.warn('Route geometry missing; skipping hazards fetch')
        setLiveHazards([])
      }
    } catch (e) {
      console.error('Route build failed:', e)
      if (e.message === 'No route found for given origin/destination') {
        setRouteError('No route found. Try a nearby city or check coordinates.')
      } else if (e.message === 'Unsupported route geometry type from ORS') {
        setRouteError('Received unsupported geometry from ORS. Please retry or adjust destination.')
      } else {
        setRouteError(e.message || 'Unknown routing error')
      }
    }
  }

  const drawRoutePolyline = (coords) => {
    if (routePolylineRef.current) routePolylineRef.current.setMap(null)
    if (!Array.isArray(coords) || coords.length === 0) {
      console.warn('drawRoutePolyline called with empty coords')
      return
    }
    const path = coords
      .filter(pair => Array.isArray(pair) && pair.length >= 2)
      .map(([lng, lat]) => ({ lng, lat }))
    if (path.length === 0) return
    routePolylineRef.current = new window.google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#f6bd60',
      strokeOpacity: 0.85,
      strokeWeight: 6,
      map: mapInstanceRef.current
    })
  }

  // Re-display hazards whenever toggled or route/hazards change
  useEffect(() => {
    displayHazards(liveHazards)
  }, [showHazards, routeGeometry, liveHazards, routeActive])

  // External Google Maps navigation removed per request. In-app navigation only.

  const toggleHazards = () => {
    setShowHazards(v => !v)
  }

  // Removed legacy navigation helpers (Google Directions based)

  if (error) {
    return (
      <div className={`${embed ? 'relative h-full' : 'fixed inset-0'} flex flex-col bg-gray-100`}>
        {!embed && (
          <div className="bg-[#004e89] text-white px-4 py-3 flex items-center justify-between shadow-lg z-20">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 hover:text-michigan-gold transition-colors"
            >
              <svg className="h-6 w-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M15 19l-7-7 7-7"></path>
              </svg>
              <span className="font-semibold">Back</span>
            </button>
            <h1 className="text-xl font-bold">Hazard Map</h1>
            <div className="w-16"></div>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-lg text-center">
            <div className="text-6xl mb-4">🗺️</div>
            <h2 className="text-2xl font-bold text-[#004e89] mb-4">Google Maps Setup Required</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left text-sm mb-4">
              <p className="font-semibold text-[#004e89] mb-2">📝 Setup Instructions:</p>
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li>Go to <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a></li>
                <li>Create a new project or select existing one</li>
                <li>Enable these APIs:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Maps JavaScript API</li>
                    <li>Places API</li>
                    <li>Directions API</li>
                    <li>Geometry Library</li>
                  </ul>
                </li>
                <li>Create an API key in Credentials</li>
                <li>Set up billing (required for Maps API)</li>
                <li>Add the API key to HazardMapPage.jsx</li>
              </ol>
            </div>
            <p className="text-xs text-gray-500">
              Google Maps requires a billing account, but includes $200 free monthly credit.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${embed ? 'relative h-full min-h-[520px] rounded-xl overflow-hidden' : 'fixed inset-0'} flex flex-col bg-transparent`}>
      {/* Header row matching Live Weather Alerts (align with page padding) */}
      <div className="">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#004e89]">Hazard Map</h1>
          <div className="flex items-stretch gap-2 w-full md:w-auto">
            <div className="flex-1 md:flex-none md:w-80">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for destination..."
                className="w-full px-4 py-2 border-2 border-[#004e89] rounded-lg focus:outline-none focus:border-michigan-gold text-gray-700"
              />
            </div>
            <button
              onClick={handleSearchClick}
              className="px-4 rounded-lg bg-michigan-gold text-[#004e89] font-semibold hover:brightness-95 transition flex items-center justify-center shadow-md"
              title="Search"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              onClick={toggleHazards}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-white text-[#004e89] border border-[#004e89]/20 hover:bg-gray-50 transition"
            >
              {showHazards ? 'Hide Hazards' : 'Show Hazards'}
            </button>
          </div>
        </div>
      </div>

      {/* (Search is integrated into the header row) */}
      

      {/* Map Container */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />
        
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75">
            <div className="text-center">
              <div className="text-4xl mb-4">🗺️</div>
              <p className="text-gray-700 text-lg font-semibold">Loading map...</p>
            </div>
          </div>
        )}

        {/* Hazard Alert Card */}
        {routeActive && filteredHazards.length > 0 && (
          <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-xl shadow-2xl p-4 border-l-4 border-red-500 z-10">
            <div className="flex items-start space-x-3">
              <svg className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              <div>
                <h3 className="font-bold text-[#004e89] text-lg">Hazard Alert!</h3>
                <p className="text-gray-600 text-sm">{filteredHazards.length} hazard{filteredHazards.length > 1 ? 's' : ''} detected</p>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-4 z-10 max-w-xs">
          <h3 className="text-sm font-bold text-[#004e89] mb-3">Hazard Legend</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HAZARD_COLORS.accident }}></div>
              <span className="text-xs text-gray-700">Accident</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HAZARD_COLORS.roadwork }}></div>
              <span className="text-xs text-gray-700">Construction</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HAZARD_COLORS.closure }}></div>
              <span className="text-xs text-gray-700">Closure</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HAZARD_COLORS.congestion }}></div>
              <span className="text-xs text-gray-700">Congestion</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HAZARD_COLORS.weather }}></div>
              <span className="text-xs text-gray-700">Weather</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HAZARD_COLORS.incident }}></div>
              <span className="text-xs text-gray-700">Incident</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HAZARD_COLORS.other }}></div>
              <span className="text-xs text-gray-700">Other</span>
            </div>
          </div>
        </div>

        {/* (Turn-by-turn panel removed in TomTom version) */}
        {routeError && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-xl shadow-lg p-4 border-l-4 border-yellow-500 z-10">
            <div className="flex items-start space-x-3">
              <svg className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              <div>
                <h3 className="font-bold text-[#004e89] text-lg">Route Issue</h3>
                <p className="text-gray-600 text-sm">{routeError}</p>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export default HazardMapPage

