import { FormEvent, useState } from "react";

interface BackupPasswordModalProps {
  backupName?: string;
  error?: string | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void | Promise<void>;
}

export function BackupPasswordModal({
  backupName,
  error,
  loading = false,
  onCancel,
  onSubmit,
}: BackupPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setValidationError("Enter the backup password.");
      return;
    }
    setValidationError(null);
    await onSubmit(password);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-xl font-semibold text-slate-800">Encrypted backup</h2>
        <p className="mb-5 text-sm text-slate-600">
          Enter the password for {backupName || "this iPhone backup"}. It is used only to unlock
          this backup and is not saved.
        </p>

        <label htmlFor="backup-password" className="mb-2 block text-sm font-medium text-slate-700">
          Backup password
        </label>
        <input
          id="backup-password"
          aria-label="Backup password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500"
        />

        {(validationError || error) && (
          <p className="mt-2 text-sm text-red-600">{validationError || error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-500 px-5 py-2 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? "Unlocking..." : "Unlock backup"}
          </button>
        </div>
      </form>
    </div>
  );
}
