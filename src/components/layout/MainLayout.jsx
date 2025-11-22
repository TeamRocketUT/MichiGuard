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

function MainLayout({ initialSection = 'hazard', onHome, embedded = false }) {
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
