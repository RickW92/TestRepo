import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ====== Renderer/Scene/Camera ======
const appEl = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 4000);
scene.add(camera);

// ====== Lighting (warm sun + ambient) ======
const hemi = new THREE.HemisphereLight(0xffe6c7, 0xfff2df, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffc48a, 1.35);
sun.position.set(180, 200, 160);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 800;
sun.shadow.camera.left = -300;
sun.shadow.camera.right = 300;
sun.shadow.camera.top = 300;
sun.shadow.camera.bottom = -300;
scene.add(sun);

// ====== Ground ======
const groundGeo = new THREE.PlaneGeometry(8000, 8000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xfff0da, roughness: 1.0, metalness: 0.0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ====== Utils ======
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return Math.random() * (max - min) + min; }

// Simple low-pass random for smooth curvature changes
class SmoothRandom {
  constructor(amplitude = 1, smoothing = 0.95) {
    this.target = 0;
    this.value = 0;
    this.amp = amplitude;
    this.smoothing = smoothing; // closer to 1 = smoother
  }
  next(dt) {
    if (Math.random() < 0.02) this.target = (Math.random() * 2 - 1) * this.amp;
    this.value = lerp(this.value, this.target, 1 - Math.exp(-dt * (1 - this.smoothing) * 60));
    return this.value;
  }
}

// ====== Biomes ======
const BIOMES = [
  {
    key: 'forest', label: 'Warm Forest',
    palette: {
      sky: 0xffebd6, fog: 0xffe0c1, ground: 0xf8ecd9, road: 0x4b4b4b,
      foliage: 0xcbe4b4, trunk: 0x8a5a3b, water: 0x7fd3ff, mountain: 0xc6b69c,
    },
    decor: { trees: true, clouds: true, mountains: true, lakes: true, city: false, snow: false },
    roadWidth: 12,
  },
  {
    key: 'snow', label: 'Snow Plains',
    palette: {
      sky: 0xeef7ff, fog: 0xe4f1ff, ground: 0xf6fbff, road: 0x3e3e46,
      foliage: 0xe8f6ff, trunk: 0xa7b2bf, water: 0x9fdbff, mountain: 0xe7eef5,
    },
    decor: { trees: true, clouds: true, mountains: true, lakes: true, city: false, snow: true },
    roadWidth: 12,
  },
  {
    key: 'desert', label: 'Desert Dunes',
    palette: {
      sky: 0xfff0d6, fog: 0xffe2bd, ground: 0xffe8c2, road: 0x5a4a3f,
      foliage: 0xeed8a6, trunk: 0xb88d48, water: 0x86defa, mountain: 0xe3c18f,
    },
    decor: { trees: true, clouds: true, mountains: true, lakes: true, city: false, snow: false },
    roadWidth: 13,
  },
  {
    key: 'alpine', label: 'Alpine Ridge',
    palette: {
      sky: 0xffefe0, fog: 0xffe4cf, ground: 0xf7efe4, road: 0x3f3f44,
      foliage: 0xcbe2bb, trunk: 0x7b5a41, water: 0x8cd8ff, mountain: 0xb9a68a,
    },
    decor: { trees: true, clouds: true, mountains: true, lakes: true, city: false, snow: false },
    roadWidth: 11.5,
  },
  {
    key: 'coastal', label: 'Coastal Drive',
    palette: {
      sky: 0xfff6e3, fog: 0xffead2, ground: 0xfdf5e6, road: 0x4a4e50,
      foliage: 0xd6f2c6, trunk: 0x90664b, water: 0x74c7ff, mountain: 0xc9b8a1,
    },
    decor: { trees: true, clouds: true, mountains: false, lakes: true, city: false, snow: false },
    roadWidth: 12,
  },
  {
    key: 'city', label: 'Tiny City',
    palette: {
      sky: 0xffefe0, fog: 0xffe3c9, ground: 0xf6ebdd, road: 0x2f2f35,
      foliage: 0xcfe9c6, trunk: 0x6d4b37, water: 0x80d4ff, mountain: 0xbfb1a4,
    },
    decor: { trees: true, clouds: true, mountains: false, lakes: false, city: true, snow: false },
    roadWidth: 12.5,
  },
];

// ====== Obstacles & Decor ======
function createLakeMesh(center, radius, color) {
  const geom = new THREE.CircleGeometry(radius, 48);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, 0.02, center.z);
  mesh.receiveShadow = true;
  return mesh;
}

function createMountainMesh(position, height, radius, color) {
  const geom = new THREE.ConeGeometry(radius, height, 6);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(position);
  mesh.position.y = height * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createBuildingMesh(position, w, h, d) {
  const colorPalette = [0xbac3cc, 0xcfd6dd, 0xdedede, 0xb6c4d6, 0xc2bdb6];
  const mat = new THREE.MeshStandardMaterial({ color: colorPalette[Math.floor(Math.random() * colorPalette.length)], roughness: 0.9, metalness: 0.05 });
  const geom = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(position.x, h * 0.5, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createCloudMesh(position) {
  const group = new THREE.Group();
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const puffGeo = new THREE.SphereGeometry(1, 12, 12);
  const puffs = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < puffs; i++) {
    const s = 1.0 + Math.random() * 1.8;
    const puff = new THREE.Mesh(puffGeo, puffMat);
    puff.scale.setScalar(s);
    puff.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2);
    group.add(puff);
  }
  group.position.copy(position);
  return group;
}

// ====== Endless Road Generator ======
class EndlessRoad {
  constructor(biome) {
    this.biome = biome;
    this.points = []; // centerline points
    this.headings = []; // heading at points
    this.stepLen = 6.0;
    this.maxCurvature = 0.015; // rad per meter
    this.smoothRand = new SmoothRandom(0.008, 0.97);
    this.avoidRadius = biome.roadWidth * 2.2;

    // Obstacles and decor containers
    this.obstacles = []; // { type: 'lake'|'building'|'block', shape: 'circle'|'rect', ... }
    this.obstacleMeshes = new THREE.Group();
    scene.add(this.obstacleMeshes);

    this.decorMeshes = new THREE.Group();
    scene.add(this.decorMeshes);

    // Road geometry buffers (growable up to a cap)
    this.maxSegments = 5000;
    this.roadWidth = biome.roadWidth;
    const maxVerts = (this.maxSegments + 1) * 2;
    this.positions = new Float32Array(maxVerts * 3);
    this.colors = new Float32Array(maxVerts * 3);
    this.uvs = new Float32Array(maxVerts * 2);
    const maxTris = this.maxSegments * 2;
    const indices = new Uint32Array(maxTris * 3);
    for (let i = 0; i < this.maxSegments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const idx = i * 6;
      indices[idx + 0] = a;
      indices[idx + 1] = b;
      indices[idx + 2] = c;
      indices[idx + 3] = b;
      indices[idx + 4] = d;
      indices[idx + 5] = c;
    }
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geom.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geom.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geom.setIndex(new THREE.BufferAttribute(indices, 1));

    const mat = new THREE.MeshStandardMaterial({
      color: this.biome.palette.road,
      roughness: 0.95,
      metalness: 0.05,
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.roadMesh = new THREE.Mesh(this.geom, mat);
    this.roadMesh.castShadow = false;
    this.roadMesh.receiveShadow = true;
    scene.add(this.roadMesh);

    // Center line mesh for visibility
    const lineGeom = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(maxVerts * 3);
    lineGeom.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffd27b, linewidth: 2 });
    this.centerLine = new THREE.LineSegments(lineGeom, lineMat);
    scene.add(this.centerLine);

    // Init seed point and heading
    this.points.push(new THREE.Vector3(0, 0, 0));
    this.headings.push(0);

    // Initialize base row so first triangles form correctly
    this.writeRow(0);

    // Pre-generate
    this.ensureAhead(60);
  }

  dispose() {
    scene.remove(this.roadMesh);
    scene.remove(this.centerLine);
    scene.remove(this.obstacleMeshes);
    scene.remove(this.decorMeshes);
  }

  writeRow(i) {
    const p = this.points[i];
    const heading = this.headings[i];
    const tan = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
    const normal = new THREE.Vector3().copy(tan).cross(UP).normalize();
    const halfW = this.roadWidth * 0.5;
    const left = new THREE.Vector3().copy(p).addScaledVector(normal, -halfW);
    const right = new THREE.Vector3().copy(p).addScaledVector(normal, +halfW);

    const vi = i * 2;
    const pBase = vi * 3;
    const uBase = vi * 2;
    const cBase = vi * 3;

    // Positions
    this.positions[pBase + 0] = left.x;  this.positions[pBase + 1] = 0.02; this.positions[pBase + 2] = left.z;
    this.positions[pBase + 3] = right.x; this.positions[pBase + 4] = 0.02; this.positions[pBase + 5] = right.z;

    // UVs
    const v = i * (this.stepLen / 4);
    this.uvs[uBase + 0] = 0; this.uvs[uBase + 1] = v;
    this.uvs[uBase + 2] = 1; this.uvs[uBase + 3] = v;

    // Colors
    const baseCol = new THREE.Color(this.biome.palette.road);
    const edgeCol = baseCol.clone().multiplyScalar(1.08);
    this.colors[cBase + 0] = edgeCol.r; this.colors[cBase + 1] = edgeCol.g; this.colors[cBase + 2] = edgeCol.b;
    this.colors[cBase + 3] = edgeCol.r; this.colors[cBase + 4] = edgeCol.g; this.colors[cBase + 5] = edgeCol.b;

    // Center line
    const lpi = vi * 3;
    this.linePositions[lpi + 0] = p.x; this.linePositions[lpi + 1] = 0.03; this.linePositions[lpi + 2] = p.z;
    this.linePositions[lpi + 3] = p.x; this.linePositions[lpi + 4] = 0.03; this.linePositions[lpi + 5] = p.z;
  }

  // ----- Biome Setup -----
  populateBiomeFeatures() {
    // Clear previous
    this.obstacleMeshes.clear();
    this.decorMeshes.clear();
    this.obstacles = [];

    const pal = this.biome.palette;

    // Lakes
    if (this.biome.decor.lakes) {
      const lakeCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < lakeCount; i++) {
        const r = rand(50, 110);
        const angle = Math.random() * TAU;
        const dist = rand(180, 600);
        const cx = Math.cos(angle) * dist;
        const cz = Math.sin(angle) * dist;
        this.obstacles.push({ type: 'lake', shape: 'circle', x: cx, z: cz, r: r + this.avoidRadius });
        const lake = createLakeMesh(new THREE.Vector3(cx, 0, cz), r, pal.water);
        this.obstacleMeshes.add(lake);
      }
    }

    // Mountains at perimeter
    if (this.biome.decor.mountains) {
      const ringR = 900;
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * TAU + Math.random() * 0.02;
        const pos = new THREE.Vector3(Math.cos(ang) * ringR, 0, Math.sin(ang) * ringR);
        const h = rand(30, 90);
        const base = rand(10, 30);
        const m = createMountainMesh(pos, h, base, pal.mountain);
        this.decorMeshes.add(m);
      }
    }

    // City blocks
    if (this.biome.decor.city) {
      const blockSize = 50;
      const grid = 5 + Math.floor(Math.random() * 4);
      const start = -grid * blockSize;
      for (let gx = -grid; gx <= grid; gx++) {
        for (let gz = -grid; gz <= grid; gz++) {
          if (Math.abs(gx) < 1 && Math.abs(gz) < 1) continue; // small plaza near origin
          const x = gx * blockSize * 2;
          const z = gz * blockSize * 2;
          const w = blockSize + Math.random() * blockSize;
          const d = blockSize + Math.random() * blockSize;
          const h = 20 + Math.random() * 80;
          const building = createBuildingMesh(new THREE.Vector3(x, 0, z), w, h, d);
          this.decorMeshes.add(building);
          // Add rectangular obstacle with margin
          this.obstacles.push({ type: 'building', shape: 'rect', x: x, z: z, w: w * 0.7 + this.avoidRadius, d: d * 0.7 + this.avoidRadius });
        }
      }
    }

    // Trees
    if (this.biome.decor.trees) {
      const trunkMat = new THREE.MeshStandardMaterial({ color: pal.trunk, roughness: 1 });
      const leafMat = new THREE.MeshStandardMaterial({ color: pal.foliage, roughness: 0.9 });
      if (this.biome.key === 'snow') {
        leafMat.color.setHex(0xf7fbff);
      }
      const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 4, 6);
      const leafGeo = new THREE.ConeGeometry(2.6, 6, 7);
      const count = 260;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * TAU;
        const dist = rand(100, 650);
        const side = Math.random() < 0.5 ? -1 : 1;
        const pos = new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.copy(pos);
        trunk.position.y = 2;
        trunk.castShadow = true;
        trunk.receiveShadow = true;

        const leaves = new THREE.Mesh(leafGeo, leafMat);
        leaves.position.copy(pos);
        leaves.position.y = 2 + 5.2;
        leaves.castShadow = true;

        this.decorMeshes.add(trunk);
        this.decorMeshes.add(leaves);
      }
    }

    // Clouds
    if (this.biome.decor.clouds) {
      const num = 24;
      for (let i = 0; i < num; i++) {
        const ang = Math.random() * TAU;
        const dist = rand(200, 700);
        const height = rand(40, 90);
        const cloud = createCloudMesh(new THREE.Vector3(Math.cos(ang) * dist, height, Math.sin(ang) * dist));
        cloud.userData.vx = rand(-0.2, 0.2);
        cloud.userData.vz = rand(-0.2, 0.2);
        this.decorMeshes.add(cloud);
      }
    }
  }

  // ----- Obstacle checks -----
  pointHitsObstacle(x, z, margin = 0) {
    for (const o of this.obstacles) {
      if (o.shape === 'circle') {
        const dx = x - o.x; const dz = z - o.z;
        if (dx * dx + dz * dz < (o.r + margin) * (o.r + margin)) return true;
      } else if (o.shape === 'rect') {
        if (Math.abs(x - o.x) < (o.w + margin) && Math.abs(z - o.z) < (o.d + margin)) return true;
      }
    }
    return false;
  }

  segmentSamplesHitObstacle(x1, z1, x2, z2, margin = 0) {
    // Sample along the segment to approximate intersection with obstacles
    const samples = 5;
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      if (this.pointHitsObstacle(x, z, margin)) return true;
    }
    return false;
  }

  avoidanceTurn(x, z) {
    // Compute a small turn suggestion away from nearest obstacle
    let bestTurn = 0;
    let bestDist = Infinity;
    for (const o of this.obstacles) {
      let dx = x - o.x; let dz = z - o.z; let dist = 0; let nx = 0; let nz = 0;
      if (o.shape === 'circle') {
        dist = Math.sqrt(dx * dx + dz * dz) - o.r;
        nx = dx; nz = dz;
      } else {
        const ex = Math.max(Math.abs(dx) - o.w, 0) * Math.sign(dx);
        const ez = Math.max(Math.abs(dz) - o.d, 0) * Math.sign(dz);
        dist = Math.hypot(ex, ez);
        nx = ex; nz = ez;
      }
      if (dist < bestDist) {
        bestDist = dist;
        const ang = Math.atan2(nz, nx);
        // Suggest turning toward normal direction
        bestTurn = ang;
      }
    }
    return bestDist < Infinity ? bestTurn : null;
  }

  // ----- Generation -----
  ensureAhead(minSegmentsAhead = 40) {
    while (this.points.length < minSegmentsAhead) {
      this.extendOne();
    }
  }

  extendOne() {
    const i = this.points.length - 1;
    const prev = this.points[i];
    let heading = this.headings[i];

    // Base smooth curvature
    const curv = this.smoothRand.next(1 / 60) * this.maxCurvature;
    heading += curv * this.stepLen;

    // Propose next point
    let nx = prev.x + Math.cos(heading) * this.stepLen;
    let nz = prev.z + Math.sin(heading) * this.stepLen;

    // Avoid obstacles by steering away if inside margin or segment passes through
    const margin = this.avoidRadius;
    let tries = 0;
    while ((this.pointHitsObstacle(nx, nz, margin) || this.segmentSamplesHitObstacle(prev.x, prev.z, nx, nz, margin)) && tries < 24) {
      const turnTo = this.avoidanceTurn(nx, nz);
      if (turnTo !== null) {
        const delta = Math.atan2(Math.sin(turnTo - heading), Math.cos(turnTo - heading));
        heading += (delta > 0 ? -1 : 1) * 0.3; // steer away a bit stronger
      } else {
        heading += (Math.random() < 0.5 ? -1 : 1) * 0.6;
      }
      nx = prev.x + Math.cos(heading) * this.stepLen;
      nz = prev.z + Math.sin(heading) * this.stepLen;
      tries++;
    }

    const next = new THREE.Vector3(nx, 0, nz);
    this.points.push(next);
    this.headings.push(heading);

    const segIndex = this.points.length - 1;
    if (segIndex >= this.maxSegments) return;

    // Write new row data
    this.writeRow(segIndex);

    // Update draw ranges and flags
    const drawVerts = (segIndex + 1) * 2;
    const triCount = Math.max(0, segIndex) * 6;
    this.geom.setDrawRange(0, triCount);
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.uv.needsUpdate = true;
    this.geom.attributes.color.needsUpdate = true;
    this.geom.computeVertexNormals();

    this.centerLine.geometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.centerLine.geometry.setDrawRange(0, drawVerts);
    this.centerLine.geometry.attributes.position.needsUpdate = true;

    // Occasional roadside decor near this segment
    if (Math.random() < 0.6 && this.biome.decor.trees) {
      const tan = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
      const normal = new THREE.Vector3().copy(tan).cross(UP).normalize();
      const side = Math.random() < 0.5 ? -1 : 1;
      const d = this.roadWidth * 1.8 + Math.random() * 14;
      const pos = new THREE.Vector3().copy(next).addScaledVector(normal, side * d);
      const tree = this.makeTree();
      if (tree) { for (const m of tree) { m.position.set(pos.x, m.position.y, pos.z); this.decorMeshes.add(m); } }
    }
  }

  makeTree() {
    if (!this.biome.decor.trees) return null;
    const pal = this.biome.palette;
    const trunkMat = new THREE.MeshStandardMaterial({ color: pal.trunk, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: this.biome.key === 'snow' ? 0xf7fbff : pal.foliage, roughness: 0.9 });
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.6, 6);
    const leafGeo = new THREE.ConeGeometry(2.2, 5.2, 7);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.8;
    trunk.castShadow = true; trunk.receiveShadow = true;
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.y = 1.8 + 4.6; leaves.castShadow = true;
    return [trunk, leaves];
  }

  updateClouds(dt) {
    for (const c of this.decorMeshes.children) {
      if (c.children && c.userData && (c.userData.vx !== undefined)) {
        c.position.x += c.userData.vx * dt;
        c.position.z += c.userData.vz * dt;
        const r = Math.hypot(c.position.x, c.position.z);
        if (r > 1200) { c.position.multiplyScalar(0.6); }
      }
    }
  }
}

// ====== Car ======
function createCar() {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8f5b, roughness: 0.6, metalness: 0.05, emissive: 0x341a0f, emissiveIntensity: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a31, roughness: 1.0 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.4 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 4.2), bodyMat);
  body.castShadow = true; body.position.y = 0.9; car.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.8), glassMat);
  cabin.position.set(0, 1.25, -0.2); cabin.castShadow = true; car.add(cabin);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.4, 0.5), darkMat);
  bumperF.position.set(0, 0.5, 2.2); car.add(bumperF);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 0.5), darkMat);
  bumperR.position.set(0, 0.5, -2.2); car.add(bumperR);

  const wheelGeo = new THREE.BoxGeometry(0.5, 0.6, 0.9);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2d2420, roughness: 1.0 });
  const wheelOffsets = [ [ 1.2, 0.45, 1.5], [ -1.2, 0.45, 1.5], [ 1.2, 0.45,-1.5], [ -1.2, 0.45,-1.5] ];
  for (const [x, y, z] of wheelOffsets) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, y, z); w.castShadow = true; car.add(w); }

  const state = {
    position: new THREE.Vector3(0, 0.45, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    steerAngle: 0,
  };

  return { car, state };
}

// ====== Controls & HUD ======
const keys = Object.create(null);
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
const speedEl = document.getElementById('speed');

// ====== World State ======
let biome, road, carObj;

function applyBiomeVisuals(b) {
  // Sky and fog
  scene.background = new THREE.Color(b.palette.sky);
  scene.fog = new THREE.Fog(b.palette.fog, 200, 1200);
  ground.material.color.setHex(b.palette.ground);
  sun.color.setHex(0xffc48a);
}

function initWorld(seed) {
  if (road) road.dispose();
  if (carObj) scene.remove(carObj.car);

  biome = BIOMES[Math.floor(Math.random() * BIOMES.length)];
  applyBiomeVisuals(biome);

  road = new EndlessRoad(biome);
  road.populateBiomeFeatures();

  carObj = createCar();
  scene.add(carObj.car);

  // Start on first road point
  const start = road.points[0];
  carObj.state.position.set(start.x, 0.45, start.z);
  carObj.state.yaw = road.headings[0];
  carObj.car.position.copy(carObj.state.position);
  carObj.car.rotation.y = carObj.state.yaw;

  // Camera snap
  camera.position.copy(new THREE.Vector3().copy(carObj.state.position).add(new THREE.Vector3(0, 6, 12)));
  camera.lookAt(carObj.state.position);

  // HUD biome label
  const titleEl = document.querySelector('.hud .title');
  if (titleEl) titleEl.textContent = `Warm Drift — ${biome.label}`;
}

initWorld();

// Re-generate world with R
window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') initWorld(); });

// ====== Car Physics (bicycle-ish + drift) ======
const params = {
  engineAcceleration: 30.0,
  brakeDeceleration: 55.0,
  airDrag: 0.75,
  rollingResistance: 2.0,
  corneringStiffness: 22.0,
  corneringStiffnessDrift: 6.0,
  steerSpeed: 4.5,
  maxSteer: 0.6,
  wheelBase: 2.5,
  maxSpeed: 95,
};

function stepCar(dt) {
  // Inputs
  const throttle = (keys['w'] || keys['arrowup']) ? 1 : 0;
  const braking = (keys['s'] || keys['arrowdown']) ? 1 : 0;
  let steerInput = 0; if (keys['a'] || keys['arrowleft']) steerInput -= 1; if (keys['d'] || keys['arrowright']) steerInput += 1;
  const drifting = !!keys['shift'];

  // Smooth steer
  const targetSteer = steerInput * params.maxSteer;
  carObj.state.steerAngle = lerp(carObj.state.steerAngle, targetSteer, 1 - Math.exp(-dt * params.steerSpeed));

  // Vehicle axes
  const forward = new THREE.Vector3(Math.cos(carObj.state.yaw), 0, Math.sin(carObj.state.yaw));
  const right = new THREE.Vector3().copy(forward).cross(UP);

  // Split velocity
  const vLong = forward.dot(carObj.state.velocity);
  const vLat = right.dot(carObj.state.velocity);

  // Longitudinal dynamics
  const engineForce = throttle * params.engineAcceleration;
  const brakeForce = braking ? params.brakeDeceleration : 0.0;
  let aLong = engineForce - Math.sign(vLong) * brakeForce - params.airDrag * vLong * Math.abs(vLong) * 0.002 - params.rollingResistance * Math.sign(vLong);
  vLong + aLong; // for clarity

  // Lateral dynamics (grip)
  const stiffness = drifting ? params.corneringStiffnessDrift : params.corneringStiffness;
  const aLat = -stiffness * vLat;

  // Update velocity in world space
  const newVLong = vLong + aLong * dt;
  const newVLat = vLat + aLat * dt;
  carObj.state.velocity.copy(forward).multiplyScalar(newVLong).add(right.multiplyScalar(newVLat));

  // Speed clamp
  const speed = carObj.state.velocity.length();
  if (speed > params.maxSpeed) carObj.state.velocity.multiplyScalar(params.maxSpeed / speed);

  // Yaw rate from bicycle model
  const yawRate = (newVLong / params.wheelBase) * Math.tan(carObj.state.steerAngle);
  carObj.state.yaw += yawRate * dt;

  // Integrate position
  carObj.state.position.addScaledVector(carObj.state.velocity, dt);
  carObj.state.position.y = 0.45;

  // Apply to mesh
  carObj.car.position.copy(carObj.state.position);
  carObj.car.rotation.y = carObj.state.yaw;

  // HUD
  speedEl.textContent = `${Math.round(speed * 3.6)} km/h`;
}

// ====== Camera Follow (velocity-based) ======
const cam = {
  height: 6.5,
  distance: 12.0,
  stiffness: 6.0,
  rollFactor: 0.15,
};
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const vel = carObj.state.velocity.clone();
  const speed = Math.max(vel.length(), 0.01);
  const forwardVel = vel.multiplyScalar(1 / speed);
  const backPos = new THREE.Vector3().copy(carObj.state.position)
    .addScaledVector(forwardVel, -cam.distance)
    .addScaledVector(UP, cam.height);
  camera.position.lerp(backPos, 1 - Math.exp(-dt * cam.stiffness));
  camTarget.copy(carObj.state.position).addScaledVector(forwardVel, 6.0);
  camera.lookAt(camTarget);
  // subtle camera roll with lateral velocity
  const right = new THREE.Vector3(forwardVel.z, 0, -forwardVel.x);
  const vLat = right.dot(carObj.state.velocity);
  camera.rotation.z = THREE.MathUtils.clamp(-vLat * 0.0025 * cam.rollFactor, -0.08, 0.08);
}

// ====== Main Loop & Road Management ======
const clock = new THREE.Clock();
let accumulator = 0;
const fixedDt = 1 / 120;

function tick(dt) {
  stepCar(dt);

  // Generate road ahead relative to car position
  // Find last generated point; if car is within N segments of the head, extend
  const head = road.points[road.points.length - 1];
  const distToHead = carObj.state.position.distanceTo(head);
  if (distToHead < 200) road.ensureAhead(road.points.length + 30);

  // Cull old geometry/points far behind to keep buffers light (we keep geometry, just ignore old points)
  // For simplicity in this prototype we keep it growing until cap; production would reuse ring buffers.

  // Decor anima
  road.updateClouds(dt);
}

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  accumulator += dt;
  while (accumulator >= fixedDt) {
    tick(fixedDt);
    accumulator -= fixedDt;
  }
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// ====== Resize ======
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});