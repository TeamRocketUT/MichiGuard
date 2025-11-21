import React, { useState } from 'react'
import { analyzeTextWithWatson, isWatsonNLUConfigured } from '../utils/watsonNLU'

function ReportHazardPage({ embed = false }) {
  const [step, setStep] = useState(1) // 1 = input, 2 = preview
  const [description, setDescription] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Extracted data from AI
  const [extractedData, setExtractedData] = useState({
    location: '',
    hazardType: 'pothole',
    summary: ''
  })

  // Hazard type mapping from keywords to form values
  const mapKeywordToHazardType = (keyword) => {
    const kw = keyword.toLowerCase()
    if (kw.includes('pothole') || kw.includes('hole')) return 'pothole'
    if (kw.includes('accident') || kw.includes('crash') || kw.includes('collision')) return 'accident'
    if (kw.includes('debris') || kw.includes('obstruction') || kw.includes('object')) return 'debris'
    if (kw.includes('flood') || kw.includes('water')) return 'flooding'
    if (kw.includes('ice') || kw.includes('icy') || kw.includes('snow') || kw.includes('slippery')) return 'icy-road'
    if (kw.includes('construction') || kw.includes('work') || kw.includes('repair')) return 'construction'
    return 'pothole' // default
  }

  const getHazardTypeLabel = (type) => {
    const labels = {
      'pothole': 'Pothole',
      'accident': 'Accident',
      'debris': 'Debris',
      'flooding': 'Flooding',
      'icy-road': 'Icy Road',
      'construction': 'Construction'
    }
    return labels[type] || type
  }

  // Analyze with Watson AI
  const handleAnalyze = async () => {
    if (description.trim().length < 15) {
      alert('Please enter a more detailed description (at least 15 characters)')
      return
    }

    setAnalyzing(true)
    
    try {
      const result = await analyzeTextWithWatson(description)
      
      if (result) {
        const entities = result.entities || []
        const keywords = result.keywords || []

        // Find location entities
        const locationEntities = entities.filter(e => 
          e.type === 'Location' || e.type === 'GeographicFeature' || 
          e.type === 'Organization' || e.type === 'Facility'
        )

        // Find hazard-related keywords
        const hazardKeywords = keywords.filter(k => {
          const text = k.text.toLowerCase()
          return text.includes('ice') || text.includes('flood') || text.includes('pothole') || 
                 text.includes('accident') || text.includes('snow') || text.includes('water') ||
                 text.includes('debris') || text.includes('construction') || text.includes('hole') ||
                 text.includes('crash') || text.includes('work')
        })

        // Extract data
        let location = ''
        let hazardType = 'pothole'
        let summary = description

        if (locationEntities.length > 0) {
          location = locationEntities[0].text
        }

        if (hazardKeywords.length > 0) {
          hazardType = mapKeywordToHazardType(hazardKeywords[0].text)
        }

        // Create a summary (first 150 chars or full description)
        if (description.length > 150) {
          summary = description.substring(0, 147) + '...'
        }

        setExtractedData({
          location,
          hazardType,
          summary
        })
        
        console.log('Watson NLU Analysis:', result)
        
        // Move to step 2
        setStep(2)
      } else {
        alert('AI analysis failed. Please try again or check your Watson NLU credentials.')
      }
    } catch (error) {
      console.error('Analysis error:', error)
      alert('Error analyzing description. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  // Submit final report
  const handleSubmitReport = async () => {
    setSubmitting(true)

    // In a real app, submit to backend
    setTimeout(() => {
      alert(
        `Hazard report submitted successfully! ✓\n\n` +
        `Type: ${getHazardTypeLabel(extractedData.hazardType)}\n` +
        `Location: ${extractedData.location || 'Not specified'}\n` +
        `Description: ${extractedData.summary}`
      )
      
      // Reset form
      setDescription('')
      setExtractedData({ location: '', hazardType: 'pothole', summary: '' })
      setStep(1)
      setSubmitting(false)
    }, 800)
  }

  // Go back to step 1
  const handleEditDescription = () => {
    setStep(1)
  }

  return (
    <div className="mobile-container mt-2 pb-2">
      <h1 className="text-xl font-bold text-[#004e89] mt-2 pb-1">Report a Hazard</h1>

      {!isWatsonNLUConfigured() && (
        <div className="mt-3 mb-3 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-xl px-3 py-2 text-xs shadow-sm">
          <p className="font-semibold flex items-center gap-2 mb-1">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            AI Setup Required
          </p>
          <p className="leading-snug">Add Watson NLU credentials to <code className="bg-yellow-100 px-1 rounded font-mono">VITE_WATSON_NLU_API_KEY</code> and <code className="bg-yellow-100 px-1 rounded font-mono">VITE_WATSON_NLU_URL</code>.</p>
        </div>
      )}

      {step === 1 && (
        <div className="mt-3 mb-3">
          <label className="block text-xs font-semibold text-gray-600 mb-2">Hazard Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-gray-300 focus:border-[#004e89] focus:ring-2 focus:ring-[#004e89]/30 p-3 text-sm h-[120px] resize-none shadow-sm"
            placeholder="Describe the hazard location, type, and severity..."
          />
          <p className="text-[11px] text-gray-500 mt-2 flex items-start gap-1">
            <svg className="w-3.5 h-3.5 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
            More detail helps AI extract location & hazard type.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="mt-3 mb-3">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || description.trim().length < 15}
            className="w-full rounded-full bg-gradient-to-r from-[#004e89] to-[#003d6b] text-white font-semibold text-sm py-3 px-4 shadow-md active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <span className="flex items-center justify-center gap-2"><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />Analyzing...</span>
            ) : (
              'Generate Report'
            )}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-3 mb-3 animate-fade-in">
          <div className="mb-2 flex items-center gap-2">
            <svg className="h-4 w-4 text-[#004e89]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            <p className="text-xs font-semibold text-[#004e89]">AI Report Generated</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
            <div>
              <p className="text-[10px] tracking-wide uppercase font-semibold text-gray-500">Location</p>
              <p className="text-sm mt-0.5 font-medium text-gray-800">{extractedData.location || <span className="italic text-gray-400">Not detected</span>}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide uppercase font-semibold text-gray-500">Hazard Type</p>
              <p className="text-sm mt-0.5 font-medium text-gray-800">{getHazardTypeLabel(extractedData.hazardType)}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide uppercase font-semibold text-gray-500">Summary</p>
              <p className="text-xs mt-0.5 leading-relaxed text-gray-700">{extractedData.summary}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <button
              type="button"
              onClick={handleEditDescription}
              className="w-full sm:w-auto rounded-full border border-gray-300 bg-white text-gray-700 text-xs font-semibold px-4 py-2 shadow-sm active:scale-95 transition"
            >Edit</button>
            <button
              type="button"
              onClick={handleSubmitReport}
              disabled={submitting}
              className="flex-1 rounded-full bg-gradient-to-r from-[#004e89] to-[#003d6b] text-white text-sm font-semibold px-4 py-2 shadow-md active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 mb-2 text-center text-[10px] text-gray-500 flex items-center justify-center gap-1">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
        Powered by IBM Watson AI
      </div>

      <style jsx>{`
        @keyframes fade-in { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
        .animate-fade-in { animation: fade-in 0.4s ease-out; }
      `}</style>
    </div>
  )
}

export default ReportHazardPage
