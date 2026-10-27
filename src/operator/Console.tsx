import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, Hand, Link2, SlidersHorizontal } from 'lucide-react';
import type { SessionCredentials } from '../lib/api';
import { useDisposable, useStore } from '../lib/store';
import { Button, cx, Notice } from '../ui/controls';
import { OperatorSession } from './OperatorSession';
import { TopBar } from './components/TopBar';
import { LiveVideo } from './components/LiveVideo';
import { AudioDock } from './components/AudioDock';
import { ExpressionPad, RobotPreview, SessionActions } from './components/RobotPanel';
import { VoiceLab } from './components/VoiceLab';
import { GreetingPanel } from './components/GreetingPanel';
import { DevicesPanel } from './components/DevicesPanel';
import { SessionPanel } from './components/SessionPanel';

type Tab = 'voice' | 'greeting' | 'devices' | 'session';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'voice', label: 'Voz robótica', icon: <AudioLines size={15} /> },
  { id: 'greeting', label: 'Saudação', icon: <Hand size={15} /> },
  { id: 'devices', label: 'Áudio e dispositivos', icon: <SlidersHorizontal size={15} /> },
  { id: 'session', label: 'Link do robô', icon: <Link2 size={15} /> },
];

interface ConsoleProps {
  creds: SessionCredentials;
  /** Inicia a sessão sem clique (janela aberta por `npm run lan`, que libera áudio sem gesto). */
  autoStart?: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export function Console(props: ConsoleProps) {
  const session = useDisposable(() => new OperatorSession(props.creds), [props.creds]);
  return session ? <ConsoleView session={session} {...props} /> : null;
}

function ConsoleView({ session, creds, autoStart, onClose, onLogout }: ConsoleProps & { session: OperatorSession }) {
  const s = useStore(session);
  const [tab, setTab] = useState<Tab>('session');
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    if (autoStart) void session.start();
  }, [session, autoStart]);

  // Quando o robô conecta, a aba mais útil passa a ser a da voz.
  useEffect(() => {
    if (s.robotPresent) setTab((t) => (t === 'session' ? 'voice' : t));
  }, [s.robotPresent]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (session.getSnapshot().phase === 'live') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session]);

  if (s.phase === 'ended') {
    return (
      <div className="stage-bg flex min-h-full items-center justify-center p-6">
        <div className="panel max-w-md p-8 text-center">
          <p className="font-display text-2xl font-light">Sessão encerrada</p>
          <p className="mt-2 text-sm text-white/50">{s.error ?? 'O link do robô foi invalidado e as mídias foram liberadas.'}</p>
          <Button variant="gold" className="mt-6" onClick={onClose}>
            Criar nova sessão
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="stage-bg min-h-full">
      <TopBar s={s} session={session} onLogout={onLogout} />
      <main className="mx-auto grid max-w-[1600px] gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:p-6">
        <div className="grid min-w-0 content-start gap-5">
          {s.error && <Notice tone="error">{s.error}</Notice>}
          <LiveVideo s={s} session={session} onShowLink={() => setTab('session')} />
          <AudioDock s={s} session={session} />
          <section className="panel">
            <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cx('relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm transition', tab === t.id ? 'text-white' : 'text-white/45 hover:text-white/80')}
                >
                  {t.icon}
                  {t.label}
                  {tab === t.id && <motion.span layoutId="tab-line" className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-gold-400" />}
                </button>
              ))}
            </nav>
            <div className="p-5">
              {tab === 'voice' && <VoiceLab s={s} session={session} />}
              {tab === 'greeting' && <GreetingPanel s={s} session={session} />}
              {tab === 'devices' && <DevicesPanel s={s} session={session} />}
              {tab === 'session' && <SessionPanel s={s} creds={creds} />}
            </div>
          </section>
        </div>

        <aside className="grid content-start gap-5">
          <RobotPreview s={s} session={session} />
          <ExpressionPad s={s} session={session} />
          {confirmEnd ? (
            <div className="panel grid gap-2 p-4">
              <p className="text-sm">Encerrar a sessão? O link do robô deixará de funcionar.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setConfirmEnd(false)}>Cancelar</Button>
                <Button variant="danger" onClick={() => (s.phase === 'live' ? session.endSession() : (session.dispose(), onClose()))}>
                  Encerrar
                </Button>
              </div>
            </div>
          ) : (
            <SessionActions s={s} session={session} onEnd={() => setConfirmEnd(true)} />
          )}
        </aside>
      </main>
    </div>
  );
}
