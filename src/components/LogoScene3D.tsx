import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Float, Environment } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import logoAsset from "@/assets/punchly-logo.png.asset.json";

function LogoDisc({ position, scale, rotationSpeed, texture }: {
  position: [number, number, number];
  scale: number;
  rotationSpeed: number;
  texture: THREE.Texture;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * rotationSpeed;
      ref.current.rotation.x += dt * rotationSpeed * 0.3;
    }
  });
  return (
    <Float speed={1.4} rotationIntensity={0.4} floatIntensity={1.2}>
      <mesh ref={ref} position={position} scale={scale}>
        <circleGeometry args={[1, 64]} />
        <meshStandardMaterial
          map={texture}
          transparent
          side={THREE.DoubleSide}
          metalness={0.6}
          roughness={0.25}
          emissive={new THREE.Color("#3b5bdb")}
          emissiveIntensity={0.15}
        />
      </mesh>
    </Float>
  );
}

function Scene({ pointer }: { pointer: React.MutableRefObject<{ x: number; y: number }> }) {
  const texture = useLoader(THREE.TextureLoader, logoAsset.url);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += (pointer.current.x * 0.3 - groupRef.current.rotation.y) * 0.04;
      groupRef.current.rotation.x += (-pointer.current.y * 0.2 - groupRef.current.rotation.x) * 0.04;
    }
  });

  const discs = useMemo(
    () => [
      { position: [0, 0, 0] as [number, number, number], scale: 2.2, speed: 0.25 },
      { position: [-3.2, 1.4, -2] as [number, number, number], scale: 0.9, speed: 0.5 },
      { position: [3.4, -1.2, -1.5] as [number, number, number], scale: 1.1, speed: -0.4 },
      { position: [-2.6, -2.2, -3] as [number, number, number], scale: 0.6, speed: 0.7 },
      { position: [2.8, 2.4, -2.5] as [number, number, number], scale: 0.7, speed: -0.6 },
      { position: [0, 3.2, -4] as [number, number, number], scale: 0.5, speed: 0.9 },
    ],
    [],
  );

  return (
    <group ref={groupRef}>
      {discs.map((d, i) => (
        <LogoDisc key={i} position={d.position} scale={d.scale} rotationSpeed={d.speed} texture={texture} />
      ))}
    </group>
  );
}

export function LogoScene3D() {
  const [mounted, setMounted] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  if (!mounted) return null;

  return (
    <Canvas
      className="!absolute inset-0"
      style={{ pointerEvents: "none" }}
      camera={{ position: [0, 0, 6], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <directionalLight position={[-5, -3, 2]} intensity={0.5} color="#7c9cff" />
      <Suspense fallback={null}>
        <Scene pointer={pointer} />
        <Environment preset="city" />
      </Suspense>
    </Canvas>
  );
}

export default LogoScene3D;
