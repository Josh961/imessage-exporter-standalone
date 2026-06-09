import { useState } from "react";
import { useLocalStorage } from "../hooks/use-local-storage";

export function DevControls() {
  const [open, setOpen] = useState(false);
  const [simulateNoChatMatch, setSimulateNoChatMatch] = useLocalStorage(
    "simulateNoChatMatch",
    false,
  );
  const [simulateEncryptedBackup, setSimulateEncryptedBackup] = useLocalStorage(
    "simulateEncryptedBackup",
    false,
  );

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="w-72 rounded-lg border border-amber-200 bg-white p-4 text-sm shadow-xl ring-1 ring-slate-950/5">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold text-slate-800">Dev controls</div>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              DEV
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-700">No-chat fallback</div>
                <p className="text-xs text-slate-500">Force the recovery screen on export.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={simulateNoChatMatch}
                aria-label="Toggle no-chat fallback simulation"
                onClick={() => setSimulateNoChatMatch(!simulateNoChatMatch)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${simulateNoChatMatch ? "bg-amber-500" : "bg-slate-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${simulateNoChatMatch ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-700">Encrypted backup prompt</div>
                <p className="text-xs text-slate-500">Ask for a backup password on first load.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={simulateEncryptedBackup}
                aria-label="Toggle encrypted backup simulation"
                onClick={() => setSimulateEncryptedBackup(!simulateEncryptedBackup)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${simulateEncryptedBackup ? "bg-amber-500" : "bg-slate-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${simulateEncryptedBackup ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={open ? "Close developer controls" : "Open developer controls"}
        onClick={() => setOpen(!open)}
        className="flex h-11 min-w-11 items-center justify-center rounded-full border border-amber-300 bg-amber-400 px-3 text-xs font-bold text-amber-950 shadow-lg transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
      >
        DEV
      </button>
    </div>
  );
}
