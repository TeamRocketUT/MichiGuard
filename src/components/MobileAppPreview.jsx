import React, { useState } from 'react'
import MainLayout from './layout/MainLayout'

// Mobile-specific lightweight app shell for previewing full flow inside phone frame
const MobileAppPreview = () => {
  const [showMainLayout, setShowMainLayout] = useState(false)
  const [locationError, setLocationError] = useState(null)

  const handleGetStarted = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // We could store location if needed; omitted for brevity in preview
          setShowMainLayout(true)
        },
        (error) => {
          setLocationError(error.message)
          setShowMainLayout(true)
        }
      )
    } else {
      setLocationError('Geolocation unsupported')
      setShowMainLayout(true)
    }
  }

  if (showMainLayout) {
    return <MainLayout initialSection="hazard" onHome={() => setShowMainLayout(false)} mobile embedded />
  }

  return (
    <div className="relative h-full flex flex-col items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-br from-[#004e89] via-[#005f9f] to-[#0072b8]" />
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 px-5 text-center space-y-5">
        <h1 className="text-3xl font-black text-white tracking-tight">MichiGuard</h1>
        <p className="text-[11px] text-white/80 leading-relaxed">
          AI-powered Michigan safety companion. Predict hazards, view alerts, and report issues—all in one mobile interface.
        </p>
        <button
          onClick={handleGetStarted}
          className="w-full bg-michigan-gold text-[#004e89] py-2.5 rounded-full text-sm font-bold shadow-lg hover:shadow-xl hover:bg-orange-400 transition-all"
        >
          Get Started
        </button>
        {locationError && (
          <p className="text-[10px] text-red-100">{locationError}</p>
        )}
        <p className="text-[9px] text-white/50 pt-2">Preview build • Data session ephemeral</p>
      </div>
    </div>
  )
}

export default MobileAppPreview