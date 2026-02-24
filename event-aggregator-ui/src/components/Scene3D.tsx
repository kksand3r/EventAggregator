"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Text } from "@react-three/drei";
import * as THREE from "three";

const HUE = "#8b5cf6";

const RIBBONS = [
    { y: -3.2, f1: 0.7, f2: 1.4, amp: 0.90, op: 0.18, z: -3.0 },
    { y: -1.4, f1: 1.0, f2: 1.8, amp: 0.75, op: 0.22, z: -1.5 },
    { y:  0.2, f1: 0.8, f2: 1.6, amp: 0.80, op: 0.20, z: -2.0 },
    { y:  1.8, f1: 0.9, f2: 1.5, amp: 0.70, op: 0.18, z: -2.5 },
    { y:  3.2, f1: 0.6, f2: 1.3, amp: 0.85, op: 0.15, z: -4.0 },
    { y:  4.6, f1: 0.5, f2: 1.1, amp: 0.65, op: 0.12, z: -5.0 },
];

function FlowRibbon({ idx }: { idx: number }) {
    const p      = RIBBONS[idx];
    const lineRef = useRef<THREE.Line | null>(null);
    const SEG    = 120;
    const W      = 40;
    const phase  = idx * 1.05;

    const geo = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= SEG; i++)
            pts.push(new THREE.Vector3((i / SEG) * W - W / 2, p.y, p.z));
        return new THREE.BufferGeometry().setFromPoints(pts);
    }, [p.y, p.z]);

    const obj = useMemo(
        () => new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: HUE, transparent: true, opacity: p.op, depthWrite: false })
        ),
        [geo, p.op]
    );

    useFrame(({ clock }) => {
        const line = lineRef.current;
        if (!line?.geometry) return;
        const t   = clock.elapsedTime;
        const arr = line.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i <= SEG; i++) {
            const xN = i / SEG;
            arr[i * 3 + 1] =
                p.y
                + Math.sin(xN * Math.PI * p.f1 + t * 0.45 + phase) * p.amp
                + Math.sin(xN * Math.PI * p.f2 - t * 0.28 + phase * 0.6) * p.amp * 0.35;
            arr[i * 3 + 2] =
                p.z + Math.sin(xN * Math.PI + t * 0.2 + phase) * 0.4;
        }
        line.geometry.attributes.position.needsUpdate = true;
    });

    return <primitive object={obj} ref={lineRef} />;
}
const BIG_SYMBOLS = [
    { t: "♫", x: -9.0, y: 5.5, z: -2.0, size: 4.5, op: 0.15, fs: 0.5, fi: 0.8, ri: 0.15 },
    { t: "♩", x: 10.5, y: -6.0, z: -1.5, size: 3.2, op: 0.18, fs: 0.7, fi: 0.6, ri: 0.12 },
    { t: "✨", x: 8.5, y: 6.2, z: -4.0, size: 5.5, op: 0.12, fs: 0.4, fi: 0.4, ri: 0.05 },
    { t: "🎭", x: -11.0, y: -5.8, z: -3.0, size: 4.0, op: 0.20, fs: 0.6, fi: 0.7, ri: 0.08 },
    { t: "🎤", x: -2.0, y: 7.5, z: -2.5, size: 2.5, op: 0.22, fs: 0.9, fi: 0.5, ri: 0.10 },
    { t: "🎤", x: 3.5, y: -7.2, z: -3.5, size: 3.8, op: 0.14, fs: 0.8, fi: 0.9, ri: 0.07 },
    { t: "♫", x: -14.0, y: 0.5, z: -5.0, size: 6.0, op: 0.08, fs: 0.3, fi: 0.3, ri: 0.04 },
    { t: "♫", x: 13.5, y: -1.2, z: -2.0, size: 2.8, op: 0.25, fs: 1.2, fi: 1.0, ri: 0.20 },
];

function BigSymbols() {
    return (
        <>
            {BIG_SYMBOLS.map((s, i) => (
                <Float
                    key={i}
                    position={[s.x, s.y, s.z]}
                    speed={s.fs}
                    floatIntensity={s.fi}
                    rotationIntensity={s.ri}
                >
                    <Text fontSize={s.size} anchorX="center" anchorY="middle" depthOffset={1}>
                        {s.t}
                        <meshBasicMaterial
                            color={HUE}
                            transparent
                            opacity={s.op}
                            depthWrite={false}
                        />
                    </Text>
                </Float>
            ))}
        </>
    );
}

const DUST = (() => {
    const n   = 80;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = 6 + Math.random() * 3;
        pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi) - 3; 
    }
    return pos;
})();

function Dust() {
    const ref = useRef<THREE.Points>(null);
    useFrame(({ clock }) => {
        if (!ref.current) return;
        ref.current.rotation.y = clock.elapsedTime * 0.010;
    });
    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[DUST, 3]} />
            </bufferGeometry>
            <pointsMaterial
                color={HUE}
                size={0.018}
                transparent
                opacity={0.18}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    );
}

function Scene() {
    return (
        <>
            <ambientLight intensity={0.2} />
            {RIBBONS.map((_, i) => <FlowRibbon key={i} idx={i} />)}
            <BigSymbols />
            <Dust />
        </>
    );
}

export default function Scene3D() {
    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                zIndex: -10,
                pointerEvents: "none",
                overflow: "hidden",
            }}
        >
            <Canvas
                camera={{ position: [0, 0, 12], fov: 52 }}
                gl={{ alpha: true, antialias: true }}
                dpr={[1, 1.5]}
                style={{ width: "100%", height: "100%" }}
            >
                <Scene />
            </Canvas>
        </div>
    );
}