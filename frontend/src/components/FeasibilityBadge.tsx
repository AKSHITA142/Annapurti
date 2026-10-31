import { CheckCircle2, Clock, XCircle } from 'lucide-react'

interface FeasibilityBadgeProps {
  badge?: 'feasible' | 'tight' | 'infeasible'
  slackMinutes?: number
  showSlack?: boolean
}

export function FeasibilityBadge({
  badge = 'feasible',
  slackMinutes,
  showSlack = true,
}: FeasibilityBadgeProps) {
  if (badge === 'feasible') {
    return (
      <span
        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200"
        title={slackMinutes !== undefined ? `Feasible route with ${slackMinutes} min safety buffer` : 'Feasible route'}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span>Feasible</span>
        {showSlack && slackMinutes !== undefined && slackMinutes > 0 && (
          <span className="text-[11px] font-normal text-emerald-700">({slackMinutes}m slack)</span>
        )}
      </span>
    )
  }

  if (badge === 'tight') {
    return (
      <span
        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200"
        title={slackMinutes !== undefined ? `Tight: Only ${slackMinutes} min safety margin` : 'Tight delivery window'}
      >
        <Clock className="w-3.5 h-3.5 text-amber-600" />
        <span>Tight</span>
        {showSlack && slackMinutes !== undefined && (
          <span className="text-[11px] font-normal text-amber-700">({slackMinutes}m slack)</span>
        )}
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200"
      title="Infeasible: Cannot meet perishable safety deadline or outside operating hours"
    >
      <XCircle className="w-3.5 h-3.5 text-rose-600" />
      <span>Infeasible</span>
      {showSlack && slackMinutes !== undefined && (
        <span className="text-[11px] font-normal text-rose-700">({slackMinutes}m)</span>
      )}
    </span>
  )
}

