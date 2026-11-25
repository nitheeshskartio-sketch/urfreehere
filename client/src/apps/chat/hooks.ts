import { useEffect, useState, useSyncExternalStore } from 'react';
import { engine } from './lib/engine';

/** Re-renders the component whenever chat state changes. */
export function useEngine() {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}

/** Object URL for a stored file once it's on this device. */
export function useFileUrl(fileId: string | undefined) {
  const e = useEngine();
  const available = fileId ? e.hasFile(fileId) : false;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (fileId && available) void engine.fileUrl(fileId).then((u) => alive && setUrl(u));
    else setUrl(null);
    return () => {
      alive = false;
    };
  }, [fileId, available]);
  return url;
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
