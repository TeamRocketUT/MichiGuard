import React, { useState } from 'react'
import Sidebar from './Sidebar'
import HazardMapPage from '../HazardMapPage'
import PredictHazardsPage from '../PredictHazardsPage'
import LiveWeatherAlerts from '../LiveWeatherAlerts'

// Placeholder pages
function HazardMapEmbedded() {
  return (
    <div className="p-6 h-full">
      <div className="h-full">
        <HazardMapPage embed={true} />
      </div>
    </div>
  )
}

function PredictHazardsEmbedded() {
  return (
    <div className="p-6 h-full">
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
  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#004e89]">Report a Hazard</h1>
        <div className="w-16" />
      </div>
      <form className="bg-white rounded-xl border border-gray-200 shadow p-4 max-w-lg space-y-3">
        <div>
          <label className="block text-sm font-semibold text-[#004e89]">Location</label>
          <input className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold" placeholder="Address or coordinates" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#004e89]">Type</label>
          <select className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold">
            <option>Pothole</option>
            <option>Flood</option>
            <option>Accident</option>
            <option>Ice</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#004e89]">Description</label>
          <textarea className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold" rows="3" placeholder="Optional details" />
        </div>
        <button type="button" className="bg-[#004e89] text-white font-semibold px-4 py-2 rounded-md hover:bg-[#004e89] transition-colors">Submit</button>
      </form>
    </div>
  )
}

function SafetyResourcesPlaceholder() {
  return (
    <div className="p-6">
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
      content = <HazardMapPlaceholder />
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
