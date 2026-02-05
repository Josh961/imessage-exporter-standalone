interface ProgressBarProps {
  percentage: number;
  text: string;
}

export function ProgressBar({ percentage, text }: ProgressBarProps) {
  const pct = Math.round(Math.min(100, Math.max(0, percentage)));

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-slate-600">{text}</span>
        <span className="text-sm font-medium text-slate-700">{pct}%</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200">
        {/* Animated stripes background */}
        <div
          className="absolute inset-0 animate-[stripe_1s_linear_infinite]"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(209, 213, 219, 0.5) 10px, rgba(209, 213, 219, 0.5) 20px)',
            backgroundSize: '28px 28px',
          }}
        />
        {/* Progress fill */}
        <div className="relative h-full rounded-full bg-sky-500 transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
