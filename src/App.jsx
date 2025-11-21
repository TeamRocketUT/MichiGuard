import { useState } from 'react'
import './App.css'
import MainLayout from './components/layout/MainLayout'

function App() {
  const [location, setLocation] = useState(null)
  const [locationError, setLocationError] = useState(null)
  const [showMainLayout, setShowMainLayout] = useState(false)

  const handleGetStarted = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
          setShowMainLayout(true)
        },
        (error) => {
          setLocationError(error.message)
          setShowMainLayout(true)
        }
      )
    } else {
      setLocationError('Geolocation is not supported by your browser')
      setShowMainLayout(true)
    }
  }

  if (showMainLayout) {
    return <MainLayout initialSection="hazard" onHome={() => setShowMainLayout(false)} />
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center">
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
        {locationError && (
          <p className="mt-4 text-sm text-red-100">{locationError}</p>
        )}
      </div>
    </div>
  )
}

export default App
