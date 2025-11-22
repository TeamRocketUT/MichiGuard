import { HiHeart, HiExclamation, HiLightBulb, HiCloud, HiUserGroup, HiPhone, HiExternalLink, HiShieldCheck } from 'react-icons/hi'

function SafetyResourcesPage({ embed = false }) {

  const resources = [
    {
      id: 'emergency',
      title: 'Emergency Services',
      subtitle: 'Statewide - Life-Threatening Situations',
      icon: <HiHeart className="w-7 h-7" />,
      color: 'red',
      items: [
        { label: '911', sublabel: 'Life-threatening emergencies (police, fire, medical)', type: 'phone', value: '911' },
        { label: 'Michigan State Police Non-Emergency', sublabel: '855-MI-TROOP', type: 'phone', value: '855-648-7667' }
      ]
    },
    {
      id: 'road',
      title: 'Road & Hazard Reporting',
      subtitle: 'Michigan-specific road issues and traffic',
      icon: <HiExclamation className="w-7 h-7" />,
      color: 'orange',
      items: [
        { label: 'MDOT Report a Road Issue', sublabel: 'Call to report hazards', type: 'phone', value: '888-296-4546' },
        { label: 'MDOT MiDrive Traffic Info', sublabel: 'Live traffic and road conditions', type: 'link', value: 'https://mdotjboss.state.mi.us/MiDrive/' },
        { label: 'SOS Emergency Line', sublabel: 'Dial *77 from mobile to reach State Police', type: 'phone', value: '*77' }
      ]
    },
    {
      id: 'utilities',
      title: 'Utility Emergencies',
      subtitle: 'Power outages, gas leaks, downed lines',
      icon: <HiLightBulb className="w-7 h-7" />,
      color: 'yellow',
      items: [
        { label: 'DTE Energy Electric Outage', sublabel: 'Report power outages', type: 'phone', value: '800-477-4747' },
        { label: 'Consumers Energy Gas Emergency', sublabel: 'Report gas leaks immediately', type: 'phone', value: '800-477-5050' },
        { label: 'Downed Power Line', sublabel: 'Call 911 immediately - stay away', type: 'phone', value: '911' }
      ]
    },
    {
      id: 'weather',
      title: 'Weather & Hazard Monitoring',
      subtitle: 'Real-time alerts and forecasts',
      icon: <HiCloud className="w-7 h-7" />,
      color: 'blue',
      items: [
        { label: 'Michigan Emergency Alerts', sublabel: 'MI Ready emergency preparedness', type: 'link', value: 'https://www.michigan.gov/miready' },
        { label: 'National Weather Service Detroit', sublabel: 'Official weather forecasts and warnings', type: 'link', value: 'https://www.weather.gov/dtx/' }
      ]
    },
    {
      id: 'community',
      title: 'Community Safety Resources',
      subtitle: 'Health, poison control, community help',
      icon: <HiUserGroup className="w-7 h-7" />,
      color: 'green',
      items: [
        { label: 'Michigan 211', sublabel: 'Community help, shelter, and resources', type: 'phone', value: '211' },
        { label: 'Michigan Poison Control', sublabel: '24/7 poison emergency hotline', type: 'phone', value: '800-222-1222' },
        { label: 'Michigan Health Hotline', sublabel: 'General health information', type: 'phone', value: '888-535-6136' }
      ]
    }
  ]

  const getColorClasses = (color) => {
    const colors = {
      red: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: 'text-red-600',
        button: 'bg-red-600 hover:bg-red-700'
      },
      orange: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        icon: 'text-orange-600',
        button: 'bg-orange-600 hover:bg-orange-700'
      },
      yellow: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        icon: 'text-yellow-600',
        button: 'bg-yellow-600 hover:bg-yellow-700'
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: 'text-[#004e89]',
        button: 'bg-[#004e89] hover:bg-[#003d6b]'
      },
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        icon: 'text-green-600',
        button: 'bg-green-600 hover:bg-green-700'
      }
    }
    return colors[color] || colors.blue
  }

  return (
    // Force full-height layout and eliminate page scrolling by compressing content
    <div className="p-3 md:p-4 h-screen overflow-hidden flex flex-col">
      {/* Header (compressed) */}
      <div className="mb-2 shrink-0">
        <h1 className="text-xl md:text-2xl font-extrabold text-[#004e89] leading-tight">
          Safety Resources
        </h1>
        <p className="text-gray-600 text-xs mt-0.5">
          Essential contacts for Michigan road safety.
        </p>
      </div>

      {/* Resource Cards Grid (compressed, auto-fit columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 flex-1 overflow-hidden">
        {resources.map((section) => {
          const colorClasses = getColorClasses(section.color)

          return (
            <div
              key={section.id}
              className="bg-white rounded-lg shadow-md border border-gray-200 flex flex-col text-sm"
            >
              {/* Condensed Header */}
              <div className={`${colorClasses.bg} ${colorClasses.border} border-b px-4 py-3 flex items-center gap-3`}>                
                <div className={`${colorClasses.icon}`}>{section.icon}</div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 text-sm truncate">{section.title}</h2>
                  <p className="text-[10px] text-gray-600 truncate">{section.subtitle}</p>
                </div>
              </div>
              {/* Compact Content */}
              <div className="p-3 space-y-2 flex-1">
                {section.items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-900 truncate" title={item.label}>{item.label}</p>
                      <p className="text-[10px] text-gray-500 truncate" title={item.sublabel}>{item.sublabel}</p>
                    </div>
                    {item.type === 'phone' ? (
                      <a
                        href={`tel:${item.value}`}
                        className={`${colorClasses.button} text-white px-3 py-1.5 rounded-full text-[10px] font-bold transition shadow hover:shadow-md flex items-center gap-1`}
                        title={`Call ${item.label}`}
                      >
                        <HiPhone className="w-3.5 h-3.5" />
                        Call
                      </a>
                    ) : (
                      <a
                        href={item.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${colorClasses.button} text-white px-3 py-1.5 rounded-full text-[10px] font-bold transition shadow hover:shadow-md flex items-center gap-1`}
                        title={`Open ${item.label}`}
                      >
                        <HiExternalLink className="w-3.5 h-3.5" />
                        Visit
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {/* Footer (compressed) */}
      <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1 justify-center shrink-0">
        <HiShieldCheck className="w-3.5 h-3.5" />
        <span>Stay safe. Data not stored.</span>
      </div>
    </div>
  )
}

export default SafetyResourcesPage
