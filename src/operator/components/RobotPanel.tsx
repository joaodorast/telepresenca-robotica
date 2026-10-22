import { motion } from 'framer-motion';
import { Hand, Power, Wand2 } from 'lucide-react';
import { FaceIcon } from '../../character/FaceIcon';
import { EXPRESSION_ORDER, EXPRESSIONS } from '../../character/expressions';
import { RobotStage } from '../../character/RobotStage';
import type { OperatorSession, OperatorSnapshot } from '../OperatorSession';
import { Button, cx, Dot } from '../../ui/controls';
import { ACTIVITY_LABEL } from './status';

export function RobotPreview({ s, session }: { s: OperatorSnapshot; session: OperatorSession }) {
  const activity = s.robot && s.robotPresent ? ACTIVITY_LABEL[s.robot.activity] : 'Desconectado';
  const tone = !s.robot || !s.robotPresent ? 'idle' : s.robot.activity === 'speaking' || s.robot.activity === 'greeting' ? 'ok' : s.robot.activity === 'listening' ? 'info' : 'warn';
  return (
    <section className="panel relative overflow-hidden">
      <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
        <span className="eyebrow">Pré-visualização</span>
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/50 px-2.5 py-1 text-[11px] backdrop-blur">
        <Dot tone={tone} pulse /> {activity}
      </div>
      <div className="h-[280px] bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,170,70,.12),transparent_65%)]">
        <RobotStage controller={session.preview} framing="full" quality="medium" ambient={false} className="!h-full" />
      </div>
      {s.robot && s.robotPresent && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.06] px-4 py-2 text-[11px] text-white/45">
          <span>Câmera: {s.robot.camera === 'on' ? 'ativa' : s.robot.camera === 'error' ? 'erro' : 'desligada'}</span>
          <span>Microfone: {s.robot.mic === 'on' ? 'ativo' : s.robot.mic === 'error' ? 'erro' : 'desligado'}</span>
          {!s.robot.audioUnlocked && <span className="text-amber-300">Áudio bloqueado no robô — toque na tela dele</span>}
        </div>
      )}
    </section>
  );
}

export function ExpressionPad({ s, session }: { s: OperatorSnapshot; session: OperatorSession }) {
  const shown = s.robot?.expression;
  const disabled = !s.robotPresent;
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Expressões</p>
        <button
          onClick={() => session.setExpression(null)}
          disabled={disabled}
          className={cx(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition disabled:opacity-40',
            s.manualExpression === null ? 'border-gold-400/50 bg-gold-400/10 text-gold-200' : 'border-white/10 text-white/60 hover:text-white',
          )}
          title="Alterna automaticamente entre falando, escutando e repouso"
        >
          <Wand2 size={12} /> Automático
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-4">
        {EXPRESSION_ORDER.map((id) => {
          const selected = s.manualExpression === id;
          const live = shown === id;
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.94 }}
              disabled={disabled}
              onClick={() => session.setExpression(selected ? null : id)}
              className={cx(
                'group relative flex flex-col items-center gap-1 rounded-xl border px-1 pb-1.5 pt-2 text-[10.5px] transition disabled:opacity-40',
                selected ? 'border-gold-400/70 bg-gold-400/10 text-gold-100 shadow-glow' : 'border-white/[0.06] bg-white/[0.02] text-white/65 hover:border-white/20 hover:text-white',
              )}
              title={selected ? 'Clique para voltar ao automático' : `Definir “${EXPRESSIONS[id].label}”`}
            >
              {live && !selected && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" title="Exibida agora" />}
              <FaceIcon expression={id} size={38} />
              {EXPRESSIONS[id].label}
            </motion.button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/35">
        O ponto verde indica a expressão exibida agora no robô. Em “Automático”, ela acompanha a fala e a escuta reais.
      </p>
    </section>
  );
}

export function SessionActions({ s, session, onEnd }: { s: OperatorSnapshot; session: OperatorSession; onEnd: () => void }) {
  return (
    <div className="grid gap-2">
      <Button variant="gold" onClick={() => session.greet()} disabled={!s.robotPresent || s.robot?.activity === 'greeting'}>
        <Hand size={16} /> {s.robot?.activity === 'greeting' ? 'Saudando…' : 'Repetir saudação'}
      </Button>
      <Button variant="danger" onClick={onEnd}>
        <Power size={16} /> Encerrar sessão
      </Button>
    </div>
  );
}
