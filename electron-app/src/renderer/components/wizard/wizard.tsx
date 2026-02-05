import { useWizard } from '../../context/wizard-context';
import { Step1BackupSource } from './step-1-backup-source';
import { Step2ContactSelection } from './step-2-contact-selection';
import { Step3DateRange } from './step-3-date-range';
import { Step4Export } from './step-4-export';
import { StepIndicator } from './step-indicator';

interface WizardProps {
  platform: string;
}

export function Wizard({ platform }: WizardProps) {
  const { state } = useWizard();

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <Step1BackupSource platform={platform} />;
      case 2:
        return <Step2ContactSelection />;
      case 3:
        return <Step3DateRange />;
      case 4:
        return <Step4Export />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center px-4 py-8">
      <StepIndicator currentStep={state.currentStep} />
      <div className="w-full max-w-2xl pb-8">{renderStep()}</div>
    </div>
  );
}
