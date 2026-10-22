import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { RobotMaterials } from '../materials';
import type { RobotRig } from '../rig';

export const ARM = { upper: 1.05, fore: 0.95 };

/**
 * Braço articulado (ombro → cotovelo → mão com dedos). O braço do lado esquerdo da tela
 * é o que acena; o outro permanece em repouso junto ao corpo.
 */
export function Arm({ side, m, rig }: { side: -1 | 1; m: RobotMaterials; rig?: RobotRig }) {
  const g = useMemo(
    () => ({
      upper: new THREE.CapsuleGeometry(0.16, ARM.upper - 0.2, 8, 20),
      fore: new THREE.CapsuleGeometry(0.14, ARM.fore - 0.2, 8, 20),
      joint: new THREE.SphereGeometry(0.17, 24, 16),
      shoulder: new THREE.SphereGeometry(0.3, 32, 20),
      ring: new THREE.TorusGeometry(0.17, 0.02, 8, 32),
      finger: new THREE.CapsuleGeometry(0.042, 0.14, 6, 12),
      knuckle: new THREE.SphereGeometry(0.048, 12, 10),
    }),
    [],
  );
  const bind = rig?.arm;
  return (
    <group position={[side * 1.52, -0.52, 0.05]}>
      <mesh geometry={g.shoulder} material={m.darkGloss} />
      <group ref={(o) => bind && (bind.shoulder = o ?? undefined)} rotation={[0, 0, side * 0.08]}>
        <mesh geometry={g.upper} material={m.shellWhite} position={[0, -ARM.upper / 2, 0]} />
        <mesh geometry={g.ring} material={m.gold} position={[0, -0.22, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <group ref={(o) => bind && (bind.elbow = o ?? undefined)} position={[0, -ARM.upper, 0]}>
          <mesh geometry={g.joint} material={m.graphite} />
          <mesh geometry={g.fore} material={m.shellWhite} position={[0, -ARM.fore / 2, 0]} />
          <group ref={(o) => bind && (bind.hand = o ?? undefined)} position={[0, -ARM.fore, 0]}>
            <mesh geometry={g.joint} material={m.graphite} scale={0.7} />
            <RoundedBox args={[0.34, 0.34, 0.13]} radius={0.06} smoothness={3} position={[0, -0.2, 0]} material={m.shellWhite} />
            {[-0.115, -0.04, 0.04, 0.115].map((x, i) => (
              <group key={x} position={[x, -0.39, 0]} rotation={[0, 0, (x / 0.115) * -0.12]}>
                <mesh geometry={g.knuckle} material={m.graphite} />
                <mesh geometry={g.finger} material={m.shellWhite} position={[0, -0.12 - (i === 1 || i === 2 ? 0.015 : 0), 0]} />
              </group>
            ))}
            <group position={[side * -0.2, -0.17, 0.02]} rotation={[0, 0, side * -0.9]}>
              <mesh geometry={g.knuckle} material={m.graphite} />
              <mesh geometry={g.finger} material={m.shellWhite} position={[0, -0.1, 0]} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
