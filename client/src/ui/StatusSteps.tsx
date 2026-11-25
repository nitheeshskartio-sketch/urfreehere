import { Check, LoaderCircle } from 'lucide-react';

export type StepState = 'done' | 'active' | 'pending';

export interface Step {
  label: string;
  state: StepState;
  detail?: string;
}

export function StatusSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-0" aria-live="polite">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && (
            <span
              className={`absolute left-[9px] top-6 h-[calc(100%-20px)] w-px ${step.state === 'done' ? 'bg-success/40' : 'bg-line'}`}
              aria-hidden="true"
            />
          )}
          <span className="relative mt-0.5 flex size-[19px] shrink-0 items-center justify-center">
            {step.state === 'done' && (
              <span className="flex size-[19px] items-center justify-center rounded-full bg-success text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
            {step.state === 'active' && <LoaderCircle className="size-[19px] animate-spin text-accent" strokeWidth={2.25} />}
            {step.state === 'pending' && <span className="size-[15px] rounded-full border-[1.5px] border-line-strong" />}
          </span>
          <div className="min-w-0">
            <p className={`text-sm ${step.state === 'pending' ? 'text-muted' : 'font-medium text-ink'}`}>{step.label}</p>
            {step.detail && step.state === 'active' && <p className="mt-0.5 text-[13px] text-muted">{step.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
