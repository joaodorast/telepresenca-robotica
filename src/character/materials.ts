import * as THREE from 'three';

/** Textura procedural da íris (gradiente radial + estrias + brilho inferior, estilo da referência). */
function irisTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const cx = s / 2;
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, '#0a1530');
  grad.addColorStop(0.3, '#16316e');
  grad.addColorStop(0.62, '#2a62c4');
  grad.addColorStop(0.86, '#1a3f8a');
  grad.addColorStop(0.95, '#0b1736');
  grad.addColorStop(1, '#070b18');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  // estrias radiais
  for (let i = 0; i < 220; i++) {
    const a = Math.random() * Math.PI * 2;
    const r0 = s * (0.14 + Math.random() * 0.06);
    const r1 = s * (0.36 + Math.random() * 0.1);
    g.strokeStyle = `rgba(${140 + Math.random() * 80},${190 + Math.random() * 50},255,${0.05 + Math.random() * 0.08})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
    g.stroke();
  }
  // brilho na metade inferior (luz refletida, típico do estilo)
  const low = g.createRadialGradient(cx, cx * 1.45, 0, cx, cx * 1.45, cx * 0.7);
  low.addColorStop(0, 'rgba(120,190,255,0.55)');
  low.addColorStop(1, 'rgba(120,190,255,0)');
  g.fillStyle = low;
  g.beginPath();
  g.arc(cx, cx, cx * 0.92, 0, Math.PI * 2);
  g.fill();
  // anel externo escuro
  g.strokeStyle = 'rgba(4,8,20,0.9)';
  g.lineWidth = s * 0.035;
  g.beginPath();
  g.arc(cx, cx, cx * 0.965, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function radialTexture(stops: [number, string][], size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type RobotMaterials = ReturnType<typeof createMaterials>;

export function createMaterials() {
  const iris = irisTexture();
  const goldEmissive = new THREE.Color('#ff9124');

  const mouthBase = {
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  };

  return {
    // Rosto: porcelana com verniz (clearcoat) — superfície polida da referência
    porcelain: new THREE.MeshPhysicalMaterial({ color: '#eceaf0', roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
    shellWhite: new THREE.MeshPhysicalMaterial({ color: '#e9e9ee', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    // Grafite polido (moldura, capacete, pescoço)
    darkGloss: new THREE.MeshPhysicalMaterial({ color: '#0b0c11', roughness: 0.24, metalness: 0.55, envMapIntensity: 0.7, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
    helmet: new THREE.MeshPhysicalMaterial({ color: '#0e0f15', roughness: 0.28, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
    liner: new THREE.MeshStandardMaterial({ color: '#06070a', roughness: 0.95, metalness: 0, envMapIntensity: 0.15, side: THREE.DoubleSide }),
    graphite: new THREE.MeshStandardMaterial({ color: '#2a2d36', metalness: 0.85, roughness: 0.32 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d6a24d', metalness: 1, roughness: 0.26 }),
    // Linhas luminosas âmbar: emissivas fora do tone mapping para brilhar como na referência
    goldGlow: new THREE.MeshStandardMaterial({ color: '#000000', emissive: goldEmissive, emissiveIntensity: 1.5, toneMapped: false }),
    goldHalo: new THREE.MeshBasicMaterial({ color: '#ffa63a', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    sclera: new THREE.MeshPhysicalMaterial({ color: '#f6f7fb', roughness: 0.3, clearcoat: 0.6 }),
    iris: new THREE.MeshStandardMaterial({ map: iris, roughness: 0.35, emissive: new THREE.Color('#2f6be0'), emissiveMap: iris, emissiveIntensity: 0.35 }),
    pupil: new THREE.MeshStandardMaterial({ color: '#030409', roughness: 0.2 }),
    // Córnea: vidro transparente que capta os reflexos do ambiente
    cornea: new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, depthWrite: false, envMapIntensity: 2.2 }),
    catchlight: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    lash: new THREE.MeshStandardMaterial({ color: '#13121a', roughness: 0.5 }),
    brow: new THREE.MeshStandardMaterial({ color: '#2b2433', roughness: 0.6 }),
    blush: new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,150,170,0.55)'], [1, 'rgba(255,150,170,0)']]),
      transparent: true,
      depthWrite: false,
    }),
    mouth: new THREE.MeshStandardMaterial({
      ...mouthBase,
      color: '#3d1522',
      roughness: 0.55,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    }),
    teeth: new THREE.MeshStandardMaterial({
      ...mouthBase,
      color: '#f4f2f6',
      roughness: 0.3,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.EqualStencilFunc,
      stencilZPass: THREE.KeepStencilOp,
    }),
    tongue: new THREE.MeshStandardMaterial({
      ...mouthBase,
      color: '#c4566a',
      roughness: 0.5,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.EqualStencilFunc,
      stencilZPass: THREE.KeepStencilOp,
    }),
    screenBack: new THREE.MeshStandardMaterial({
      map: radialTexture([[0, '#272c3a'], [0.55, '#10131b'], [1, '#040508']]),
      roughness: 0.9,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: radialTexture([[0, '#1a1e28'], [1, '#000000']]),
      emissiveIntensity: 0.6,
    }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#0a1428', roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
    led: new THREE.MeshBasicMaterial({ color: '#3dff8f', toneMapped: false }),
  };
}
