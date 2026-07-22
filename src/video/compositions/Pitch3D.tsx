import React, { useMemo } from "react";
import { Line } from "@react-three/drei";
import { COLORS } from "../theme";
import {
  PITCH_LENGTH_UNITS,
  PITCH_WIDTH_UNITS,
  CENTER_CIRCLE_RADIUS_UNITS,
  CENTER_SPOT_RADIUS_UNITS,
  BOX_DEPTH_UNITS,
  BOX_WIDTH_UNITS,
  GOAL_WIDTH_UNITS,
  GOAL_HEIGHT_UNITS,
} from "../coords3D";

const LINE_COLOR = "#e8f0ec";
const LINE_HEIGHT = 0.015; // just above the ground plane, avoids z-fighting
const LINE_WIDTH = 1.6;
const STRIPE_COUNT = 10;

// Local, brighter grass greens rather than the shared 2D COLORS.pitch/
// pitchStripe — those are tuned dark on purpose for the 2D board's own
// overlays; changing them here would ripple into every 2D pitch too. Kept
// as flat (unlit) colors on purpose, same as before, so brightness is exact
// and predictable rather than depending on the scene's light angle.
const GRASS_COLOR = "#2f7d40";
const GRASS_STRIPE_COLOR = "#357f47";

function circlePoints(radius: number, segments = 64): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return [Math.cos(angle) * radius, LINE_HEIGHT, Math.sin(angle) * radius];
  });
}

function boxOutline(nearEdgeX: number, direction: 1 | -1): [number, number, number][] {
  const farX = nearEdgeX + direction * BOX_DEPTH_UNITS;
  const halfWidth = BOX_WIDTH_UNITS / 2;
  return [
    [nearEdgeX, LINE_HEIGHT, -halfWidth],
    [farX, LINE_HEIGHT, -halfWidth],
    [farX, LINE_HEIGHT, halfWidth],
    [nearEdgeX, LINE_HEIGHT, halfWidth],
  ];
}

/** The 3D counterpart to Pitch.tsx/PerspectivePitch.tsx — a ground-plane
 * pitch with mowing stripes and white line markings (boundary, halfway line,
 * center circle/spot, both penalty boxes) plus a simple goal frame at each
 * end. Shared by TacticalBoard3D/Formation3D/ShotMap3D so the pitch itself
 * looks identical across every 3D card, same role Pitch.tsx plays for the 2D
 * family. Purely static geometry — no frame-driven animation of its own;
 * callers fade its containing group in via opacity same as every 2D board. */
export const Pitch3D: React.FC = () => {
  const stripeLength = PITCH_LENGTH_UNITS / STRIPE_COUNT;
  const stripes = useMemo(() => Array.from({ length: STRIPE_COUNT }, (_, i) => i).filter((i) => i % 2 === 0), []);
  const centerCircle = useMemo(() => circlePoints(CENTER_CIRCLE_RADIUS_UNITS), []);
  const halfLength = PITCH_LENGTH_UNITS / 2;
  const halfWidth = PITCH_WIDTH_UNITS / 2;

  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[PITCH_LENGTH_UNITS, PITCH_WIDTH_UNITS]} />
        <meshBasicMaterial color={GRASS_COLOR} />
      </mesh>

      {/* Mowing stripes */}
      {stripes.map((i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-halfLength + stripeLength * (i + 0.5), 0.005, 0]}
        >
          <planeGeometry args={[stripeLength, PITCH_WIDTH_UNITS]} />
          <meshBasicMaterial color={GRASS_STRIPE_COLOR} />
        </mesh>
      ))}

      {/* Boundary */}
      <Line
        points={[
          [-halfLength, LINE_HEIGHT, -halfWidth],
          [halfLength, LINE_HEIGHT, -halfWidth],
          [halfLength, LINE_HEIGHT, halfWidth],
          [-halfLength, LINE_HEIGHT, halfWidth],
          [-halfLength, LINE_HEIGHT, -halfWidth],
        ]}
        color={LINE_COLOR}
        lineWidth={LINE_WIDTH}
        transparent
        opacity={0.6}
      />

      {/* Halfway line */}
      <Line
        points={[
          [0, LINE_HEIGHT, -halfWidth],
          [0, LINE_HEIGHT, halfWidth],
        ]}
        color={LINE_COLOR}
        lineWidth={LINE_WIDTH}
        transparent
        opacity={0.6}
      />

      {/* Center circle + spot */}
      <Line points={centerCircle} color={LINE_COLOR} lineWidth={LINE_WIDTH} transparent opacity={0.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LINE_HEIGHT, 0]}>
        <circleGeometry args={[CENTER_SPOT_RADIUS_UNITS, 16]} />
        <meshBasicMaterial color={LINE_COLOR} transparent opacity={0.6} />
      </mesh>

      {/* Penalty boxes, one at each goal line */}
      <Line
        points={[...boxOutline(-halfLength, 1), boxOutline(-halfLength, 1)[0]]}
        color={LINE_COLOR}
        lineWidth={LINE_WIDTH}
        transparent
        opacity={0.6}
      />
      <Line
        points={[...boxOutline(halfLength, -1), boxOutline(halfLength, -1)[0]]}
        color={LINE_COLOR}
        lineWidth={LINE_WIDTH}
        transparent
        opacity={0.6}
      />

      {/* Goal frames — simple wireframe boxes standing on each goal line */}
      {[-halfLength, halfLength].map((goalX) => (
        <Line
          key={goalX}
          points={[
            [goalX, 0, -GOAL_WIDTH_UNITS / 2],
            [goalX, GOAL_HEIGHT_UNITS, -GOAL_WIDTH_UNITS / 2],
            [goalX, GOAL_HEIGHT_UNITS, GOAL_WIDTH_UNITS / 2],
            [goalX, 0, GOAL_WIDTH_UNITS / 2],
          ]}
          color={COLORS.text}
          lineWidth={LINE_WIDTH}
          transparent
          opacity={0.7}
        />
      ))}
    </group>
  );
};
