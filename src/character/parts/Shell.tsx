import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { RobotMaterials } from '../materials';
import type { RobotRig } from '../rig';

function roundedRect(shape: THREE.Shape | THREE.Path, w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function ring(outerW: number, outerH: number, innerW: number, innerH: number, rOut: number, rIn: number) {
  const s = roundedRect(new THREE.Shape(), outerW, outerH, rOut) as THREE.Shape;
  s.holes.push(roundedRect(new THREE.Path(), innerW, innerH, rIn) as THREE.Path);
  return s;
}

// Dimensões da “tela” que forma a cabeça (referência: monitor com moldura escura e filete dourado)
export const SHELL = { innerW: 2.62, innerH: 2.78, border: 0.16, radius: 0.5, back: -0.95, depth: 1.55 };

/** Moldura da cabeça: carcaça de grafite polido, filete âmbar luminoso, fundo de tela e câmera. */
export function HeadShell({ m, ledRef }: { m: RobotMaterials; ledRef: (o: THREE.Mesh | null) => void }) {
  const geo = useMemo(() => {
    const { innerW, innerH, border, radius, depth } = SHELL;
    const frame = new THREE.ExtrudeGeometry(ring(innerW + border * 2, innerH + border * 2, innerW, innerH, radius + border, radius), {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.05,
      bevelSegments: 5,
      curveSegments: 24,
    });
    const rim = new THREE.ExtrudeGeometry(ring(innerW - 0.07, innerH - 0.07, innerW - 0.13, innerH - 0.13, radius - 0.04, radius - 0.07), {
      depth: 0.02,
      bevelEnabled: false,
      curveSegments: 24,
    });
    const halo = new THREE.ShapeGeometry(ring(innerW + 0.02, innerH + 0.02, innerW - 0.24, innerH - 0.24, radius, radius - 0.12), 24);
    const outerRim = new THREE.ExtrudeGeometry(
      ring(innerW + border * 2 + 0.115, innerH + border * 2 + 0.115, innerW + border * 2 + 0.08, innerH + border * 2 + 0.08, radius + border + 0.06, radius + border + 0.04),
      { depth: 0.5, bevelEnabled: false, curveSegments: 24 },
    );
    // forro fosco interno: evita que as paredes da moldura reflitam luz e mantém a “tela” escura e profunda
    const liner = new THREE.ExtrudeGeometry(ring(innerW - 0.095, innerH - 0.095, innerW - 0.13, innerH - 0.13, radius - 0.05, radius - 0.065), {
      depth: depth - 0.02,
      bevelEnabled: false,
      curveSegments: 24,
    });
    const back = new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), innerW + 0.04, innerH + 0.04, radius) as THREE.Shape, 24);
    return { frame, rim, halo, outerRim, back, liner };
  }, []);

  const front = SHELL.back + SHELL.depth + 0.07;
  const top = SHELL.innerH / 2 + SHELL.border;
  return (
    <group>
      <mesh geometry={geo.frame} material={m.darkGloss} position={[0, 0, SHELL.back]} />
      <mesh geometry={geo.liner} material={m.liner} position={[0, 0, SHELL.back + 0.01]} />
      <mesh geometry={geo.back} material={m.screenBack} position={[0, 0, SHELL.back + 0.02]} />
      {/* filete dourado interno + halo aditivo (brilho sem pós-processamento) */}
      <mesh geometry={geo.rim} material={m.goldGlow} position={[0, 0, front - 0.01]} />
      <mesh geometry={geo.halo} material={m.goldHalo} position={[0, 0, front + 0.012]} />
      {/* contorno dourado externo, metálico */}
      <mesh geometry={geo.outerRim} material={m.gold} position={[0, 0, front - 0.62]} />

      {/* câmera integrada no topo (o LED acende quando a câmera está ativa) */}
      <group position={[0, top + 0.15, -0.15]}>
        <RoundedBox args={[0.78, 0.3, 0.42]} radius={0.12} smoothness={4} material={m.darkGloss} />
        <mesh position={[0, 0, 0.215]} rotation={[Math.PI / 2, 0, 0]} material={m.graphite}>
          <cylinderGeometry args={[0.12, 0.12, 0.04, 32]} />
        </mesh>
        <mesh position={[0, 0, 0.23]} material={m.lens}>
          <sphereGeometry args={[0.085, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
        </mesh>
        <mesh position={[0, 0, 0.226]} rotation={[0, 0, 0]} material={m.gold}>
          <torusGeometry args={[0.105, 0.012, 8, 32]} />
        </mesh>
        <mesh ref={ledRef} position={[0.27, 0, 0.215]} material={m.led}>
          <circleGeometry args={[0.022, 16]} />
        </mesh>
      </group>
      {/* suporte inferior que liga ao pescoço */}
      <RoundedBox args={[0.9, 0.3, 0.6]} radius={0.1} smoothness={4} position={[0, -SHELL.innerH / 2 - SHELL.border - 0.05, -0.3]} material={m.graphite} />
    </group>
  );
}

/** Tronco, pescoço, ombros e logotipo. */
export function Body({ m, rig }: { m: RobotMaterials; rig: RobotRig }) {
  const geo = useMemo(() => {
    const pts = [
      [0.001, 0],
      [0.62, 0],
      [0.98, -0.07],
      [1.28, -0.24],
      [1.47, -0.48],
      [1.56, -0.8],
      [1.57, -1.15],
      [1.5, -1.7],
      [1.38, -2.1],
      [0.001, -2.1],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = new THREE.LatheGeometry(pts, 72);
    const chevron = new THREE.Shape();
    chevron.moveTo(-0.2, 0);
    chevron.lineTo(0, 0.17);
    chevron.lineTo(0.2, 0);
    chevron.lineTo(0.13, 0);
    chevron.lineTo(0, 0.1);
    chevron.lineTo(-0.13, 0);
    chevron.closePath();
    const logo = new THREE.ExtrudeGeometry(chevron, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2 });
    return { torso, logo };
  }, []);

  return (
    <group ref={(o) => (rig.body = o ?? undefined)} position={[0, -2.08, -0.25]}>
      {/* pescoço com anéis */}
      <mesh material={m.graphite} position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.3, 0.36, 0.62, 40]} />
      </mesh>
      {[0.18, 0.36].map((y) => (
        <mesh key={y} material={m.darkGloss} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.335, 0.03, 10, 48]} />
        </mesh>
      ))}
      <mesh material={m.darkGloss} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.66, 0.82, 0.2, 48]} />
      </mesh>
      <group scale={[1, 1, 0.74]}>
        <mesh geometry={geo.torso} material={m.shellWhite} />
        {/* faixa dourada luminosa no peito */}
        <mesh material={m.goldGlow} position={[0, -0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.355, 0.022, 10, 96]} />
        </mesh>
        <mesh material={m.goldHalo} position={[0, -0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.355, 0.07, 10, 96]} />
        </mesh>
        <mesh material={m.darkGloss} position={[0, -0.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.12, 0.06, 10, 96]} />
        </mesh>
      </group>
      <mesh geometry={geo.logo} material={m.goldGlow} position={[0, -0.9, 1.16]} rotation={[-0.05, 0, 0]} />
    </group>
  );
}
