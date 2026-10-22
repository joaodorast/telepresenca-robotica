// Laboratório visual do personagem — disponível apenas em desenvolvimento (npm run dev → /dev/stage).
// Útil para ajustar expressões e materiais sem precisar de dois dispositivos.
import { useMemo, useState } from 'react';
import { CharacterController } from '../character/CharacterController';
import { EXPRESSION_ORDER, EXPRESSIONS } from '../character/expressions';
import { RobotStage, type Framing } from '../character/RobotStage';
import type { ExpressionId } from '../shared/protocol';

export default function StageLab() {
  const params = new URLSearchParams(location.search);
  const controller = useMemo(() => {
    const c = new CharacterController();
    c.awake = params.get('sleep') ? 0 : 1;
    c.cameraActive = true;
    c.manualExpression = (params.get('e') as ExpressionId) || null;
    c.waving = params.has('wave');
    if (params.has('open')) c.mouthSource = () => ({ open: 0.6, width: 0.5, round: 0, level: 0.5 });
    return c;
  }, []);
  const [framing, setFraming] = useState<Framing>((params.get('f') as Framing) || 'face');
  const [, force] = useState(0);
  const hideUi = params.has('clean');
  return (
    <div className="stage-bg relative h-full">
      <RobotStage controller={controller} framing={framing} className="!absolute inset-0" />
      {!hideUi && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-2">
          {EXPRESSION_ORDER.map((e) => (
            <button key={e} className="rounded-lg bg-white/10 px-3 py-1 text-xs" onClick={() => ((controller.manualExpression = e), force((n) => n + 1))}>
              {EXPRESSIONS[e].label}
            </button>
          ))}
          <button className="rounded-lg bg-gold-500/30 px-3 py-1 text-xs" onClick={() => void controller.playGreeting({ wave: true, speak: () => new Promise((r) => setTimeout(r, 2500)) })}>
            Saudação
          </button>
          <button className="rounded-lg bg-white/10 px-3 py-1 text-xs" onClick={() => setFraming(framing === 'face' ? 'full' : 'face')}>
            Enquadramento
          </button>
        </div>
      )}
    </div>
  );
}
