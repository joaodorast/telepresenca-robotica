import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import type { CharacterController } from './CharacterController';
import { createMaterials } from './materials';
import { createRig } from './rig';
import { HEAD_PIVOT_Y, useRobotAnimation } from './useRobotAnimation';
import { Face } from './parts/Face';
import { Body, HeadShell } from './parts/Shell';
import { Arm } from './parts/Arm';

export type Quality = 'high' | 'medium' | 'low';
export type Framing = 'face' | 'full';

const FRAMINGS: Record<Framing, { y: number; halfH: number; halfW: number }> = {
  face: { y: 0.08, halfH: 1.86, halfW: 1.72 },
  full: { y: -0.75, halfH: 3.0, halfW: 2.5 },
};

/** Enquadra o personagem de acordo com a proporção da tela (paisagem ou retrato). */
function CameraRig({ framing }: { framing: Framing }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const target = useRef(new THREE.Vector3());
  useEffect(() => {
    const f = FRAMINGS[framing];
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const aspect = size.width / Math.max(1, size.height);
    const dist = Math.max(f.halfH / tan, f.halfW / (tan * aspect)) + 0.9;
    target.current.set(0, f.y, 0);
    camera.position.set(0, f.y + 0.25, dist);
    camera.lookAt(target.current);
    camera.updateProjectionMatrix();
  }, [camera, size, framing]);
  // leve paralaxe para dar profundidade
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.17) * 0.06;
    camera.lookAt(target.current);
  });
  return null;
}

function Lights({ quality }: { quality: Quality }) {
  return (
    <>
      <ambientLight intensity={0.22} />
      {/* luz principal quente, levemente acima e à direita */}
      <directionalLight position={[2.6, 3.4, 6]} intensity={1.7} color="#fff3e2" />
      {/* contraluz âmbar (recorte dourado na silhueta) */}
      <directionalLight position={[-5, 2.5, -3]} intensity={2.2} color="#ffae4a" />
      <directionalLight position={[5, 1, -4]} intensity={1.1} color="#ffcf8a" />
      {/* preenchimento frio suave vindo de baixo */}
      <pointLight position={[0, -1.6, 4]} intensity={6} distance={12} decay={1.6} color="#c9d6ff" />
      <Environment resolution={quality === 'low' ? 64 : 256} frames={1}>
        <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 5, 4]} rotation={[Math.PI / 2.5, 0, 0]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={2.4} color="#ffb25c" position={[-6, 1, 1]} rotation={[0, Math.PI / 2, 0]} scale={[3, 8, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffd9a0" position={[6, 0, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[3, 8, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#9fb4ff" position={[0, -2, 6]} scale={3} />
        <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, 0, -8]} scale={[12, 6, 1]} />
      </Environment>
    </>
  );
}

function RobotModel({ controller, quality }: { controller: CharacterController; quality: Quality }) {
  const m = useMemo(() => createMaterials(), []);
  const rig = useMemo(() => createRig(), []);
  const led = useRef<THREE.Mesh | null>(null);
  useRobotAnimation(controller, rig, m);
  useFrame(({ clock }) => {
    if (led.current) {
      led.current.visible = controller.cameraActive;
      (led.current.material as THREE.MeshBasicMaterial).color.setHSL(0.4, 1, 0.5 + Math.sin(clock.elapsedTime * 2) * 0.08);
    }
  });
  useEffect(() => () => Object.values(m).forEach((mat) => mat.dispose()), [m]);
  const segments = quality === 'low' ? 32 : quality === 'medium' ? 48 : 64;

  return (
    <group>
      {/* pivô da cabeça no pescoço: inclinações giram a “tela” como um todo */}
      <group ref={(o) => (rig.headPivot = o ?? undefined)} position={[0, HEAD_PIVOT_Y, 0]}>
        <group position={[0, -HEAD_PIVOT_Y, 0]}>
          <HeadShell m={m} ledRef={(o) => (led.current = o)} />
          <group scale={1.1} position={[0, -0.02, 0.06]}>
            <Face rig={rig} m={m} segments={segments} />
          </group>
        </group>
      </group>
      <Body m={m} rig={rig} />
      <group position={[0, -2.08, -0.25]}>
        <Arm side={-1} m={m} rig={rig} />
        <Arm side={1} m={m} />
      </group>
    </group>
  );
}

export interface RobotStageProps {
  controller: CharacterController;
  framing?: Framing;
  quality?: Quality;
  ambient?: boolean;
  className?: string;
}

/** Palco 3D reutilizado pela tela do robô (rosto em destaque) e pela pré-visualização do operador. */
export function RobotStage({ controller, framing = 'face', quality: initial = 'high', ambient = true, className }: RobotStageProps) {
  const [quality, setQuality] = useState<Quality>(initial);
  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [1, 1];
  return (
    <Canvas
      className={className}
      dpr={dpr}
      camera={{ fov: 32, near: 0.1, far: 60, position: [0, 0, 9] }}
      gl={{ antialias: quality !== 'low', alpha: true, stencil: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <PerformanceMonitor
        onDecline={() => setQuality((q) => (q === 'high' ? 'medium' : 'low'))}
        flipflops={3}
        onFallback={() => setQuality('low')}
      />
      <CameraRig framing={framing} />
      <Suspense fallback={null}>
        <Lights quality={quality} />
        <RobotModel controller={controller} quality={quality} />
        {ambient && quality !== 'low' && (
          <Sparkles count={quality === 'high' ? 60 : 30} scale={[9, 7, 4]} position={[0, 0, -3]} size={2.2} speed={0.25} opacity={0.55} color="#ffbe6b" />
        )}
      </Suspense>
    </Canvas>
  );
}
