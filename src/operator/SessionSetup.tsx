import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogOut, Sparkles } from 'lucide-react';
import { api, ApiError, type SessionCredentials } from '../lib/api';
import { Button, Notice } from '../ui/controls';
import { BrandMark } from './components/Brand';

export function SessionSetup({
  adminToken,
  onCreated,
  onLogout,
}: {
  adminToken: string;
  onCreated: (c: SessionCredentials) => void;
  onLogout: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createSession(adminToken));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onLogout();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stage-bg flex min-h-full items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel w-full max-w-lg p-8">
        <div className="flex items-center justify-between">
          <BrandMark />
          <Button variant="subtle" onClick={onLogout}>
            <LogOut size={15} /> Sair
          </Button>
        </div>
        <h1 className="mt-8 font-display text-2xl font-light">Nova sessão de telepresença</h1>
        <ol className="mt-4 space-y-2 text-sm text-white/60">
          <li>1. Crie a sessão para gerar um link exclusivo e temporário do personagem.</li>
          <li>2. Abra o link (ou o QR code) no dispositivo que representa o robô e toque em “Iniciar”.</li>
          <li>3. Inicie a central para ativar seu microfone e conduzir a interação.</li>
        </ol>
        {error && (
          <div className="mt-5">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <Button variant="gold" className="mt-8 w-full" onClick={create} disabled={busy}>
          <Sparkles size={16} /> {busy ? 'Criando…' : 'Criar sessão'}
        </Button>
      </motion.div>
    </div>
  );
}
