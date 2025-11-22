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

  // Lightweight local analysis fallback when Watson NLU is unavailable
  const localAnalyze = (text) => {
    const lower = text.toLowerCase()
    const keywords = [
      'pothole','hole','accident','crash','collision','debris','obstruction','object',
      'flood','water','ice','icy','snow','slippery','construction','work','repair'
    ]

    const found = keywords.find(k => lower.includes(k))
    const hazardType = found ? mapKeywordToHazardType(found) : 'pothole'
    const summary = text.length > 150 ? text.substring(0, 147) + '...' : text
    return { location: '', hazardType, summary }
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
        console.warn('AI analysis unavailable; using local heuristic analysis instead.')
        const local = localAnalyze(description)
        setExtractedData(local)
        setStep(2)
      }
    } catch (error) {
      console.error('Analysis error:', error)
      const local = localAnalyze(description)
      setExtractedData(local)
      setStep(2)
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
    <div className={`${embed ? 'relative h-full rounded-xl overflow-hidden' : 'fixed inset-0'} flex flex-col bg-transparent overflow-hidden`}>
      <div className="px-4 pt-4">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#004e89] mb-4">Report a Hazard</h1>
      </div>
      
      <div className="px-4 pt-2 pb-4 max-w-6xl mx-auto w-full flex-1 overflow-y-auto">
        {!isWatsonNLUConfigured() && (
          <div className="mb-4 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-xl px-4 py-3 text-xs shadow-sm">
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
          <div className="mb-4 bg-white rounded-xl shadow border border-gray-100 p-4">
            <label className="block text-sm font-semibold text-[#004e89] mb-3">Hazard Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border-2 border-gray-300 focus:border-michigan-gold focus:outline-none p-3 text-sm h-[150px] resize-none"
              placeholder="Describe the hazard location, type, and severity..."
            />
            <p className="text-xs text-gray-500 mt-3 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <span>More detail helps AI extract location & hazard type. Please include the location, type of hazard, and any relevant details.</span>
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="mb-4">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || description.trim().length < 15}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#004e89] text-white font-semibold rounded-lg hover:bg-[#003d6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Analyzing...
                </span>
              ) : (
                'Generate Report'
              )}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="mb-4 animate-fade-in">
            <div className="mb-3 flex items-center gap-2">
              <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              <p className="text-sm font-bold text-[#004e89]">AI Report Generated</p>
            </div>
            <div className="bg-white rounded-xl shadow border border-gray-100 p-4 space-y-4 mb-4">
              <div>
                <p className="text-xs tracking-wide uppercase font-semibold text-gray-500 mb-1">Location</p>
                <p className="text-sm font-medium text-gray-800">
                  {extractedData.location || <span className="italic text-gray-400">Not detected</span>}
                </p>
              </div>
              <div>
                <p className="text-xs tracking-wide uppercase font-semibold text-gray-500 mb-1">Hazard Type</p>
                <p className="text-sm font-medium text-gray-800">{getHazardTypeLabel(extractedData.hazardType)}</p>
              </div>
              <div>
                <p className="text-xs tracking-wide uppercase font-semibold text-gray-500 mb-1">Summary</p>
                <p className="text-xs leading-relaxed text-gray-700">{extractedData.summary}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleEditDescription}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >Edit</button>
              <button
                type="button"
                onClick={handleSubmitReport}
                disabled={submitting}
                className="flex-1 px-4 py-2 rounded-lg bg-[#004e89] text-white font-semibold text-sm hover:bg-[#003d6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Submitting...
                  </span>
                ) : (
                  'Submit Report'
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          <span>Powered by IBM Watson AI</span>
        </div>
      </div>
    </div>
  )
}

export default ReportHazardPage
