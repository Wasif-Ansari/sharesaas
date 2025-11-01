'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode.react';
import { useSignaling, computeFileSha256, type FileTransferProgress } from '@/lib/signaling';

export default function Home() {
  const signalingUrl = useMemo(() => {
    if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:8080';
    
    // Use environment variable in production, localhost in development
    const url = process.env.NEXT_PUBLIC_SIGNALING_URL || 
                (window.location.hostname === 'localhost' 
                  ? 'ws://127.0.0.1:8080' 
                  : `ws://${window.location.hostname}:8080`);
    
    console.log('🔗 Signaling URL:', url);
    return url;
  }, []);

  const { code, isConnected, on, create, join, signal } = useSignaling(signalingUrl);
  
  useEffect(() => {
    console.log('?? Signaling connection status:', isConnected ? 'CONNECTED' : 'DISCONNECTED');
  }, [isConnected]);
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [files, setFiles] = useState<FileTransferProgress[]>([]);
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const fileQueueRef = useRef<File[]>([]);
  const [windowWidth, setWindowWidth] = useState(1024); // Default to desktop size

  // Track window width for responsive styles
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => setWindowWidth(windowWidth);
    setWindowWidth(windowWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { 
    if (typeof window !== 'undefined') {
      console.log('?? Initializing RTCPeerConnection');
      const newPc = new RTCPeerConnection({ 
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
      });
      
      newPc.onicecandidate = (e) => { 
        if (e.candidate) {
          console.log('? ICE candidate found:', e.candidate.type);
        } else {
          console.log('? ICE gathering complete');
        }
      };
      
      newPc.oniceconnectionstatechange = () => {
        console.log('? ICE connection state:', newPc.iceConnectionState);
      };
      
      newPc.onconnectionstatechange = () => {
        console.log('? WebRTC connection state:', newPc.connectionState);
      };
      
      setPc(newPc);
      
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('code');
      if (codeParam && codeParam.length === 6) {
        console.log('?? Auto-filling code from URL:', codeParam);
        setInputCode(codeParam);
        setRole('receiver');
      }
    }
  }, []);

  useEffect(() => {
    if (!pc) return;
    
    // Setup ICE candidate handler
    pc.onicecandidate = (e) => { 
      if (e.candidate) {
        console.log('? Sending ICE candidate');
        signal(e.candidate); 
      }
    };
    
    const offPeerJoined = on('peer_joined', async () => {
      console.log('?? Peer joined! Creating data channel...');
      setPeerConnected(true);
      try {
        const dc = pc.createDataChannel('file', { ordered: true });
        dc.binaryType = 'arraybuffer';
        console.log('Data channel created, wiring...');
        wireDataChannel(dc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('? Sending offer via signaling');
        signal(pc.localDescription);
        console.log('? Offer sent successfully');
      } catch (e) { 
        console.error('? Error creating offer:', e);
        setError((e as any).message); 
      }
    });
    
    const offSignal = on('signal', async (m) => {
      console.log('?? Received signal:', m.data.type || 'ICE candidate');
      try {
        if (m.data.sdp) {
          console.log('? Processing SDP:', m.data.type);
          await pc.setRemoteDescription(new RTCSessionDescription(m.data));
          console.log('? Remote description set');
          
          if (m.data.type === 'offer') {
            console.log('? Creating answer...');
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('? Sending answer via signaling');
            signal(pc.localDescription);
            console.log('? Answer sent successfully');
          }
        } else if (m.data.candidate) {
          console.log('? Adding ICE candidate');
          await pc.addIceCandidate(new RTCIceCandidate(m.data));
          console.log('? ICE candidate added');
        }
      } catch (e) { 
        console.error('? Signaling error:', e);
        setError((e as any).message); 
      }
    });
    
    pc.ondatachannel = (e) => { 
      console.log('Data channel received');
      e.channel.binaryType = 'arraybuffer';
      wireDataChannel(e.channel); 
      setPeerConnected(true);
    };
    
    return () => { offPeerJoined(); offSignal(); };
  }, [pc, on, signal]);

  function wireDataChannel(dc: RTCDataChannel) {
    console.log('?? Wiring data channel...');
    dcRef.current = dc;
    dc.binaryType = 'arraybuffer';
    
    dc.onopen = () => { 
      console.log('? Data channel OPEN. Ready to transfer!'); 
      if (fileQueueRef.current.length > 0) {
        console.log('?? Starting file queue transfer...');
        startSending(); 
      }
    };
    
    dc.onerror = (e) => {
      console.error('? Data channel ERROR:', e);
      setError('Data channel connection error');
    };
    
    dc.onclose = () => {
      console.log('?? Data channel CLOSED');
    };
    
    dc.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        console.log('?? Received message:', msg.type);
        
        if (msg.type === 'file_info') {
          console.log('?? Starting to receive file:', msg.name, 'Size:', msg.size, 'bytes');
          const file: FileTransferProgress = { name: msg.name, size: msg.size, sent: 0, speed: 0, eta: 0, status: 'transferring', hash: msg.hash };
          setFiles((prev) => [...prev, file]);
          (dc as any).chunks = [];
          (dc as any).fileName = msg.name;
          (dc as any).receivedSize = 0;
          (dc as any).expectedSize = msg.size;
        } else if (msg.type === 'file_complete') {
          console.log('? File transfer marked complete');
          await finalizeFileReceive(dc, msg.fileId);
        }
      } catch { 
        // Binary chunk received
        await handleChunkReceive(dc, e.data); 
      }
    };
  }

  async function handleChunkReceive(dc: RTCDataChannel, chunk: ArrayBuffer) {
    const dcAny = dc as any;
    dcAny.receivedSize += chunk.byteLength;
    dcAny.chunks.push(new Uint8Array(chunk));
    
    console.log(`?? Chunk received: ${chunk.byteLength} bytes (${dcAny.receivedSize}/${dcAny.expectedSize})`);
    
    setFiles((prev) => prev.map((f) => f.name === dcAny.fileName ? { ...f, sent: dcAny.receivedSize } : f));
    if (dcAny.receivedSize >= dcAny.expectedSize) {
      console.log('? All chunks received, finalizing...');
      await finalizeFileReceive(dc, dcAny.fileName);
    }
  }

  async function finalizeFileReceive(dc: RTCDataChannel, fileName: string) {
    const dcAny = dc as any;
    console.log('?? Finalizing file download:', fileName);
    
    setFiles((prev) => prev.map((f) => (f.name === fileName ? { ...f, status: 'complete' } : f)));
    const finalBlob = new Blob(dcAny.chunks);
    
    console.log('?? Created blob:', finalBlob.size, 'bytes');
    
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('? File downloaded successfully');
    
    delete dcAny.chunks;
    delete dcAny.fileName;
    delete dcAny.receivedSize;
    delete dcAny.expectedSize;
  }

  function waitForBuffer(dc: RTCDataChannel): Promise<void> {
    if (dc.bufferedAmount < 65536) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (dc.bufferedAmount < 65536) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
  }

  async function startSending() {
    const file = fileQueueRef.current.shift();
    if (!file || !dcRef.current) {
      console.log('? Cannot send: no file or data channel');
      return;
    }
    
    const dc = dcRef.current;
    const fileId = `${file.name}-${Date.now()}`;
    
    console.log('?? Starting to send file:', file.name, 'Size:', file.size, 'DC state:', dc.readyState);
    
    try {
      const hash = await computeFileSha256(file);
      console.log('?? File hash computed:', hash);
      
      const fileInfo = { type: 'file_info', fileId, name: file.name, size: file.size, hash };
      dc.send(JSON.stringify(fileInfo));
      console.log('? Sent file_info');
      
      const chunkSize = 16 * 1024;
      let offset = 0;
      let chunkCount = 0;
      
      while (offset < file.size) {
        await waitForBuffer(dc);
        const end = Math.min(offset + chunkSize, file.size);
        const chunk = file.slice(offset, end);
        const buffer = await chunk.arrayBuffer();
        dc.send(buffer);
        offset = end;
        chunkCount++;
        
        if (chunkCount % 50 === 0) {
          console.log(`?? Sent ${chunkCount} chunks (${offset}/${file.size} bytes)`);
        }
        
        setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, sent: offset, status: 'transferring' } : f));
      }
      
      console.log(`? All chunks sent (${chunkCount} total). Sending completion signal...`);
      dc.send(JSON.stringify({ type: 'file_complete', fileId }));
      setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, status: 'complete' } : f));
      
      console.log('? File transfer complete:', file.name);
      
      if (fileQueueRef.current.length > 0) {
        console.log('?? Queue has more files, continuing...');
        setTimeout(() => startSending(), 500);
      }
    } catch (e) {
      console.error('? Error sending file:', e);
      setFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, status: 'error', error: (e as any).message } : f));
    }
  }

  async function handleSendFiles(fileList: FileList | null) {
    console.log('?? handleSendFiles called');
    console.log('Files selected:', fileList?.length);
    console.log('Peer connected:', peerConnected);
    console.log('Data channel state:', dcRef.current?.readyState);
    
    if (!fileList) {
      console.error('? No files selected');
      return;
    }
    
    if (!peerConnected) { 
      console.error('? Peer not connected');
      setError('Peer not connected'); 
      return; 
    }
    
    if (!dcRef.current) {
      console.error('? No data channel');
      setError('Data channel not ready');
      return;
    }
    
    console.log('?? Adding', fileList.length, 'files to queue');
    const newFiles: FileTransferProgress[] = Array.from(fileList).map((f) => ({ 
      name: f.name, 
      size: f.size, 
      sent: 0, 
      speed: 0, 
      eta: 0, 
      status: 'pending' 
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    fileQueueRef.current.push(...Array.from(fileList));
    
    console.log('Queue length:', fileQueueRef.current.length);
    console.log('Data channel ready state:', dcRef.current.readyState);
    
    if (dcRef.current.readyState === 'open') {
      console.log('?? Data channel is open, starting transfer');
      startSending();
    } else {
      console.log('? Data channel not open yet. State:', dcRef.current.readyState);
      setError(`Data channel not ready (${dcRef.current.readyState})`);
    }
  }

  // Responsive styles - mobile-first approach
  const isMobile = windowWidth < 640;
  const isSmall = windowWidth < 400;
  const isTiny = windowWidth < 360;
  
  const containerStyle: React.CSSProperties = { 
    width: '100%', 
    maxWidth: '600px', 
    padding: isTiny ? '8px' : isSmall ? '10px' : isMobile ? '12px' : '16px',
    boxSizing: 'border-box'
  };
  
  const cardStyle: React.CSSProperties = { 
    background: 'white', 
    borderRadius: isMobile ? '12px' : '24px',
    boxShadow: isMobile ? '0 10px 30px rgba(0,0,0,0.2)' : '0 20px 60px rgba(0,0,0,0.3)', 
    padding: isTiny ? '16px' : isSmall ? '18px' : isMobile ? '20px' : '48px',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden'
  };
  
  const buttonStyle: React.CSSProperties = { 
    width: '100%', 
    padding: isTiny ? '12px' : isMobile ? '14px' : '16px',
    borderRadius: isMobile ? '10px' : '12px', 
    border: 'none', 
    fontSize: isTiny ? '15px' : isMobile ? '16px' : '18px',
    fontWeight: '600', 
    cursor: 'pointer', 
    marginBottom: isMobile ? '12px' : '16px',
    minHeight: isTiny ? '44px' : '48px',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent'
  };

  const titleSize = isTiny ? '24px' : isSmall ? '28px' : isMobile ? '32px' : windowWidth < 768 ? '40px' : '48px';
  const qrSize = isTiny ? 120 : isSmall ? 140 : windowWidth < 640 ? 160 : 180;

  return (
    <div style={{
      ...containerStyle,
      maxWidth: '100vw',
      overflowX: 'hidden',
      margin: '0 auto'
    }}>
      <div style={{
        ...cardStyle,
        position: 'relative'
      }}>
        <h1 style={{ 
          fontSize: titleSize,
          fontWeight: '800', 
          textAlign: 'center', 
          marginBottom: isTiny ? '4px' : '8px', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent',
          wordBreak: 'break-word',
          lineHeight: '1.2'
        }}>
          ShareSaaS
        </h1>
        <p style={{ 
          textAlign: 'center', 
          color: '#666', 
          marginBottom: isTiny ? '16px' : isSmall ? '20px' : isMobile ? '24px' : '32px',
          fontSize: isTiny ? '12px' : isMobile ? '13px' : '16px',
          lineHeight: '1.4'
        }}>
          P2P File Sharing • {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </p>

        {error && (
          <div style={{ 
            padding: isTiny ? '10px' : isMobile ? '12px' : '16px',
            background: '#fee', 
            border: '1px solid #fcc', 
            borderRadius: isMobile ? '6px' : '8px', 
            color: '#c33', 
            marginBottom: isTiny ? '12px' : isMobile ? '16px' : '24px',
            fontSize: isTiny ? '12px' : isMobile ? '13px' : '14px',
            wordBreak: 'break-word',
            lineHeight: '1.4'
          }}>
            {error}
          </div>
        )}
        
        {!isConnected && role && (
          <div style={{ 
            padding: isTiny ? '10px' : isMobile ? '12px' : '16px',
            background: '#fff3cd', 
            border: '1px solid #ffc107', 
            borderRadius: isMobile ? '6px' : '8px', 
            color: '#856404', 
            marginBottom: isTiny ? '12px' : isMobile ? '16px' : '24px',
            fontSize: isTiny ? '12px' : isMobile ? '13px' : '14px',
            lineHeight: '1.4'
          }}>
            ⚠️ Connecting to signaling server...
          </div>
        )}

        {!role ? (
          <div>
            <button onClick={() => { 
              console.log('?? User clicked Send Files');
              setRole('sender'); 
              create();
              console.log('?? Creating new session...');
            }} style={{ ...buttonStyle, background: '#667eea', color: 'white' }}>
              ?? Send Files
            </button>
            <button onClick={() => {
              console.log('?? User clicked Receive Files');
              setRole('receiver');
            }} style={{ ...buttonStyle, background: '#764ba2', color: 'white' }}>
              ?? Receive Files
            </button>
          </div>
        ) : role === 'sender' && code ? (
          <div>
            <p style={{ 
              textAlign: 'center', 
              color: '#999', 
              fontSize: isTiny ? '11px' : isMobile ? '12px' : '14px',
              marginBottom: isTiny ? '6px' : '8px',
              lineHeight: '1.4'
            }}>
              Share this code:
            </p>
            <div style={{ 
              fontSize: isTiny ? '32px' : isSmall ? '40px' : isMobile ? '48px' : '56px',
              fontWeight: '800', 
              textAlign: 'center', 
              color: '#667eea', 
              letterSpacing: isTiny ? '2px' : isSmall ? '3px' : isMobile ? '4px' : '8px',
              marginBottom: isTiny ? '16px' : isSmall ? '20px' : isMobile ? '24px' : '32px',
              wordBreak: 'break-all',
              lineHeight: '1.2'
            }}>
              {code}
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginBottom: isTiny ? '16px' : isSmall ? '20px' : isMobile ? '24px' : '32px'
            }}>
              <div style={{ 
                padding: isTiny ? '8px' : isSmall ? '10px' : isMobile ? '12px' : '16px',
                background: 'white', 
                borderRadius: isMobile ? '12px' : '16px', 
                border: '2px solid #ddd',
                display: 'inline-block'
              }}>
                <QRCode 
                  value={`http://${typeof window !== 'undefined' ? location.hostname : 'localhost'}:3000?code=${code}`} 
                  size={qrSize} 
                />
              </div>
            </div>
            {peerConnected ? (
              <div>
                <label style={{ 
                  display: 'block', 
                  width: '100%', 
                  padding: isTiny ? '24px 12px' : isSmall ? '28px 14px' : isMobile ? '32px 16px' : '48px',
                  border: '2px dashed #ccc', 
                  borderRadius: isMobile ? '12px' : '16px', 
                  textAlign: 'center', 
                  cursor: 'pointer', 
                  background: '#f9f9f9',
                  minHeight: isTiny ? '100px' : '120px',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s'
                }}>
                  <input type="file" multiple onChange={(e) => handleSendFiles(e.target.files)} style={{ display: 'none' }} />
                  <div style={{ 
                    fontSize: isTiny ? '28px' : isSmall ? '32px' : isMobile ? '36px' : '48px', 
                    marginBottom: isTiny ? '8px' : isMobile ? '12px' : '16px',
                    lineHeight: '1'
                  }}>
                    📁
                  </div>
                  <div style={{ 
                    fontSize: isTiny ? '14px' : isSmall ? '15px' : isMobile ? '16px' : '18px',
                    fontWeight: '600', 
                    color: '#333',
                    lineHeight: '1.4'
                  }}>
                    Tap to select files
                  </div>
                </label>
                {files.length > 0 && (
                  <div style={{ marginTop: isTiny ? '12px' : isMobile ? '16px' : '24px' }}>
                    {files.map((f) => (
                      <div key={f.name} style={{ 
                        padding: isTiny ? '10px' : isMobile ? '12px' : '16px',
                        background: '#f5f5f5', 
                        borderRadius: '12px', 
                        marginBottom: '12px' 
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                          gap: '8px'
                        }}>
                          <span style={{ 
                            fontSize: isTiny ? '12px' : isMobile ? '13px' : '14px',
                            fontWeight: '600',
                            wordBreak: 'break-word',
                            flex: '1 1 auto',
                            minWidth: 0
                          }}>
                            {f.name}
                          </span>
                          <span style={{ 
                            fontSize: isTiny ? '10px' : isMobile ? '11px' : '12px',
                            color: '#666',
                            whiteSpace: 'nowrap'
                          }}>
                            {f.status}
                          </span>
                        </div>
                        <div style={{ 
                          fontSize: isTiny ? '10px' : isMobile ? '11px' : '12px',
                          color: '#999',
                          marginBottom: isTiny ? '6px' : '8px',
                          lineHeight: '1.3'
                        }}>
                          {(f.sent / 1024 / 1024).toFixed(2)} MB / {(f.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                        <div style={{ 
                          width: '100%', 
                          height: isTiny ? '4px' : isMobile ? '6px' : '8px',
                          background: '#ddd', 
                          borderRadius: '4px', 
                          overflow: 'hidden' 
                        }}>
                          <div style={{ 
                            width: `${(f.sent / f.size) * 100}%`, 
                            height: '100%', 
                            background: 'linear-gradient(90deg, #667eea, #764ba2)', 
                            transition: 'width 0.3s' 
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: isTiny ? '24px' : isSmall ? '28px' : isMobile ? '32px' : '48px',
                color: '#999',
                fontSize: isTiny ? '13px' : isMobile ? '14px' : '16px',
                lineHeight: '1.5'
              }}>
                ⏳ Waiting for receiver...
              </div>
            )}
          </div>
        ) : role === 'receiver' ? (
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: isTiny ? '12px' : isMobile ? '13px' : '14px',
              fontWeight: '600', 
              color: '#333', 
              marginBottom: '8px' 
            }}>
              Enter 6-digit code
            </label>
            <div style={{ 
              display: 'flex', 
              gap: isTiny ? '6px' : '8px', 
              marginBottom: isTiny ? '12px' : isMobile ? '16px' : '24px',
              flexDirection: 'column',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              alignItems: 'stretch'
            }}>
              <input 
                type="text" 
                value={inputCode} 
                onChange={(e) => setInputCode(e.target.value.slice(0, 6))} 
                maxLength={6} 
                placeholder="000000" 
                style={{ 
                  width: '100%',
                  maxWidth: '100%',
                  padding: isTiny ? '12px' : isMobile ? '14px' : '16px',
                  fontSize: isTiny ? '22px' : isSmall ? '24px' : isMobile ? '26px' : '28px',
                  textAlign: 'center', 
                  fontFamily: 'monospace', 
                  border: '2px solid #ddd', 
                  borderRadius: isMobile ? '10px' : '12px', 
                  outline: 'none',
                  boxSizing: 'border-box',
                  minHeight: isTiny ? '44px' : '48px',
                  letterSpacing: '2px',
                  WebkitAppearance: 'none'
                }} 
              />
              <button 
                onClick={() => {
                  console.log('?? Attempting to join session with code:', inputCode);
                  join(inputCode);
                }} 
                disabled={inputCode.length !== 6} 
                style={{ 
                  padding: isTiny ? '12px 20px' : isMobile ? '14px 24px' : '16px 32px',
                  background: inputCode.length === 6 ? '#764ba2' : '#ccc', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: isMobile ? '10px' : '12px', 
                  fontSize: isTiny ? '15px' : isMobile ? '16px' : '18px',
                  fontWeight: '600', 
                  cursor: inputCode.length === 6 ? 'pointer' : 'not-allowed',
                  minHeight: isTiny ? '44px' : '48px',
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  WebkitAppearance: 'none',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
              >
                Join
              </button>
            </div>
            {peerConnected && (
              <div style={{ 
                padding: isTiny ? '10px' : isMobile ? '12px' : '16px',
                background: '#efe', 
                border: '1px solid #cfc', 
                borderRadius: isMobile ? '8px' : '12px', 
                color: '#060', 
                marginBottom: isTiny ? '12px' : isMobile ? '16px' : '24px',
                fontSize: isTiny ? '12px' : isMobile ? '13px' : '14px',
                lineHeight: '1.4'
              }}>
                ✅ Connected to sender
              </div>
            )}
            {files.length > 0 && (
              <div>
                {files.map((f) => (
                  <div key={f.name} style={{ 
                    padding: isTiny ? '10px' : isMobile ? '12px' : '16px',
                    background: '#f5f5f5', 
                    borderRadius: '12px', 
                    marginBottom: '12px' 
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <span style={{ 
                        fontSize: isTiny ? '12px' : isMobile ? '13px' : '14px',
                        fontWeight: '600',
                        wordBreak: 'break-word',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        {f.name}
                      </span>
                      <span style={{ 
                        fontSize: isTiny ? '10px' : isMobile ? '11px' : '12px',
                        color: '#666',
                        whiteSpace: 'nowrap'
                      }}>
                        {f.status}
                      </span>
                    </div>
                    <div style={{ 
                      fontSize: isTiny ? '10px' : isMobile ? '11px' : '12px',
                      color: '#999',
                      marginBottom: isTiny ? '6px' : '8px',
                      lineHeight: '1.3'
                    }}>
                      {(f.sent / 1024 / 1024).toFixed(2)} MB / {(f.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: isTiny ? '4px' : isMobile ? '6px' : '8px',
                      background: '#ddd', 
                      borderRadius: '4px', 
                      overflow: 'hidden' 
                    }}>
                      <div style={{ 
                        width: `${(f.sent / f.size) * 100}%`, 
                        height: '100%', 
                        background: 'linear-gradient(90deg, #667eea, #764ba2)', 
                        transition: 'width 0.3s' 
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {role && (
          <button 
            onClick={() => { setRole(null); setFiles([]); setError(null); }} 
            style={{ 
              ...buttonStyle, 
              background: 'transparent', 
              border: '2px solid #ddd', 
              color: '#666', 
              marginTop: isTiny ? '12px' : isMobile ? '16px' : '24px',
              marginBottom: '0',
              transition: 'all 0.2s'
            }}
          >
            ↺ Reset
          </button>
        )}
      </div>
    </div>
  );
}

