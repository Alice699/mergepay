"use client";

import { useEffect, useRef } from "react";
import type {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

type EyeRig = {
  expression: { value: number };
  gaze: Vector2;
  root: Group;
};

type RobotRig = {
  chest: MeshPhysicalMaterial;
  eyes: [EyeRig, EyeRig];
  head: Group;
  mouth: Group;
  root: Group;
};

type RobotPersona = "feminine" | "masculine";

type ArmRig = {
  elbow: Mesh;
  hand: Mesh;
  lower: Mesh;
  shoulder: Mesh;
  upper: Mesh;
};

const VOID_ECLIPSE = 0x0b0b0b;
const MIDNIGHT_SLATE = 0x2b4559;
const SILVER_MIST = 0xe4e4e4;
const GREETING_CYCLE_SECONDS = 8.1;
const OLED_EYE_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const OLED_EYE_FRAGMENT_SHADER = `
  uniform float uExpression;
  uniform vec2 uGaze;
  uniform float uPersona;
  varying vec2 vUv;

  void main() {
    vec2 point = (vUv - 0.5) * 2.0;
    float expression = smoothstep(0.0, 1.0, uExpression);
    float eyeWidth = mix(0.88, 0.94, uPersona);
    float eyeHeight = mix(0.62, 0.58, uPersona);
    float horizontalCurve = mix(2.2, 2.0, uPersona);
    vec2 eyePoint = vec2(point.x / eyeWidth, point.y / eyeHeight);
    float eyeContour =
      pow(abs(eyePoint.x), horizontalCurve) +
      pow(abs(eyePoint.y), 2.0);
    float eye = 1.0 - smoothstep(0.84, 1.0, eyeContour);
    float aura = 1.0 - smoothstep(0.94, 1.28, eyeContour);
    float lowerLift = expression * 0.1 * (
      1.0 - smoothstep(0.18, 0.94, abs(point.x))
    );
    float lowerLid = smoothstep(-0.58 + lowerLift, -0.51 + lowerLift, point.y);
    eye *= lowerLid;
    aura *= smoothstep(-0.68 + lowerLift, -0.53 + lowerLift, point.y);

    vec2 gaze = uGaze * vec2(0.34, 0.27);
    vec2 irisPoint = point - gaze;
    float irisRadius = length(irisPoint * vec2(mix(0.98, 0.92, uPersona), 1.0));
    float iris = (1.0 - smoothstep(0.45, 0.515, irisRadius)) * eye;
    float irisLight = 1.0 - smoothstep(0.075, 0.45, irisRadius);
    float irisRing = 1.0 - smoothstep(0.02, 0.072, abs(irisRadius - 0.365));
    float pupil = (1.0 - smoothstep(0.155, 0.215, irisRadius)) * iris;

    vec3 iceShadow = vec3(0.27, 0.43, 0.5);
    vec3 iceLight = vec3(0.58, 0.73, 0.78);
    vec3 color = mix(
      iceShadow,
      iceLight,
      clamp(0.5 + point.y * 0.26 + expression * 0.06, 0.0, 1.0)
    );
    vec3 irisOuter = vec3(0.065, 0.2, 0.27);
    vec3 irisInner = vec3(0.36, 0.7, 0.79);
    vec3 irisColor = mix(irisOuter, irisInner, irisLight);
    irisColor += irisRing * vec3(0.1, 0.2, 0.22);
    color = mix(color, irisColor, iris);
    color = mix(color, vec3(0.012, 0.026, 0.032), pupil * 0.98);

    float keyLight = 1.0 - smoothstep(
      0.052,
      0.105,
      length(irisPoint - vec2(-0.14, 0.18))
    );
    float fillLight = 1.0 - smoothstep(
      0.022,
      0.048,
      length(irisPoint - vec2(0.16, -0.14))
    );
    color += keyLight * iris * vec3(0.78, 0.9, 0.93);
    color += fillLight * iris * vec3(0.48, 0.69, 0.75);

    float upperShade = smoothstep(-0.02, 0.56, point.y) * eye;
    float innerRim = smoothstep(0.68, 0.96, eyeContour) * eye;
    color = mix(color, vec3(0.2, 0.38, 0.46), upperShade * 0.34);
    color = mix(color, vec3(0.25, 0.45, 0.53), innerRim * 0.18);
    float alpha = max(eye * 0.97, aura * 0.12);

    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createRoundedPanelGeometry(
  THREE: typeof import("three"),
  width: number,
  height: number,
  radius: number,
  depth: number,
) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shape = new THREE.Shape();

  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(
    halfWidth,
    -halfHeight,
    halfWidth,
    -halfHeight + radius,
  );
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(
    -halfWidth,
    halfHeight,
    -halfWidth,
    halfHeight - radius,
  );
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(
    -halfWidth,
    -halfHeight,
    -halfWidth + radius,
    -halfHeight,
  );

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 16,
    depth,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

function createRialoMarkGeometry(THREE: typeof import("three")) {
  const shape = new THREE.Shape();
  const scale = 0.00105;
  const x = (value: number) => (value - 200) * scale;
  const y = (value: number) => (200 - value) * scale;

  shape.moveTo(x(163), y(80));
  shape.lineTo(x(238), y(80));
  shape.bezierCurveTo(x(254), y(80), x(263), y(90), x(263), y(105));
  shape.bezierCurveTo(x(263), y(120), x(272), y(128), x(287), y(128));
  shape.bezierCurveTo(x(301), y(128), x(311), y(138), x(311), y(152));
  shape.bezierCurveTo(x(311), y(166), x(301), y(176), x(287), y(176));
  shape.lineTo(x(239), y(176));
  shape.bezierCurveTo(x(224), y(176), x(213), y(187), x(213), y(201));
  shape.bezierCurveTo(x(213), y(215), x(224), y(225), x(239), y(225));
  shape.bezierCurveTo(x(253), y(225), x(262), y(236), x(262), y(250));
  shape.lineTo(x(262), y(294));
  shape.bezierCurveTo(x(262), y(309), x(251), y(319), x(237), y(319));
  shape.bezierCurveTo(x(223), y(319), x(213), y(309), x(213), y(294));
  shape.lineTo(x(213), y(250));
  shape.bezierCurveTo(x(213), y(236), x(202), y(225), x(187), y(225));
  shape.lineTo(x(113), y(225));
  shape.bezierCurveTo(x(99), y(225), x(89), y(215), x(89), y(201));
  shape.bezierCurveTo(x(89), y(187), x(100), y(176), x(114), y(176));
  shape.lineTo(x(187), y(176));
  shape.bezierCurveTo(x(202), y(176), x(213), y(166), x(213), y(152));
  shape.bezierCurveTo(x(213), y(138), x(202), y(128), x(187), y(128));
  shape.lineTo(x(163), y(128));
  shape.bezierCurveTo(x(149), y(128), x(138), y(117), x(138), y(104));
  shape.bezierCurveTo(x(138), y(90), x(149), y(80), x(163), y(80));

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    curveSegments: 18,
    depth: 0.018,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

function smoothStep(value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function MergeCoreScene() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = sceneRef.current;
    if (!mount) return;

    const performanceNavigator = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
    };
    const useStaticFallback =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      performanceNavigator.connection?.saveData === true ||
      (performanceNavigator.deviceMemory !== undefined &&
        performanceNavigator.deviceMemory <= 2);
    if (useStaticFallback) {
      mount.dataset.renderState = "fallback";
      return;
    }

    let disposed = false;
    let cleanupScene: (() => void) | undefined;
    const initializeScene = async () => {
      const THREE = await import("three");
      if (disposed) return;

      let renderer: WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
      } catch {
        mount.dataset.renderState = "fallback";
        return;
      }

      renderer.setClearColor(VOID_ECLIPSE, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.className = "merge-core__canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      mount.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
      camera.position.set(0, 0.08, 7.8);

      const geometries: BufferGeometry[] = [];
      const materials: Material[] = [];
      const textures: Texture[] = [];
      const trackGeometry = <T extends BufferGeometry>(geometry: T) => {
        geometries.push(geometry);
        return geometry;
      };
      const trackMaterial = <T extends Material>(material: T) => {
        materials.push(material);
        return material;
      };
      const trackTexture = <T extends Texture>(texture: T) => {
        textures.push(texture);
        return texture;
      };

      scene.add(new THREE.HemisphereLight(SILVER_MIST, VOID_ECLIPSE, 1.5));
      const keyLight = new THREE.DirectionalLight(SILVER_MIST, 3.2);
      keyLight.position.set(-3.8, 4.5, 5.2);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0002;
      scene.add(keyLight);
      const slateLight = new THREE.PointLight(MIDNIGHT_SLATE, 18, 9, 2);
      slateLight.position.set(1.8, -1.4, 3.4);
      scene.add(slateLight);

      // One clear character moment: two purpose-built robots greet the visitor.
      const robotRoot = new THREE.Group();
      robotRoot.position.y = 0.08;
      robotRoot.scale.setScalar(0.9);
      scene.add(robotRoot);

      const slateShell = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          clearcoatRoughness: 0.14,
          color: MIDNIGHT_SLATE,
          metalness: 0.38,
          roughness: 0.2,
        }),
      );
      const mistShell = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          clearcoatRoughness: 0.11,
          color: SILVER_MIST,
          metalness: 0.24,
          roughness: 0.17,
        }),
      );
      const jointMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 0.85,
          clearcoatRoughness: 0.16,
          color: VOID_ECLIPSE,
          metalness: 0.68,
          roughness: 0.2,
        }),
      );
      const visorMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          color: VOID_ECLIPSE,
          metalness: 0.3,
          opacity: 0.96,
          roughness: 0.08,
          transparent: true,
        }),
      );
      const faceLineMaterial = trackMaterial(
        new THREE.MeshBasicMaterial({
          color: 0x9fb7c1,
          opacity: 0.86,
          transparent: true,
        }),
      );
      faceLineMaterial.toneMapped = false;
      const slateInset = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 0.9,
          clearcoatRoughness: 0.14,
          color: MIDNIGHT_SLATE,
          emissive: MIDNIGHT_SLATE,
          emissiveIntensity: 0.08,
          metalness: 0.42,
          roughness: 0.2,
        }),
      );

      const headGeometry = trackGeometry(
        createRoundedPanelGeometry(THREE, 1.02, 0.74, 0.24, 0.5),
      );
      const visorGeometry = trackGeometry(
        createRoundedPanelGeometry(THREE, 0.76, 0.36, 0.15, 0.05),
      );
      const bodyGeometry = trackGeometry(
        createRoundedPanelGeometry(THREE, 0.84, 1.04, 0.25, 0.48),
      );
      const chestGeometry = trackGeometry(
        createRoundedPanelGeometry(THREE, 0.46, 0.36, 0.12, 0.04),
      );
      const pelvisGeometry = trackGeometry(
        createRoundedPanelGeometry(THREE, 0.64, 0.24, 0.1, 0.38),
      );
      const footGeometry = trackGeometry(
        createRoundedPanelGeometry(THREE, 0.31, 0.15, 0.065, 0.46),
      );
      const eyeDisplayGeometry = trackGeometry(
        new THREE.PlaneGeometry(0.235, 0.155),
      );
      const mouthCurve = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-0.073, 0.012, 0),
          new THREE.Vector3(-0.039, -0.014, 0),
          new THREE.Vector3(0, -0.023, 0),
          new THREE.Vector3(0.039, -0.014, 0),
          new THREE.Vector3(0.073, 0.012, 0),
        ],
        false,
        "catmullrom",
        0.48,
      );
      const mouthGeometry = trackGeometry(
        new THREE.TubeGeometry(mouthCurve, 28, 0.0055, 8, false),
      );
      const mouthEndGeometry = trackGeometry(
        new THREE.SphereGeometry(0.0056, 12, 8),
      );
      const neckGeometry = trackGeometry(
        new THREE.CylinderGeometry(0.115, 0.14, 0.21, 28),
      );
      const legGeometry = trackGeometry(
        new THREE.CapsuleGeometry(0.102, 0.31, 6, 16),
      );
      const rialoMarkGeometry = trackGeometry(createRialoMarkGeometry(THREE));

      const createRobot = (
        x: number,
        shell: MeshPhysicalMaterial,
        chestBase: MeshPhysicalMaterial,
        markMaterial: MeshPhysicalMaterial,
        inward: -1 | 1,
        persona: RobotPersona,
      ): RobotRig => {
        const robot = new THREE.Group();
        robot.position.x = x;
        robot.rotation.y = inward * 0.055;
        robotRoot.add(robot);

        const head = new THREE.Group();
        head.position.set(0, 0.46, 0.02);
        head.rotation.y = inward * 0.08;
        robot.add(head);

        const headShell = new THREE.Mesh(headGeometry, shell);
        headShell.castShadow = true;
        headShell.receiveShadow = true;
        head.add(headShell);

        const visor = new THREE.Mesh(visorGeometry, visorMaterial);
        visor.position.z = 0.273;
        head.add(visor);

        const createEye = (side: -1 | 1): EyeRig => {
          const eyeRoot = new THREE.Group();
          eyeRoot.position.set(side * 0.158, 0.014, 0.37);
          eyeRoot.rotation.z = persona === "feminine" ? side * 0.054 : 0;
          head.add(eyeRoot);

          const expression = { value: 0 };
          const gaze = new THREE.Vector2();
          const displayMaterial = trackMaterial(
            new THREE.ShaderMaterial({
              blending: THREE.NormalBlending,
              depthWrite: false,
              fragmentShader: OLED_EYE_FRAGMENT_SHADER,
              transparent: true,
              uniforms: {
                uExpression: expression,
                uGaze: { value: gaze },
                uPersona: { value: persona === "feminine" ? 1 : 0 },
              },
              vertexShader: OLED_EYE_VERTEX_SHADER,
            }),
          );
          displayMaterial.toneMapped = false;
          const display = new THREE.Mesh(eyeDisplayGeometry, displayMaterial);
          display.scale.set(
            persona === "feminine" ? 1.02 : 0.9,
            persona === "feminine" ? 0.94 : 1.04,
            1,
          );
          display.renderOrder = 6;
          eyeRoot.add(display);

          return { expression, gaze, root: eyeRoot };
        };

        const leftEye = createEye(-1);
        const rightEye = createEye(1);

        const mouth = new THREE.Group();
        mouth.position.set(0, -0.093, 0.356);
        mouth.scale.x = persona === "feminine" ? 0.96 : 0.9;
        mouth.renderOrder = 4;
        const mouthLine = new THREE.Mesh(mouthGeometry, faceLineMaterial);
        mouth.add(mouthLine);
        for (const side of [-1, 1] as const) {
          const mouthEnd = new THREE.Mesh(
            mouthEndGeometry,
            faceLineMaterial,
          );
          mouthEnd.position.set(side * 0.073, 0.012, 0);
          mouth.add(mouthEnd);
        }
        head.add(mouth);

        const neck = new THREE.Mesh(neckGeometry, jointMaterial);
        neck.position.set(0, -0.015, -0.02);
        neck.castShadow = true;
        robot.add(neck);

        const body = new THREE.Mesh(bodyGeometry, shell);
        body.position.set(0, -0.67, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        robot.add(body);

        const chestAssembly = new THREE.Group();
        chestAssembly.position.set(0, -0.64, 0.265);
        robot.add(chestAssembly);

        const chest = trackMaterial(chestBase.clone() as MeshPhysicalMaterial);
        const chestPlate = new THREE.Mesh(chestGeometry, chest);
        chestPlate.castShadow = true;
        chestAssembly.add(chestPlate);

        const rialoMark = new THREE.Mesh(rialoMarkGeometry, markMaterial);
        rialoMark.position.z = 0.074;
        rialoMark.castShadow = true;
        rialoMark.renderOrder = 2;
        chestAssembly.add(rialoMark);

        const pelvis = new THREE.Mesh(pelvisGeometry, jointMaterial);
        pelvis.position.set(0, -1.25, -0.015);
        pelvis.castShadow = true;
        robot.add(pelvis);

        for (const legX of [-0.205, 0.205]) {
          const leg = new THREE.Mesh(legGeometry, shell);
          leg.position.set(legX, -1.49, 0);
          leg.castShadow = true;
          robot.add(leg);

          const foot = new THREE.Mesh(footGeometry, shell);
          foot.position.set(legX + inward * 0.01, -1.75, 0.085);
          foot.rotation.x = -0.035;
          foot.castShadow = true;
          foot.receiveShadow = true;
          robot.add(foot);
        }

        return { chest, eyes: [leftEye, rightEye], head, mouth, root: robot };
      };

      const leftRobot = createRobot(
        -1.14,
        slateShell,
        mistShell,
        slateInset,
        1,
        "feminine",
      );
      const rightRobot = createRobot(
        1.14,
        mistShell,
        slateInset,
        mistShell,
        -1,
        "masculine",
      );

      const limbGeometry = trackGeometry(
        new THREE.CylinderGeometry(1, 1, 1, 24),
      );
      const jointGeometry = trackGeometry(
        new THREE.SphereGeometry(1, 22, 16),
      );
      const createArm = (shell: MeshPhysicalMaterial): ArmRig => {
        const shoulder = new THREE.Mesh(jointGeometry, jointMaterial);
        const upper = new THREE.Mesh(limbGeometry, shell);
        const elbow = new THREE.Mesh(jointGeometry, jointMaterial);
        const lower = new THREE.Mesh(limbGeometry, shell);
        const hand = new THREE.Mesh(jointGeometry, shell);
        shoulder.scale.setScalar(0.15);
        elbow.scale.setScalar(0.124);
        hand.scale.set(0.168, 0.138, 0.18);
        for (const part of [shoulder, upper, elbow, lower, hand]) {
          part.castShadow = true;
          robotRoot.add(part);
        }
        return { elbow, hand, lower, shoulder, upper };
      };

      const leftInnerArm = createArm(slateShell);
      const rightInnerArm = createArm(mistShell);
      const leftOuterArm = createArm(slateShell);
      const rightOuterArm = createArm(mistShell);
      const yAxis = new THREE.Vector3(0, 1, 0);
      const limbDirection = new THREE.Vector3();
      const placeLimb = (
        mesh: Mesh,
        start: Vector3,
        end: Vector3,
        radius: number,
      ) => {
        limbDirection.subVectors(end, start);
        mesh.position.copy(start).addScaledVector(limbDirection, 0.5);
        mesh.scale.set(radius, limbDirection.length(), radius);
        mesh.quaternion.setFromUnitVectors(yAxis, limbDirection.normalize());
      };
      const positionArm = (
        arm: ArmRig,
        shoulder: Vector3,
        elbow: Vector3,
        hand: Vector3,
      ) => {
        arm.shoulder.position.copy(shoulder);
        arm.elbow.position.copy(elbow);
        arm.hand.position.copy(hand);
        placeLimb(arm.upper, shoulder, elbow, 0.104);
        placeLimb(arm.lower, elbow, hand, 0.09);
      };

      const floorTextureCanvas = document.createElement("canvas");
      floorTextureCanvas.width = 256;
      floorTextureCanvas.height = 256;
      const floorTextureContext = floorTextureCanvas.getContext("2d");
      if (floorTextureContext) {
        const gradient = floorTextureContext.createRadialGradient(
          128,
          128,
          4,
          128,
          128,
          124,
        );
        gradient.addColorStop(0, "rgba(91, 126, 146, 0.34)");
        gradient.addColorStop(0.42, "rgba(55, 86, 105, 0.2)");
        gradient.addColorStop(0.72, "rgba(43, 69, 89, 0.08)");
        gradient.addColorStop(1, "rgba(43, 69, 89, 0)");
        floorTextureContext.fillStyle = gradient;
        floorTextureContext.fillRect(0, 0, 256, 256);
      }
      const floorTexture = trackTexture(
        new THREE.CanvasTexture(floorTextureCanvas),
      );
      floorTexture.colorSpace = THREE.SRGBColorSpace;
      floorTexture.generateMipmaps = false;
      floorTexture.minFilter = THREE.LinearFilter;
      floorTexture.magFilter = THREE.LinearFilter;

      const ambientFloorMaterial = trackMaterial(
        new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          map: floorTexture,
          opacity: 0.78,
          transparent: true,
        }),
      );
      ambientFloorMaterial.toneMapped = false;
      const ambientFloor = new THREE.Mesh(
        trackGeometry(new THREE.PlaneGeometry(5.35, 2.7)),
        ambientFloorMaterial,
      );
      ambientFloor.position.set(0, -1.872, -0.08);
      ambientFloor.rotation.x = -Math.PI / 2;
      ambientFloor.renderOrder = 0;
      robotRoot.add(ambientFloor);

      const shadowCatcher = new THREE.Mesh(
        trackGeometry(new THREE.PlaneGeometry(5.2, 2.75)),
        trackMaterial(
          new THREE.ShadowMaterial({ color: VOID_ECLIPSE, opacity: 0.34 }),
        ),
      );
      shadowCatcher.position.set(0, -1.866, -0.06);
      shadowCatcher.rotation.x = -Math.PI / 2;
      shadowCatcher.receiveShadow = true;
      shadowCatcher.renderOrder = 1;
      robotRoot.add(shadowCatcher);

      const floorRingMaterial = trackMaterial(
        new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          color: 0x7894a3,
          depthWrite: false,
          opacity: 0.12,
          side: THREE.DoubleSide,
          transparent: true,
        }),
      );
      floorRingMaterial.toneMapped = false;
      const floorRing = new THREE.Mesh(
        trackGeometry(new THREE.RingGeometry(2.25, 2.27, 128)),
        floorRingMaterial,
      );
      floorRing.position.set(0, -1.858, -0.04);
      floorRing.rotation.x = -Math.PI / 2;
      floorRing.renderOrder = 2;
      robotRoot.add(floorRing);

      const rippleGeometry = trackGeometry(
        new THREE.RingGeometry(0.34, 0.37, 80),
      );
      const createRipple = (x: number) => {
        const material = trackMaterial(
          new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            color: 0xb7d0da,
            depthWrite: false,
            opacity: 0,
            side: THREE.DoubleSide,
            transparent: true,
          }),
        );
        material.toneMapped = false;
        const ripple = new THREE.Mesh(rippleGeometry, material);
        ripple.position.set(x, -1.85, 0.06);
        ripple.rotation.x = -Math.PI / 2;
        ripple.scale.setScalar(0.72);
        ripple.renderOrder = 3;
        robotRoot.add(ripple);
        return { material, ripple };
      };
      const leftFloorRipple = createRipple(-1.14);
      const rightFloorRipple = createRipple(1.14);

      const leftInnerShoulder = new THREE.Vector3();
      const leftInnerElbow = new THREE.Vector3();
      const leftInnerHand = new THREE.Vector3();
      const rightInnerShoulder = new THREE.Vector3();
      const rightInnerElbow = new THREE.Vector3();
      const rightInnerHand = new THREE.Vector3();
      const leftWaveShoulder = new THREE.Vector3();
      const leftWaveElbow = new THREE.Vector3();
      const leftWaveHand = new THREE.Vector3();
      const rightWaveShoulder = new THREE.Vector3();
      const rightWaveElbow = new THREE.Vector3();
      const rightWaveHand = new THREE.Vector3();

      const setBlink = (
        robot: RobotRig,
        elapsed: number,
        offset: number,
        warmth = 0,
        gazeX = 0,
        gazeY = 0,
      ) => {
        const phase = (elapsed + offset) % 5.4;
        const blink =
          phase < 0.16
            ? 1 - Math.sin((phase / 0.16) * Math.PI) * 0.82
            : 1;
        const smile = smoothStep(warmth);
        robot.eyes.forEach((eye) => {
          eye.expression.value = smile;
          eye.root.position.y = 0.012 + smile * 0.009;
          eye.root.scale.set(
            1 + smile * 0.035,
            Math.max(0.08, blink * (1 - smile * 0.07)),
            1,
          );
          eye.gaze.set(gazeX * 10, gazeY * 12);
        });
      };

      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      let reducedMotion = motionQuery.matches;
      let inViewport = true;
      let frameId = 0;
      let animationOrigin = performance.now();
      let targetX = 0;
      let targetY = 0;
      let eyeFocusX = 0;
      let eyeFocusY = 0;
      let lastPointerGreeting = Number.NEGATIVE_INFINITY;

      const resize = () => {
        const { width, height } = mount.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        const pixelRatioLimit = width < 640 ? 1.35 : 1.75;
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, pixelRatioLimit),
        );
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.position.z = width < 640 ? 8.8 : 7.8;
        camera.updateProjectionMatrix();
        if (reducedMotion) renderFrame(1.9);
      };

      const renderFrame = (elapsed: number) => {
        const cycle = elapsed % GREETING_CYCLE_SECONDS;
        const waveEnvelope = (start: number, end: number) =>
          smoothStep((cycle - start) / 0.52) *
          (1 - smoothStep((cycle - (end - 0.52)) / 0.52));
        const leftGreeting = waveEnvelope(0.68, 3.88);
        const rightGreeting = waveEnvelope(0.88, 4.08);
        const leftWaveProgress = smoothStep((cycle - 0.68) / 3.2);
        const rightWaveProgress = smoothStep((cycle - 0.88) / 3.2);
        const leftWave =
          Math.sin(Math.max(0, cycle - 0.68) * Math.PI * 1.9) *
          leftGreeting *
          (1 - leftWaveProgress * 0.26);
        const rightWave =
          Math.sin(Math.max(0, cycle - 0.88) * Math.PI * 1.84) *
          rightGreeting *
          (1 - rightWaveProgress * 0.26);
        const microMotion = Math.sin(elapsed * 0.72);
        const leftBreath = Math.sin(elapsed * 0.92) * 0.008;
        const rightBreath = Math.sin(elapsed * 0.84 + 1.4) * 0.008;
        const leftHeadIdle = Math.sin(elapsed * 0.46) * 0.006;
        const rightHeadIdle = Math.sin(elapsed * 0.41 + 1.4) * 0.006;
        const floorBreath = 0.5 + Math.sin(elapsed * 0.62) * 0.5;
        const getRippleState = (start: number) => {
          const rawPhase = (cycle - start) / 1.55;
          const phase = Math.min(1, Math.max(0, rawPhase));
          const energy =
            rawPhase >= 0 && rawPhase <= 1
              ? Math.sin(phase * Math.PI)
              : 0;
          return { energy, phase };
        };
        const leftRippleState = getRippleState(0.54);
        const rightRippleState = getRippleState(0.76);

        ambientFloorMaterial.opacity = 0.72 + floorBreath * 0.12;
        floorRingMaterial.opacity = 0.075 + floorBreath * 0.045;
        leftFloorRipple.ripple.scale.setScalar(
          0.72 + leftRippleState.phase * 1.45,
        );
        rightFloorRipple.ripple.scale.setScalar(
          0.72 + rightRippleState.phase * 1.45,
        );
        leftFloorRipple.material.opacity = leftRippleState.energy * 0.24;
        rightFloorRipple.material.opacity = rightRippleState.energy * 0.24;

        leftRobot.root.position.y = leftBreath;
        rightRobot.root.position.y = rightBreath;

        leftInnerShoulder.set(-0.67, -0.37 + leftBreath, 0.1);
        leftInnerElbow.set(
          -0.55,
          -0.72 + leftBreath + microMotion * 0.008,
          0.2,
        );
        leftInnerHand.set(
          -0.49,
          -1.04 + leftBreath + microMotion * 0.012,
          0.27,
        );
        rightInnerShoulder.set(0.67, -0.37 + rightBreath, 0.1);
        rightInnerElbow.set(
          0.55,
          -0.72 + rightBreath - microMotion * 0.008,
          0.2,
        );
        rightInnerHand.set(
          0.49,
          -1.04 + rightBreath - microMotion * 0.012,
          0.27,
        );
        positionArm(
          leftInnerArm,
          leftInnerShoulder,
          leftInnerElbow,
          leftInnerHand,
        );
        positionArm(
          rightInnerArm,
          rightInnerShoulder,
          rightInnerElbow,
          rightInnerHand,
        );

        leftWaveShoulder.set(-1.64, -0.37 + leftBreath, 0.02);
        leftWaveElbow.set(
          -1.75 - leftGreeting * (0.12 + leftWave * 0.018),
          -0.75 +
            leftBreath +
            leftGreeting * (0.69 + Math.abs(leftWave) * 0.014),
          0.12 + leftGreeting * (0.12 + leftWave * 0.018),
        );
        leftWaveHand.set(
          -1.66 + leftGreeting * (-0.09 + leftWave * 0.15),
          -1.06 +
            leftBreath +
            leftGreeting * (1.58 + Math.abs(leftWave) * 0.025),
          0.23 + leftGreeting * (0.17 + leftWave * 0.025),
        );
        rightWaveShoulder.set(1.64, -0.37 + rightBreath, 0.02);
        rightWaveElbow.set(
          1.75 + rightGreeting * (0.12 + rightWave * 0.018),
          -0.75 +
            rightBreath +
            rightGreeting * (0.69 + Math.abs(rightWave) * 0.014),
          0.12 + rightGreeting * (0.12 + rightWave * 0.018),
        );
        rightWaveHand.set(
          1.66 + rightGreeting * (0.09 - rightWave * 0.15),
          -1.06 +
            rightBreath +
            rightGreeting * (1.58 + Math.abs(rightWave) * 0.025),
          0.23 + rightGreeting * (0.17 - rightWave * 0.025),
        );
        positionArm(
          leftOuterArm,
          leftWaveShoulder,
          leftWaveElbow,
          leftWaveHand,
        );
        positionArm(
          rightOuterArm,
          rightWaveShoulder,
          rightWaveElbow,
          rightWaveHand,
        );
        leftOuterArm.hand.rotation.z =
          leftGreeting * (-0.18 + leftWave * 0.48);
        rightOuterArm.hand.rotation.z =
          rightGreeting * (0.18 - rightWave * 0.48);

        leftRobot.head.rotation.z =
          -0.018 + leftGreeting * 0.04 + leftWave * 0.008 + leftHeadIdle;
        rightRobot.head.rotation.z =
          0.018 - rightGreeting * 0.04 - rightWave * 0.008 + rightHeadIdle;
        leftRobot.head.position.y =
          0.46 + leftGreeting * 0.018 + Math.abs(leftWave) * 0.006;
        rightRobot.head.position.y =
          0.46 + rightGreeting * 0.018 + Math.abs(rightWave) * 0.006;
        leftRobot.head.rotation.x = leftGreeting * 0.026;
        rightRobot.head.rotation.x = rightGreeting * 0.026;
        leftRobot.head.rotation.y = 0.08 * (1 - leftGreeting * 0.78);
        rightRobot.head.rotation.y = -0.08 * (1 - rightGreeting * 0.78);
        eyeFocusX += (targetX * 0.022 - eyeFocusX) * 0.055;
        eyeFocusY += (-targetY * 0.014 - eyeFocusY) * 0.055;
        setBlink(
          leftRobot,
          elapsed,
          0,
          leftGreeting,
          eyeFocusX,
          eyeFocusY,
        );
        setBlink(
          rightRobot,
          elapsed,
          1.65,
          rightGreeting,
          eyeFocusX,
          eyeFocusY,
        );

        const leftVoice =
          leftGreeting * (0.18 + Math.abs(Math.sin(elapsed * 8.4)) * 0.22);
        const rightVoice =
          rightGreeting * (0.18 + Math.abs(Math.sin(elapsed * 8.1)) * 0.22);
        leftRobot.mouth.scale.y = 0.9 + leftVoice * 0.32;
        rightRobot.mouth.scale.y = 0.9 + rightVoice * 0.32;
        leftRobot.mouth.rotation.z = leftWave * 0.009;
        rightRobot.mouth.rotation.z = -rightWave * 0.009;
        leftRobot.chest.emissiveIntensity =
          0.08 + leftGreeting * 0.13 + leftVoice * 0.09;
        rightRobot.chest.emissiveIntensity =
          0.08 + rightGreeting * 0.13 + rightVoice * 0.09;

        const greetingState =
          cycle >= 1.24 && cycle < 3.18 ? "visible" : "hidden";
        if (mount.dataset.greeting !== greetingState) {
          mount.dataset.greeting = greetingState;
        }

        robotRoot.rotation.y +=
          (targetX * 0.065 - robotRoot.rotation.y) * 0.04;
        robotRoot.rotation.x +=
          (-targetY * 0.028 - robotRoot.rotation.x) * 0.04;
        renderer.render(scene, camera);
      };

      const stop = () => {
        if (!frameId) return;
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      };

      const animate = (time: number) => {
        frameId = 0;
        if (!inViewport || document.hidden || reducedMotion) return;
        renderFrame((time - animationOrigin) / 1000);
        frameId = window.requestAnimationFrame(animate);
      };

      const start = () => {
        if (frameId || !inViewport || document.hidden || reducedMotion) return;
        frameId = window.requestAnimationFrame(animate);
      };

      const handlePointerMove = (event: PointerEvent) => {
        const bounds = mount.getBoundingClientRect();
        targetX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        targetY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
      };
      const handlePointerEnter = () => {
        if (reducedMotion) return;
        const now = performance.now();
        const cycle = ((now - animationOrigin) / 1000) % GREETING_CYCLE_SECONDS;
        const greetingIsApproaching = cycle < 4.18;
        if (greetingIsApproaching || now - lastPointerGreeting < 4_500) return;

        animationOrigin = now - 200;
        lastPointerGreeting = now;
        mount.dataset.greeting = "hidden";
      };
      const handlePointerLeave = () => {
        targetX = 0;
        targetY = 0;
      };
      const handleVisibility = () => {
        if (document.hidden) stop();
        else start();
      };
      const handleContextLost = (event: Event) => {
        event.preventDefault();
        stop();
        mount.dataset.renderState = "fallback";
      };
      const handleMotionChange = (event: MediaQueryListEvent) => {
        reducedMotion = event.matches;
        if (reducedMotion) {
          stop();
          renderFrame(1.9);
        } else {
          animationOrigin = performance.now();
          mount.dataset.greeting = "hidden";
          start();
        }
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      const viewportObserver =
        "IntersectionObserver" in window
          ? new IntersectionObserver(
              ([entry]) => {
                inViewport = entry?.isIntersecting ?? true;
                if (inViewport) start();
                else stop();
              },
              { rootMargin: "120px", threshold: 0.01 },
            )
          : undefined;
      viewportObserver?.observe(mount);

      mount.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      mount.addEventListener("pointerenter", handlePointerEnter, {
        passive: true,
      });
      mount.addEventListener("pointerleave", handlePointerLeave, {
        passive: true,
      });
      renderer.domElement.addEventListener(
        "webglcontextlost",
        handleContextLost,
      );
      document.addEventListener("visibilitychange", handleVisibility);
      motionQuery.addEventListener("change", handleMotionChange);

      resize();
      renderFrame(reducedMotion ? 1.9 : 0);
      mount.dataset.renderState = "ready";
      if (!reducedMotion) start();

      cleanupScene = () => {
        stop();
        resizeObserver.disconnect();
        viewportObserver?.disconnect();
        mount.removeEventListener("pointermove", handlePointerMove);
        mount.removeEventListener("pointerenter", handlePointerEnter);
        mount.removeEventListener("pointerleave", handlePointerLeave);
        renderer.domElement.removeEventListener(
          "webglcontextlost",
          handleContextLost,
        );
        document.removeEventListener("visibilitychange", handleVisibility);
        motionQuery.removeEventListener("change", handleMotionChange);
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        textures.forEach((texture) => texture.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    let bootstrapTimer = 0;
    let bootstrapObserver: IntersectionObserver | undefined;
    const queueScene = () => {
      if (bootstrapTimer || disposed) return;
      bootstrapTimer = window.setTimeout(() => {
        bootstrapTimer = 0;
        void initializeScene().catch(() => {
          if (!disposed) mount.dataset.renderState = "fallback";
        });
      }, 80);
    };

    if ("IntersectionObserver" in window) {
      bootstrapObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          bootstrapObserver?.disconnect();
          queueScene();
        },
        { rootMargin: "180px", threshold: 0.01 },
      );
      bootstrapObserver.observe(mount);
    } else {
      queueScene();
    }

    return () => {
      disposed = true;
      if (bootstrapTimer) window.clearTimeout(bootstrapTimer);
      bootstrapObserver?.disconnect();
      cleanupScene?.();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="merge-core"
      data-greeting="hidden"
      data-render-state="loading"
      ref={sceneRef}
    >
      <div className="merge-core__fallback">
        <span className="merge-core__fallback-stage" />
        <span className="merge-core__fallback-robot merge-core__fallback-robot--left">
          <i className="merge-core__fallback-head">
            <b />
            <b />
            <span className="merge-core__fallback-mouth" />
          </i>
          <i className="merge-core__fallback-body" />
          <i className="merge-core__fallback-arm" />
        </span>
        <span className="merge-core__fallback-robot merge-core__fallback-robot--right">
          <i className="merge-core__fallback-head">
            <b />
            <b />
            <span className="merge-core__fallback-mouth" />
          </i>
          <i className="merge-core__fallback-body" />
          <i className="merge-core__fallback-arm" />
        </span>
      </div>
      <span className="merge-core__greeting">
        <span className="merge-core__greeting-bubble">Grialo!</span>
      </span>
    </div>
  );
}
