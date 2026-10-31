import { Truck, X } from 'lucide-react'
import { SimulatedBadge } from './SimulatedBadge'

interface QRCodeModalProps {
  jobId: number
  otpCode: string
  status: string
  onClose: () => void
}

export function QRCodeModal({ jobId, otpCode, status, onClose }: QRCodeModalProps) {
  const steps = [
    { key: 'assigned', label: 'Assigned' },
    { key: 'collected', label: 'Collected' },
    { key: 'in_transit', label: 'In Transit' },
    { key: 'delivered', label: 'Delivered' },
  ]

  const currentIdx = steps.findIndex((s) => s.key === status)
  const activeStepIdx = currentIdx >= 0 ? currentIdx : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold p-1 rounded-full hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-center space-x-2 mb-1">
          <Truck className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900">Delivery Job #{jobId}</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Verification Handover Pass</p>

        {/* QR Code SVG Visual */}
        <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 inline-block shadow-xs mb-4">
          <svg
            className="w-40 h-40 mx-auto"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Top-Left Finder */}
            <rect x="10" y="10" width="30" height="30" rx="4" fill="#0f172a" />
            <rect x="15" y="15" width="20" height="20" rx="2" fill="#ffffff" />
            <rect x="20" y="20" width="10" height="10" rx="1" fill="#0f172a" />

            {/* Top-Right Finder */}
            <rect x="80" y="10" width="30" height="30" rx="4" fill="#0f172a" />
            <rect x="85" y="15" width="20" height="20" rx="2" fill="#ffffff" />
            <rect x="90" y="20" width="10" height="10" rx="1" fill="#0f172a" />

            {/* Bottom-Left Finder */}
            <rect x="10" y="80" width="30" height="30" rx="4" fill="#0f172a" />
            <rect x="15" y="85" width="20" height="20" rx="2" fill="#ffffff" />
            <rect x="20" y="90" width="10" height="10" rx="1" fill="#0f172a" />

            {/* Random Matrix Modules encoding Job & OTP */}
            <rect x="48" y="12" width="6" height="6" fill="#0f172a" />
            <rect x="60" y="12" width="6" height="6" fill="#0f172a" />
            <rect x="52" y="24" width="8" height="8" fill="#2563eb" />
            <rect x="66" y="24" width="6" height="6" fill="#0f172a" />
            <rect x="48" y="38" width="6" height="6" fill="#0f172a" />
            <rect x="12" y="52" width="8" height="8" fill="#0f172a" />
            <rect x="28" y="56" width="6" height="6" fill="#0f172a" />
            <rect x="48" y="54" width="24" height="24" rx="4" fill="#059669" />
            <rect x="54" y="60" width="12" height="12" rx="2" fill="#ffffff" />
            <rect x="84" y="50" width="8" height="8" fill="#0f172a" />
            <rect x="98" y="58" width="8" height="8" fill="#2563eb" />
            <rect x="48" y="88" width="8" height="8" fill="#0f172a" />
            <rect x="64" y="84" width="8" height="8" fill="#0f172a" />
            <rect x="80" y="88" width="8" height="8" fill="#0f172a" />
            <rect x="94" y="94" width="14" height="14" rx="2" fill="#0f172a" />
          </svg>
        </div>

        {/* 6-Digit OTP */}
        <div className="mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Handover OTP Code
          </span>
          <span className="inline-block px-4 py-1.5 rounded-xl bg-blue-50 text-blue-700 font-mono text-2xl font-black tracking-widest border border-blue-200">
            {otpCode}
          </span>
        </div>

        {/* Status Timeline */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs">
            {steps.map((s, idx) => {
              const isPast = idx < activeStepIdx
              const isCurrent = idx === activeStepIdx
              return (
                <div key={s.key} className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mb-1 ${
                      isPast
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`text-[10px] font-medium capitalize ${
                      isCurrent ? 'text-blue-600 font-bold' : isPast ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4 pt-2 flex items-center justify-center space-x-1">
          <SimulatedBadge />
        </div>
      </div>
    </div>
  )
}
