// Watson NLU utility functions
// Configuration is loaded from .env file
// Add to .env:
//   VITE_WATSON_NLU_API_KEY=your_api_key
//   VITE_WATSON_NLU_URL=your_service_url

const WATSON_NLU_API_KEY = import.meta.env.VITE_WATSON_NLU_API_KEY
const WATSON_NLU_URL = import.meta.env.VITE_WATSON_NLU_URL

/**
 * Analyze text using Watson Natural Language Understanding
 * @param {string} text - Text to analyze
 * @param {object} options - Optional configuration for analysis features
 * @returns {Promise<object|null>} Analysis results or null if unavailable
 */
export async function analyzeTextWithWatson(text, options = {}) {
  if (!WATSON_NLU_API_KEY || !WATSON_NLU_URL || !text || text.trim().length === 0) {
    return null
  }

  const defaultFeatures = {
    entities: {
      limit: 10,
      sentiment: true
    },
    keywords: {
      limit: 10,
      sentiment: true
    },
    sentiment: {},
    categories: {}
  }

  const features = options.features || defaultFeatures

  try {
    const response = await fetch(`${WATSON_NLU_URL}/v1/analyze?version=2022-04-07`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`apikey:${WATSON_NLU_API_KEY}`)}`
      },
      body: JSON.stringify({
        text: text,
        features: features
      })
    })

    if (!response.ok) {
      console.error('Watson NLU API error:', response.status, response.statusText)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Watson NLU request failed:', error)
    return null
  }
}

/**
 * Check if Watson NLU is configured
 * @returns {boolean} True if API key and URL are set
 */
export function isWatsonNLUConfigured() {
  return !!(WATSON_NLU_API_KEY && WATSON_NLU_URL)
}

