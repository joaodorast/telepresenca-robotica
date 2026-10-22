import type * as THREE from 'three';
import type { MouthShape } from './parts/mouthGeometry';

/** Referências aos nós animados do personagem, preenchidas pelos componentes de geometria. */
export interface RobotRig {
  headPivot?: THREE.Group;
  eyes: { gaze?: THREE.Group; shape?: THREE.Group; pupil?: THREE.Mesh; lidTop?: THREE.Group; lidBottom?: THREE.Group }[];
  brows: THREE.Group[];
  mouth?: { update: (s: MouthShape) => void };
  arm: { shoulder?: THREE.Group; elbow?: THREE.Group; hand?: THREE.Group };
  body?: THREE.Group;
}

export const createRig = (): RobotRig => ({ eyes: [{}, {}], brows: [], arm: {} });
