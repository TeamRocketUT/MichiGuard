import React from 'react'

const items = [
  { key: 'hazard', label: 'Hazard Map', icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  )},
  { key: 'predict', label: 'Predict Hazards', icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c0 .65.26 1.27.73 1.73.46.47 1.08.74 1.73.74H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )},
  { key: 'weather', label: 'Live Weather Alerts', icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  )},
  { key: 'report', label: 'Report a Hazard', icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )},
  { key: 'resources', label: 'Safety Resources', icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M4 19.5A2.5 2.5 0 006.5 22h11a2.5 2.5 0 002.5-2.5V6a2 2 0 00-2-2h-11a2 2 0 00-2 2z" />
    </svg>
  )}
]

function Sidebar({ activeKey, onNavigate, onHome }) {
  return (
    <aside className="h-screen w-60 bg-[#00274C] text-white flex flex-col py-6 shadow-xl">
      <button
        className="px-5 pb-6 text-left group"
        onClick={() => onHome && onHome()}
        title="Back to Get Started"
      >
        <div className="text-lg font-extrabold tracking-wide group-hover:text-michigan-gold transition-colors">MichiGuard</div>
        <div className="text-[11px] text-michigan-gold font-semibold">Safety Assistant</div>
      </button>
      <nav className="flex-1 space-y-2 px-3">
        {items.map((item) => {
          const active = activeKey === item.key
          return (
            <button
              key={item.key}
              onClick={() => onNavigate?.(item.key)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition group text-left ${
                active
                  ? 'bg-michigan-gold text-[#00274C] shadow ring-2 ring-michigan-gold'
                  : 'hover:bg-white/10'
              }`}
              title={item.label}
            >
              <span className={`flex items-center justify-center h-8 w-8 rounded-md ${active ? 'bg-white text-[#00274C]' : 'bg-white/10'}`}>
                {item.icon}
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="px-5 pt-4 text-[10px] text-white/60">© {new Date().getFullYear()} MichiGuard</div>
    </aside>
  )
}

export default Sidebar
