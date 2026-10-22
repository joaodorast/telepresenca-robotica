import * as THREE from 'three';

export interface MouthShape {
  smile: number;
  open: number;
  width: number;
  round: number;
  skew: number;
}

const N = 28; // pontos por lábio
const CURVATURE = 0.6; // acompanha a curvatura do rosto (z = −k·x²)

const quad = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

/**
 * Boca paramétrica: contorno de dois lábios (curvas de Bézier) misturado a uma elipse para vogais
 * arredondadas. Os vértices são atualizados no mesmo buffer a cada quadro (sem alocação).
 */
export class MouthGeometry {
  readonly geometry = new THREE.BufferGeometry();
  private readonly pos = new Float32Array((2 * N + 1) * 3);
  /** Métricas usadas para posicionar dentes e língua. */
  readonly metrics = { w: 0.1, top: 0, bottom: 0 };

  constructor() {
    const idx: number[] = [];
    for (let i = 1; i <= 2 * N; i++) idx.push(0, i, (i % (2 * N)) + 1);
    this.geometry.setIndex(idx);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const normals = new Float32Array(this.pos.length);
    for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.update({ smile: 0.1, open: 0, width: 0.5, round: 0, skew: 0 });
    this.geometry.computeBoundingSphere();
  }

  update(p: MouthShape) {
    const smilePos = Math.max(0, p.smile);
    const frown = Math.max(0, -p.smile);
    const w = 0.085 + 0.13 * p.width - 0.045 * p.round + 0.02 * smilePos;
    const h = 0.01 + 0.2 * p.open;
    const cy = 0.038 * p.smile;
    const sk = 0.032 * p.skew;
    const mid = 0.022 * frown;
    let top = mid + 0.004 + h * 0.3;
    const bottom = mid - 0.004 - h * 0.7 - 0.036 * smilePos * (0.4 + p.open);
    if (top < bottom + 0.008) top = bottom + 0.008;
    const lx = -w, ly = cy - sk, rx = w, ry = cy + sk;
    const cyE = (top + bottom) / 2;
    const ryE = Math.max(0.006, (top - bottom) / 2);
    const upCtrl = 2 * top - (ly + ry) / 2;
    const loCtrl = 2 * bottom - (ly + ry) / 2;
    const b = Math.min(1, Math.max(0, p.round)) * 0.85;
    const pos = this.pos;
    pos[0] = 0;
    pos[1] = cyE;
    pos[2] = 0.004;
    for (let k = 0; k < N; k++) {
      const t = k / N;
      // lábio superior: esquerda → direita
      let x = quad(lx, 0, rx, t);
      let y = quad(ly, upCtrl, ry, t);
      const a1 = Math.PI - Math.PI * t;
      x = x * (1 - b) + w * Math.cos(a1) * b;
      y = y * (1 - b) + (cyE + ryE * Math.sin(a1)) * b;
      let o = (1 + k) * 3;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = -CURVATURE * x * x;
      // lábio inferior: direita → esquerda
      x = quad(rx, 0, lx, t);
      y = quad(ry, loCtrl, ly, t);
      const a2 = -Math.PI * t;
      x = x * (1 - b) + w * Math.cos(a2) * b;
      y = y * (1 - b) + (cyE + ryE * Math.sin(a2)) * b;
      o = (1 + N + k) * 3;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = -CURVATURE * x * x;
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.metrics.w = w;
    this.metrics.top = top * (1 - b) + (cyE + ryE) * b;
    this.metrics.bottom = bottom * (1 - b) + (cyE - ryE) * b;
  }
}
