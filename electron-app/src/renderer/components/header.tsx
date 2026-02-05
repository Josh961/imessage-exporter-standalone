interface HeaderProps {
  onSettingsClick: () => void;
  onInfoClick: () => void;
}

export function Header({ onSettingsClick, onInfoClick }: HeaderProps) {
  const handleWebsiteClick = () => {
    window.electronAPI.openExternalLink('https://myforeverbooks.com');
  };

  return (
    <header className="relative flex flex-col items-center px-4 pb-4 pt-6">
      <div className="flex items-center justify-center">
        <h1 className="text-center text-4xl font-bold text-slate-950">iMessage Exporter</h1>
        <button onClick={onInfoClick} className="ml-2 text-slate-700 hover:text-slate-800 focus:outline-none" aria-label="About">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-center text-xl text-slate-800">
        A free tool from{' '}
        <button onClick={handleWebsiteClick} className="font-bold text-sky-500 hover:text-sky-400">
          My Forever Books
        </button>
      </p>

      <button onClick={onSettingsClick} className="absolute right-4 top-4 text-slate-700 hover:text-slate-800 focus:outline-none" aria-label="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </header>
  );
}
