import type { ExportStep } from "../lib/export-phase";

interface ExportStepsProps {
  steps: ExportStep[];
}

const BADGE_CLASSES: Record<ExportStep["status"], string> = {
  done: "bg-green-100 text-green-700",
  active: "bg-sky-500 text-white ring-4 ring-sky-100",
  pending: "bg-slate-100 text-slate-400",
};

const LABEL_CLASSES: Record<ExportStep["status"], string> = {
  done: "text-slate-500",
  active: "font-semibold text-slate-800",
  pending: "text-slate-400",
};

export function ExportSteps({ steps }: ExportStepsProps) {
  return (
    <ol
      className="mb-6 flex flex-wrap items-center justify-center gap-y-2"
      aria-label="Export steps"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          className="flex items-center"
          aria-current={step.status === "active" ? "step" : undefined}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 ${BADGE_CLASSES[step.status]}`}
            aria-hidden="true"
          >
            {step.status === "done" ? (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          <span
            className={`ml-2 text-sm transition-colors duration-300 ${LABEL_CLASSES[step.status]}`}
          >
            {step.label}
            {step.status === "done" && <span className="sr-only"> (done)</span>}
          </span>
          {index < steps.length - 1 && (
            <span
              className={`mx-3 h-px w-8 transition-colors duration-300 ${
                step.status === "done" ? "bg-green-300" : "bg-slate-200"
              }`}
              aria-hidden="true"
            />
          )}
        </li>
      ))}
    </ol>
  );
}
