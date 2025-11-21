import { useEffect, useRef, useState } from 'react'
import { analyzeTextWithWatson } from '../utils/watsonNLU'
import { getCurrentWeather, getWeatherForecast, assessHazardRisk, isWeatherAPIConfigured } from '../utils/weatherAPI'

// Enhanced route analysis with Google Maps Directions and real-time weather
async function getRouteAnalysis(routeStart, routeDest, hazardType, geocoder, directionsService) {
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

    // Calculate overall route risk
    const totalRisk = weatherPoints.reduce((sum, p) => sum + p.risk.score, 0)
    const avgRisk = weatherPoints.length > 0 ? totalRisk / weatherPoints.length : 0
    const highRiskZones = weatherPoints.filter(p => p.risk.level === 'High').length
    const mediumRiskZones = weatherPoints.filter(p => p.risk.level === 'Medium').length

    // Build comprehensive analysis text for Watson NLU
    const routeAnalysisText = `
      Route Analysis from ${routeStart} to ${routeDest}:
      
      Route Information:
      - Distance: ${leg.distance.text}
      - Estimated Duration: ${leg.duration.text}
      - Number of weather checkpoints: ${weatherPoints.length}
      
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
      
      Analysis Request:
      Based on these real-time weather conditions along the entire route, assess the overall safety for ${hazardType}.
      Identify the most dangerous segments, provide recommendations, and predict potential hazards.
      Consider the route distance, weather variability, and risk distribution.
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

    // Adjust based on NLU sentiment
    if (nluAnalysis?.sentiment?.document) {
      const sentiment = nluAnalysis.sentiment.document
      if (sentiment.label === 'negative') {
        overallRiskScore = Math.min(100, overallRiskScore + 10)
        if (overallRiskScore >= 60) overallRiskLevel = 'High'
      }
    }

    // Extract insights
    const keywords = nluAnalysis?.keywords?.filter(k => {
      const text = k.text.toLowerCase()
      return text.includes('hazard') || text.includes('risk') || text.includes('danger') ||
             text.includes('ice') || text.includes('snow') || text.includes('flood') ||
             text.includes('wind') || text.includes('visibility') || text.includes('caution')
    }).slice(0, 5).map(k => k.text) || []

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
      hazardType
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
      directionsResult: directionsResult
    }
  } catch (error) {
    console.error('Route analysis error:', error)
    return { error: error.message || 'Failed to analyze route' }
  }
}

function generateRouteExplanation(riskLevel, riskScore, highRiskZones, mediumRiskZones, distance, duration, keywords, hazardType) {
  let explanation = `${riskLevel} risk (${riskScore}%) detected along your ${distance} route (${duration}). `
  
  if (highRiskZones > 0) {
    explanation += `${highRiskZones} high-risk zone${highRiskZones > 1 ? 's' : ''} identified. `
  }
  if (mediumRiskZones > 0) {
    explanation += `${mediumRiskZones} moderate-risk zone${mediumRiskZones > 1 ? 's' : ''} found. `
  }
  
  if (keywords.length > 0) {
    explanation += `Key concerns: ${keywords.slice(0, 3).join(', ')}. `
  }
  
  if (riskLevel === 'High') {
    explanation += `Consider delaying travel or finding an alternative route. ${hazardType} conditions are likely along significant portions of this route.`
  } else if (riskLevel === 'Medium') {
    explanation += `Exercise caution, especially in identified risk zones. Monitor conditions and drive defensively.`
  } else {
    explanation += `Conditions appear favorable. Normal driving precautions recommended.`
  }
  
  return explanation
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function PredictHazardsPage({ onBack, embed = false }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const heatmapLayerRef = useRef(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [selectedHazard, setSelectedHazard] = useState('Icy Roads')
  const [showExplain, setShowExplain] = useState(false)
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

  // Function to update location and fetch weather
  const updateLocation = async (lat, lng, name = '') => {
    const loc = { lat, lng }
    setUserLocation(loc)
    setLocationName(name)
    setLoadingWeather(true)
    
    // Fetch real-time weather
    const weather = await getCurrentWeather(lat, lng)
    if (weather) {
      setWeatherData(weather)
    }
    setLoadingWeather(false)
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
  }, [])

  // Handle location search
  const handleLocationSearch = async (e) => {
    e.preventDefault()
    if (!locationInput.trim() || !geocoder) return

    setLoadingWeather(true)
    geocoder.geocode({ address: locationInput }, async (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location
        const name = results[0].formatted_address
        await updateLocation(loc.lat(), loc.lng(), name)
        setLocationInput('')
      } else {
        alert('Location not found. Please try a different address or city name.')
        setLoadingWeather(false)
      }
    })
  }

  // Handle use current location button
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
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
        },
        { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 }
      )
    } else {
      alert('Geolocation is not supported by your browser.')
    }
  }

  // Update hazard risk assessment when weather or hazard type changes
  useEffect(() => {
    if (weatherData && selectedHazard) {
      const risk = assessHazardRisk(weatherData, selectedHazard)
      setHazardRisk(risk)
    }
  }, [weatherData, selectedHazard])

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
  useEffect(() => {
    const generateInsights = async () => {
      setLoadingInsights(true)
      
      if (!weatherData) {
        setLoadingInsights(false)
        return
      }

      // Build comprehensive analysis text with all weather data
      const weatherContext = `
        Hazard Prediction Analysis for ${selectedHazard}:
        
        Current Weather Conditions:
        - Temperature: ${weatherData.temp}°F (feels like ${weatherData.feelsLike}°F)
        - Weather Condition: ${weatherData.condition} - ${weatherData.description}
        - Wind Speed: ${weatherData.windSpeed} mph
        - Humidity: ${weatherData.humidity}%
        - Visibility: ${weatherData.visibility ? weatherData.visibility + ' miles' : 'Unknown'}
        - Precipitation: ${weatherData.precipitation > 0 ? weatherData.precipitation.toFixed(2) + ' inches' : 'None'}
        
        Location: ${locationName || 'Michigan'}
        
        Hazard Type: ${selectedHazard}
        
        Risk Assessment Factors:
        ${hazardRisk ? hazardRisk.factors.map(f => `- ${f}`).join('\n') : '- Analyzing conditions...'}
        
        Prediction Context:
        Based on these real-time weather conditions, predict the likelihood of ${selectedHazard} occurring.
        Consider temperature trends, precipitation patterns, wind conditions, and visibility.
        Assess the risk level and provide actionable insights for drivers.
        Identify key warning signs and recommended precautions.
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
        
        // Prioritize hazard-related keywords
        const hazardKeywords = keywords
          .filter(k => {
            const text = k.text.toLowerCase()
            return text.includes('ice') || text.includes('snow') || text.includes('freez') ||
                   text.includes('flood') || text.includes('water') || text.includes('rain') ||
                   text.includes('wind') || text.includes('visibility') || text.includes('fog') ||
                   text.includes('hazard') || text.includes('risk') || text.includes('danger') ||
                   text.includes('slippery') || text.includes('wet') || text.includes('storm')
          })
          .slice(0, 5)
          .map(k => k.text)

        // Get location entities
        const locations = entities
          .filter(e => e.type === 'Location' || e.type === 'GeographicFeature')
          .map(e => e.text)

        // Calculate confidence based on NLU sentiment and risk score
        let confidence = hazardRisk ? hazardRisk.score : 50
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

        // Build intelligent prediction text
        let predictionText = ''
        if (hazardRisk) {
          if (hazardRisk.level === 'High') {
            predictionText = `There is a ${Math.round(confidence)}% chance of ${selectedHazard.toLowerCase()} conditions`
          } else if (hazardRisk.level === 'Medium') {
            predictionText = `There is a ${Math.round(confidence)}% chance of ${selectedHazard.toLowerCase()} conditions developing`
          } else {
            predictionText = `Low probability (${Math.round(confidence)}%) of ${selectedHazard.toLowerCase()} conditions`
          }
        } else {
          predictionText = `Analyzing ${selectedHazard.toLowerCase()} risk`
        }

        setAiInsights({
          keywords: hazardKeywords.length > 0 ? hazardKeywords : keywords.slice(0, 5).map(k => k.text),
          sentiment: sentiment?.label || 'neutral',
          confidence: Math.round(confidence),
          prediction: predictionText,
          timeWindow: timeWindow,
          locations: locations,
          concepts: concepts.slice(0, 3).map(c => c.text),
          riskLevel: hazardRisk?.level || 'Unknown',
          factors: hazardRisk?.factors || []
        })
      } else {
        // Fallback using real weather data only
        const confidence = hazardRisk ? hazardRisk.score : 50
        setAiInsights({
          keywords: hazardRisk?.factors || ['weather conditions', 'road safety'],
          sentiment: 'neutral',
          confidence: confidence,
          prediction: `Risk assessment: ${hazardRisk?.level || 'Unknown'}`,
          timeWindow: 'Next 2-4 hours',
          locations: [],
          concepts: [],
          riskLevel: hazardRisk?.level || 'Unknown',
          factors: hazardRisk?.factors || []
        })
      }
      setLoadingInsights(false)
    }

    generateInsights()
  }, [selectedHazard, weatherData, hazardRisk, locationName])

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
      const analysis = await getRouteAnalysis(routeStart, routeDest, selectedHazard, geo, dirService)
      
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
        
        // Update heatmap with route weather points
        if (heatmapLayerRef.current && analysis.weatherPoints.length > 0) {
          const heatmapData = analysis.weatherPoints.map(p => ({
            location: new window.google.maps.LatLng(p.lat, p.lng),
            weight: p.risk.score / 100
          }))
          heatmapLayerRef.current.setData(heatmapData)
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
          weatherPoints: analysis.weatherPoints
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
        <p className="text-[#004e89] text-lg mb-4 font-medium">AI-powered hazard forecasting for Michigan drivers.</p>
        
        {/* Location Selector */}
        <div className="mb-4 bg-white rounded-xl shadow border border-gray-100 p-3 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-[#004e89] whitespace-nowrap">Location:</label>
            <form onSubmit={handleLocationSearch} className="flex-1 flex gap-2">
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                placeholder="Search city or address (e.g., Detroit, MI or 123 Main St)"
                className="flex-1 border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold"
                disabled={!geocoder || loadingWeather}
              />
              <button
                type="submit"
                disabled={!geocoder || loadingWeather || !locationInput.trim()}
                className="px-4 py-2 bg-[#004e89] text-white font-semibold rounded-lg hover:bg-[#003d6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Search
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
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">
                            {aiInsights.riskLevel === 'High' ? '⚠️' :
                             aiInsights.riskLevel === 'Medium' ? '⚡' : '✅'}
                          </span>
                          <h4 className="font-bold text-base text-[#004e89]">
                            {selectedHazard}
                          </h4>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          aiInsights.riskLevel === 'High' ? 'bg-red-200 text-red-800' :
                          aiInsights.riskLevel === 'Medium' ? 'bg-yellow-200 text-yellow-800' :
                          'bg-green-200 text-green-800'
                        }`}>
                          {aiInsights.riskLevel} Risk
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed mb-2">
                        {aiInsights.prediction || `There is a ${aiInsights.confidence}% chance of ${selectedHazard.toLowerCase()} conditions`}
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
                    onClick={() => setShowExplain(prev => !prev)}
                    className="w-full text-xs font-semibold bg-michigan-gold text-[#004e89] px-3 py-1.5 rounded-md shadow hover:brightness-95 transition mt-1"
                  >
                    {showExplain ? 'Hide Details' : 'Show How This Works'}
                  </button>
                )}
                {showExplain && aiInsights && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                    {weatherData && hazardRisk && aiInsights ? (
                      <>
                        <div className="flex items-center space-x-2 mb-3">
                          <span className="text-xl">🔍</span>
                          <h5 className="font-bold text-sm text-[#004e89]">How This Prediction Works</h5>
                        </div>
                        
                        {/* Step 1: Weather Data */}
                        <div className="bg-white rounded-lg p-3 border-l-4 border-blue-500">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                            <h6 className="font-bold text-xs text-blue-700">Real-Time Weather Data</h6>
                          </div>
                          <div className="grid grid-cols-2 gap-2 ml-8 text-xs text-gray-600">
                            <div>
                              <span className="font-semibold">Temp:</span> {weatherData.temp}°F
                              {weatherData.feelsLike !== weatherData.temp && (
                                <span className="text-gray-500"> (feels {weatherData.feelsLike}°F)</span>
                              )}
                            </div>
                            <div>
                              <span className="font-semibold">Condition:</span> {weatherData.description}
                            </div>
                            {weatherData.windSpeed > 0 && (
                              <div>
                                <span className="font-semibold">Wind:</span> {weatherData.windSpeed} mph
                              </div>
                            )}
                            {weatherData.visibility && (
                              <div>
                                <span className="font-semibold">Visibility:</span> {weatherData.visibility} mi
                              </div>
                            )}
                            <div>
                              <span className="font-semibold">Humidity:</span> {weatherData.humidity}%
                            </div>
                            {weatherData.precipitation > 0 && (
                              <div>
                                <span className="font-semibold">Precipitation:</span> {weatherData.precipitation.toFixed(2)}"
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Step 2: Risk Calculation */}
                        <div className="bg-white rounded-lg p-3 border-l-4 border-purple-500">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                            <h6 className="font-bold text-xs text-purple-700">Risk Calculation</h6>
                          </div>
                          <p className="ml-8 text-xs text-gray-600">
                            Analyzed weather conditions against {selectedHazard} patterns. 
                            Calculated <span className="font-semibold">{hazardRisk.level} risk</span> with a score of <span className="font-semibold">{hazardRisk.score}%</span>.
                          </p>
                        </div>

                        {/* Step 3: AI Analysis */}
                        <div className="bg-white rounded-lg p-3 border-l-4 border-green-500">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                            <h6 className="font-bold text-xs text-green-700">Watson NLU AI Analysis</h6>
                          </div>
                          <div className="ml-8 space-y-1 text-xs text-gray-600">
                            <div>
                              <span className="font-semibold">Sentiment:</span> 
                              <span className={`ml-1 px-2 py-0.5 rounded ${
                                aiInsights.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                                aiInsights.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {aiInsights.sentiment}
                              </span>
                            </div>
                            {aiInsights.concepts.length > 0 && (
                              <div>
                                <span className="font-semibold">Key Concepts:</span> 
                                <span className="ml-1">{aiInsights.concepts.slice(0, 3).join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Final Summary */}
                        <div className="bg-[#004e89] text-white rounded-lg p-3 mt-2">
                          <p className="text-xs font-semibold mb-1">📊 Final Prediction</p>
                          <p className="text-xs leading-relaxed opacity-90">
                            The <span className="font-bold">{aiInsights.confidence}%</span> confidence score combines real-time weather data analysis with AI-powered pattern recognition to predict {selectedHazard.toLowerCase()} likelihood.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-xs text-gray-500">Loading detailed analysis explanation...</p>
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
