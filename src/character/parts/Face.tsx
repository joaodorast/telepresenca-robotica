import { useMemo } from 'react';
import * as THREE from 'three';
import type { RobotMaterials } from '../materials';
import type { RobotRig } from '../rig';
import { MouthGeometry } from './mouthGeometry';

const EYE_R = 0.28;
const EYE_X = 0.405;
const EYE_Y = 0.06;
const EYE_Z = 0.6;
const FACE_SCALE: [number, number, number] = [0.95, 1.05, 0.9];

/** Calota esférica voltada para +Z, com UV planar (para a textura radial da íris). */
function capGeometry(radius: number, angle: number, seg = 48) {
  const g = new THREE.SphereGeometry(radius, seg, 12, 0, Math.PI * 2, 0, angle);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const r = radius * Math.sin(angle);
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * r) + 0.5, p.getY(i) / (2 * r) + 0.5);
  uv.needsUpdate = true;
  return g;
}

function useFaceGeometries(segments: number) {
  return useMemo(() => {
    const s = segments;
    return {
      face: new THREE.SphereGeometry(1, s, Math.round(s * 0.75)),
      helmetTop: new THREE.SphereGeometry(1.045, s, s / 2, 0, Math.PI * 2, 0, 0.9),
      // laterais e nuca, com abertura frontal para o rosto (corte tipo "chanel")
      helmetBack: new THREE.SphereGeometry(1.04, s, s / 2, Math.PI / 2 + 0.92, Math.PI * 2 - 1.84, 0.2, 1.95),
      sclera: new THREE.SphereGeometry(EYE_R, 40, 28),
      iris: capGeometry(EYE_R * 1.004, 0.74),
      pupil: capGeometry(EYE_R * 1.008, 0.3, 32),
      cornea: new THREE.SphereGeometry(EYE_R * 1.03, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(Math.PI / 2),
      lidTop: new THREE.SphereGeometry(EYE_R * 1.075, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      lidBottom: new THREE.SphereGeometry(EYE_R * 1.07, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      lashTop: new THREE.TorusGeometry(EYE_R * 1.075, 0.017, 8, 40, Math.PI).rotateX(Math.PI / 2),
      lashBottom: new THREE.TorusGeometry(EYE_R * 1.07, 0.006, 6, 40, Math.PI).rotateX(Math.PI / 2),
      catchBig: new THREE.CircleGeometry(0.042, 24),
      catchSmall: new THREE.CircleGeometry(0.02, 16),
      brow: new THREE.TorusGeometry(0.34, 0.019, 8, 24, 0.75),
      blush: new THREE.PlaneGeometry(0.26, 0.15),
      nose: new THREE.SphereGeometry(0.035, 16, 12),
      earCup: new THREE.CylinderGeometry(0.33, 0.33, 0.22, 48),
      earRing: new THREE.TorusGeometry(0.255, 0.018, 12, 64),
      earHalo: new THREE.TorusGeometry(0.255, 0.06, 12, 64),
      earCap: new THREE.CylinderGeometry(0.22, 0.22, 0.02, 48),
      band: new THREE.TorusGeometry(1.13, 0.055, 16, 80, Math.PI),
      teeth: new THREE.PlaneGeometry(1, 1),
      tongue: new THREE.CircleGeometry(1, 24),
    };
  }, [segments]);
}

type Geos = ReturnType<typeof useFaceGeometries>;

function Eye({ side, rig, m, g }: { side: 0 | 1; rig: RobotRig; m: RobotMaterials; g: Geos }) {
  const sx = side === 0 ? -1 : 1;
  const slot = rig.eyes[side];
  const catchDir = new THREE.Vector3(-0.32, 0.36, 0.88).normalize().multiplyScalar(EYE_R * 1.012);
  const catchDir2 = new THREE.Vector3(0.2, -0.22, 0.95).normalize().multiplyScalar(EYE_R * 1.012);
  return (
    <group position={[sx * EYE_X, EYE_Y, EYE_Z]}>
      <group ref={(o) => (slot.shape = o ?? undefined)} scale={[1, 1.12, 1]}>
        <mesh geometry={g.sclera} material={m.sclera} />
        <group ref={(o) => (slot.gaze = o ?? undefined)}>
          <mesh geometry={g.iris} material={m.iris} />
          <mesh ref={(o) => (slot.pupil = o ?? undefined)} geometry={g.pupil} material={m.pupil} />
        </group>
        <mesh geometry={g.cornea} material={m.cornea} renderOrder={2} />
        <mesh geometry={g.catchBig} material={m.catchlight} position={catchDir} onUpdate={(o) => o.lookAt(catchDir.clone().multiplyScalar(2))} />
        <mesh geometry={g.catchSmall} material={m.catchlight} position={catchDir2} onUpdate={(o) => o.lookAt(catchDir2.clone().multiplyScalar(2))} />
        <group ref={(o) => (slot.lidTop = o ?? undefined)}>
          <mesh geometry={g.lidTop} material={m.porcelain} />
          <mesh geometry={g.lashTop} material={m.lash} />
        </group>
        <group ref={(o) => (slot.lidBottom = o ?? undefined)}>
          <mesh geometry={g.lidBottom} material={m.porcelain} />
          <mesh geometry={g.lashBottom} material={m.lash} />
        </group>
      </group>
    </group>
  );
}

function Brow({ side, rig, m, g }: { side: 0 | 1; rig: RobotRig; m: RobotMaterials; g: Geos }) {
  const sx = side === 0 ? -1 : 1;
  return (
    <group position={[sx * 0.4, 0.43, 0.75]} rotation={[-0.48, sx * 0.46, 0]}>
      <group ref={(o) => o && (rig.brows[side] = o)}>
        <mesh geometry={g.brow} material={m.brow} rotation={[0, 0, Math.PI / 2 - 0.375]} position={[0, -0.34, 0]} />
      </group>
    </group>
  );
}

function Mouth({ rig, m, g }: { rig: RobotRig; m: RobotMaterials; g: Geos }) {
  const mouth = useMemo(() => new MouthGeometry(), []);
  const refs = useMemo(() => ({ teeth: null as THREE.Mesh | null, tongue: null as THREE.Mesh | null }), []);
  rig.mouth = {
    update: (s) => {
      mouth.update(s);
      const { w, top, bottom } = mouth.metrics;
      const h = top - bottom;
      const visible = s.open > 0.06;
      if (refs.teeth) {
        refs.teeth.visible = visible;
        refs.teeth.scale.set(w * 1.5, Math.min(0.045, h * 0.3), 1);
        refs.teeth.position.set(0, top - Math.min(0.045, h * 0.3) / 2 + 0.002, 0.012);
      }
      if (refs.tongue) {
        refs.tongue.visible = visible;
        refs.tongue.scale.set(w * 0.72, Math.max(0.004, h * 0.32), 1);
        refs.tongue.position.set(0, bottom + h * 0.08, 0.01);
      }
    },
  };
  return (
    <group position={[0, -0.47, 0.812]} rotation={[0.405, 0, 0]}>
      <mesh geometry={mouth.geometry} material={m.mouth} renderOrder={5} frustumCulled={false} />
      <mesh ref={(o) => (refs.teeth = o)} geometry={g.teeth} material={m.teeth} renderOrder={6} visible={false} />
      <mesh ref={(o) => (refs.tongue = o)} geometry={g.tongue} material={m.tongue} renderOrder={6} visible={false} />
    </group>
  );
}

/** Rosto completo: porcelana, capacete/cabelo, fones com anéis dourados, olhos, sobrancelhas e boca. */
export function Face({ rig, m, segments }: { rig: RobotRig; m: RobotMaterials; segments: number }) {
  const g = useFaceGeometries(segments);
  return (
    <group>
      <group scale={FACE_SCALE}>
        <mesh geometry={g.face} material={m.porcelain} />
        <mesh geometry={g.helmetTop} material={m.helmet} />
        <mesh geometry={g.helmetBack} material={m.helmet} />
      </group>

      {/* fones/“orelhas” com anéis luminosos */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 1.02, 0.02, -0.02]}>
          <mesh geometry={g.earCup} material={m.darkGloss} rotation={[0, 0, Math.PI / 2]} />
          <mesh geometry={g.earCap} material={m.graphite} rotation={[0, 0, Math.PI / 2]} position={[sx * 0.115, 0, 0]} />
          <mesh geometry={g.earRing} material={m.goldGlow} rotation={[0, Math.PI / 2, 0]} position={[sx * 0.122, 0, 0]} />
          <mesh geometry={g.earHalo} material={m.goldHalo} rotation={[0, Math.PI / 2, 0]} position={[sx * 0.125, 0, 0]} />
        </group>
      ))}
      <mesh geometry={g.band} material={m.darkGloss} position={[0, 0.02, -0.12]} rotation={[-0.12, 0, 0]} />

      <mesh geometry={g.nose} material={m.porcelain} position={[0, -0.17, 0.875]} scale={[1, 0.8, 0.7]} />
      {[-1, 1].map((sx) => (
        <mesh key={sx} geometry={g.blush} material={m.blush} position={[sx * 0.6, -0.23, 0.69]} rotation={[0.1, sx * 0.62, 0]} />
      ))}

      <Eye side={0} rig={rig} m={m} g={g} />
      <Eye side={1} rig={rig} m={m} g={g} />
      <Brow side={0} rig={rig} m={m} g={g} />
      <Brow side={1} rig={rig} m={m} g={g} />
      <Mouth rig={rig} m={m} g={g} />
    </group>
  );
}
