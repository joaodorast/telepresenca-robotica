import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { api } from '../lib/api';
import { SIGNALING_CONFIGURED, SIGNALING_HTTP } from '../config/env';
import { Button, Notice } from '../ui/controls';
import { BrandMark } from './components/Brand';

export function LoginScreen({ onLogin }: { onLogin: (a: { token: string; expiresAt: number }) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.login(password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stage-bg flex min-h-full items-center justify-center p-6">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel w-full max-w-sm p-8"
      >
        <BrandMark />
        <h1 className="mt-6 font-display text-2xl font-light">Central do Operador</h1>
        <p className="mt-1 text-sm text-white/50">Acesso restrito à equipe que conduz o personagem.</p>
        <label className="mt-6 block">
          <span className="eyebrow">Senha de acesso</span>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 focus-within:border-gold-400/60">
            <Lock size={15} className="text-white/40" />
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-white/25"
              placeholder="••••••••"
            />
          </div>
        </label>
        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {!SIGNALING_CONFIGURED && (
          <div className="mt-4">
            <Notice tone="info">VITE_SIGNALING_URL não definido — usando {SIGNALING_HTTP}.</Notice>
          </div>
        )}
        <Button type="submit" variant="gold" className="mt-6 w-full" disabled={!password || busy}>
          {busy ? 'Verificando…' : 'Entrar'}
        </Button>
      </motion.form>
    </div>
  );
}
