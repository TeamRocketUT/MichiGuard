import React, { useEffect, useMemo, useState } from 'react'

// Placeholder: fake IBM Weather Company endpoint base (unused, for future wiring)
const IBM_WEATHER_ALERTS_URL = 'https://api.weather.company.ibm.fake/alerts'

// Watsonx.ai placeholder — returns the original text for now
async function summarizeAlert(alertText) {
  return alertText
}

// Dummy alerts — in a real app, shape should mirror the API response
const DUMMY_ALERTS = [
  {
    id: 'a1',
    title: 'Winter Weather Advisory',
    severity: 'Moderate',
    start: '2025-12-01T02:00:00Z',
    end: '2025-12-01T14:00:00Z',
    description: 'Snow and blowing snow expected. Plan for slippery roads and reduced visibility. Gusts up to 25 mph.',
    area: 'Ann Arbor, MI'
  },
  {
    id: 'a2',
    title: 'Ice Storm Warning',
    severity: 'Severe',
    start: '2025-12-02T06:00:00Z',
    end: '2025-12-02T18:00:00Z',
    description: 'Significant icing expected. Power outages and tree damage are likely due to the ice. Travel is strongly discouraged.',
    area: 'Detroit, MI'
  },
  {
    id: 'a3',
    title: 'Wind Advisory',
    severity: 'Minor',
    start: '2025-12-03T10:00:00Z',
    end: '2025-12-03T22:00:00Z',
    description: 'Winds 20-30 mph with gusts up to 45 mph expected. Secure outdoor objects. Use caution when driving high-profile vehicles.',
    area: 'Grand Rapids, MI'
  }
]

// Helper: format ISO date into readable local string
function fmt(dt) {
  try {
    return new Date(dt).toLocaleString()
  } catch {
    return dt
  }
}

// Helper functions — currently simulate network calls with dummy data
async function fetchAlertsByCoordinates(lat, lon) {
  // Future: fetch(`${IBM_WEATHER_ALERTS_URL}?lat=${lat}&lon=${lon}`)
  await new Promise(r => setTimeout(r, 500))
  // Return subset filtered by rough location hints (dummy logic)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
  // Simple heuristic: different bands return different sample alerts
  if (lat > 42.6) return [DUMMY_ALERTS[2]]
  if (lon < -83.2) return [DUMMY_ALERTS[0]]
  return [DUMMY_ALERTS[0], DUMMY_ALERTS[1]]
}

async function fetchAlertsBySearch(query) {
  await new Promise(r => setTimeout(r, 350))
  const q = (query || '').toLowerCase().trim()
  if (!q) return []
  return DUMMY_ALERTS.filter(a => a.area.toLowerCase().includes(q) || a.title.toLowerCase().includes(q))
}

export default function LiveWeatherAlerts({ embed = false }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [usingSearch, setUsingSearch] = useState(false)

  // On mount: request location and fetch alerts by coordinates
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      setLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return
        try {
          const res = await fetchAlertsByCoordinates(pos.coords.latitude, pos.coords.longitude)
          if (!cancelled) {
            setAlerts(res)
            setError(null)
          }
        } catch (e) {
          if (!cancelled) setError('Failed to fetch alerts for your location.')
        } finally {
          if (!cancelled) setLoading(false)
        }
      },
      (err) => {
        if (cancelled) return
        setError('Location unavailable: ' + (err?.message || 'Permission denied'))
        setLoading(false)
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
    setUsingSearch(true)
    setError(null)
    try {
      const res = await fetchAlertsBySearch(q)
      setAlerts(res)
    } catch (e) {
      setError('Failed to fetch alerts for search query.')
    } finally {
      setLoading(false)
    }
  }

  const clearSearch = async () => {
    setSearch('')
    setUsingSearch(false)
    setLoading(true)
    setError(null)
    try {
      // Re-run geolocation-based fetch, but without prompting again — just fallback to Ann Arbor coords
      const res = await fetchAlertsByCoordinates(42.2808, -83.7430)
      setAlerts(res)
    } catch (e) {
      setError('Failed to refresh alerts.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4">
      {/* Inline error/notice */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Header + Search (always show page title) */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#004e89]">Live Weather Alerts</h1>
        <form onSubmit={handleSubmit} className="flex items-stretch gap-2 w-full md:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search city or ZIP..."
            className="w-full md:w-64 bg-white border-2 border-[#004e89] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#004e89] text-white font-semibold hover:bg-[#004e89] transition-colors"
            title="Search"
          >
            Search
          </button>
          {usingSearch && (
            <button
              type="button"
              onClick={clearSearch}
              className="px-3 py-2 rounded-lg bg-gray-100 text-[#004e89] font-semibold hover:bg-gray-200 transition-colors"
              title="Clear search"
            >
              Clear
            </button>
          )}
        </form>
      </div>

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

  return (
    <div className="bg-white rounded-xl shadow hover:shadow-lg transition border border-gray-200 overflow-hidden">
      <div className="bg-[#004e89] text-white px-4 py-3 flex items-center justify-between">
        <h3 className="font-bold text-sm tracking-wide line-clamp-1">{alert.title}</h3>
        <SeverityBadge level={alert.severity} />
      </div>
      <div className="p-4 text-sm text-gray-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-gray-600">Area</div>
          <div className="font-semibold text-[#004e89]">{alert.area}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-gray-600">Starts</div>
          <div className="font-medium">{fmt(alert.start)}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-gray-600">Ends</div>
          <div className="font-medium">{fmt(alert.end)}</div>
        </div>
        <div className="pt-2 border-t border-gray-200">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Description</div>
          <p className="leading-relaxed text-gray-800">{summary}</p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <span className="text-[10px] font-semibold bg-michigan-gold text-[#004e89] px-2 py-1 rounded shadow">Live</span>
      </div>
    </div>
  )
}
