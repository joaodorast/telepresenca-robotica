import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AudioLines, Camera, CameraOff, Mic, MicOff, WifiOff } from 'lucide-react';
import { RobotStage, type Quality } from '../character/RobotStage';
import { useDisposable, useStore } from '../lib/store';
import { cx } from '../ui/controls';
import { RobotSession } from './RobotSession';

/**
 * Tela exibida à pessoa diante do personagem. Mostra apenas o robô e o mínimo necessário:
 * nunca o vídeo da câmera, a imagem do operador ou controles administrativos.
 */
export default function RobotPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  // O token vem do link (?t=...) e fica guardado na aba para sobreviver a recarregamentos.
  const token = useMemo(() => {
    const fromUrl = params.get('t');
    try {
      if (fromUrl) sessionStorage.setItem('tp.robot.token', fromUrl);
      return fromUrl ?? sessionStorage.getItem('tp.robot.token');
    } catch {
      return fromUrl;
    }
  }, [params]);
  const quality = (['high', 'medium', 'low'].includes(params.get('q') ?? '') ? params.get('q') : 'high') as Quality;
  const session = useDisposable(() => (token ? new RobotSession(token) : null), [token]);
  useEffect(() => {
    // remove o token da barra de endereço após a leitura (evita exposição em capturas de tela)
    if (token) window.history.replaceState(null, '', `/robot${params.get('q') ? `?q=${params.get('q')}` : ''}`);
  }, [token, params]);

  if (!token) return <MissingToken />;
  if (!session) return <div className="stage-bg h-full" />;
  return <RobotView session={session} quality={quality} />;
}

function MissingToken() {
  return (
    <div className="stage-bg flex h-full items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <p className="eyebrow mb-3">Telepresença robótica</p>
        <h1 className="font-display text-2xl font-light">Link de sessão necessário</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          Abra nesta tela o link do personagem gerado na central do operador (ou leia o QR code exibido lá).
        </p>
      </div>
    </div>
  );
}

function RobotView({ session, quality }: { session: RobotSession; quality: Quality }) {
  const s = useStore(session);

  const begin = async () => {
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    } catch {
      /* tela cheia é opcional (iOS não suporta) */
    }
    void session.start();
  };

  const reconnecting = s.phase === 'running' && (s.signaling.state === 'reconnecting' || s.signaling.state === 'connecting');
  const capturing = s.camera === 'on' || s.mic === 'on';

  return (
    <div
      className="stage-bg relative h-full select-none overflow-hidden"
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
    >
      <RobotStage controller={session.controller} framing="face" quality={quality} className="!absolute inset-0" />

      {/* indicador de privacidade: câmera e microfone ativos */}
      {s.phase === 'running' && (
        <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md">
          <span className="flex items-center gap-1" title={s.cameraError ?? 'Câmera ativa'}>
            {s.camera === 'on' ? <Camera size={13} className="text-emerald-400" /> : <CameraOff size={13} className="text-white/40" />}
          </span>
          <span className="flex items-center gap-1" title={s.micError ?? 'Microfone ativo'}>
            {s.mic === 'on' ? <Mic size={13} className="text-emerald-400" /> : <MicOff size={13} className="text-white/40" />}
          </span>
          {capturing && <span>Câmera e microfone em uso</span>}
        </div>
      )}

      <AnimatePresence>
        {reconnecting && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-amber-300/20 bg-black/50 px-3 py-1.5 text-[11px] text-amber-100 backdrop-blur-md"
          >
            <WifiOff size={13} /> Reconectando…
          </motion.div>
        )}
      </AnimatePresence>

      {/* balão de fala durante a saudação (texto conhecido) */}
      <AnimatePresence>
        {s.caption && (
          <motion.div
            key="caption"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="absolute bottom-[7%] left-1/2 flex w-[min(88vw,560px)] -translate-x-1/2 items-center gap-4 rounded-2xl border border-white/10 bg-ink-900/70 px-5 py-4 shadow-2xl backdrop-blur-xl"
          >
            <p className="flex-1 font-display text-[clamp(16px,2.4vw,22px)] font-light leading-snug text-white/95">{s.caption}</p>
            <AudioLines className="shrink-0 text-gold-400" size={26} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* transparência: revelação ao final da demonstração */}
      <AnimatePresence>
        {s.reveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/85 to-transparent px-6 pb-10 pt-24"
          >
            <div className="max-w-xl text-center">
              <p className="eyebrow mb-2 text-gold-300/80">Bastidores</p>
              <p className="font-display text-[clamp(18px,2.6vw,26px)] font-light leading-snug">
                Este personagem foi conduzido em tempo real por um operador humano.
              </p>
              <p className="mt-2 text-sm text-white/55">A voz, as expressões e os gestos foram controlados remotamente — não se trata de uma inteligência artificial autônoma.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* início: o toque desbloqueia áudio, câmera e microfone */}
      <AnimatePresence>
        {s.phase === 'standby' && (
          <motion.div exit={{ opacity: 0 }} className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-6 pb-[8vh]">
            <motion.button
              onClick={begin}
              whileTap={{ scale: 0.96 }}
              className="rounded-full border border-gold-400/50 bg-black/50 px-8 py-4 font-display text-lg font-light tracking-wide text-white shadow-glow backdrop-blur-md"
            >
              Toque para iniciar
            </motion.button>
            <p className="max-w-sm text-center text-xs leading-relaxed text-white/45">
              Ao iniciar, a câmera e o microfone deste dispositivo serão compartilhados com a central de operação durante a sessão.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {(s.phase === 'starting' || (s.phase === 'running' && s.signaling.state === 'idle')) && (
        <div className="absolute bottom-[10vh] left-1/2 -translate-x-1/2 text-xs text-white/50">Preparando…</div>
      )}

      {s.phase === 'ended' && (
        <div className="absolute inset-0 flex items-end justify-center bg-black/45 pb-[10vh]">
          <div className={cx('rounded-2xl border border-white/10 bg-black/50 px-6 py-4 text-center backdrop-blur-md')}>
            <p className="font-display text-lg font-light">Sessão encerrada</p>
            <p className="mt-1 text-xs text-white/50">{s.endedReason}</p>
          </div>
        </div>
      )}
    </div>
  );
}
