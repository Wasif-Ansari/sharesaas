import { useEffect, useState, useCallback, useRef } from 'react';
import { sha256 } from 'js-sha256';

export function useSignaling(signalingUrl: string) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Connecting...');
  const [isConnected, setIsConnected] = useState(false);
  const listeners = useRef<{ [t: string]: ((m: any) => void)[] }>({});
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const s = new WebSocket(signalingUrl);

    s.onopen = () => {
      setStatus('Ready');
      setIsConnected(true);
      // Heartbeat every 30 seconds to keep session alive
      heartbeatInterval.current = setInterval(() => {
        if (s.readyState === 1) {
          s.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
    };

    s.onclose = () => {
      setStatus('Disconnected');
      setIsConnected(false);
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
    };

    s.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        (listeners.current[msg.type] || []).forEach((fn) => fn(msg));
      } catch {}
    };

    s.onerror = () => {
      setStatus('Connection error');
    };

    setWs(s);

    return () => {
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      s.close();
    };
  }, [signalingUrl]);

  const on = useCallback((type: string, fn: (m: any) => void) => {
    listeners.current[type] ||= [];
    listeners.current[type].push(fn);
    return () => {
      listeners.current[type] = listeners.current[type].filter((f) => f !== fn);
    };
  }, []);

  const create = useCallback(() => {
    ws?.send(JSON.stringify({ type: 'create' }));
  }, [ws]);

  const join = useCallback((c: string) => {
    ws?.send(JSON.stringify({ type: 'join', code: c }));
  }, [ws]);

  const signal = useCallback((data: any) => {
    ws?.send(JSON.stringify({ type: 'signal', data }));
  }, [ws]);

  useEffect(() => {
    on('created', (m) => {
      setCode(m.code);
      setSessionId(m.sessionId);
    });
  }, [on]);

  useEffect(() => {
    on('joined', (m) => {
      setCode(m.code);
      setSessionId(m.sessionId);
    });
  }, [on]);

  return { ws, code, sessionId, status, isConnected, on, create, join, signal };
}

export async function computeFileSha256(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const hash = sha256.create();

  let offset = 0;
  const reader = file.stream().getReader();

  while (offset < file.size) {
    const { value, done } = await reader.read();
    if (done) break;
    hash.update(value);
    offset += value.byteLength;
    if (onProgress) onProgress(Math.round((offset / file.size) * 100));
  }

  return hash.hex();
}

export interface FileTransferProgress {
  name: string;
  size: number;
  sent: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  status: 'pending' | 'transferring' | 'verifying' | 'complete' | 'error';
  hash?: string;
  error?: string;
}

export interface SessionState {
  role: 'sender' | 'receiver' | null;
  code: string | null;
  sessionId: string | null;
  peerConnected: boolean;
  files: FileTransferProgress[];
  currentFile: string | null;
  overallProgress: number;
}
