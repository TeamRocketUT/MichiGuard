import React, { useState } from 'react'

function SafetyResourcesPage({ embed = false }) {
  const [expandedSection, setExpandedSection] = useState(null)

  const toggleSection = (sectionId) => {
    setExpandedSection(expandedSection === sectionId ? null : sectionId)
  }

  const resources = [
    {
      id: 'emergency',
      title: 'Emergency Services',
      subtitle: 'Statewide - Life-Threatening Situations',
      icon: (
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
        </svg>
      ),
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
      icon: (
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
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
      icon: (
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
        </svg>
      ),
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
      icon: (
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
        </svg>
      ),
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
      icon: (
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
      ),
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
          const isExpanded = expandedSection === section.id

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
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
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
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
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
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span>Stay safe. Data not stored.</span>
      </div>
    </div>
  )
}

export default SafetyResourcesPage
