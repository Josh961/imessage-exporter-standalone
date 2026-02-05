import { useEffect } from 'react';

interface InfoModalProps {
  onClose: () => void;
}

export function InfoModal({ onClose }: InfoModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleLinkClick = (url: string) => {
    window.electronAPI.openExternalLink(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-xl font-semibold text-slate-800">About iMessage Exporter</h2>

        <div className="space-y-4 text-sm text-slate-600">
          <p>
            This software is open source and based on the code from{' '}
            <button onClick={() => handleLinkClick('https://github.com/ReagentX/imessage-exporter/tree/develop')} className="text-sky-500 hover:text-sky-600 hover:underline">
              ReagentX/imessage-exporter
            </button>
            .
          </p>

          <p>
            This version is packaged as a standalone alternative, also open source, and can be found at{' '}
            <button onClick={() => handleLinkClick('https://github.com/Josh961/imessage-exporter-standalone')} className="text-sky-500 hover:text-sky-600 hover:underline">
              Josh961/imessage-exporter-standalone
            </button>
            .
          </p>

          <p>Both projects are licensed under the GPL-3.0 License.</p>

          <p>
            The installed executable is bundled with ImageMagick. ImageMagick is licensed under the ImageMagick License, which can be found at{' '}
            <button onClick={() => handleLinkClick('https://imagemagick.org/script/license.php')} className="text-sky-500 hover:text-sky-600 hover:underline">
              https://imagemagick.org/script/license.php
            </button>
            .
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-6 py-2 font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
