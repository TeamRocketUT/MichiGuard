import React from 'react'
import MobileAppPreview from './MobileAppPreview'

// Placeholder hazard preview content; replace with your real component logic as needed.
export const MobileHazardPreview = () => {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-lg font-semibold text-[#004e89] tracking-tight">Report Hazard</h2>
      <p className="text-xs text-gray-600 leading-relaxed">
        Quickly describe a roadway, weather, or safety issue. Our AI assists classification before submission.
      </p>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-gray-700">Description</label>
        <textarea
          rows={4}
          placeholder="E.g. Fallen tree blocking right lane near I-94 exit..."
          className="w-full text-xs rounded-xl border border-gray-300 focus:border-[#004e89] focus:ring-2 focus:ring-[#004e89]/30 outline-none p-2 resize-none bg-white"
        />
        <button
          type="button"
          className="w-full bg-gradient-to-r from-[#004e89] to-[#006bb3] text-white text-xs font-semibold tracking-wide py-2 rounded-full shadow hover:shadow-md transition"
        >
          Analyze Hazard
        </button>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1">
        <p className="text-[10px] text-gray-500">AI Preview (sample)</p>
        <p className="text-[11px] text-gray-700 line-clamp-3">
          Type: Weather / Obstruction. Confidence High. Suggest detour signage.
        </p>
      </div>
    </div>
  )
}

// Mobile preview frame component
// Renders a realistic phone mockup with an inner screen containing hazard preview.
const MobilePreview = ({ children }) => {
  return (
    <div className="w-full flex justify-center py-8">
      <div className="relative" style={{ width: 340 }}>
        {/* Outer phone frame */}
        <div
          className="bg-black shadow-2xl ring-1 ring-black/40 mx-auto"
          style={{
            borderRadius: '40px',
            padding: '14px',
            width: '340px',
            height: '680px',
            boxShadow: '0 8px 24px -6px rgba(0,0,0,0.35), 0 4px 12px -4px rgba(0,0,0,0.25)'
          }}
        >
          {/* Speaker notch */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{ top: 10 }}
          >
            <div
              className="bg-gray-800"
              style={{
                width: '90px',
                height: '14px',
                borderRadius: '8px'
              }}
            />
          </div>
          {/* Inner screen */}
          <div
            className="bg-white overflow-hidden"
            style={{
              borderRadius: '30px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Safe area simulation */}
            <div className="pt-6 h-full flex flex-col">
              <div className="flex-1 overflow-y-auto custom-scrollbar">{children || <MobileAppPreview />}</div>
            </div>
          </div>
        </div>
        {/* Subtle reflection / highlight (optional aesthetic) */}
        <div className="pointer-events-none absolute inset-0" style={{ borderRadius: '40px' }}>
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 60%)',
            borderRadius: '40px'
          }} />
        </div>
      </div>
    </div>
  )
}

export default MobilePreview

/*
Usage Example:
-------------
1. Import into a page/component (e.g. `ReportHazardPage.jsx`).

import MobilePreview from './MobilePreview'

// Inside JSX:
<div className="mt-10">
  <MobilePreview />
</div>

// Or provide custom children instead of placeholder:
<MobilePreview>
  <YourHazardFormComponent />
</MobilePreview>

Styling Notes:
- All sizing is fixed for realism; wrap in responsive containers if needed.
- Outer frame uses inline radius (40px) & inner screen 30px per requirement.
- Replace placeholder content with live hazard reporting logic as desired.
*/
