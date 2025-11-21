import { useState, useEffect, useRef } from 'react'

// Static hazard data
const HAZARD_DATA = [
  { id: 1, type: "pothole", lat: 42.3559, lng: -83.0701, title: "Pothole" },
  { id: 2, type: "accident", lat: 42.3602, lng: -83.0687, title: "Accident" },
  { id: 3, type: "flood", lat: 42.3621, lng: -83.0729, title: "Flood" }
]

// Hazard icon colors
const HAZARD_COLORS = {
  pothole: '#FF6B6B',
  accident: '#FFD93D',
  flood: '#4ECDC4'
}

// Google Maps API Key loaded from .env
// Add to .env: VITE_GOOGLE_MAPS_API_KEY=your_api_key
// Required APIs: Maps JavaScript API, Places API, Directions API, Geocoding API (optional), Distance Matrix (optional)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function HazardMapPage({ onBack, embed = false }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const directionsRendererRef = useRef(null)
  const userMarkerRef = useRef(null)
  const autocompleteRef = useRef(null)
  const searchInputRef = useRef(null)
  const geocoderRef = useRef(null)

  const [userLocation, setUserLocation] = useState(null)
  const [destination, setDestination] = useState('')
  const [routeActive, setRouteActive] = useState(false)
  const [highlightedHazards, setHighlightedHazards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [showHazards, setShowHazards] = useState(true)
  const [routeError, setRouteError] = useState(null)
  const hazardHighlightCirclesRef = useRef([])
  const [pendingAddress, setPendingAddress] = useState(null)
  const [directionsResult, setDirectionsResult] = useState(null)
  const [navigating, setNavigating] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const watchIdRef = useRef(null)

  // Load Google Maps Script
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setError('Google Maps API key missing. Add VITE_GOOGLE_MAPS_API_KEY to .env and restart dev server.')
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

  // Navigation tracking: watch user position and update current step
  useEffect(() => {
    if (!navigating) {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }
    if (!directionsResult) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(newLoc)
        userMarkerRef.current?.setPosition(newLoc)
        maybeAdvanceStep(newLoc)
      },
      (err) => {
        console.warn('watchPosition error', err)
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    )
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [navigating, directionsResult])

  const initializeMap = (center) => {
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

      // Add hazard markers
      addHazardMarkers(map)

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

      // Initialize directions renderer
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#f6bd60',
          strokeWeight: 6,
          strokeOpacity: 0.8
        }
      })

      geocoderRef.current = new window.google.maps.Geocoder()

      setLoading(false)
    } catch (err) {
      setError('Failed to initialize map: ' + err.message)
      setLoading(false)
    }
  }

  const addHazardMarkers = (map) => {
    HAZARD_DATA.forEach((hazard) => {
      const marker = new window.google.maps.Marker({
        position: { lat: hazard.lat, lng: hazard.lng },
        map: showHazards ? map : null,
        title: hazard.title,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: HAZARD_COLORS[hazard.type],
          fillOpacity: 0.85,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      })

      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div style="padding: 8px; font-weight: bold; color: #004e89;">${hazard.title}</div>`
      })

      marker.addListener('click', () => {
        infoWindow.open(map, marker)
      })

      markersRef.current.push({ marker, hazard })
    })
  }

  const handlePlaceSelect = () => {
    const place = autocompleteRef.current.getPlace()
    if (place.geometry && userLocation) {
      setDestination(place.formatted_address)
      drawRoute(place.geometry.location)
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
        drawRoute(results[0].geometry.location)
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

  const drawRoute = (destinationLocation) => {
    if (!userLocation || !mapInstanceRef.current) return

    const directionsService = new window.google.maps.DirectionsService()
    
    directionsService.route(
      {
        origin: userLocation,
        destination: destinationLocation,
        travelMode: window.google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        if (status === 'OK' && result.routes && result.routes[0]) {
          directionsRendererRef.current.setDirections(result)
          setRouteActive(true)
          setRouteError(null)
          setDirectionsResult(result)
          
          // Highlight hazards near route
          highlightHazardsNearRoute(result.routes[0].overview_path)

          // Fit map to route bounds
          if (result.routes[0].bounds) {
            mapInstanceRef.current.fitBounds(result.routes[0].bounds)
          }
        } else {
          console.error('Directions request failed:', status)
          setRouteError('Unable to calculate route: ' + status)
        }
      }
    )
  }

  const highlightHazardsNearRoute = (routePath) => {
    if (!showHazards) {
      setHighlightedHazards([])
      return
    }

    // Clear previous highlight circles
    hazardHighlightCirclesRef.current.forEach(c => c.setMap(null))
    hazardHighlightCirclesRef.current = []

    const nearbyHazards = []
    const distanceThreshold = 200 // meters

    markersRef.current.forEach(({ marker, hazard }) => {
      const hazardLatLng = new window.google.maps.LatLng(hazard.lat, hazard.lng)
      let isNearRoute = false
      for (let i = 0; i < routePath.length; i++) {
        const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
          hazardLatLng,
          routePath[i]
        )
        if (distance <= distanceThreshold) {
          isNearRoute = true
          break
        }
      }

      if (isNearRoute) {
        nearbyHazards.push(hazard.id)
        marker.setIcon({
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: HAZARD_COLORS[hazard.type],
          fillOpacity: 1,
          strokeColor: '#f6bd60',
          strokeWeight: 5
        })
        marker.setAnimation(window.google.maps.Animation.BOUNCE)
        // Add pulsating circle overlay
        const circle = new window.google.maps.Circle({
          strokeColor: '#f6bd60',
          strokeOpacity: 0.7,
          strokeWeight: 2,
          fillColor: HAZARD_COLORS[hazard.type],
          fillOpacity: 0.15,
          map: mapInstanceRef.current,
          center: hazardLatLng,
          radius: 120
        })
        hazardHighlightCirclesRef.current.push(circle)
      } else {
        // Reset marker if previously highlighted
        marker.setAnimation(null)
        marker.setIcon({
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: HAZARD_COLORS[hazard.type],
          fillOpacity: 0.85,
          strokeColor: '#ffffff',
          strokeWeight: 2
        })
      }
    })

    setHighlightedHazards(nearbyHazards)
  }

  // External Google Maps navigation removed per request. In-app navigation only.

  const toggleHazards = () => {
    const next = !showHazards
    setShowHazards(next)
    markersRef.current.forEach(({ marker }) => {
      marker.setMap(next ? mapInstanceRef.current : null)
      if (!next) {
        marker.setAnimation(null)
      }
    })
    if (!next) {
      hazardHighlightCirclesRef.current.forEach(c => c.setMap(null))
      hazardHighlightCirclesRef.current = []
      setHighlightedHazards([])
    } else if (routeActive && directionsRendererRef.current?.getDirections()) {
      const path = directionsRendererRef.current.getDirections().routes[0].overview_path
      highlightHazardsNearRoute(path)
    }
  }

  const startNavigation = () => {
    if (!directionsResult) return
    setNavigating(true)
    setCurrentStepIndex(0)
    setRouteError(null)
  }

  const stopNavigation = () => {
    setNavigating(false)
  }

  const maybeAdvanceStep = (currentPos) => {
    if (!directionsResult) return
    const steps = directionsResult.routes[0].legs[0].steps
    if (currentStepIndex >= steps.length) return
    const stepEnd = steps[currentStepIndex].end_location
    const userLatLng = new window.google.maps.LatLng(currentPos.lat, currentPos.lng)
    const dist = window.google.maps.geometry.spherical.computeDistanceBetween(userLatLng, stepEnd)
    // Advance when within 25m of end of step
    if (dist < 25) {
      setCurrentStepIndex((i) => Math.min(i + 1, steps.length - 1))
    }
  }

  const getNextHazardAhead = () => {
    if (!directionsResult) return null
    const pathPoints = directionsResult.routes[0].overview_path
    // Use currentStepIndex to approximate progress along path
    const progressPoint = pathPoints[Math.min(currentStepIndex * 5, pathPoints.length - 1)]
    if (!progressPoint) return null
    let nearest = null
    let minDist = Infinity
    markersRef.current.forEach(({ hazard }) => {
      const hazardLatLng = new window.google.maps.LatLng(hazard.lat, hazard.lng)
      const d = window.google.maps.geometry.spherical.computeDistanceBetween(progressPoint, hazardLatLng)
      if (d < minDist) {
        minDist = d
        nearest = { hazard, distance: d }
      }
    })
    return nearest
  }

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
                <li>Add the API key to .env as VITE_GOOGLE_MAPS_API_KEY</li>
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
      {/* Header row matching Live Weather Alerts */}
      <div className="px-4 pt-4">
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
            {routeActive && !navigating && (
              <button
                onClick={startNavigation}
                className="px-4 py-2 rounded-lg bg-[#004e89] text-white font-semibold hover:bg-[#004e89] transition-colors shadow-md"
              >
                Start
              </button>
            )}
            {navigating && (
              <button
                onClick={stopNavigation}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-md"
              >
                Stop
              </button>
            )}
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
        {highlightedHazards.length > 0 && (
          <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-xl shadow-2xl p-4 border-l-4 border-red-500 z-10">
            <div className="flex items-start space-x-3">
              <svg className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              <div>
                <h3 className="font-bold text-[#004e89] text-lg">Hazard Alert!</h3>
                <p className="text-gray-600 text-sm">
                  {highlightedHazards.length} hazard{highlightedHazards.length > 1 ? 's' : ''} detected along your route
                </p>
              </div>
            </div>
          </div>
        )}
        {navigating && directionsResult && (
          <div className="absolute top-4 left-4 w-80 bg-white rounded-xl shadow-xl p-4 border border-gray-200 z-10 max-h-[70vh] overflow-y-auto">
            <h3 className="font-bold text-[#004e89] mb-2">Directions</h3>
            <ul className="space-y-2 text-sm">
              {directionsResult.routes[0].legs[0].steps.map((s, idx) => (
                <li
                  key={idx}
                  className={`p-2 rounded-md border ${idx === currentStepIndex ? 'bg-michigan-gold border-michigan-gold text-[#004e89] font-semibold' : 'bg-gray-50'} transition-colors`}
                  dangerouslySetInnerHTML={{ __html: s.instructions }}
                />
              ))}
            </ul>
            {(() => {
              const nextHazard = getNextHazardAhead()
              if (!nextHazard) return null
              return (
                <div className="mt-4 p-3 rounded-lg bg-yellow-50 border-l-4 border-yellow-400">
                  <p className="text-sm text-[#004e89] font-semibold">Nearest Hazard Ahead</p>
                  <p className="text-xs text-gray-700">
                    {nextHazard.hazard.title} ~ {Math.round(nextHazard.distance)}m away
                  </p>
                </div>
              )
            })()}
          </div>
        )}
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

