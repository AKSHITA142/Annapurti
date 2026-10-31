import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, ShieldAlert, ShieldCheck } from 'lucide-react'

interface SpoilageCountdownProps {
  safeDeadline: string
  compact?: boolean
}

export function SpoilageCountdown({ safeDeadline, compact = false }: SpoilageCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number
    minutes: number
    seconds: number
    totalSeconds: number
    isExpired: boolean
  }>({ hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isExpired: false })

  useEffect(() => {
    function calculate() {
      const target = new Date(safeDeadline).getTime()
      const now = Date.now()
      const diff = Math.floor((target - now) / 1000)

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isExpired: true })
      } else {
        const hours = Math.floor(diff / 3600)
        const minutes = Math.floor((diff % 3600) / 60)
        const seconds = diff % 60
        setTimeLeft({ hours, minutes, seconds, totalSeconds: diff, isExpired: false })
      }
    }

    calculate()
    const interval = setInterval(calculate, 1000)
    return () => clearInterval(interval)
  }, [safeDeadline])

  const totalMinutes = Math.floor(timeLeft.totalSeconds / 60)

  if (timeLeft.isExpired) {
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
        <span>Spoiled / Past Deadline</span>
      </span>
    )
  }

  // Red / Urgent: < 1 hour (< 60 mins)
  if (totalMinutes < 60) {
    const isPulsing = totalMinutes < 30
    return (
      <span
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 ${
          isPulsing ? 'animate-pulse' : ''
        }`}
        title="Red threshold: Under 1 hour safe consumption window remaining"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
        <span>
          {compact ? '' : 'Urgent (<1h): '}
          {timeLeft.hours > 0 ? `${timeLeft.hours}h ` : ''}
          {timeLeft.minutes}m {timeLeft.seconds}s
        </span>
      </span>
    )
  }

  // Amber / Caution: 1 to 2 hours (60 - 120 mins)
  if (totalMinutes < 120) {
    return (
      <span
        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300"
        title="Amber threshold: 1 to 2 hours remaining"
      >
        <Clock className="w-3.5 h-3.5 text-amber-600" />
        <span>
          {compact ? '' : 'Caution (1-2h): '}
          {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
        </span>
      </span>
    )
  }

  // Green / Safe: Over 2 hours (>= 120 mins)
  return (
    <span
      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
      title="Green threshold: Safe window over 2 hours"
    >
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
      <span>
        {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
      </span>
    </span>
  )
}

