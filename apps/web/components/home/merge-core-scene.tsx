"use client";

import { useEffect, useRef } from "react";
import type {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

type RobotRig = {
  chest: MeshPhysicalMaterial;
  eyes: [Mesh, Mesh];
  head: Group;
};

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

      mount.dataset.renderState = "ready";
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
      const trackGeometry = <T extends BufferGeometry>(geometry: T) => {
        geometries.push(geometry);
        return geometry;
      };
      const trackMaterial = <T extends Material>(material: T) => {
        materials.push(material);
        return material;
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

      // One clear character moment: two purpose-built robots complete a handoff.
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
      const eyeMaterial = trackMaterial(
        new THREE.MeshStandardMaterial({
          color: SILVER_MIST,
          emissive: SILVER_MIST,
          emissiveIntensity: 2.8,
          roughness: 0.14,
        }),
      );
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
      const eyeGeometry = trackGeometry(
        new THREE.SphereGeometry(0.057, 20, 14),
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

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.17, 0.005, 0.312);
        leftEye.scale.set(1.28, 0.62, 0.34);
        head.add(leftEye);
        const rightEye = leftEye.clone();
        rightEye.position.x = 0.17;
        head.add(rightEye);

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

        return { chest, eyes: [leftEye, rightEye], head };
      };

      const leftRobot = createRobot(
        -1.14,
        slateShell,
        mistShell,
        slateInset,
        1,
      );
      const rightRobot = createRobot(
        1.14,
        mistShell,
        slateInset,
        mistShell,
        -1,
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

      positionArm(
        leftOuterArm,
        new THREE.Vector3(-1.64, -0.37, 0.02),
        new THREE.Vector3(-1.75, -0.75, 0.12),
        new THREE.Vector3(-1.66, -1.06, 0.23),
      );
      positionArm(
        rightOuterArm,
        new THREE.Vector3(1.64, -0.37, 0.02),
        new THREE.Vector3(1.75, -0.75, 0.12),
        new THREE.Vector3(1.66, -1.06, 0.23),
      );

      const tokenGroup = new THREE.Group();
      tokenGroup.position.set(0, -0.39, 0.48);
      robotRoot.add(tokenGroup);
      const tokenMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          clearcoatRoughness: 0.07,
          color: SILVER_MIST,
          emissive: SILVER_MIST,
          emissiveIntensity: 0.28,
          metalness: 0.74,
          roughness: 0.11,
        }),
      );
      const token = new THREE.Mesh(
        trackGeometry(
          createRoundedPanelGeometry(THREE, 0.34, 0.34, 0.105, 0.13),
        ),
        tokenMaterial,
      );
      token.castShadow = true;
      tokenGroup.add(token);
      const tokenInset = new THREE.Mesh(
        trackGeometry(
          createRoundedPanelGeometry(THREE, 0.15, 0.15, 0.045, 0.02),
        ),
        slateInset,
      );
      tokenInset.position.z = 0.08;
      tokenGroup.add(tokenInset);

      const tokenHalo = new THREE.Mesh(
        trackGeometry(new THREE.TorusGeometry(0.43, 0.008, 8, 72)),
        trackMaterial(
          new THREE.MeshBasicMaterial({
            color: SILVER_MIST,
            opacity: 0.22,
            transparent: true,
          }),
        ),
      );
      tokenHalo.position.z = -0.06;
      tokenGroup.add(tokenHalo);

      const stage = new THREE.Mesh(
        trackGeometry(new THREE.CylinderGeometry(2.45, 2.62, 0.09, 80)),
        trackMaterial(
          new THREE.MeshPhysicalMaterial({
            color: VOID_ECLIPSE,
            metalness: 0.32,
            opacity: 0.74,
            roughness: 0.66,
            transparent: true,
          }),
        ),
      );
      stage.position.set(0, -1.91, -0.12);
      stage.receiveShadow = true;
      robotRoot.add(stage);

      const coreLight = new THREE.PointLight(SILVER_MIST, 1.2, 3.4, 2);
      coreLight.position.copy(tokenGroup.position);
      robotRoot.add(coreLight);

      const leftShoulder = new THREE.Vector3();
      const leftElbow = new THREE.Vector3();
      const leftHand = new THREE.Vector3();
      const rightShoulder = new THREE.Vector3();
      const rightElbow = new THREE.Vector3();
      const rightHand = new THREE.Vector3();

      const setBlink = (robot: RobotRig, elapsed: number, offset: number) => {
        const phase = (elapsed + offset) % 5.4;
        const blink =
          phase < 0.16
            ? 1 - Math.sin((phase / 0.16) * Math.PI) * 0.82
            : 1;
        for (const eye of robot.eyes) {
          eye.scale.set(1.28, 0.62 * blink, 0.34);
        }
      };

      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      let reducedMotion = motionQuery.matches;
      let inViewport = true;
      let frameId = 0;
      let targetX = 0;
      let targetY = 0;

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
        if (reducedMotion) renderFrame(2.85);
      };

      const renderFrame = (elapsed: number) => {
        const cycle = (elapsed % 7.6) / 7.6;
        const approach = smoothStep((cycle - 0.14) / 0.2);
        const release = smoothStep((cycle - 0.72) / 0.16);
        const contact = approach * (1 - release);
        const energy = smoothStep((contact - 0.36) / 0.64);
        const microMotion = Math.sin(elapsed * 0.72);

        leftShoulder.set(-0.67, -0.37, 0.1);
        leftElbow.set(
          -0.53 + contact * 0.09,
          -0.69 + contact * 0.13,
          0.25,
        );
        leftHand.set(
          -0.58 + contact * 0.34,
          -0.54 + contact * 0.12,
          0.43,
        );
        rightShoulder.set(0.67, -0.37, 0.1);
        rightElbow.set(
          0.53 - contact * 0.09,
          -0.69 + contact * 0.13,
          0.25,
        );
        rightHand.set(
          0.58 - contact * 0.34,
          -0.54 + contact * 0.12,
          0.43,
        );
        positionArm(leftInnerArm, leftShoulder, leftElbow, leftHand);
        positionArm(rightInnerArm, rightShoulder, rightElbow, rightHand);

        leftRobot.head.rotation.z =
          -0.018 - contact * 0.032 + microMotion * 0.006;
        rightRobot.head.rotation.z =
          0.018 + contact * 0.032 - microMotion * 0.006;
        leftRobot.head.rotation.y = 0.08 + contact * 0.055;
        rightRobot.head.rotation.y = -0.08 - contact * 0.055;
        setBlink(leftRobot, elapsed, 0);
        setBlink(rightRobot, elapsed, 1.65);

        tokenGroup.position.y = -0.39 + energy * 0.055;
        tokenGroup.rotation.y = elapsed * 0.22;
        tokenGroup.rotation.z = Math.sin(elapsed * 0.34) * 0.045;
        const tokenScale = 0.94 + energy * 0.1;
        tokenGroup.scale.setScalar(tokenScale);
        tokenMaterial.emissiveIntensity = 0.28 + energy * 1.35;
        tokenHalo.rotation.z = elapsed * 0.08;
        tokenHalo.scale.setScalar(0.94 + energy * 0.22);
        coreLight.position.copy(tokenGroup.position);
        coreLight.intensity = 1.1 + energy * 5.6;
        leftRobot.chest.emissiveIntensity = 0.08 + energy * 0.42;
        rightRobot.chest.emissiveIntensity = 0.08 + energy * 0.42;

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
        renderFrame(time / 1000);
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
          renderFrame(2.85);
        } else {
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
      if (reducedMotion) renderFrame(2.85);
      else start();

      cleanupScene = () => {
        stop();
        resizeObserver.disconnect();
        viewportObserver?.disconnect();
        mount.removeEventListener("pointermove", handlePointerMove);
        mount.removeEventListener("pointerleave", handlePointerLeave);
        renderer.domElement.removeEventListener(
          "webglcontextlost",
          handleContextLost,
        );
        document.removeEventListener("visibilitychange", handleVisibility);
        motionQuery.removeEventListener("change", handleMotionChange);
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
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
      data-render-state="loading"
      ref={sceneRef}
    >
      <div className="merge-core__fallback">
        <span className="merge-core__fallback-stage" />
        <span className="merge-core__fallback-robot merge-core__fallback-robot--left">
          <i className="merge-core__fallback-head">
            <b />
            <b />
          </i>
          <i className="merge-core__fallback-body" />
          <i className="merge-core__fallback-arm" />
        </span>
        <span className="merge-core__fallback-robot merge-core__fallback-robot--right">
          <i className="merge-core__fallback-head">
            <b />
            <b />
          </i>
          <i className="merge-core__fallback-body" />
          <i className="merge-core__fallback-arm" />
        </span>
        <span className="merge-core__fallback-token" />
      </div>
    </div>
  );
}
