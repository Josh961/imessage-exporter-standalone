import { useState } from 'react';
import { useWizard } from '../../context/wizard-context';

function isValidDate(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateString;
}

export function Step3DateRange() {
  const { state, setStartDate, setEndDate, nextStep, prevStep } = useWizard();
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    setError(null);

    if (!state.startDate) {
      setError('Start date is required');
      return;
    }

    if (!isValidDate(state.startDate)) {
      setError('Invalid start date');
      return;
    }

    if (state.endDate && !isValidDate(state.endDate)) {
      setError('Invalid end date');
      return;
    }

    if (state.startDate && state.endDate && new Date(state.startDate) > new Date(state.endDate)) {
      setError('Start date cannot be after end date');
      return;
    }

    nextStep();
  };

  const getContactName = (): string => {
    if (!state.selectedContact) return '';
    return state.selectedContact.displayName || state.selectedContact.contact;
  };

  const getSuggestedDateRange = () => {
    if (!state.selectedContact) return null;
    return {
      first: state.selectedContact.firstMessageDate,
      last: state.selectedContact.lastMessageDate,
    };
  };

  const suggestedRange = getSuggestedDateRange();

  const formatSuggestedDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleUseFirstDate = () => {
    if (suggestedRange?.first) {
      const date = new Date(suggestedRange.first);
      setStartDate(date.toISOString().slice(0, 10));
    }
  };

  return (
    <div className="rounded-3xl bg-white p-8 shadow-md">
      <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">Select date range</h2>
      <p className="mb-6 text-center text-slate-600">
        Choose the time period for messages with <span className="font-medium text-slate-800">{getContactName()}</span>.
      </p>

      {suggestedRange && suggestedRange.first && suggestedRange.last && (
        <div className="mb-6 rounded-xl bg-sky-50 p-4 text-center text-sm text-sky-700">
          Messages available from {formatSuggestedDate(suggestedRange.first)} to {formatSuggestedDate(suggestedRange.last)}
        </div>
      )}

      {error && <div className="mb-6 rounded-xl bg-red-50 p-4 text-center text-red-700">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Start date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={state.startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {suggestedRange?.first && (
            <button onClick={handleUseFirstDate} className="mt-2 text-sm text-sky-600 hover:text-sky-700 hover:underline">
              Use earliest date ({formatSuggestedDate(suggestedRange.first)})
            </button>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            End date <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="date"
            value={state.endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="mt-2 text-sm text-slate-500">Leave empty to export up to today.</p>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={prevStep} className="flex-1 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50">
          Back
        </button>
        <button onClick={handleNext} className="flex-1 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white transition-all hover:bg-sky-600">
          Continue
        </button>
      </div>
    </div>
  );
}
