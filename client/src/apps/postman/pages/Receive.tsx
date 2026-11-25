import { ArrowLeft, CircleCheck, Download, FolderDown, ScanLine, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { FileRow } from '../components/FileRow';
import { Link } from '../../../site/Link';
import { TransferView } from '../components/TransferView';
import { Button } from '../../../ui/Button';
import { fileKind } from '../../../ui/FileIcon';
import { Notice } from '../../../ui/Notice';
import { Panel, PanelHeader } from '../../../ui/Panel';
import { RouteBadge } from '../components/RouteBadge';
import { StateMessage } from '../../../ui/StateMessage';
import { StatusSteps, type Step } from '../../../ui/StatusSteps';
import { useKeepAwake, useLeaveWarning } from '../hooks/usePageGuards';
import { useReceiver, type ReceiverState } from '../hooks/useReceiver';
import { canSaveToFolder, downloadAll, downloadBlob } from '../lib/download';
import { ERROR_COPY, type ErrorCode } from '../lib/errors';
import { formatBytes, formatCode, parseCode } from '../../../lib/format';
import { navigate } from '../../../lib/router';
import { supportsQrScan, supportsWebRTC } from '../lib/support';
import { highestLevel } from '../lib/safety';
import type { ReceivedFile, RejectReason } from '../lib/transfer/receiver';

const QrScanner = lazy(() => import('../components/QrScanner'));

/** Errors that happen before connecting: shown inline on the code form. */
const JOIN_ERRORS: ErrorCode[] = ['INVALID_CODE', 'ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'ROOM_FULL', 'RATE_LIMITED', 'SERVER_BUSY', 'SIGNALING_UNAVAILABLE'];

export default function Receive({ linkCode }: { linkCode?: string }) {
  const { state, join, accept, decline, cancel, reset } = useReceiver();
  const { phase } = state;
  const supported = useMemo(supportsWebRTC, []);
  const [linkError, setLinkError] = useState(false);

  // Opened from a share link: connect right away.
  useEffect(() => {
    if (!linkCode || !supported) return;
    const code = parseCode(linkCode);
    if (code) void join(code);
    else setLinkError(true);
  }, [linkCode, join, supported]);

  useLeaveWarning(phase === 'transferring');
  useKeepAwake(phase === 'transferring');

  const startOver = useCallback(() => {
    reset();
    setLinkError(false);
    if (linkCode) navigate('/postman/receive', { replace: true });
  }, [linkCode, reset]);

  let content: JSX.Element;

  if (!supported) {
    content = (
      <Panel>
        <StateMessage icon={X} tone="error" {...ERROR_COPY.UNSUPPORTED} />
      </Panel>
    );
  } else if (phase === 'idle' || (phase === 'error' && JOIN_ERRORS.includes(state.error!.code))) {
    content = (
      <CodeForm
        initialCode={linkCode && !linkError ? linkCode : ''}
        error={linkError ? 'INVALID_CODE' : state.error?.code}
        onSubmit={(code) => {
          setLinkError(false);
          void join(code);
        }}
      />
    );
  } else if (phase === 'joining' || phase === 'connecting' || phase === 'waiting') {
    content = <ConnectingPanel state={state} onCancel={startOver} />;
  } else if (phase === 'incoming') {
    content = <IncomingPanel state={state} onAccept={accept} onDecline={decline} />;
  } else if (phase === 'transferring') {
    content = <TransferView direction="receive" files={state.files ?? []} progress={state.progress} route={state.route} onCancel={cancel} />;
  } else if (phase === 'complete') {
    content = <CompletePanel files={state.received ?? []} onDone={startOver} />;
  } else if (phase === 'declined') {
    content = (
      <Panel>
        <StateMessage
          icon={X}
          tone="neutral"
          title="Transfer declined"
          message={
            state.offerProblem
              ? `${state.offerProblem.message} No files were received, and the sender has been told why.`
              : 'No files were received. The sender has been notified.'
          }
        >
          <Button onClick={startOver}>Enter another code</Button>
        </StateMessage>
      </Panel>
    );
  } else {
    const copy =
      phase === 'cancelled'
        ? { title: 'Transfer cancelled', message: 'Partially received files were discarded.' }
        : ERROR_COPY[state.error!.code];
    content = (
      <Panel>
        <StateMessage icon={X} tone={phase === 'error' ? 'error' : 'neutral'} title={copy.title} message={copy.message}>
          <Button onClick={startOver}>Enter another code</Button>
        </StateMessage>
      </Panel>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
      <Link
        href="/postman"
        className={`inline-flex items-center gap-1.5 rounded-md text-sm text-muted hover:text-ink ${phase === 'transferring' ? 'invisible' : ''}`}
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <h1 className="mb-5 mt-3 text-2xl font-semibold tracking-tight sm:mb-6">Receive files</h1>
      {content}
    </div>
  );
}

function CodeForm({
  initialCode,
  error,
  onSubmit,
}: {
  initialCode: string;
  error?: ErrorCode;
  onSubmit: (code: string) => void;
}) {
  const [value, setValue] = useState(initialCode ? formatCode(initialCode.toUpperCase()) : '');
  const [localError, setLocalError] = useState<ErrorCode | null>(null);
  const [scanning, setScanning] = useState(false);
  const canScan = useMemo(supportsQrScan, []);
  const shownError = localError ?? error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = parseCode(value);
    if (!code) return setLocalError('INVALID_CODE');
    onSubmit(code);
  };

  const onScanned = useCallback(
    (code: string) => {
      setScanning(false);
      setValue(formatCode(code));
      onSubmit(code);
    },
    [onSubmit],
  );

  return (
    <Panel>
      <PanelHeader title={scanning ? 'Scan QR code' : 'Enter sharing code'} />
      <div className="p-4 sm:p-5">
        {scanning ? (
          <Suspense fallback={<div className="mx-auto aspect-square w-full max-w-[320px] animate-pulse rounded-lg bg-slate-100" />}>
            <QrScanner onCode={onScanned} onClose={() => setScanning(false)} />
          </Suspense>
        ) : (
          <form onSubmit={submit} noValidate>
            {shownError && (
              <div className="mb-4">
                <Notice tone="error" title={ERROR_COPY[shownError].title}>
                  {ERROR_COPY[shownError].message}
                </Notice>
              </div>
            )}
            <label htmlFor="code" className="text-sm text-muted">
              Code shown on the sending device
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                id="code"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setLocalError(null);
                }}
                placeholder="XXXX-XXXX"
                autoFocus={!initialCode}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={64}
                aria-invalid={!!shownError}
                className="h-12 min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-4 font-mono text-xl uppercase tracking-[0.16em] placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <Button type="submit" size="lg" className="h-12 sm:px-6">
                Connect
              </Button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              You can also paste the full link, or open it directly on this device.
            </p>

            {canScan && (
              <>
                <div className="my-5 flex items-center gap-3 text-[13px] text-muted">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>
                <Button variant="secondary" size="lg" className="w-full" onClick={() => setScanning(true)}>
                  <ScanLine />
                  Scan QR code
                </Button>
              </>
            )}
          </form>
        )}
      </div>
    </Panel>
  );
}

function ConnectingPanel({ state, onCancel }: { state: ReceiverState; onCancel: () => void }) {
  const { phase } = state;
  const steps: Step[] = [
    {
      label: 'Connecting to sender',
      state: phase === 'waiting' ? 'done' : 'active',
      detail: phase === 'joining' ? 'Looking up the code…' : 'Setting up an encrypted peer-to-peer channel.',
    },
    { label: 'Sender connected', state: phase === 'waiting' ? 'done' : 'pending' },
    { label: 'Waiting for files', state: phase === 'waiting' ? 'active' : 'pending', detail: 'The file list will appear here.' },
  ];
  return (
    <Panel>
      <PanelHeader title={state.code ? `Code ${formatCode(state.code)}` : 'Connecting'} action={<RouteBadge route={state.route} />} />
      <div className="p-4 sm:p-5">
        <StatusSteps steps={steps} />
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function IncomingPanel({
  state,
  onAccept,
  onDecline,
}: {
  state: ReceiverState;
  onAccept: () => void;
  onDecline: (reason?: RejectReason) => void;
}) {
  const files = state.files ?? [];
  const total = files.reduce((s, f) => s + f.size, 0);
  const risky = files.filter((f) => f.warnings?.length);
  const highRisk = files.some((f) => highestLevel(f.warnings) === 'high');
  const problem = state.offerProblem;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold">Incoming files</h2>
          <p className="mt-0.5 text-sm text-muted tabular">
            {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(total)}
          </p>
        </div>
        <RouteBadge route={state.route} />
      </div>

      {(problem || risky.length > 0) && (
        <div className="space-y-2 border-b border-line px-4 py-3 sm:px-5">
          {problem && (
            <Notice tone="error" title="These files can't be received">
              {problem.message}
            </Notice>
          )}
          {risky.length > 0 && (
            <Notice tone={highRisk ? 'error' : 'warning'} title={`${risky.length} ${risky.length === 1 ? 'file needs' : 'files need'} your attention`}>
              {highRisk
                ? 'Some files can run programs on your device or are disguised as another type. Decline unless you know exactly what they are.'
                : 'Some files can contain scripts or macros. Open them only if you trust the sender.'}
            </Notice>
          )}
        </div>
      )}

      <ul className="max-h-[min(420px,50vh)] divide-y divide-line overflow-y-auto">
        {files.map((f) => (
          <FileRow
            key={f.id}
            name={f.name}
            size={f.size}
            type={f.type}
            detail={`${fileKind(f.name, f.type)} · ${formatBytes(f.size)}`}
            warnings={f.warnings}
          />
        ))}
      </ul>
      <div className="border-t border-line bg-surface px-4 py-4 sm:px-5">
        <p className="mb-3 text-[13px] text-muted">
          Only accept files from a device you trust. Files are not scanned for viruses; your device's security software checks them when you open them.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="lg" onClick={() => onDecline(problem?.reason)}>
            Decline
          </Button>
          {!problem && (
            <Button size="lg" onClick={onAccept} disabled={state.checkingOffer} variant={highRisk ? 'danger' : 'primary'}>
              <Download />
              {highRisk ? 'Accept anyway' : 'Accept and receive'}
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function CompletePanel({ files, onDone }: { files: ReceivedFile[]; onDone: () => void }) {
  const [downloaded, setDownloaded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const total = files.reduce((s, f) => s + f.meta.size, 0);
  const toFolder = useMemo(canSaveToFolder, []);

  const markAll = () => setDownloaded(new Set(files.map((f) => f.meta.id)));

  /** High-risk files need an explicit confirmation before they're saved. */
  const confirmRisky = (list: ReceivedFile[]) => {
    const risky = list.filter((f) => highestLevel(f.meta.warnings) === 'high');
    if (!risky.length) return true;
    const lines = risky.map((f) => `• ${f.meta.name}: ${f.meta.warnings![0].message}`).join('\n');
    return window.confirm(
      `${risky.length === 1 ? 'This file may be harmful' : 'These files may be harmful'}:\n\n${lines}\n\nOnly open ${
        risky.length === 1 ? 'it' : 'them'
      } if you trust the sender. Download anyway?`,
    );
  };

  const saveOne = (f: ReceivedFile) => {
    if (!confirmRisky([f])) return;
    try {
      downloadBlob(f.blob, f.meta.name);
      setDownloaded((s) => new Set(s).add(f.meta.id));
    } catch {
      setSaveError(true);
    }
  };

  const saveAll = async () => {
    if (!confirmRisky(files)) return;
    setBusy(true);
    setSaveError(false);
    try {
      if (await downloadAll(files)) markAll();
    } catch {
      setSaveError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line px-4 py-4 sm:px-5">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Transfer complete</h2>
          <p className="mt-0.5 text-sm text-muted tabular">
            {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(total)} received
          </p>
        </div>
      </div>

      <ul className="max-h-[min(460px,55vh)] divide-y divide-line overflow-y-auto">
        {files.map((f) => (
          <FileRow
            key={f.meta.id}
            name={f.meta.name}
            size={f.meta.size}
            type={f.meta.type}
            done={downloaded.has(f.meta.id)}
            warnings={f.meta.warnings}
            action={
              <Button variant="secondary" size="sm" onClick={() => saveOne(f)} aria-label={`Download ${f.meta.name}`}>
                <Download />
                <span className="hidden sm:inline">{downloaded.has(f.meta.id) ? 'Again' : 'Download'}</span>
              </Button>
            }
          />
        ))}
      </ul>

      <div className="space-y-3 border-t border-line bg-surface px-4 py-4 sm:px-5">
        {saveError && <Notice tone="error" title={ERROR_COPY.FILE_SAVE.title}>Your browser blocked the download. Try again, or download files one at a time.</Notice>}
        <p className="text-[13px] text-muted">Files are kept only in this tab. Download them before you close it.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              if (downloaded.size < files.length && !window.confirm('Some files have not been downloaded. Discard them?')) return;
              onDone();
            }}
          >
            Done
          </Button>
          {files.length > 1 && (
            <Button size="lg" onClick={saveAll} disabled={busy}>
              {toFolder ? <FolderDown /> : <Download />}
              {toFolder ? 'Save all to folder' : 'Download all'}
            </Button>
          )}
          {files.length === 1 && (
            <Button size="lg" onClick={() => saveOne(files[0])}>
              <Download />
              Download
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
