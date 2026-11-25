export function supportsWebRTC(): boolean {
  return typeof window !== 'undefined' && 'RTCPeerConnection' in window && 'RTCDataChannel' in window;
}

export function supportsQrScan(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    !!navigator.mediaDevices?.getUserMedia &&
    window.isSecureContext
  );
}

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}
