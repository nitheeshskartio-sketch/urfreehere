import { ArrowLeft, CircleCheck, Lock, RotateCcw, Share2, Timer, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Dropzone } from '../components/Dropzone';
import { FileRow } from '../components/FileRow';
import { Link } from '../../../site/Link';
import { TransferView } from '../components/TransferView';
import { Button } from '../../../ui/Button';
import { CopyButton } from '../../../ui/CopyButton';
import { Notice } from '../../../ui/Notice';
import { Panel, PanelHeader } from '../../../ui/Panel';
import { QRCode } from '../../../ui/QRCode';
import { StateMessage } from '../../../ui/StateMessage';
import { StatusSteps, type Step } from '../../../ui/StatusSteps';
import { RouteBadge } from '../components/RouteBadge';
import { useSender, type SenderState } from '../hooks/useSender';
import { useKeepAwake, useLeaveWarning } from '../hooks/usePageGuards';
import { ERROR_COPY } from '../lib/errors';
import { formatBytes, formatCode, shareLink } from '../../../lib/format';
import { LIMITS, addWithinLimits, type RejectedFile } from '../lib/limits';
import { clearPendingFiles, peekPendingFiles } from '../lib/pendingFiles';
import { supportsWebRTC } from '../lib/support';

const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

export default function Send() {
  const [initial] = useState(() => addWithinLimits([], peekPendingFiles()));
  const [files, setFiles] = useState<File[]>(initial.files);
  const [rejected, setRejected] = useState<RejectedFile[]>(initial.rejected);
  useEffect(clearPendingFiles, []);
  const { state, share, setFiles: syncFiles, cancel, reset } = useSender();
  const { phase } = state;
  const supported = useMemo(supportsWebRTC, []);

  const inTransfer = phase === 'transferring' || (!!state.started && (phase === 'error' || phase === 'cancelled'));
  const locked = phase === 'connecting' || phase === 'ready' || inTransfer || phase === 'complete';

  // Keep the room in sync with the selection: open one when files are added,
  // close it when the list is emptied.
  useEffect(() => {
    syncFiles(files);
    if (!supported) return;
    if (files.length && phase === 'idle') void share(files);
    if (!files.length && (phase === 'creating' || phase === 'waiting')) reset();
  }, [files, phase, share, reset, syncFiles, supported]);

  useLeaveWarning(phase === 'waiting' || phase === 'connecting' || phase === 'ready' || phase === 'transferring');
  useKeepAwake(phase === 'connecting' || phase === 'ready' || phase === 'transferring');

  const addFiles = (incoming: File[]) => {
    const seen = new Set(files.map(fileKey));
    const result = addWithinLimits(files, incoming.filter((f) => !seen.has(fileKey(f))));
    setFiles(result.files);
    setRejected(result.rejected);
  };

  const startOver = () => {
    reset();
    setFiles([]);
    setRejected([]);
  };

  if (!supported) {
    return (
      <PageShell>
        <Panel>
          <StateMessage icon={X} tone="error" {...ERROR_COPY.UNSUPPORTED} />
        </Panel>
      </PageShell>
    );
  }

  // --- Transfer, success and post-transfer failure -----------------------
  if (inTransfer || phase === 'complete') {
    const sent = state.sentFiles ?? files;
    return (
      <PageShell narrow busy={phase === 'transferring'}>
        {phase === 'transferring' && (
          <TransferView direction="send" files={sent} progress={state.progress} route={state.route} onCancel={cancel} />
        )}
        {phase === 'complete' && (
          <Panel>
            <StateMessage
              icon={CircleCheck}
              tone="success"
              title="Transfer complete"
              message={`${sent.length} ${sent.length === 1 ? 'file' : 'files'} · ${formatBytes(
                state.progress?.total ?? 0,
              )} received and saved by the other device.`}
            >
              <Button variant="secondary" onClick={() => reset()}>
                Send same files again
              </Button>
              <Button onClick={startOver}>Send more files</Button>
            </StateMessage>
          </Panel>
        )}
        {(phase === 'error' || phase === 'cancelled') && (
          <Panel>
            <StateMessage
              icon={X}
              tone={phase === 'error' ? 'error' : 'neutral'}
              title={phase === 'cancelled' ? 'Transfer cancelled' : ERROR_COPY[state.error!.code].title}
              message={
                phase === 'cancelled'
                  ? 'Files that were not fully transferred were discarded on the other device.'
                  : ERROR_COPY[state.error!.code].message
              }
            >
              <Button variant="secondary" onClick={startOver}>
                Choose other files
              </Button>
              <Button onClick={() => reset()}>
                <RotateCcw />
                Try again
              </Button>
            </StateMessage>
          </Panel>
        )}
      </PageShell>
    );
  }

  // --- Selection + sharing ------------------------------------------------
  const total = files.reduce((s, f) => s + f.size, 0);

  return (
    <PageShell>
      {rejected.length > 0 && (
        <div className="mb-5">
          <Notice tone="warning" title={`${rejected.length} ${rejected.length === 1 ? 'file was' : 'files were'} not added`}>
            <ul className="space-y-0.5">
              {rejected.slice(0, 5).map((r, i) => (
                <li key={i} className="wrap-anywhere">
                  <span className="font-medium text-ink-soft">{r.name}</span>: {r.reason}
                </li>
              ))}
              {rejected.length > 5 && <li>…and {rejected.length - 5} more</li>}
            </ul>
            <button type="button" onClick={() => setRejected([])} className="mt-1.5 font-medium text-ink-soft hover:text-ink">
              Dismiss
            </button>
          </Notice>
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Files"
            meta={files.length ? `${files.length} · ${formatBytes(total)} of ${formatBytes(LIMITS.maxTotalSize)}` : undefined}
            action={
              files.length > 0 && !locked ? (
                <Button variant="ghost" size="sm" onClick={startOver}>
                  Clear all
                </Button>
              ) : undefined
            }
          />
          {files.length === 0 ? (
            <div className="p-4 sm:p-5">
              <Dropzone onFiles={addFiles} />
            </div>
          ) : (
            <>
              <ul className="max-h-[min(460px,55vh)] divide-y divide-line overflow-y-auto">
                {files.map((f) => (
                  <FileRow
                    key={fileKey(f)}
                    name={f.name}
                    size={f.size}
                    type={f.type}
                    action={
                      locked ? undefined : (
                        <button
                          type="button"
                          onClick={() => setFiles((cur) => cur.filter((x) => x !== f))}
                          className="rounded-md p-2 text-muted transition-colors hover:bg-surface hover:text-ink"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="size-4" />
                        </button>
                      )
                    }
                  />
                ))}
              </ul>
              <div className="border-t border-line p-3 sm:px-5">
                {locked ? (
                  <p className="flex items-center gap-2 py-1 text-[13px] text-muted">
                    <Lock className="size-3.5" />
                    The file list is locked while a receiver is connected.
                  </p>
                ) : (
                  <Dropzone onFiles={addFiles} compact />
                )}
              </div>
            </>
          )}
        </Panel>

        <SharePanel state={state} hasFiles={files.length > 0} onRetry={() => reset()} />
      </div>
    </PageShell>
  );
}

function PageShell({ children, narrow = false, busy = false }: { children: React.ReactNode; narrow?: boolean; busy?: boolean }) {
  return (
    <div className={`mx-auto px-4 pb-16 pt-6 sm:px-8 sm:pt-8 ${narrow ? 'max-w-[720px]' : 'max-w-content'}`}>
      {/* Hidden mid-transfer: leaving the page would cancel it. */}
      <Link href="/postman" className={`inline-flex items-center gap-1.5 rounded-md text-sm text-muted hover:text-ink ${busy ? 'invisible' : ''}`}>
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <h1 className="mb-5 mt-3 text-2xl font-semibold tracking-tight sm:mb-6">Send files</h1>
      {children}
    </div>
  );
}

function useMinutesLeft(expiresAt?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 60_000)) : null;
}

function SharePanel({ state, hasFiles, onRetry }: { state: SenderState; hasFiles: boolean; onRetry: () => void }) {
  const { phase, code } = state;
  const minutesLeft = useMinutesLeft(phase === 'waiting' ? state.expiresAt : undefined);

  if (!hasFiles) {
    return (
      <Panel className="p-5">
        <h2 className="text-[15px] font-semibold">Share</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Add files to get a sharing code, link and QR code for the receiving device.
        </p>
      </Panel>
    );
  }

  if (phase === 'error' || phase === 'cancelled') {
    const copy = phase === 'error' ? ERROR_COPY[state.error!.code] : { title: 'Sharing stopped', message: 'The link is no longer active.' };
    return (
      <Panel>
        <StateMessage icon={X} tone={phase === 'error' ? 'error' : 'neutral'} title={copy.title} message={copy.message}>
          <Button onClick={onRetry}>
            <RotateCcw />
            Create new code
          </Button>
        </StateMessage>
      </Panel>
    );
  }

  const steps: Step[] = [
    { label: 'Waiting for receiver', state: phase === 'waiting' || phase === 'creating' ? 'active' : 'done', detail: 'Open the link or enter the code on the other device.' },
    { label: 'Receiver connected', state: phase === 'connecting' || phase === 'ready' ? 'done' : 'pending' },
    {
      label: 'Establishing secure connection',
      state: phase === 'connecting' ? 'active' : phase === 'ready' ? 'done' : 'pending',
      detail: 'Setting up an encrypted peer-to-peer channel.',
    },
    {
      label: 'Ready to transfer',
      state: phase === 'ready' ? 'active' : 'pending',
      detail: 'Waiting for the receiver to accept the files.',
    },
  ];

  const link = code ? shareLink(code) : '';
  const canShare = typeof navigator.share === 'function';

  return (
    <Panel className="lg:sticky lg:top-24">
      <PanelHeader title="Share" action={<RouteBadge route={state.route} />} />
      <div className="p-4 sm:p-5">
        {phase === 'creating' || !code ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
            <div className="mx-auto aspect-square w-full max-w-[200px] animate-pulse rounded-lg bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] text-muted">Sharing code</p>
                <p className="mt-0.5 font-mono text-[26px] font-semibold leading-tight tracking-[0.12em]">{formatCode(code)}</p>
              </div>
              <CopyButton text={formatCode(code)} size="sm" aria-label="Copy code" />
            </div>

            <div className="mt-4 flex justify-center rounded-lg border border-line bg-white p-3">
              <QRCode value={link} className="aspect-square w-full max-w-[184px] sm:max-w-[200px]" />
            </div>

            <div className="mt-4">
              <label htmlFor="share-link" className="text-[13px] text-muted">
                Link
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="share-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink-soft focus:outline-none"
                />
                <CopyButton text={link} className="h-10" />
              </div>
              {canShare && (
                <Button
                  variant="secondary"
                  className="mt-2 w-full sm:hidden"
                  onClick={() => navigator.share({ title: 'Receive files', url: link }).catch(() => {})}
                >
                  <Share2 />
                  Share link
                </Button>
              )}
            </div>
            {minutesLeft !== null && (
              <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
                <Timer className="size-3.5" />
                Expires in {minutesLeft} min · works for one device
              </p>
            )}
          </>
        )}

        <div className="mt-5 border-t border-line pt-5">
          <StatusSteps steps={steps} />
        </div>
        {phase === 'waiting' && (
          <div className="mt-5">
            <Notice>Keep this page open until the transfer finishes.</Notice>
          </div>
        )}
      </div>
    </Panel>
  );
}
