import React, { useState } from 'react'
import Sidebar from './Sidebar'
import HazardMapPage from '../HazardMapPage'
import PredictHazardsPage from '../PredictHazardsPage'
import LiveWeatherAlerts from '../LiveWeatherAlerts'
import { analyzeTextWithWatson, isWatsonNLUConfigured } from '../../utils/watsonNLU'

// Placeholder pages
function HazardMapEmbedded() {
  return (
    <div className="p-4 h-full">
      <div className="h-full">
        <HazardMapPage embed={true} />
      </div>
    </div>
  )
}

function PredictHazardsEmbedded() {
  return (
    <div className="p-4 h-full">
      <div className="h-full">
        <PredictHazardsPage embed={true} />
      </div>
    </div>
  )
}

function WeatherAlertsPlaceholder() {
  return <LiveWeatherAlerts embed={true} />
}

function ReportHazardPlaceholder() {
  const [location, setLocation] = useState('')
  const [hazardType, setHazardType] = useState('Pothole')
  const [description, setDescription] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  // Auto-analyze description with Watson NLU when user types
  const handleDescriptionChange = async (e) => {
    const value = e.target.value
    setDescription(value)

    // Debounce: analyze after user stops typing for 1 second
    if (value.trim().length > 10) {
      setAnalyzing(true)
      setTimeout(async () => {
        const result = await analyzeTextWithWatson(value)
        if (result) {
          // Extract entities (locations, hazard types)
          const entities = result.entities || []
          const keywords = result.keywords || []
          const sentiment = result.sentiment?.document || {}

          // Find location entities
          const locationEntities = entities.filter(e => 
            e.type === 'Location' || e.type === 'GeographicFeature' || e.type === 'Organization'
          )

          // Find hazard-related keywords
          const hazardKeywords = keywords.filter(k => {
            const text = k.text.toLowerCase()
            return text.includes('ice') || text.includes('flood') || text.includes('pothole') || 
                   text.includes('accident') || text.includes('snow') || text.includes('water') ||
                   text.includes('danger') || text.includes('hazard')
          })

          setAnalysis({
            entities: locationEntities,
            keywords: hazardKeywords,
            sentiment: sentiment,
            suggestedLocation: locationEntities[0]?.text || null,
            suggestedType: hazardKeywords[0]?.text || null
          })

          // Auto-fill location if found
          if (locationEntities.length > 0 && !location) {
            setLocation(locationEntities[0].text)
          }

          // Auto-suggest hazard type
          if (hazardKeywords.length > 0) {
            const keyword = hazardKeywords[0].text.toLowerCase()
            if (keyword.includes('ice') || keyword.includes('snow')) {
              setHazardType('Ice')
            } else if (keyword.includes('flood') || keyword.includes('water')) {
              setHazardType('Flood')
            } else if (keyword.includes('pothole')) {
              setHazardType('Pothole')
            } else if (keyword.includes('accident') || keyword.includes('crash')) {
              setHazardType('Accident')
            }
          }
        }
        setAnalyzing(false)
      }, 1000)
    } else {
      setAnalysis(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitted(true)
    
    // Final analysis on submit
    if (description.trim()) {
      const result = await analyzeTextWithWatson(description)
      if (result) {
        console.log('Final Watson NLU Analysis:', result)
      }
    }

    // In a real app, submit to backend
    setTimeout(() => {
      alert('Hazard report submitted! (This is a demo - Watson NLU analysis logged to console)')
      setLocation('')
      setHazardType('Pothole')
      setDescription('')
      setAnalysis(null)
      setSubmitted(false)
    }, 500)
  }

  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#004e89]">Report a Hazard</h1>
        <div className="w-16" />
      </div>
      
      {!isWatsonNLUConfigured() && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm">
          <p className="font-semibold mb-1">Watson NLU Setup Required</p>
          <p>Add <code className="bg-yellow-100 px-1 rounded">VITE_WATSON_NLU_API_KEY</code> and <code className="bg-yellow-100 px-1 rounded">VITE_WATSON_NLU_URL</code> to your <code className="bg-yellow-100 px-1 rounded">.env</code> file to enable AI-powered analysis.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow p-4 max-w-lg space-y-3">
        <div>
          <label className="block text-sm font-semibold text-[#004e89]">Location</label>
          <input 
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold" 
            placeholder="Address or coordinates" 
          />
          {analysis?.suggestedLocation && !location && (
            <p className="mt-1 text-xs text-blue-600">
              💡 AI detected location: <button type="button" onClick={() => setLocation(analysis.suggestedLocation)} className="underline font-semibold">{analysis.suggestedLocation}</button>
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#004e89]">Type</label>
          <select 
            value={hazardType}
            onChange={(e) => setHazardType(e.target.value)}
            className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold"
          >
            <option>Pothole</option>
            <option>Flood</option>
            <option>Accident</option>
            <option>Ice</option>
          </select>
          {analysis?.suggestedType && (
            <p className="mt-1 text-xs text-blue-600">
              💡 AI suggested: {analysis.suggestedType}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#004e89]">
            Description
            {analyzing && <span className="ml-2 text-xs text-gray-500">(Analyzing with Watson NLU...)</span>}
          </label>
          <textarea 
            value={description}
            onChange={handleDescriptionChange}
            className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold" 
            rows="3" 
            placeholder="Describe the hazard (AI will auto-detect location and type)" 
          />
          
          {/* Watson NLU Analysis Results */}
          {analysis && !analyzing && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs">
              <p className="font-semibold text-[#004e89] mb-2">🤖 AI Analysis:</p>
              {analysis.sentiment && (
                <p className="mb-1">
                  <span className="font-semibold">Sentiment:</span> {analysis.sentiment.label} 
                  {analysis.sentiment.score && ` (${(Math.abs(analysis.sentiment.score) * 100).toFixed(0)}% confidence)`}
                </p>
              )}
              {analysis.entities.length > 0 && (
                <p className="mb-1">
                  <span className="font-semibold">Detected Locations:</span> {analysis.entities.map(e => e.text).join(', ')}
                </p>
              )}
              {analysis.keywords.length > 0 && (
                <p>
                  <span className="font-semibold">Key Terms:</span> {analysis.keywords.slice(0, 3).map(k => k.text).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
        <button 
          type="submit" 
          disabled={submitted}
          className="bg-[#004e89] text-white font-semibold px-4 py-2 rounded-md hover:bg-[#004e89] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitted ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </div>
  )
}

function SafetyResourcesPlaceholder() {
  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2">
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#004e89]">Safety Resources</h1>
        <div className="w-16" />
      </div>
      <p className="text-gray-700">Links and guidance coming soon.</p>
    </div>
  )
}

function MainLayout({ initialSection = 'hazard', onHome }) {
  const [active, setActive] = useState(initialSection)

  let content = null
  switch (active) {
    case 'hazard':
      content = <HazardMapEmbedded />
      break
    case 'predict':
      content = <PredictHazardsEmbedded />
      break
    case 'weather':
      content = <WeatherAlertsPlaceholder />
      break
    case 'report':
      content = <ReportHazardPlaceholder />
      break
    case 'resources':
      content = <SafetyResourcesPlaceholder />
      break
    default:
      content = <HazardMapEmbedded />
  }

  return (
    <div className="h-screen w-screen flex bg-[#cbeef3]">
      <Sidebar activeKey={active} onNavigate={setActive} onHome={onHome} />
      <main className="flex-1 overflow-y-auto min-h-0">
        {content}
      </main>
    </div>
  )
}

export default MainLayout
