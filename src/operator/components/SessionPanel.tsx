import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { OperatorSnapshot } from '../OperatorSession';
import type { SessionCredentials } from '../../lib/api';
import { Button, Notice } from '../../ui/controls';
import { publicOrigin } from '../../config/env';

export function robotLink(creds: SessionCredentials) {
  return `${publicOrigin()}/robot?t=${encodeURIComponent(creds.robotToken)}`;
}

export function SessionPanel({ s, creds }: { s: OperatorSnapshot; creds: SessionCredentials }) {
  const link = robotLink(creds);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#0b0c11', light: '#ffffff' } }).then(setQr);
  }, [link]);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <div className="rounded-2xl bg-white p-2">{qr && <img src={qr} alt="QR code do link do robô" className="w-full" />}</div>
      <div className="grid content-start gap-3">
        <div>
          <span className="eyebrow">Link do personagem</span>
          <p className="mt-2 break-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-white/60">{link}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar link'}
          </Button>
          <Button variant="subtle" onClick={() => window.open(link, '_blank', 'noopener')}>
            <ExternalLink size={14} /> Abrir aqui
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-white/45">
          Este link dá acesso apenas ao papel de robô desta sessão e expira em {new Date(creds.expiresAt).toLocaleString('pt-BR')}. Ele deixa de funcionar ao encerrar a sessão. Não o compartilhe publicamente.
        </p>
        <p className="font-mono text-[11px] text-white/30">Sessão {creds.sessionId}</p>
        {s.iceWarnings.map((w) => (
          <Notice key={w} tone="warn">
            {w}
          </Notice>
        ))}
      </div>
    </div>
  );
}
