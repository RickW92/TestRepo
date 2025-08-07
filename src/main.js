import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// Scene setup
const appEl = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffe8cc);
scene.fog = new THREE.Fog(0xffd7b5, 180, 900);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 3000);
scene.add(camera);

// Lights - warm golden hour
const hemi = new THREE.HemisphereLight(0xffdfba, 0xffe7d6, 0.75);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffc48a, 1.25);
sun.position.set(120, 160, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 500;
sun.shadow.camera.left = -200;
sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;
scene.add(sun);

// Ground
const groundGeo = new THREE.PlaneGeometry(4000, 4000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xfff0da, roughness: 1.0, metalness: 0.0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Utility
const TAU = Math.PI * 2;
const tmpVec3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function randRange(min, max) { return Math.random() * (max - min) + min; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

// Track generation
function generateTrack({
  numControlPoints = 12,
  radius = 220,
  radialJitter = 60,
  trackWidth = 12,
  segments = 1200,
  seed = Math.floor(Math.random() * 1e9),
} = {}) {
  // Pseudo RNG for repeatability
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);

  const controlPoints = [];
  for (let i = 0; i < numControlPoints; i++) {
    const baseAng = (i / numControlPoints) * TAU;
    const ang = baseAng + (rnd() - 0.5) * (TAU / numControlPoints) * 0.65; // gentle randomness
    const r = radius + (rnd() - 0.5) * radialJitter * 2.0;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    controlPoints.push(new THREE.Vector3(x, 0, z));
  }
  // Ensure nice order around the loop by angle sort
  controlPoints.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.35);

  // Build ribbon mesh along curve
  const leftRightPositions = new Float32Array(segments * 2 * 3);
  const uvs = new Float32Array(segments * 2 * 2);
  const colors = new Float32Array(segments * 2 * 3);
  const indices = new Uint32Array(segments * 6);

  const colorCenter = new THREE.Color(0xf3d6b3);
  const colorEdge = new THREE.Color(0xf8caa1);

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = tmpVec3.copy(tangent).cross(UP).normalize();
    const halfW = trackWidth * 0.5;

    const left = tmpVec3.copy(p).addScaledVector(normal, -halfW);
    const right = tmpVec3.copy(p).addScaledVector(normal, +halfW);

    const li = i * 2 * 3;
    leftRightPositions[li + 0] = left.x;
    leftRightPositions[li + 1] = left.y + 0.01; // lift a hair to avoid z-fighting
    leftRightPositions[li + 2] = left.z;
    leftRightPositions[li + 3] = right.x;
    leftRightPositions[li + 4] = right.y + 0.01;
    leftRightPositions[li + 5] = right.z;

    const ui = i * 2 * 2;
    uvs[ui + 0] = 0; uvs[ui + 1] = t * 80; // stretched
    uvs[ui + 2] = 1; uvs[ui + 3] = t * 80;

    const ci = i * 2 * 3;
    const mixedL = colorEdge;
    const mixedR = colorEdge;
    colors[ci + 0] = mixedL.r; colors[ci + 1] = mixedL.g; colors[ci + 2] = mixedL.b;
    colors[ci + 3] = mixedR.r; colors[ci + 4] = mixedR.g; colors[ci + 5] = mixedR.b;
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = ((i + 1) % segments) * 2;
    const idx = i * 6;
    indices[idx + 0] = a;
    indices[idx + 1] = a + 1;
    indices[idx + 2] = b;
    indices[idx + 3] = a + 1;
    indices[idx + 4] = b + 1;
    indices[idx + 5] = b;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(leftRightPositions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xf3d6b3,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const trackMesh = new THREE.Mesh(geom, mat);
  trackMesh.receiveShadow = true;

  return { curve, trackMesh, trackWidth };
}

// Add simple decor objects to enhance vibe
function addDecorAlongTrack(curve, trackWidth, count = 120) {
  const group = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa47148, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xe3f2c1, roughness: 0.9 });

  const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 4, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 6, 7);

  for (let i = 0; i < count; i++) {
    const t = (i / count) + Math.random() * (1 / count);
    const p = curve.getPointAt(t % 1);
    const tangent = curve.getTangentAt(t % 1).normalize();
    const normal = new THREE.Vector3().copy(tangent).cross(UP).normalize();

    const side = Math.random() < 0.5 ? -1 : 1;
    const dist = trackWidth * 1.8 + Math.random() * 16;
    const pos = new THREE.Vector3().copy(p).addScaledVector(normal, side * dist);

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.copy(pos);
    trunk.position.y = 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;

    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.copy(pos);
    leaves.position.y = 2 + 5.2;
    leaves.castShadow = true;

    group.add(trunk);
    group.add(leaves);
  }

  return group;
}

// Car setup
function createCar() {
  const car = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8f5b, roughness: 0.6, metalness: 0.05, emissive: 0x341a0f, emissiveIntensity: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x6b3f28, roughness: 1.0 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.4 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 4.2), bodyMat);
  body.castShadow = true;
  body.position.y = 0.9;
  car.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.8), glassMat);
  cabin.position.set(0, 1.25, -0.2);
  cabin.castShadow = true;
  car.add(cabin);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.4, 0.5), darkMat);
  bumperF.position.set(0, 0.5, 2.2);
  car.add(bumperF);

  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 0.5), darkMat);
  bumperR.position.set(0, 0.5, -2.2);
  car.add(bumperR);

  const wheelGeo = new THREE.BoxGeometry(0.5, 0.6, 0.9);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 1.0 });
  const wheelOffsets = [
    [ 1.2, 0.45, 1.5], [ -1.2, 0.45, 1.5],
    [ 1.2, 0.45,-1.5], [ -1.2, 0.45,-1.5],
  ];
  for (const [x, y, z] of wheelOffsets) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, y, z);
    w.castShadow = true;
    car.add(w);
  }

  // Physics state
  const state = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
  };

  return { car, state };
}

// Controls
const keys = Object.create(null);
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// HUD
const speedEl = document.getElementById('speed');

// Initialize world
let track, decor, carObj;
function initWorld(seed) {
  if (track) scene.remove(track.trackMesh);
  if (decor) scene.remove(decor);
  if (carObj) scene.remove(carObj.car);

  track = generateTrack({ seed });
  scene.add(track.trackMesh);

  decor = addDecorAlongTrack(track.curve, track.trackWidth, 140);
  scene.add(decor);

  carObj = createCar();

  // Place car at t=0
  const p0 = track.curve.getPointAt(0);
  const t0 = track.curve.getTangentAt(0);
  carObj.state.position.copy(p0).add(new THREE.Vector3(0, 0.4, 0));
  carObj.state.velocity.set(0, 0, 0);
  carObj.state.yaw = Math.atan2(t0.z, t0.x);

  carObj.car.position.copy(carObj.state.position);
  carObj.car.rotation.y = carObj.state.yaw;

  scene.add(carObj.car);

  // Camera snap
  camera.position.copy(new THREE.Vector3().copy(carObj.car.position).add(new THREE.Vector3(0, 6, 12)));
  camera.lookAt(carObj.car.position);
}

initWorld();

// Re-generate track with R
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') initWorld(Math.floor(Math.random() * 1e9));
});

// Physics constants
const params = {
  engineAcceleration: 28.0,
  brakeDeceleration: 60.0,
  airDrag: 0.8,
  rollingResistance: 2.5,
  baseLateralGrip: 9.5,
  driftLateralGrip: 2.0,
  steerPower: 2.4,
  steerPowerDrift: 3.0,
  maxSpeed: 90.0,
};

// Main loop
const clock = new THREE.Clock();
let accumulator = 0;
const fixedDt = 1 / 120; // fixed physics tick for consistency

function step(dt) {
  // Inputs
  const throttle = (keys['w'] || keys['arrowup']) ? 1 : 0;
  const braking = (keys['s'] || keys['arrowdown']) ? 1 : 0;
  let steerInput = 0;
  if (keys['a'] || keys['arrowleft']) steerInput -= 1;
  if (keys['d'] || keys['arrowright']) steerInput += 1;
  const drifting = !!(keys['shift']);

  // Car dynamics (very simplified)
  const forward = new THREE.Vector3(Math.cos(carObj.state.yaw), 0, Math.sin(carObj.state.yaw));
  const speedForward = forward.dot(carObj.state.velocity);
  const forwardVel = new THREE.Vector3().copy(forward).multiplyScalar(speedForward);
  const lateralVel = new THREE.Vector3().copy(carObj.state.velocity).sub(forwardVel);

  // Engine and brakes
  const engineForce = throttle * params.engineAcceleration;
  const brakeForce = braking ? params.brakeDeceleration : 0.0;
  const accel = engineForce - Math.sign(speedForward) * brakeForce;
  forwardVel.addScaledVector(forward, accel * dt);

  // Drag and rolling resistance
  const dragFactor = Math.max(0, 1 - params.airDrag * dt);
  forwardVel.multiplyScalar(dragFactor);
  const rolling = Math.max(0, 1 - params.rollingResistance * dt);
  forwardVel.multiplyScalar(rolling);

  // Lateral grip (reduced while drifting)
  const grip = drifting ? params.driftLateralGrip : params.baseLateralGrip;
  const lateralDecay = Math.max(0, 1 - grip * dt);
  lateralVel.multiplyScalar(lateralDecay);

  // Recombine
  carObj.state.velocity.copy(forwardVel.add(lateralVel));
  // Clamp max speed
  const speed = carObj.state.velocity.length();
  if (speed > params.maxSpeed) {
    carObj.state.velocity.multiplyScalar(params.maxSpeed / speed);
  }

  // Steering influences yaw rate, stronger at speed
  const speedFactor = clamp(Math.abs(speedForward) / params.maxSpeed, 0, 1);
  const steerStrength = (drifting ? params.steerPowerDrift : params.steerPower) * (0.25 + 0.75 * speedFactor);
  carObj.state.yaw += steerInput * steerStrength * dt;

  // Slight automatic alignment to direction of travel for stability
  if (speed > 1e-3) {
    const velHeading = Math.atan2(carObj.state.velocity.z, carObj.state.velocity.x);
    let delta = velHeading - carObj.state.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // wrap
    carObj.state.yaw += delta * (drifting ? 0.6 : 1.2) * dt;
  }

  // Position integrate
  carObj.state.position.addScaledVector(carObj.state.velocity, dt);

  // Keep near ground
  carObj.state.position.y = 0.45;

  // Apply to mesh
  carObj.car.position.copy(carObj.state.position);
  carObj.car.rotation.y = carObj.state.yaw;

  // HUD speed (km/h visual)
  speedEl.textContent = `${Math.round(carObj.state.velocity.length() * 3.6)} km/h`;
}

// Camera follow (spring)
const camOffset = new THREE.Vector3(0, 5.5, 12);
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.cos(carObj.state.yaw), 0, Math.sin(carObj.state.yaw));
  const right = new THREE.Vector3().copy(forward).cross(UP);
  const desired = new THREE.Vector3()
    .copy(carObj.state.position)
    .addScaledVector(forward, -camOffset.z)
    .addScaledVector(UP, camOffset.y);

  camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
  camTarget.copy(carObj.state.position).addScaledVector(forward, 6.0);
  camera.lookAt(camTarget);
}

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  accumulator += dt;
  while (accumulator >= fixedDt) {
    step(fixedDt);
    accumulator -= fixedDt;
  }
  updateCamera(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});