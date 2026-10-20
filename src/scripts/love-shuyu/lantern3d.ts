// 第一幕的八面纸灯。八个三角纸面、竹骨、下缘环骨、五枚挂件与拉绳
// 都是真实三维几何，缓慢转动时会依次遮挡，不在平面 SVG 上伪装立体感。

import * as THREE from 'three';

import { reduceMotion, requireElement } from './dom';

export interface Lantern3DController {
  start: () => void;
  stop: () => void;
  resize: () => void;
  pull: () => void;
}

// 取景余量：拉绳被拉到最长时，木珠与整束流苏会落到灯底以下很远。画布若只
// 按灯体取景，那一截就掉出视锥、在暗底里凭空消失（看起来像绳子被黑暗吃掉）。
// 做法是让画布向下多出 CORD_HEADROOM 的渲染余量（CSS 里 `.lantern` 的
// `height: 116%`），再按同一比例放宽纵向 fov 并把相机下移同样的世界距离——
// 灯体在原有区域内的成像因此逐像素不变，多出来的可视范围全部落在下方。
// **这个数与 CSS 的高度是同一个数，改一处就得改另一处。**
const CORD_HEADROOM = 0.16;
const FRAME_FOV = 34;
const CAMERA_Z = 10.6;
const FRAME_CENTER_Y = -0.45;
const FRAME_HALF_HEIGHT = Math.tan(THREE.MathUtils.degToRad(FRAME_FOV / 2)) * CAMERA_Z;
const VIEW_HALF_HEIGHT = FRAME_HALF_HEIGHT * (1 + CORD_HEADROOM);
// 上边缘保持不动：相机下移的量正好等于视野变高的量。
const CAMERA_Y = FRAME_CENTER_Y + FRAME_HALF_HEIGHT - VIEW_HALF_HEIGHT;
const VIEW_FOV = THREE.MathUtils.radToDeg(Math.atan(VIEW_HALF_HEIGHT / CAMERA_Z)) * 2;

const TOP = new THREE.Vector3(0, 2.35, 0);
const BOTTOM = new THREE.Vector3(0, -2.35, 0);
const RING = [
  new THREE.Vector3(1.82, 0, 0),
  new THREE.Vector3(0, 0, 1.42),
  new THREE.Vector3(-1.82, 0, 0),
  new THREE.Vector3(0, 0, -1.42),
];

// 下半部加一圈真实四边环骨，挂件从这圈“下边缘”悬下，
// 锚点因此会和灯面同步转入、转出视线。
const LOWER_RIM = RING.map((point) => BOTTOM.clone().lerp(point, 0.58));

const traceHeart = (context: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  context.beginPath();
  context.moveTo(x, y + size * 0.42);
  context.bezierCurveTo(x - size * 0.86, y - size * 0.08, x - size * 0.58, y - size * 0.78, x, y - size * 0.3);
  context.bezierCurveTo(x + size * 0.58, y - size * 0.78, x + size * 0.86, y - size * 0.08, x, y + size * 0.42);
  context.closePath();
};

const makePaperTexture = (face: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const coolFace = face === 2 || face === 3 || face === 5;
  const gradient = context.createRadialGradient(245, 246, 22, 256, 270, 370);
  gradient.addColorStop(0, '#fff4c8');
  gradient.addColorStop(0.34, coolFace ? '#d9ca58' : '#ffd04b');
  gradient.addColorStop(0.7, coolFace ? '#47947f' : '#f18728');
  gradient.addColorStop(1, coolFace ? '#246d8f' : '#c94625');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  // 低对比的染纸纤维与晕染，不做发亮的白噪点。
  let state = (face + 1) * 0x9e3779b1;
  const random = () => {
    state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
    return ((state ^= state >>> 15) >>> 0) / 4294967296;
  };
  for (let index = 0; index < 720; index += 1) {
    const alpha = 0.018 + random() * 0.042;
    context.fillStyle = random() > 0.52 ? `rgba(255,244,210,${alpha})` : `rgba(75,39,18,${alpha})`;
    context.fillRect(random() * 512, random() * 512, 0.7 + random() * 2.2, 7 + random() * 30);
  }

  context.save();
  context.strokeStyle = 'rgba(255,250,232,.94)';
  context.lineWidth = 6;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // 四个纸面保留白描花；与它们交错的四面增加圆润的手绘爱心。
  // 花面也点一枚小心，让“花 + 爱心”在同一圈灯面上形成连续图案。
  if (face % 2 === 0) {
    context.translate(face === 0 ? 250 : 310, face === 0 ? 290 : 330);
    context.rotate((face - 1) * 0.13);
    for (let petal = 0; petal < 6; petal += 1) {
      context.save();
      context.rotate((Math.PI * 2 * petal) / 6);
      context.beginPath();
      context.ellipse(0, -48, 18, 42, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    context.beginPath();
    context.arc(0, 0, 14, 0, Math.PI * 2);
    context.stroke();
    traceHeart(context, face === 0 ? -104 : 92, -92, 25);
    context.stroke();
  } else {
    context.translate(face === 1 || face === 5 ? 220 : 292, face < 4 ? 286 : 326);
    context.rotate((face - 3) * 0.045);
    traceHeart(context, 0, 0, 68);
    context.stroke();
    traceHeart(context, face % 4 === 1 ? 92 : -92, 86, 24);
    context.stroke();
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 1, 0, 0, 1, 0], 2));
  geometry.computeVertexNormals();
  return geometry;
};

const cylinderBetween = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 8,
) => {
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius * 1.06, direction.length(), radialSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(midpoint);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
};

const extrudedCharm = (shape: THREE.Shape, material: THREE.Material, depth = 0.06) => {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.018,
    bevelThickness: 0.016,
    curveSegments: 12,
    steps: 1,
  });
  geometry.center();
  return new THREE.Mesh(geometry, material);
};

const makeHeartShape = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.15);
  shape.bezierCurveTo(-0.31, 0.02, -0.22, 0.31, 0, 0.16);
  shape.bezierCurveTo(0.22, 0.31, 0.31, 0.02, 0, -0.15);
  return shape;
};

const makeLeafShape = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.18);
  shape.bezierCurveTo(-0.24, -0.05, -0.2, 0.18, 0, 0.25);
  shape.bezierCurveTo(0.2, 0.18, 0.24, -0.05, 0, -0.18);
  return shape;
};

const makeStarShape = () => {
  const shape = new THREE.Shape();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? 0.23 : 0.1;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
};

export const createLantern3D = (): Lantern3DController => {
  const canvas = requireElement<HTMLCanvasElement>('lantern-3d');
  const stage = requireElement<HTMLDivElement>('lantern-stage');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEW_FOV, 1, 0.1, 40);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.lookAt(0, CAMERA_Y, 0);

  const lantern = new THREE.Group();
  lantern.rotation.set(-0.055, 0.5, -0.012);
  scene.add(lantern);

  const paperMaterials: THREE.MeshStandardMaterial[] = [];
  for (let face = 0; face < 8; face += 1) {
    const upper = face < 4;
    const side = face % 4;
    const a = upper ? TOP : BOTTOM;
    const b = upper ? RING[side] : RING[(side + 1) % 4];
    const c = upper ? RING[(side + 1) % 4] : RING[side];
    const texture = makePaperTexture(face);
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      emissive: new THREE.Color(face % 3 === 1 ? 0x5b230c : 0x6a320c),
      emissiveIntensity: 0.48,
      roughness: 0.83,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
    });
    paperMaterials.push(material);
    lantern.add(new THREE.Mesh(triangle(a, b, c), material));
  }

  const bamboo = new THREE.MeshStandardMaterial({ color: 0x2b180d, roughness: 0.72, metalness: 0.02 });
  for (let side = 0; side < 4; side += 1) {
    const next = (side + 1) % 4;
    lantern.add(cylinderBetween(TOP, RING[side], 0.052, bamboo));
    lantern.add(cylinderBetween(BOTTOM, RING[side], 0.052, bamboo));
    lantern.add(cylinderBetween(RING[side], RING[next], 0.043, bamboo));
    lantern.add(cylinderBetween(LOWER_RIM[side], LOWER_RIM[next], 0.034, bamboo));
  }

  const capMaterial = new THREE.MeshStandardMaterial({ color: 0x8c421c, roughness: 0.62 });
  for (const point of [TOP, BOTTOM]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), capMaterial);
    cap.position.copy(point);
    lantern.add(cap);
  }

  // 左右侧顶点各一枚木珠和五根短流苏，随灯的真实转角一起发生遮挡。
  const tasselMaterial = new THREE.MeshStandardMaterial({ color: 0xead6b8, roughness: 0.92 });
  for (const side of [0, 2]) {
    const direction = side === 0 ? 1 : -1;
    const anchor = RING[side];
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), capMaterial);
    bead.position.set(anchor.x + direction * 0.13, anchor.y - 0.04, anchor.z);
    lantern.add(bead);
    for (let thread = -2; thread <= 2; thread += 1) {
      const start = new THREE.Vector3(bead.position.x + direction * 0.04, -0.11, bead.position.z);
      const end = new THREE.Vector3(
        bead.position.x + direction * (0.28 + Math.abs(thread) * 0.035),
        -0.52 + Math.abs(thread) * 0.035,
        bead.position.z + thread * 0.055,
      );
      lantern.add(cylinderBetween(start, end, 0.012, tasselMaterial));
    }
  }

  // 五枚挂件的造型彼此不重复：如意结（祝福）、蛋糕与蜡烛（生日）、
  // 嫩叶（生命）、爱心（爱）、许愿星（愿望与未来）。
  const cordMaterial = new THREE.MeshStandardMaterial({ color: 0xcbb691, roughness: 0.88 });
  const knotMaterial = new THREE.MeshStandardMaterial({ color: 0xcf5c47, roughness: 0.68 });
  const roseMaterial = new THREE.MeshStandardMaterial({ color: 0xe98275, roughness: 0.58, metalness: 0.03 });
  const creamMaterial = new THREE.MeshStandardMaterial({ color: 0xffdca2, roughness: 0.76 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x5fa78e, roughness: 0.72 });
  const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xe9b54c, roughness: 0.46, metalness: 0.18 });
  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd267,
    emissive: 0xff7b1f,
    emissiveIntensity: 0.75,
    roughness: 0.38,
  });

  const ornamentBuilders: Array<(root: THREE.Group) => void> = [
    (root) => {
      for (const direction of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.023, 8, 24), knotMaterial);
        loop.position.x = direction * 0.055;
        loop.rotation.z = direction * 0.63;
        root.add(loop);
        root.add(
          cylinderBetween(
            new THREE.Vector3(direction * 0.035, -0.07, 0),
            new THREE.Vector3(direction * 0.09, -0.25, 0),
            0.016,
            knotMaterial,
          ),
        );
      }
      root.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), goldMaterial));
    },
    (root) => {
      const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.13, 18), roseMaterial);
      cake.position.y = -0.04;
      root.add(cake);
      const icing = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.045, 18), creamMaterial);
      icing.position.y = 0.045;
      root.add(icing);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10), goldMaterial);
      candle.position.y = 0.135;
      root.add(candle);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), flameMaterial);
      flame.scale.set(0.72, 1.25, 0.72);
      flame.position.y = 0.235;
      root.add(flame);
    },
    (root) => {
      const leaf = extrudedCharm(makeLeafShape(), leafMaterial, 0.055);
      leaf.rotation.z = -0.3;
      root.add(leaf);
      root.add(cylinderBetween(new THREE.Vector3(-0.015, -0.14, 0), new THREE.Vector3(0.08, -0.28, 0), 0.012, goldMaterial));
    },
    (root) => {
      const heart = extrudedCharm(makeHeartShape(), roseMaterial, 0.075);
      heart.scale.setScalar(1.08);
      root.add(heart);
    },
    (root) => {
      const star = extrudedCharm(makeStarShape(), goldMaterial, 0.065);
      star.rotation.z = 0.08;
      root.add(star);
    },
  ];

  const ornamentSpecs = [
    { edge: 0, at: 0.2, length: 0.46 },
    { edge: 0, at: 0.75, length: 0.58 },
    { edge: 1, at: 0.48, length: 0.5 },
    { edge: 2, at: 0.42, length: 0.58 },
    { edge: 3, at: 0.66, length: 0.48 },
  ];
  const ornamentSwings: Array<{ root: THREE.Group; baseY: number; phase: number }> = [];

  ornamentSpecs.forEach((spec, index) => {
    const anchor = LOWER_RIM[spec.edge].clone().lerp(LOWER_RIM[(spec.edge + 1) % 4], spec.at);
    const root = new THREE.Group();
    root.position.copy(anchor);
    const outwardY = Math.atan2(anchor.x, anchor.z);
    root.rotation.y = outwardY;

    root.add(cylinderBetween(new THREE.Vector3(), new THREE.Vector3(0, -spec.length, 0), 0.012, cordMaterial));
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), index % 2 === 0 ? goldMaterial : capMaterial);
    bead.position.y = -spec.length;
    root.add(bead);

    const charm = new THREE.Group();
    charm.position.y = -spec.length - 0.18;
    ornamentBuilders[index](charm);
    root.add(charm);
    lantern.add(root);
    ornamentSwings.push({ root, baseY: outwardY, phase: index * 1.27 });
  });

  // 底部拉绳与灯同在一个三维坐标系里：圆柱绳、木珠和六根流苏都会
  // 随灯体旋转，点击后绳长与重锤位置在 WebGL 帧中真实变化。
  const pullCordLength = 0.7;
  const pullCord = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, pullCordLength, 10), cordMaterial);
  pullCord.position.set(BOTTOM.x, BOTTOM.y - pullCordLength / 2, BOTTOM.z);
  lantern.add(pullCord);

  const pullWeight = new THREE.Group();
  pullWeight.position.set(BOTTOM.x, BOTTOM.y - pullCordLength, BOTTOM.z);
  const pullBead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), capMaterial);
  pullWeight.add(pullBead);
  for (let thread = -2.5; thread <= 2.5; thread += 1) {
    pullWeight.add(
      cylinderBetween(
        new THREE.Vector3(thread * 0.018, -0.08, 0),
        new THREE.Vector3(thread * 0.038, -0.47 + Math.abs(thread) * 0.025, thread * 0.01),
        0.011,
        tasselMaterial,
      ),
    );
  }
  lantern.add(pullWeight);

  scene.add(new THREE.HemisphereLight(0xffe8bd, 0x102a31, 1.3));
  const innerLight = new THREE.PointLight(0xffa02c, 13, 12, 1.65);
  innerLight.position.set(0, 0.05, 0.12);
  scene.add(innerLight);
  const edgeLight = new THREE.DirectionalLight(0x80d7cf, 1.25);
  edgeLight.position.set(-3.5, 1.2, 4.5);
  scene.add(edgeLight);

  let frame = 0;
  let wanted = false;
  let startedAt = performance.now();
  let pullStartedAt: number | null = null;

  const draw = (now: number) => {
    const seconds = (now - startedAt) / 1000;
    if (!reduceMotion.matches) {
      lantern.rotation.y = 0.5 + Math.sin(seconds * 0.36) * 0.5 + seconds * 0.035;
      lantern.rotation.x = -0.055 + Math.sin(seconds * 0.27 + 0.7) * 0.035;
      innerLight.intensity = 12.5 + Math.sin(seconds * ((Math.PI * 2) / 5.2)) * 1.8;
      for (let index = 0; index < paperMaterials.length; index += 1) {
        paperMaterials[index].emissiveIntensity = 0.46 + Math.sin(seconds * 1.2 + index * 0.7) * 0.035;
      }
      for (const ornament of ornamentSwings) {
        ornament.root.rotation.y = ornament.baseY;
        ornament.root.rotation.z = Math.sin(seconds * 0.8 + ornament.phase) * 0.07;
        ornament.root.rotation.x = Math.sin(seconds * 0.63 + ornament.phase * 0.8) * 0.035;
      }
    }

    let stretch = 0;
    if (pullStartedAt !== null && !reduceMotion.matches) {
      const t = Math.min(1, (now - pullStartedAt) / 430);
      if (t <= 0.56) {
        const down = t / 0.56;
        stretch = 1.18 * (1 - (1 - down) ** 3);
      } else {
        const release = (t - 0.56) / 0.44;
        stretch = 1.18 * (1 - release) ** 2 - Math.sin(release * Math.PI) * 0.08;
      }
      if (t === 1) pullStartedAt = null;
    }
    pullCord.scale.y = 1 + stretch;
    // CylinderGeometry 默认以中心缩放，补回上端位移，使拉绳始终咬住灯底顶点。
    pullCord.position.y = BOTTOM.y - (pullCordLength * (1 + stretch)) / 2;
    pullWeight.position.y = BOTTOM.y - pullCordLength * (1 + stretch);
    pullWeight.rotation.z = stretch * 0.045;

    renderer.render(scene, camera);
  };

  const loop = (now: number) => {
    draw(now);
    if (wanted && !document.hidden && !reduceMotion.matches) frame = window.requestAnimationFrame(loop);
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    // 画布比 stage 高出一截取景余量，绘图缓冲与相机长宽比都要按画布算，
    // 而不是按 stage——否则拉长的拉绳仍会被裁在画面之外。
    const height = rect.height * (1 + CORD_HEADROOM);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(rect.width, height, false);
    camera.aspect = rect.width / height;
    camera.updateProjectionMatrix();
    draw(performance.now());
  };

  const start = () => {
    wanted = true;
    resize();
    if (frame || document.hidden || reduceMotion.matches) return;
    startedAt = performance.now();
    frame = window.requestAnimationFrame(loop);
  };

  const stop = () => {
    wanted = false;
    window.cancelAnimationFrame(frame);
    frame = 0;
  };

  const pull = () => {
    pullStartedAt = performance.now();
    if (!wanted) start();
    else if (!frame && !document.hidden && !reduceMotion.matches) frame = window.requestAnimationFrame(loop);
    draw(performance.now());
  };

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    window.cancelAnimationFrame(frame);
    frame = 0;
    stage.classList.add('lantern-webgl-fallback');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    stage.classList.remove('lantern-webgl-fallback');
    resize();
    if (wanted) start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else if (wanted) {
      start();
    }
  });

  resize();
  return { start, stop, resize, pull };
};
