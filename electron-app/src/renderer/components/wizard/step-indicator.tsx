import type { WizardStep } from '../../types';

interface StepIndicatorProps {
  currentStep: WizardStep;
}

const steps = [
  { number: 1, label: 'Backup source' },
  { number: 2, label: 'Contact' },
  { number: 3, label: 'Date range' },
  { number: 4, label: 'Export' },
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="mb-8 flex items-start justify-center">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-start">
          {/* Step column */}
          <div className="flex w-24 flex-col items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step.number < currentStep ? 'bg-sky-500 text-white' : step.number === currentStep ? 'bg-sky-500 text-white ring-4 ring-sky-200' : 'bg-slate-200 text-slate-500'
              }`}>
              {step.number < currentStep ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.number
              )}
            </div>
            <span className={`mt-2 text-center text-xs font-medium ${step.number <= currentStep ? 'text-slate-700' : 'text-slate-400'}`}>{step.label}</span>
          </div>
          {/* Connector line - positioned at circle center height */}
          {index < steps.length - 1 && <div className={`-mx-7 mt-5 h-0.5 w-14 ${step.number < currentStep ? 'bg-sky-500' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );
}
