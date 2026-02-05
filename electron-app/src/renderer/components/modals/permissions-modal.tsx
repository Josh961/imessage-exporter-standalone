import { useState } from 'react';

interface PermissionsModalProps {
  onClose: () => void;
}

export function PermissionsModal({ onClose: _onClose }: PermissionsModalProps) {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleOpenSystemPreferences = () => {
    window.electronAPI.openSystemPreferences();
  };

  const handleCheckPermissions = async () => {
    setChecking(true);
    const hasAccess = await window.electronAPI.checkFullDiskAccess();
    setChecking(false);

    if (hasAccess) {
      setPermissionsGranted(true);
    } else {
      alert('Full disk access has not been granted yet. Please try again.');
    }
  };

  const handleRestartApp = () => {
    window.electronAPI.restartApp();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-slate-900">Full disk access required</h2>

        <p className="mb-4 text-sm text-slate-700">This app needs access to your iMessages and to save exported chats. Please follow these steps:</p>

        <ol className="mb-6 list-inside list-decimal space-y-2 text-sm text-slate-700">
          <li>Click the "Open system settings" button below</li>
          <li>Toggle the switch next to "iMessage Exporter" to grant access</li>
        </ol>

        <div className="space-y-4">
          <button onClick={handleOpenSystemPreferences} className="w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">
            Open system settings
          </button>

          <hr className="border-slate-200" />

          {!permissionsGranted ? (
            <>
              <p className="text-sm text-slate-700">Once you've granted permissions, click the button below to verify:</p>
              <button
                onClick={handleCheckPermissions}
                disabled={checking}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {checking ? 'Checking...' : 'Check permissions'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-green-600">The app has the necessary permissions.</p>
              <button onClick={handleRestartApp} className="w-full rounded-lg border border-green-500 px-4 py-3 font-semibold text-green-600 hover:bg-green-50">
                Restart app
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
