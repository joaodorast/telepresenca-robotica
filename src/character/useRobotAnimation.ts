import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { CharacterController } from './CharacterController';
import { EXPRESSIONS, NEUTRAL, PARAM_KEYS, type FaceParams } from './expressions';
import type { RobotMaterials } from './materials';
import type { RobotRig } from './rig';

export const HEAD_PIVOT_Y = -1.55;

const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Loop de animação único do personagem: interpola expressões, pisca, faz micro-movimentos
 * de olhar (sacadas), respira, inclina a cabeça, sincroniza a boca e anima o aceno.
 * Nenhuma alocação por quadro.
 */
export function useRobotAnimation(controller: CharacterController, rig: RobotRig, m: RobotMaterials) {
  const cur = useRef<FaceParams>({ ...NEUTRAL });
  const s = useRef({
    awake: controller.awake,
    blink: 0,
    blinkStart: -1,
    nextBlink: 2,
    doubleBlink: false,
    gx: 0,
    gy: 0,
    tgx: 0,
    tgy: 0,
    nextSaccade: 1,
    wave: 0,
    tilt: 0,
    open: 0,
    width: 0.5,
    round: 0,
    level: 0,
  });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const st = s.current;
    const p = cur.current;

    // 1. expressão-alvo com transição suave
    const target = EXPRESSIONS[controller.expression].params;
    for (const k of PARAM_KEYS) p[k] = damp(p[k], target[k], 5.5, dt);
    st.awake = damp(st.awake, controller.awake, 2.4, dt);
    st.tilt = damp(st.tilt, controller.tiltBoost, 3, dt);
    const awake = smooth(Math.min(1, Math.max(0, st.awake)));

    // 2. piscadas naturais (intervalo aleatório, às vezes duplas)
    if (controller.blinkRequest) {
      controller.blinkRequest = false;
      st.nextBlink = t;
    }
    if (t >= st.nextBlink && st.blinkStart < 0) {
      st.blinkStart = t;
      st.doubleBlink = Math.random() < 0.18;
    }
    if (st.blinkStart >= 0) {
      const bt = (t - st.blinkStart) / 0.16;
      st.blink = bt < 0.5 ? smooth(bt * 2) : bt < 1 ? smooth(2 - bt * 2) : 0;
      if (bt >= 1) {
        st.blinkStart = -1;
        st.nextBlink = t + (st.doubleBlink ? 0.12 : 2.2 + Math.random() * 3.8);
        st.doubleBlink = false;
      }
    }

    // 3. olhar: sacadas sutis, ou fixo na câmera durante a saudação
    if (controller.gazeLock) {
      st.tgx = 0;
      st.tgy = 0;
    } else if (t > st.nextSaccade) {
      st.tgx = (Math.random() - 0.5) * 0.5;
      st.tgy = (Math.random() - 0.5) * 0.3;
      if (Math.random() < 0.45) st.tgx = st.tgy = 0; // volta a olhar para a pessoa
      st.nextSaccade = t + 0.8 + Math.random() * 2.4;
    }
    st.gx = damp(st.gx, st.tgx, 16, dt);
    st.gy = damp(st.gy, st.tgy, 16, dt);

    // 4. boca: análise do áudio em tempo real, ou visemas do texto (síntese do navegador)
    const live = controller.textVisemes.sample() ?? controller.mouthSource?.() ?? null;
    const lOpen = live ? live.open : 0;
    const lLevel = live ? live.level : 0;
    st.open = damp(st.open, lOpen, 22, dt);
    st.width = damp(st.width, live ? live.width : 0.5, 18, dt);
    st.round = damp(st.round, live ? live.round : 0, 18, dt);
    st.level = damp(st.level, lLevel, 12, dt);
    const talk = Math.min(1, st.level * 3);
    rig.mouth?.update({
      smile: p.smile * (1 - 0.45 * talk) * awake,
      open: Math.max(p.open * (1 - talk), st.open * 0.95),
      width: lerp(p.width, st.width, talk * 0.85),
      round: Math.max(p.round * (1 - talk), st.round),
      skew: p.skew,
    });

    // 5. olhos e pálpebras
    const sleepLid = 1 - awake;
    const lidTop = Math.min(1, Math.max(p.lidTop, st.blink, sleepLid * 1.05));
    const upper = lerp(-0.72, 0.1, lidTop);
    // ao fechar por completo, a pálpebra inferior sobe para encontrar a superior
    const closing = smooth(Math.min(1, Math.max(0, (lidTop - 0.55) / 0.45)));
    const lower = lerp(lerp(0.88, 0.32, Math.min(1, p.lidBottom + talk * 0.08)), 0.02, closing);
    const eyeOpen = p.eyeOpen;
    for (let i = 0; i < 2; i++) {
      const e = rig.eyes[i];
      if (e.lidTop) e.lidTop.rotation.x = upper;
      if (e.lidBottom) e.lidBottom.rotation.x = lower;
      if (e.gaze) {
        e.gaze.rotation.y = st.gx * 0.55;
        e.gaze.rotation.x = -st.gy * 0.45;
      }
      if (e.pupil) e.pupil.scale.set(p.pupil, p.pupil, 1);
      if (e.shape) e.shape.scale.set(eyeOpen, 1.12 * eyeOpen, 1);
    }

    // 6. sobrancelhas
    for (let i = 0; i < 2; i++) {
      const b = rig.brows[i];
      if (!b) continue;
      const sx = i === 0 ? -1 : 1;
      const asym = p.browAsym * (i === 0 ? 1 : -1);
      b.position.y = p.browY * 0.12 + asym * 0.06 + talk * 0.012 * Math.sin(t * 9);
      b.rotation.z = -sx * (p.browAngle * 0.5 + asym * 0.16);
    }

    // 7. cabeça: pose da expressão + respiração + inclinação da saudação + seguir o olhar
    if (rig.headPivot) {
      const h = rig.headPivot;
      h.rotation.x = p.pitch + (1 - awake) * 0.16 + Math.sin(t * 0.7) * 0.012 + st.gy * -0.06 - talk * 0.02 * Math.sin(t * 6.5);
      h.rotation.y = p.yaw + Math.sin(t * 0.31) * 0.035 + st.gx * 0.12;
      h.rotation.z = p.tilt + st.tilt + Math.sin(t * 0.43 + 1) * 0.016;
      h.position.y = HEAD_PIVOT_Y + Math.sin(t * 1.25) * 0.012 - (1 - awake) * 0.06;
    }
    if (rig.body) rig.body.scale.y = 1 + Math.sin(t * 1.25) * 0.004;

    // 8. aceno
    st.wave = damp(st.wave, controller.waving ? 1 : 0, controller.waving ? 3.2 : 2.6, dt);
    const w = smooth(Math.min(1, Math.max(0, st.wave)));
    const { shoulder, elbow, hand } = rig.arm;
    if (shoulder && elbow && hand) {
      const osc = Math.sin(t * 7.2);
      shoulder.rotation.z = lerp(-0.08, -2.32, w);
      shoulder.rotation.x = lerp(0, 0.42, w);
      shoulder.rotation.y = lerp(0, -0.25, w);
      elbow.rotation.z = lerp(0.04, -0.82 + osc * 0.32, w);
      hand.rotation.z = osc * 0.22 * w;
    }

    // 9. brilho âmbar: aumenta ao despertar e pulsa levemente com a fala
    m.goldGlow.emissiveIntensity = (0.3 + 1.2 * awake) * (1 + st.level * 0.5);
    m.goldHalo.opacity = (0.05 + 0.13 * awake) * (1 + st.level * 0.8);
  });
}
