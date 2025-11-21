import { useEffect, useRef, useState } from 'react'

// Mock heatmap data
const heatmapPoints = [
  { lat: 42.285, lng: -83.75, weight: 0.9 },
  { lat: 42.295, lng: -83.77, weight: 0.7 },
  { lat: 42.275, lng: -83.70, weight: 0.5 }
]

// Placeholder for future IBM watsonx.ai integration
async function getHazardPrediction(data) {
  // will call IBM watsonx.ai endpoint later
  // return fetch('/api/watsonx', { method: 'POST', body: JSON.stringify(data) })
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function PredictHazardsPage({ onBack, embed = false }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const heatmapLayerRef = useRef(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [selectedHazard, setSelectedHazard] = useState('Icy Roads')
  const [showExplain, setShowExplain] = useState(false)
  const [routeModalOpen, setRouteModalOpen] = useState(false)
  const [routeStart, setRouteStart] = useState('')
  const [routeDest, setRouteDest] = useState('')
  const [routeResult, setRouteResult] = useState(null)
  const [loadingMap, setLoadingMap] = useState(true)
  const [error, setError] = useState(null)

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
    try {
      const center = { lat: 42.2808, lng: -83.7430 }
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 10,
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] }
        ]
      })
      mapInstanceRef.current = map

      // Build weighted locations for heatmap
      const weighted = heatmapPoints.map(p => ({
        location: new window.google.maps.LatLng(p.lat, p.lng),
        weight: p.weight
      }))

      heatmapLayerRef.current = new window.google.maps.visualization.HeatmapLayer({
        data: weighted,
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

  const submitRouteRisk = (e) => {
    e.preventDefault()
    if (!routeStart || !routeDest) {
      setRouteResult({ level: 'Unknown', zones: 0, msg: 'Please provide both start and destination.' })
      return
    }
    // Mock risk evaluation
    setRouteResult({ level: 'Medium', zones: 2, msg: '2 high-risk zones detected along your route.' })
  }

  return (
    <div className={`${embed ? 'relative h-full rounded-xl overflow-hidden' : 'fixed inset-0'} flex flex-col bg-transparent overflow-y-auto`}>
      {/* Header row matching Live Weather Alerts */}
      <div className="px-4 pt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#004e89]">Predict Road Hazards</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-16 max-w-6xl mx-auto w-full">
        <p className="text-[#004e89] text-lg mb-6 font-medium">AI-powered hazard forecasting for Michigan drivers.</p>

        {/* Top Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow hover:shadow-lg transition p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-[#004e89] uppercase tracking-wide">Current Weather</h3>
            <p className="mt-2 text-gray-700 text-sm">Temp: <span className="font-semibold">29°F</span></p>
            <p className="text-gray-700 text-sm">Snow Expected</p>
          </div>
          <div className="bg-white rounded-xl shadow hover:shadow-lg transition p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-[#004e89] uppercase tracking-wide">Traffic Level</h3>
            <p className="mt-2 text-gray-700 text-sm">Moderate Congestion</p>
          </div>
          <div className="bg-white rounded-xl shadow hover:shadow-lg transition p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-[#004e89] uppercase tracking-wide">Road Type</h3>
            <p className="mt-2 text-gray-700 text-sm">Urban Roads</p>
          </div>
        </div>

        {/* Hazard Type Dropdown */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-3 sm:space-y-0">
          <label className="text-[#004e89] font-semibold text-sm" htmlFor="hazardType">Select Hazard Type</label>
          <select
            id="hazardType"
            value={selectedHazard}
            onChange={(e) => setSelectedHazard(e.target.value)}
            className="bg-white border-2 border-[#004e89] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold w-full sm:w-64"
          >
            <option>Icy Roads</option>
            <option>Flood Risk</option>
            <option>Low Visibility</option>
            <option>Accident Likelihood</option>
            <option>High Wind Risk</option>
          </select>
        </div>

        {/* Map & Insights Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow border border-gray-100 overflow-hidden relative min-h-[420px]">
            <div ref={mapRef} className="absolute inset-0" />
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
              Center: Ann Arbor
            </div>
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg px-3 py-2 text-xs shadow border border-gray-200">
              <p className="font-semibold text-[#004e89]">Heatmap Legend</p>
              <p className="text-gray-600">Red: High risk • Yellow: Medium risk</p>
            </div>
          </div>

          {/* AI Insights */}
          <div className="flex flex-col space-y-6">
            <div className="group bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transition hover:shadow-xl">
              <div className="bg-[#004e89] text-white px-4 py-3 flex items-center justify-between">
                <h3 className="font-bold text-sm tracking-wide">AI-Generated Insights</h3>
                <span className="text-[10px] font-semibold bg-michigan-gold text-[#004e89] px-2 py-1 rounded">Beta</span>
              </div>
              <div className="p-4 text-sm text-gray-700 leading-relaxed">
                <p className="mb-2">There is a <span className="font-bold">68%</span> chance of icy road conditions near <span className="font-semibold">Ann Arbor</span> between <span className="font-semibold">5–7 PM</span>.</p>
                <p>Consider avoiding <span className="font-semibold">Huron St</span> and taking <span className="font-semibold">Washtenaw Ave</span> instead.</p>
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={() => setShowExplain(prev => !prev)}
                  className="mt-2 text-xs font-semibold bg-michigan-gold text-[#004e89] px-3 py-2 rounded-md shadow hover:brightness-95 transition"
                >
                  {showExplain ? 'Hide Explanation' : 'Explain This Prediction'}
                </button>
                {showExplain && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-700">
                    Icy risk is high because temperatures are dropping below freezing and snow accumulation exceeds 0.5 inches.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-5">
              <h3 className="font-bold text-[#004e89] text-sm mb-2 uppercase tracking-wide">Route Hazard Check</h3>
              <p className="text-xs text-gray-600 mb-3">Evaluate hazard risk along a custom route.</p>
              <button
                onClick={() => setRouteModalOpen(true)}
                className="text-sm font-semibold bg-[#004e89] text-white px-4 py-2 rounded-md shadow hover:bg-[#004e89] transition-colors"
              >
                Check My Route Risk
              </button>
              {routeResult && (
                <div className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
                  <p><span className="font-semibold">Risk Level:</span> {routeResult.level}</p>
                  <p><span className="font-semibold">Zones:</span> {routeResult.zones} high-risk zones detected.</p>
                  <p className="text-gray-600 mt-1">{routeResult.msg}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Route Modal */}
      {routeModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => { setRouteModalOpen(false); setRouteResult(null) }}
              className="absolute top-3 right-3 text-gray-500 hover:text-[#004e89]"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h3 className="text-lg font-bold text-[#004e89] mb-4">Check My Route Risk</h3>
            <form onSubmit={submitRouteRisk} className="space-y-4">
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-[#004e89]">Start Location</label>
                <input
                  type="text"
                  value={routeStart}
                  onChange={(e) => setRouteStart(e.target.value)}
                  placeholder="e.g. Detroit, MI"
                  className="border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-[#004e89]">Destination</label>
                <input
                  type="text"
                  value={routeDest}
                  onChange={(e) => setRouteDest(e.target.value)}
                  placeholder="e.g. Ann Arbor, MI"
                  className="border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-michigan-gold text-[#004e89] font-semibold py-2 rounded-md shadow hover:brightness-95 transition text-sm"
              >
                Evaluate Risk
              </button>
            </form>
            {routeResult && (
              <div className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
                <p><span className="font-semibold">Risk Level:</span> {routeResult.level}</p>
                <p><span className="font-semibold">Zones:</span> {routeResult.zones}</p>
                <p className="text-gray-600 mt-1">{routeResult.msg}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PredictHazardsPage
