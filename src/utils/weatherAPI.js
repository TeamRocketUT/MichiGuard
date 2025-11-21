// Real-time weather data utility
// Uses OpenWeatherMap API (free tier: 60 calls/minute, 1,000,000 calls/month)
// Add to .env: VITE_OPENWEATHER_API_KEY=your_api_key
// Get free API key at: https://openweathermap.org/api

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5'

/**
 * Get current weather data for a location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<object|null>} Weather data or null if unavailable
 */
export async function getCurrentWeather(lat, lon) {
  if (!OPENWEATHER_API_KEY) {
    console.warn('OpenWeatherMap API key not configured')
    return null
  }

  try {
    const response = await fetch(
      `${OPENWEATHER_BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=imperial`
    )

    if (!response.ok) {
      console.error('OpenWeatherMap API error:', response.status, response.statusText)
      return null
    }

    const data = await response.json()
    return {
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      condition: data.weather[0].main,
      description: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind?.speed || 0),
      visibility: data.visibility ? (data.visibility / 1609.34).toFixed(1) : null, // Convert meters to miles
      precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
      icon: data.weather[0].icon
    }
  } catch (error) {
    console.error('Failed to fetch weather data:', error)
    return null
  }
}

/**
 * Get weather forecast for a location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<object|null>} Forecast data or null if unavailable
 */
export async function getWeatherForecast(lat, lon) {
  if (!OPENWEATHER_API_KEY) {
    return null
  }

  try {
    const response = await fetch(
      `${OPENWEATHER_BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=imperial&cnt=5`
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.list.map(item => ({
      time: new Date(item.dt * 1000),
      temp: Math.round(item.main.temp),
      condition: item.weather[0].main,
      description: item.weather[0].description,
      precipitation: item.rain?.['3h'] || item.snow?.['3h'] || 0,
      windSpeed: Math.round(item.wind?.speed || 0)
    }))
  } catch (error) {
    console.error('Failed to fetch forecast:', error)
    return null
  }
}

/**
 * Check if OpenWeatherMap is configured
 * @returns {boolean} True if API key is set
 */
export function isWeatherAPIConfigured() {
  return !!OPENWEATHER_API_KEY
}

/**
 * Get hazard risk based on weather conditions
 * @param {object} weather - Weather data from getCurrentWeather
 * @param {string} hazardType - Type of hazard to assess
 * @returns {object} Risk assessment
 */
export function assessHazardRisk(weather, hazardType) {
  if (!weather) {
    return { level: 'Unknown', score: 0, factors: [] }
  }

  let riskScore = 0
  const factors = []

  switch (hazardType) {
    case 'Icy Roads':
      if (weather.temp <= 32) {
        riskScore += 40
        factors.push('Freezing temperatures')
      }
      if (weather.precipitation > 0) {
        riskScore += 30
        factors.push('Precipitation expected')
      }
      if (weather.humidity > 80) {
        riskScore += 20
        factors.push('High humidity')
      }
      break

    case 'Flood Risk':
      if (weather.precipitation > 0.5) {
        riskScore += 50
        factors.push('Heavy precipitation')
      }
      if (weather.humidity > 85) {
        riskScore += 20
        factors.push('High humidity')
      }
      break

    case 'Low Visibility':
      if (weather.visibility && weather.visibility < 1) {
        riskScore += 60
        factors.push('Very low visibility')
      } else if (weather.visibility && weather.visibility < 3) {
        riskScore += 40
        factors.push('Reduced visibility')
      }
      if (weather.condition === 'Fog' || weather.condition === 'Mist') {
        riskScore += 30
        factors.push('Foggy conditions')
      }
      break

    case 'High Wind Risk':
      if (weather.windSpeed > 30) {
        riskScore += 60
        factors.push('Strong winds')
      } else if (weather.windSpeed > 20) {
        riskScore += 40
        factors.push('Moderate winds')
      }
      break

    case 'Accident Likelihood':
      // Combine multiple factors
      if (weather.condition === 'Rain' || weather.condition === 'Snow') {
        riskScore += 30
        factors.push('Wet conditions')
      }
      if (weather.visibility && weather.visibility < 3) {
        riskScore += 25
        factors.push('Poor visibility')
      }
      if (weather.windSpeed > 20) {
        riskScore += 20
        factors.push('Windy conditions')
      }
      break
  }

  let level = 'Low'
  if (riskScore >= 60) level = 'High'
  else if (riskScore >= 30) level = 'Medium'

  return {
    level,
    score: Math.min(100, riskScore),
    factors
  }
}

