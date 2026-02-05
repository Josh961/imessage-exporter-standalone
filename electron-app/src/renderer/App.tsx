import { useEffect, useState } from 'react';
import { Header } from './components/header';
import { InfoModal } from './components/modals/info-modal';
import { PermissionsModal } from './components/modals/permissions-modal';
import { SettingsModal } from './components/modals/settings-modal';
import { Wizard } from './components/wizard/wizard';
import { WizardProvider } from './context/wizard-context';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    const init = async () => {
      const p = await window.electronAPI.getPlatform();
      setPlatform(p);
    };
    init();

    window.electronAPI.onShowPermissionsModal(() => {
      setShowPermissions(true);
    });
  }, []);

  return (
    <WizardProvider>
      <div className="min-h-screen">
        <Header onSettingsClick={() => setShowSettings(true)} onInfoClick={() => setShowInfo(true)} />
        <main>
          <Wizard platform={platform} />
        </main>
        <footer className="py-6 text-center text-sm text-slate-500">&copy; {new Date().getFullYear()} My Forever Books. All rights reserved.</footer>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      {showPermissions && <PermissionsModal onClose={() => setShowPermissions(false)} />}
    </WizardProvider>
  );
}
