import React, { useState } from 'react'
import Sidebar from './Sidebar'
import HazardMapPage from '../HazardMapPage'
import PredictHazardsPage from '../PredictHazardsPage'
import LiveWeatherAlerts from '../LiveWeatherAlerts'
import ReportHazardPage from '../ReportHazardPage'
import SafetyResourcesPage from '../SafetyResourcesPage'

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

function MainLayout({ initialSection = 'hazard', onHome, mobile = false, embedded = false }) {
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
      content = <ReportHazardPage embed={true} />
      break
    case 'resources':
      content = <SafetyResourcesPage embed={true} />
      break
    default:
      content = <HazardMapEmbedded />
  }

  if (mobile) {
    // Mobile embedded layout (for phone frame): vertical stack + bottom nav
    const mobileItems = [
      { key: 'hazard', label: 'Map', icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )},
      { key: 'predict', label: 'Predict', icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c0 .65.26 1.27.73 1.73.46.47 1.08.74 1.73.74H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      )},
      { key: 'weather', label: 'Weather', icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      )},
      { key: 'report', label: 'Report', icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )},
      { key: 'resources', label: 'Resources', icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M4 19.5A2.5 2.5 0 006.5 22h11a2.5 2.5 0 002.5-2.5V6a2 2 0 00-2-2h-11a2 2 0 00-2 2z" />
        </svg>
      )}
    ]

    return (
      <div className="flex flex-col h-full w-full bg-[#cbeef3]">
        <div className="flex-1 overflow-y-auto min-h-0">
          {content}
        </div>
        <nav className="grid grid-cols-5 bg-[#004e89] text-white border-t border-[#004e89]/40">
          {mobileItems.map(mi => {
            const activeMi = active === mi.key
            return (
              <button
                key={mi.key}
                onClick={() => setActive(mi.key)}
                className={`flex flex-col items-center justify-center py-1.5 text-[9px] font-semibold gap-0.5 transition ${activeMi ? 'bg-michigan-gold text-[#004e89]' : 'hover:bg-white/10'}`}
                title={mi.label}
              >
                <span className={`h-6 w-6 flex items-center justify-center rounded-md ${activeMi ? 'bg-white text-[#004e89]' : 'bg-white/10'}`}>{mi.icon}</span>
                <span className="truncate w-full text-center">{mi.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    )
  }

  // Desktop / full layout
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
