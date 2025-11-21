import { useState } from 'react'
import './App.css'
import HazardMapPage from './components/HazardMapPage'
import PredictHazardsPage from './components/PredictHazardsPage'

function App() {
  const [showFeatures, setShowFeatures] = useState(false)
  const [showMapPage, setShowMapPage] = useState(false)
  const [location, setLocation] = useState(null)
  const [locationError, setLocationError] = useState(null)
  const [showPredictPage, setShowPredictPage] = useState(false)

  const handleGetStarted = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
          setShowFeatures(true)
        },
        (error) => {
          setLocationError(error.message)
          // Still show features page even if location fails
          setShowFeatures(true)
        }
      )
    } else {
      setLocationError('Geolocation is not supported by your browser')
      setShowFeatures(true)
    }
  }

  return (
    <>
      {/* Show Map Page */}
      {showMapPage && (
        <HazardMapPage 
          userLocation={location}
          onBack={() => setShowMapPage(false)}
        />
      )}

      {/* Show Predict Hazards Page */}
      {showPredictPage && (
        <PredictHazardsPage 
          onBack={() => setShowPredictPage(false)}
        />
      )}

      {/* Landing Page */}
      <div 
        className={`fixed inset-0 flex flex-col items-center justify-center transition-transform duration-1000 ease-in-out ${
          showFeatures ? '-translate-y-full' : 'translate-y-0'
        } ${showMapPage || showPredictPage ? 'hidden' : ''}`}
      >
        {/* Background Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070')`
          }}
        ></div>
        <div className="absolute inset-0 bg-michigan-blue opacity-75"></div>
        
        {/* Content */}
        <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-michigan-gold mb-8">
            MichiGuard
          </h1>
          <p className="text-xl sm:text-2xl text-white leading-relaxed mb-12 max-w-3xl mx-auto font-medium">
            MichiGuard is an AI-powered trail safety platform that predicts hazards, delivers real-time weather alerts, and crowdsources danger reports to keep Michigan's roads and pathways safe.
          </p>
          <button 
            onClick={handleGetStarted}
            className="animate-float bg-michigan-gold text-white px-8 py-3 rounded-full text-lg font-bold hover:bg-orange-400 transform hover:scale-105 transition-all duration-200 shadow-2xl hover:shadow-[0_0_30px_rgba(246,189,96,0.8)]"
            style={{ boxShadow: '0 0 20px rgba(246, 189, 96, 0.6)' }}
          >
            Get Started
          </button>
        </div>
      </div>

      {/* Features Page */}
      <div 
        className={`fixed inset-0 bg-[#457b9d] transition-transform duration-1000 ease-in-out ${
          showFeatures ? 'translate-y-0' : 'translate-y-full'
        } ${showMapPage || showPredictPage ? 'hidden' : ''}`}
      >
        {/* Navigation Bar */}
        <nav className="bg-michigan-blue shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <button 
                  onClick={() => setShowFeatures(false)}
                  className="text-2xl sm:text-3xl font-bold text-michigan-gold hover:text-teal-400 transition-colors duration-200 cursor-pointer"
                >
                  MichiGuard
                </button>
              </div>
              
              <div className="hidden md:flex space-x-8">
                <a href="#trails" className="text-white hover:text-michigan-gold transition-colors duration-200 font-medium">
                  Trails
                </a>
                <a href="#safety" className="text-white hover:text-michigan-gold transition-colors duration-200 font-medium">
                  Safety Score
                </a>
                <a href="#profile" className="text-white hover:text-michigan-gold transition-colors duration-200 font-medium">
                  Profile
                </a>
              </div>

              <div className="md:hidden">
                <button className="text-white hover:text-michigan-gold">
                  <svg className="h-6 w-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M4 6h16M4 12h16M4 18h16"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Dashboard Content */}
        <div className="h-[calc(100vh-4rem)] overflow-y-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-6xl w-full mx-auto">
            {/* Dashboard Header */}
            <div className="text-center mb-12">
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-3">
                Your Safety Dashboard
              </h2>
              <p className="text-lg text-gray-100">
                Select a feature to begin
              </p>
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* Hazard Map */}
              <button
                onClick={() => setShowMapPage(true)}
                className="bg-white hover:bg-gray-50 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-8 text-center group border-2 border-transparent hover:border-michigan-gold"
              >
                <div className="flex justify-center mb-4">
                  <div className="bg-michigan-blue rounded-full p-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="h-12 w-12 text-michigan-gold" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-michigan-blue mb-2">
                  Hazard Map
                </h3>
                <p className="text-gray-600 text-sm">
                  View real-time hazards in your area
                </p>
              </button>

              {/* Live Weather Alerts */}
              <button
                onClick={() => window.location.href = '/weather'}
                className="bg-white hover:bg-gray-50 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-8 text-center group border-2 border-transparent hover:border-michigan-gold"
              >
                <div className="flex justify-center mb-4">
                  <div className="bg-michigan-blue rounded-full p-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="h-12 w-12 text-michigan-gold" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-michigan-blue mb-2">
                  Live Weather Alerts
                </h3>
                <p className="text-gray-600 text-sm">
                  Get real-time weather updates
                </p>
              </button>

              {/* Predict Hazard Risk */}
              <button
                onClick={() => setShowPredictPage(true)}
                className="bg-white hover:bg-gray-50 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-8 text-center group border-2 border-transparent hover:border-michigan-gold"
              >
                <div className="flex justify-center mb-4">
                  <div className="bg-michigan-blue rounded-full p-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="h-12 w-12 text-michigan-gold" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-michigan-blue mb-2">
                  Predict Hazard Risk
                </h3>
                <p className="text-gray-600 text-sm">
                  AI-powered risk assessment
                </p>
              </button>

              {/* Report a Hazard */}
              <button
                onClick={() => window.location.href = '/report'}
                className="bg-white hover:bg-gray-50 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-8 text-center group border-2 border-transparent hover:border-michigan-gold"
              >
                <div className="flex justify-center mb-4">
                  <div className="bg-michigan-blue rounded-full p-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="h-12 w-12 text-michigan-gold" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-michigan-blue mb-2">
                  Report a Hazard
                </h3>
                <p className="text-gray-600 text-sm">
                  Help others stay safe
                </p>
              </button>

              {/* Safe Route Suggestions */}
              <button
                onClick={() => window.location.href = '/routes'}
                className="bg-white hover:bg-gray-50 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-8 text-center group border-2 border-transparent hover:border-michigan-gold"
              >
                <div className="flex justify-center mb-4">
                  <div className="bg-michigan-blue rounded-full p-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="h-12 w-12 text-michigan-gold" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-michigan-blue mb-2">
                  Safe Route Suggestions
                </h3>
                <p className="text-gray-600 text-sm">
                  Find the safest path
                </p>
              </button>

              {/* Emergency Info */}
              <button
                onClick={() => window.location.href = '/emergency'}
                className="bg-white hover:bg-gray-50 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-8 text-center group border-2 border-transparent hover:border-michigan-gold"
              >
                <div className="flex justify-center mb-4">
                  <div className="bg-michigan-blue rounded-full p-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="h-12 w-12 text-michigan-gold" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-michigan-blue mb-2">
                  Emergency Info
                </h3>
                <p className="text-gray-600 text-sm">
                  Quick access to help
                </p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
