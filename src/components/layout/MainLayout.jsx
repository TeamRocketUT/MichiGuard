import React, { useState } from 'react'
import Sidebar from './Sidebar'
import HazardMapPage from '../HazardMapPage'
import PredictHazardsPage from '../PredictHazardsPage'
import LiveWeatherAlerts from '../LiveWeatherAlerts'

// Placeholder pages
function HazardMapEmbedded() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow overflow-hidden min-h-[560px]">
        <HazardMapPage embed={true} />
      </div>
    </div>
  )
}

function PredictHazardsEmbedded() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow overflow-hidden min-h-[560px]">
        <PredictHazardsPage embed={true} />
      </div>
    </div>
  )
}

function WeatherAlertsPlaceholder() {
  return <LiveWeatherAlerts />
}

function ReportHazardPlaceholder() {
  return (
    <div className="p-6">
      <h1 className="text-2xl md:text-3xl font-extrabold text-[#00274C] mb-4">Report a Hazard</h1>
      <form className="bg-white rounded-xl border border-gray-200 shadow p-4 max-w-lg space-y-3">
        <div>
          <label className="block text-sm font-semibold text-[#00274C]">Location</label>
          <input className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold" placeholder="Address or coordinates" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#00274C]">Type</label>
          <select className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold">
            <option>Pothole</option>
            <option>Flood</option>
            <option>Accident</option>
            <option>Ice</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#00274C]">Description</label>
          <textarea className="mt-1 w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-michigan-gold" rows="3" placeholder="Optional details" />
        </div>
        <button type="button" className="bg-[#00274C] text-white font-semibold px-4 py-2 rounded-md hover:bg-[#1d3557] transition-colors">Submit</button>
      </form>
    </div>
  )
}

function SafetyResourcesPlaceholder() {
  return (
    <div className="p-6">
      <h1 className="text-2xl md:text-3xl font-extrabold text-[#00274C] mb-2">Safety Resources</h1>
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
    <div className="h-screen w-screen flex bg-gray-100">
      <Sidebar activeKey={active} onNavigate={setActive} onHome={onHome} />
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div className="text-[#00274C] font-bold">{active === 'hazard' ? 'Hazard Map' :
            active === 'predict' ? 'Predict Hazards' :
            active === 'weather' ? 'Live Weather Alerts' :
            active === 'report' ? 'Report a Hazard' : 'Safety Resources'}</div>
          <div className="w-10" />
        </div>
        {content}
      </main>
    </div>
  )
}

export default MainLayout
