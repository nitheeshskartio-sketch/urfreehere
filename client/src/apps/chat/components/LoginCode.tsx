import { Download, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { CopyButton } from '../../../ui/CopyButton';
import { formatLoginCode } from '../lib/identity';
import { Modal } from './Modal';

function downloadCode(code: string, name: string) {
  const text = `UR Chat login code\n\n${formatLoginCode(code)}\n\nAccount: ${name}\nKeep this code private. Anyone with it can sign in as you.\nUse it in UR Chat → "I have a login code" on any device.\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ur-chat-login-code.txt';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Shows a login code with reveal, copy and download. */
export function LoginCodeBox({ code, name, revealed: initial = false }: { code: string; name: string; revealed?: boolean }) {
  const [revealed, setRevealed] = useState(initial);
  const formatted = formatLoginCode(code);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-3">
        <KeyRound className="size-4 shrink-0 text-muted" />
        <code className={`min-w-0 flex-1 break-all font-mono text-[15px] font-semibold tracking-wider ${revealed ? '' : 'select-none blur-[5px]'}`}>{formatted}</code>
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="rounded-md p-1.5 text-muted hover:bg-white hover:text-ink"
          aria-label={revealed ? 'Hide login code' : 'Show login code'}
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={formatted} size="sm" label="Copy code" />
        <Button variant="secondary" size="sm" onClick={() => downloadCode(code, name)}>
          <Download />
          Save as file
        </Button>
      </div>
    </div>
  );
}

/** Shown once right after sign-up. */
export function LoginCodeDialog({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  return (
    <Modal
      title="Save your login code"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>I've saved it</Button>
        </div>
      }
    >
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          Use this code to sign in on another device or after clearing your browser. It's the only way to get back into your account, and we can't recover it for
          you.
        </p>
        <LoginCodeBox code={code} name={name} revealed />
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
          Keep it private: anyone with this code can sign in as you. You can find it again in Settings → Login code.
        </p>
      </div>
    </Modal>
  );
}
