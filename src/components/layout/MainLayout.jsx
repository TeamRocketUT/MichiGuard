import { useState } from 'react'
import Sidebar from './Sidebar'
import HazardMapPage from '../HazardMapPage'
import PredictHazardsPage from '../PredictHazardsPage'
import LiveWeatherAlerts from '../LiveWeatherAlerts'
import ReportHazardPage from '../ReportHazardPage'
import SafetyResourcesPage from '../SafetyResourcesPage'

function MainLayout({ initialSection = 'hazard', onHome, embedded = false }) {
  const [active, setActive] = useState(initialSection)

  let content = null
  switch (active) {
    case 'hazard':
      content = <HazardMapPage embed={true} />
      break
    case 'predict':
      content = <PredictHazardsPage embed={true} />
      break
    case 'weather':
      content = <LiveWeatherAlerts embed={true} />
      break
    case 'report':
      content = <ReportHazardPage embed={true} />
      break
    case 'resources':
      content = <SafetyResourcesPage embed={true} />
      break
    default:
      content = <HazardMapPage embed={true} />
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
