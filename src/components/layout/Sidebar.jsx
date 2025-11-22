import { HiOutlineMap, HiOutlineCog, HiOutlineCloud, HiExclamation, HiOutlineBookOpen } from 'react-icons/hi'

const items = [
  { key: 'hazard', label: 'Hazard Map', icon: <HiOutlineMap className="h-5 w-5" /> },
  { key: 'predict', label: 'Predict Hazards', icon: <HiOutlineCog className="h-5 w-5" /> },
  { key: 'weather', label: 'Live Weather Alerts', icon: <HiOutlineCloud className="h-5 w-5" /> },
  { key: 'report', label: 'Report a Hazard', icon: <HiExclamation className="h-5 w-5" /> },
  { key: 'resources', label: 'Safety Resources', icon: <HiOutlineBookOpen className="h-5 w-5" /> }
]

function Sidebar({ activeKey, onNavigate, onHome }) {
  return (
    <aside className="h-screen w-60 bg-[#004e89] text-white flex flex-col py-6 shadow-xl">
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
                  ? 'bg-michigan-gold text-[#004e89] shadow ring-2 ring-michigan-gold'
                  : 'hover:bg-white/10'
              }`}
              title={item.label}
            >
              <span className={`flex items-center justify-center h-8 w-8 rounded-md ${active ? 'bg-white text-[#004e89]' : 'bg-white/10'}`}>
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
