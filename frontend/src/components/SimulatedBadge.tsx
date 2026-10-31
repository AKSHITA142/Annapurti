export function SimulatedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 select-none ${className}`}
      title="This metric or entity is simulated for MVP evaluation"
    >
      simulated
    </span>
  )
}

