// Captura de câmera e microfone com mensagens de erro claras em português.

export type MediaFailureKind = 'denied' | 'not-found' | 'busy' | 'insecure' | 'unsupported' | 'unknown';

export interface MediaFailure {
  kind: MediaFailureKind;
  message: string;
}

export function mediaSupportIssue(): MediaFailure | null {
  if (!window.isSecureContext) {
    return {
      kind: 'insecure',
      message: 'Câmera e microfone exigem HTTPS (ou localhost). Abra a aplicação por um endereço seguro.',
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { kind: 'unsupported', message: 'Este navegador não oferece acesso a câmera e microfone.' };
  }
  return null;
}

export function describeMediaError(err: unknown, device: 'câmera' | 'microfone'): MediaFailure {
  const issue = mediaSupportIssue();
  if (issue) return issue;
  const name = (err as DOMException)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { kind: 'denied', message: `Permissão de ${device} negada. Libere o acesso no cadeado da barra de endereço e tente novamente.` };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { kind: 'not-found', message: `Nenhum(a) ${device} encontrado(a) neste dispositivo.` };
    case 'NotReadableError':
    case 'AbortError':
      return { kind: 'busy', message: `O(a) ${device} está em uso por outro aplicativo ou indisponível no momento.` };
    default:
      return { kind: 'unknown', message: `Falha ao acessar ${device}: ${(err as Error)?.message || 'erro desconhecido'}.` };
  }
}

export interface MicOptions {
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export async function requestMicrophone(o: MicOptions = {}): Promise<MediaStream> {
  const issue = mediaSupportIssue();
  if (issue) throw Object.assign(new Error(issue.message), { name: 'SecurityError' });
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: o.deviceId ? { exact: o.deviceId } : undefined,
      echoCancellation: o.echoCancellation ?? true,
      noiseSuppression: o.noiseSuppression ?? true,
      autoGainControl: o.autoGainControl ?? false,
      channelCount: 1,
    },
    video: false,
  });
}

export async function requestCamera(deviceId?: string): Promise<MediaStream> {
  const issue = mediaSupportIssue();
  if (issue) throw Object.assign(new Error(issue.message), { name: 'SecurityError' });
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      facingMode: deviceId ? undefined : 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 24, max: 30 },
    },
    audio: false,
  });
}

export interface DeviceLists {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
}

export async function listDevices(): Promise<DeviceLists> {
  const all = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
  return {
    audioInputs: all.filter((d) => d.kind === 'audioinput'),
    audioOutputs: all.filter((d) => d.kind === 'audiooutput'),
    videoInputs: all.filter((d) => d.kind === 'videoinput'),
  };
}

export const supportsOutputSelection = () => 'setSinkId' in HTMLMediaElement.prototype;

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
