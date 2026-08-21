import React from "react";
import * as THREE from "three";
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { Line, RoundedBox } from "@react-three/drei";
import { CameraRig3D } from "./CameraRig3D";
import type { SharedVisualProps } from "../sharedVisualProps";
import type { Visual } from "../../model/Segment";
import { DISPLAY_FONT_FAMILY } from "../theme";

/**
 * A REAL 3D STAGE.
 *
 * The 2D stage can state that a phone turned. It cannot travel through
 * anything, give an object a side profile, or put a field in space with depth
 * both in front of and behind the thing it surrounds — and those are not
 * finishing touches on a flat renderer, they need volume, lighting, and a
 * camera that occupies a position.
 *
 * The teaching move this exists for is the reference frame. A quantity fixed to
 * the WORLD holds its direction while the body it is drawn on tumbles; one
 * fixed to the BODY tumbles with it. Flat, that is a claim with two arrows
 * next to it. Here the viewer can orbit the pair and watch it hold from every
 * side, which is the difference between being told a phone has an orientation
 * and seeing one have it.
 *
 * Every `kind` below is a mesh with real volume. Nothing here is a picture of a
 * thing standing in for the thing.
 */

type SpatialData = Extract<Visual, { kind: "spatial" }>;
type SpatialObject = SpatialData["objects"][number];
type SpatialAction = SpatialData["timeline"][number];

/** THE SAME TWO PALETTES THE 2D STAGE USES, so a video can cut between a flat
 * scene and a spatial one without the world changing colour underneath the
 * viewer. Adding a third dimension is the only difference between the media;
 * it is not licence to invent a new look.
 *
 * The dark set glows on black. The light set is dark and saturated because it
 * has to hold against cream — the same reasoning, and the same hexes, as
 * StageCard's LIGHT_ACCENTS. */
const ACCENTS_DARK: Record<string, string> = {
  neutral: "#8ea3c8",
  primary: "#3b82f6",
  warn: "#f97316",
  success: "#22c55e",
  danger: "#ef4444",
  profile: "#a855f7",
};
const ACCENTS_LIGHT: Record<string, string> = {
  neutral: "#1f2a44",
  primary: "#1d4ed8",
  warn: "#d97706",
  success: "#15803d",
  danger: "#b3121f",
  profile: "#6d28d9",
};

/** Linear 0..1 across an action's own window. */
function progress(t: number, start: number, duration: number): number {
  if (t <= start) return 0;
  if (t >= start + duration) return 1;
  return (t - start) / duration;
}

/** Ease used for anything a viewer reads as a deliberate move — camera travel,
 * an object settling into an attitude. A linear camera move reads as a machine
 * panning; this reads as a decision. */
function ease(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const DEG = Math.PI / 180;

/** Half-extents of each mesh, in its own units, so a vector can be rooted
 * exactly on the surface it leaves from.
 *
 * Guessing one clearance for every shape cannot work: the same number that
 * clears a phone's long edge leaves an arrow floating half a screen away from
 * its short edge. These are the actual dimensions the meshes are built at. */
const HALF_EXTENTS: Record<string, [number, number, number]> = {
  phone: [0.475, 0.975, 0.055],
  globe: [1, 1, 1],
  satellite: [0.9, 0.35, 1.05],
  node: [0.16, 0.16, 0.16],
  plane: [8.25, 0.05, 14.85],
  pin: [0.3, 1.0, 0.3],
  axes: [0, 0, 0],
  vector: [0, 0, 0],
};

/** Distance from a body's centre to its surface along `d` — an exact ray/box
 * hit for the boxy shapes and simply the radius for the sphere. */
function surfaceDistance(kind: string, d: THREE.Vector3, scale: number): number {
  const half = HALF_EXTENTS[kind];
  if (!half) return 0.6 * scale;
  if (kind === "globe") return half[0] * scale;
  const comps = [
    Math.abs(d.x) > 1e-4 ? (half[0] * scale) / Math.abs(d.x) : Infinity,
    Math.abs(d.y) > 1e-4 ? (half[1] * scale) / Math.abs(d.y) : Infinity,
    Math.abs(d.z) > 1e-4 ? (half[2] * scale) / Math.abs(d.z) : Infinity,
  ];
  const t = Math.min(...comps);
  return Number.isFinite(t) ? t : 0.6 * scale;
}


// ---------------------------------------------------------------------------
// Meshes
// ---------------------------------------------------------------------------


/** Simplified continent outlines in (longitude, latitude). Rough on purpose:
 * this is an illustrated globe, not a survey, and hand-sized polygons read far
 * better at phone scale than a coastline traced to the metre would. */
const LANDMASSES: [number, number][][] = [
  // North America
  [[-168, 65], [-140, 70], [-120, 72], [-95, 73], [-80, 70], [-60, 60], [-55, 50], [-65, 45], [-80, 42], [-82, 30], [-97, 26], [-105, 22], [-115, 30], [-125, 40], [-130, 55], [-150, 60]],
  // South America
  [[-80, 10], [-60, 10], [-50, 0], [-35, -5], [-38, -22], [-48, -25], [-58, -35], [-65, -45], [-72, -52], [-75, -40], [-70, -20], [-78, -5]],
  // Africa
  [[-17, 15], [0, 25], [12, 32], [25, 32], [35, 30], [43, 12], [51, 12], [40, -5], [40, -25], [32, -34], [20, -35], [12, -18], [9, 4], [-8, 5]],
  // Europe
  [[-10, 36], [0, 44], [12, 45], [20, 40], [30, 45], [40, 48], [30, 60], [25, 70], [10, 60], [5, 58], [-5, 50]],
  // Asia
  [[30, 45], [45, 42], [60, 45], [75, 40], [78, 22], [88, 22], [95, 15], [100, 8], [105, 12], [110, 20], [122, 40], [130, 45], [140, 50], [150, 60], [160, 68], [140, 72], [110, 75], [80, 75], [60, 70], [45, 65], [35, 60]],
  // Australia
  [[114, -22], [130, -12], [142, -11], [150, -22], [153, -28], [148, -38], [138, -35], [128, -32], [115, -34]],
  // Greenland
  [[-45, 60], [-20, 65], [-18, 75], [-30, 83], [-55, 82], [-58, 70]],
  // Antarctica
  [[-180, -63], [-120, -68], [-60, -63], [0, -68], [60, -65], [120, -68], [180, -63], [180, -90], [-180, -90]],
];

/** THE EARTH'S SURFACE, painted procedurally rather than loaded as an asset —
 * the render has no network and an image file would be one more thing to ship
 * and cache. Equirectangular, so it wraps the sphere correctly: longitude maps
 * to x, latitude to y. */
function useEarthTexture(ocean: string, land: string, coast: string): THREE.CanvasTexture | null {
  return React.useMemo(() => {
    if (typeof document === "undefined") return null;
    const W = 2048;
    const H = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, W, H);

    const project = (lon: number, lat: number): [number, number] => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];

    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    for (const shape of LANDMASSES) {
      ctx.beginPath();
      shape.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = land;
      ctx.fill();
      ctx.strokeStyle = coast;
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [ocean, land, coast]);
}

/** THE PLANET, and the one fact about it that matters here: its magnetic axis
 * is not its spin axis. The graticule is real geometry rather than a texture so
 * it holds up at any distance, and the field — when the state calls for it — is
 * a set of dipole loops built around an axis tilted off the spin axis. That
 * offset IS "magnetic north is not true north", shown rather than asserted. */
const Globe: React.FC<{ color: string; showField: boolean; fieldColor: string; lineColor: string; lineOpacity: number; ocean: string; land: string; coast: string }> = ({
  color,
  showField,
  fieldColor,
  lineColor,
  lineOpacity,
  ocean,
  land,
  coast,
}) => {
  const earth = useEarthTexture(ocean, land, coast);
  const R = 1;
  const MAGNETIC_TILT = 16;

  const graticule = React.useMemo(() => {
    const lines: [number, number, number][][] = [];
    // Meridians.
    for (let m = 0; m < 8; m++) {
      const lon = (m / 8) * Math.PI * 2;
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 48; i++) {
        const lat = -Math.PI / 2 + (i / 48) * Math.PI;
        pts.push([R * Math.cos(lat) * Math.cos(lon), R * Math.sin(lat), R * Math.cos(lat) * Math.sin(lon)]);
      }
      lines.push(pts);
    }
    // Parallels.
    for (let p = 1; p < 6; p++) {
      const lat = -Math.PI / 2 + (p / 6) * Math.PI;
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 64; i++) {
        const lon = (i / 64) * Math.PI * 2;
        pts.push([R * Math.cos(lat) * Math.cos(lon), R * Math.sin(lat), R * Math.cos(lat) * Math.sin(lon)]);
      }
      lines.push(pts);
    }
    return lines;
  }, []);

  /** Dipole loops. Each leaves one pole, bows out by `spread`, and returns to
   * the other — the shape everyone has seen around a bar magnet, which is why
   * it reads as a magnetic field with no label at all. They are generated at
   * several bearings so the field has genuine depth: some loops pass in front
   * of the planet and some behind it, and that parallax as the camera moves is
   * what makes it a field rather than a drawing of one. */
  const fieldLoops = React.useMemo(() => {
    const loops: [number, number, number][][] = [];
    const spreads = [1.5, 2.15];
    const bearings = 4;
    for (const spread of spreads) {
      for (let b = 0; b < bearings; b++) {
        const lon = (b / bearings) * Math.PI * 2;
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= 64; i++) {
          const u = i / 64;
          // A lobe: zero radius at the poles, widest at the equator.
          const theta = -Math.PI / 2 + u * Math.PI;
          const r = R * spread * Math.cos(theta) * Math.cos(theta);
          const y = R * 1.04 * Math.sin(theta);
          pts.push([r * Math.cos(lon), y, r * Math.sin(lon)]);
        }
        loops.push(pts);
      }
    }
    return loops;
  }, []);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[R, 64, 48]} />
        {earth ? (
          <meshStandardMaterial map={earth} roughness={0.9} metalness={0.02} />
        ) : (
          <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
        )}
      </mesh>
      {graticule.map((pts, i) => (
        <Line key={`g${i}`} points={pts} color={lineColor} lineWidth={1} transparent opacity={lineOpacity} />
      ))}
      {/* No spin-axis spindle. It was drawn as a technical reference line and
          read as one — a dimension line pinned to a planet. The tilt it existed
          to prove is already legible without it, because the field loops lean
          visibly against the sphere's own graticule. */}
      {showField ? (
        <group rotation={[0, 0, MAGNETIC_TILT * DEG]}>
          {fieldLoops.map((pts, i) => (
            <Line key={`f${i}`} points={pts} color={fieldColor} lineWidth={2} transparent opacity={0.8} />
          ))}
          {/* The magnetic pole: visibly NOT at the top of the spin axis. */}
          <mesh position={[0, R * 1.06, 0]}>
            <sphereGeometry args={[0.075, 16, 16]} />
            <meshStandardMaterial color={fieldColor} emissive={fieldColor} emissiveIntensity={0.5} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
};

/** A SPACECRAFT, built the way the real ones look: a cylindrical bus, a big
 * parabolic dish on a short boom with its feed at the focus, two gridded solar
 * wings, and an engine bell at the tail.
 *
 * The parts are not decoration. The dish says which way it is pointing, the
 * wings say which way it is oriented, and the bell says which end is the back —
 * so when it runs an orbit the viewer can read its attitude and not merely its
 * position. A featureless box in orbit is a moving dot. */
const Satellite: React.FC<{ light: boolean }> = ({ light }) => {
  const hull = light ? "#eceff5" : "#dfe5ee";
  const trim = light ? "#7f8b9e" : "#94a3b8";
  const panelBlue = "#3f5a94";
  const mullion = light ? "#8b93a5" : "#6b7280";
  const nozzle = "#a4432c";

  return (
    <group>
      {/* Bus: a cylinder lying along X, with banding so it reads as built. */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.17, 0.17, 0.95, 24]} />
        <meshStandardMaterial color={hull} metalness={0.35} roughness={0.45} />
      </mesh>
      {[-0.16, 0.02, 0.2].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.176, 0.176, 0.03, 24]} />
          <meshStandardMaterial color={trim} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}

      {/* Dish, mounted COAXIALLY on the nose of the bus rather than out on an
          arm. Slung off to the side on a diagonal strut it stopped reading as a
          satellite and started reading as a spaceship — real communications
          dishes sit on the end of the body and look straight down the axis the
          craft is pointing, which here is the axis aimed at the planet. */}
      <mesh position={[-0.54, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 0.14, 12]} />
        <meshStandardMaterial color={trim} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[-0.66, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <sphereGeometry args={[0.31, 30, 18, 0, Math.PI * 2, 0, Math.PI / 2.7]} />
        <meshStandardMaterial color={hull} metalness={0.25} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      {/* The feed, sitting at the dish's focus on its axis. */}
      <mesh position={[-0.86, 0, 0]}>
        <sphereGeometry args={[0.045, 14, 14]} />
        <meshStandardMaterial color={nozzle} roughness={0.6} />
      </mesh>

      {/* Engine bell at the tail — the part that fixes which end is the back. */}
      <mesh position={[0.6, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.2, 0.32, 22, 1, true]} />
        <meshStandardMaterial color={nozzle} metalness={0.2} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Solar wings, gridded. The grid is what makes a blue rectangle read as
          a solar array rather than as a flag. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * 0.62]}>
          <mesh rotation={[0, 0, 0]}>
            <boxGeometry args={[0.62, 0.02, 0.86]} />
            <meshStandardMaterial color={panelBlue} metalness={0.25} roughness={0.5} />
          </mesh>
          {[-0.21, 0, 0.21].map((z, i) => (
            <mesh key={`z${i}`} position={[0, 0.013, z]}>
              <boxGeometry args={[0.62, 0.006, 0.022]} />
              <meshStandardMaterial color={mullion} roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.013, 0]}>
            <boxGeometry args={[0.024, 0.006, 0.86]} />
            <meshStandardMaterial color={mullion} roughness={0.6} />
          </mesh>
          {/* Boom out to the bus. */}
          <mesh position={[0, 0, -side * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 0.28, 10]} />
            <meshStandardMaterial color={trim} metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** A HANDSET WITH THICKNESS. The whole reason it is a mesh and not a rectangle
 * is that it can be turned edge-on: a flat card viewed from the side vanishes,
 * and a phone seen from its edge is still obviously a phone. */
const Phone: React.FC<{ color: string; light: boolean }> = ({ color, light }) => (
  <group>
    <RoundedBox args={[0.95, 1.95, 0.11]} radius={0.09} smoothness={4}>
      <meshStandardMaterial color={color} metalness={light ? 0.15 : 0.75} roughness={light ? 0.55 : 0.28} />
    </RoundedBox>
    {/* Glass, sitting just proud of the frame so the frame reads as a bezel. */}
    <mesh position={[0, 0, 0.058]}>
      <planeGeometry args={[0.83, 1.8]} />
      <meshStandardMaterial color={light ? "#e8eefc" : "#dbeafe"} metalness={0.1} roughness={0.08} />
    </mesh>
    {/* Camera bump — the detail that fixes which side is the back. */}
    <mesh position={[-0.26, 0.72, -0.075]}>
      <cylinderGeometry args={[0.11, 0.11, 0.04, 20]} />
      <meshStandardMaterial color={light ? "#5b6779" : "#0f172a"} metalness={0.6} roughness={0.35} />
    </mesh>
  </group>
);


/** A STREET MAP, built rather than drawn: asphalt with dashed centre lines,
 * green blocks raised off it, buildings with real height standing on those
 * blocks, and trees along the verges.
 *
 * The first attempt was a flat plane with pale gaps between grey squares, which
 * read as tiling and grout. What makes a viewer recognise a street map is not a
 * grid — it is the specific furniture of streets: dark carriageways with markings
 * down the middle, kerbs, blocks that are visibly land rather than gaps, and
 * things standing on them. In three dimensions the buildings can simply BE
 * boxes with height, which is both cheaper and more convincing than drawing
 * their shadows onto a texture. */
const StreetMap: React.FC<{ light: boolean }> = ({ light }) => {
  const asphalt = light ? "#7d818c" : "#2c3446";
  const marking = light ? "#f4f2ea" : "#8fa0bd";
  const grass = light ? "#8ec46f" : "#2f5c3a";
  const kerb = light ? "#c9c6bb" : "#3a4457";
  const roof = [light ? "#c96f5a" : "#7f4a3f", light ? "#5b7fa8" : "#3f5f80", light ? "#d7b45e" : "#8a7440", light ? "#8a93a3" : "#55606f"];

  // A DEEP GRID RATHER THAN A ZOOM. A square town centred in a portrait frame
  // leaves dead bands top and bottom however close the camera gets, because
  // tilting it compresses its depth into a wide, shallow band. More streets
  // running away from camera is what actually fills a tall frame — so the town
  // is longer than it is wide, and the answer to empty space is more town, not
  // a tighter lens.
  const COLS = 5;
  const ROWS = 9;
  const BLOCK = 2.1;
  const ROAD = 1.2;
  const PITCH = BLOCK + ROAD;
  const spanX = COLS * PITCH;
  const spanZ = ROWS * PITCH;
  const centreOf = (i: number, n: number) => (i - (n - 1) / 2) * PITCH;
  /** Carriageway centrelines, which are what anything travelling through the
   * town has to follow. Between the block centres, at the same pitch. */
  const roadsX = Array.from({ length: COLS + 1 }, (_, i) => centreOf(i, COLS) - PITCH / 2);
  const roadsZ = Array.from({ length: ROWS + 1 }, (_, i) => centreOf(i, ROWS) - PITCH / 2);

  const rand = (i: number) => {
    const v = Math.sin(i * 127.1) * 43758.5453;
    return v - Math.floor(v);
  };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spanX, spanZ]} />
        <meshStandardMaterial color={asphalt} roughness={0.95} />
      </mesh>

      {/* Dashed centre lines down every carriageway. */}
      {roadsX.map((u, i) =>
        Array.from({ length: Math.round(spanZ / 0.62) }).map((_, k) => (
          <mesh key={`vx${i}-${k}`} rotation={[-Math.PI / 2, 0, 0]} position={[u, 0.012, -spanZ / 2 + 0.31 + k * 0.62]}>
            <planeGeometry args={[0.075, 0.3]} />
            <meshStandardMaterial color={marking} roughness={0.8} />
          </mesh>
        )),
      )}
      {roadsZ.map((v, i) =>
        Array.from({ length: Math.round(spanX / 0.62) }).map((_, k) => (
          <mesh key={`vz${i}-${k}`} rotation={[-Math.PI / 2, 0, 0]} position={[-spanX / 2 + 0.31 + k * 0.62, 0.012, v]}>
            <planeGeometry args={[0.3, 0.075]} />
            <meshStandardMaterial color={marking} roughness={0.8} />
          </mesh>
        )),
      )}

      {Array.from({ length: COLS }).map((_, ci) =>
        Array.from({ length: ROWS }).map((_, ri) => {
          const bx = centreOf(ci, COLS);
          const bz = centreOf(ri, ROWS);
          const seedBase = ci * 31 + ri * 7;
          return (
            <group key={`b${ci}-${ri}`} position={[bx, 0, bz]}>
              <mesh position={[0, 0.03, 0]}>
                <boxGeometry args={[BLOCK + 0.16, 0.06, BLOCK + 0.16]} />
                <meshStandardMaterial color={kerb} roughness={0.9} />
              </mesh>
              <mesh position={[0, 0.07, 0]}>
                <boxGeometry args={[BLOCK, 0.08, BLOCK]} />
                <meshStandardMaterial color={grass} roughness={0.95} />
              </mesh>
              {Array.from({ length: 2 }).map((_, k) => {
                const seed = seedBase + k * 3;
                const h = 0.35 + rand(seed) * 0.7;
                const w = 0.42 + rand(seed + 31) * 0.26;
                const ox = (rand(seed + 11) - 0.5) * (BLOCK - w - 0.3);
                const oz = (rand(seed + 17) - 0.5) * (BLOCK - w - 0.3);
                return (
                  <group key={k} position={[ox, 0, oz]}>
                    <mesh position={[0, 0.11 + h / 2, 0]}>
                      <boxGeometry args={[w, h, w]} />
                      <meshStandardMaterial color={light ? "#eae6dc" : "#4a5568"} roughness={0.85} />
                    </mesh>
                    <mesh position={[0, 0.11 + h + 0.035, 0]}>
                      <boxGeometry args={[w + 0.06, 0.07, w + 0.06]} />
                      <meshStandardMaterial color={roof[(ci + ri + k) % roof.length]} roughness={0.8} />
                    </mesh>
                  </group>
                );
              })}
              <group position={[BLOCK * 0.34, 0, -BLOCK * 0.34]}>
                <mesh position={[0, 0.2, 0]}>
                  <cylinderGeometry args={[0.035, 0.045, 0.2, 8]} />
                  <meshStandardMaterial color={light ? "#8a6a4a" : "#4a3a2a"} roughness={0.9} />
                </mesh>
                <mesh position={[0, 0.38, 0]}>
                  <sphereGeometry args={[0.17, 14, 12]} />
                  <meshStandardMaterial color={light ? "#5f9e4a" : "#2f6b38"} roughness={0.95} />
                </mesh>
              </group>
            </group>
          );
        }),
      )}
    </group>
  );
};

/** A LOCATION PIN: a teardrop standing on the surface, with its point touching
 * the ground and a hole through the head. Drawn as a sphere sitting on a short
 * cone it read as a ball resting on the road — the recognisable silhouette is a
 * head WIDER than the taper beneath it, meeting the ground at a point, which is
 * what tells the viewer it marks a spot rather than occupies one. */
const LocationPin: React.FC<{ color: string }> = ({ color }) => (
  <group>
    {/* Taper: apex on the ground, opening up into the head. */}
    <mesh position={[0, 0.34, 0]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[0.23, 0.68, 22]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.1} />
    </mesh>
    <mesh position={[0, 0.72, 0]}>
      <sphereGeometry args={[0.29, 22, 22]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.1} />
    </mesh>
    {/* The hole through the head, front and back so it survives any angle. */}
    {[0.26, -0.26].map((z) => (
      <mesh key={z} position={[0, 0.72, z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 18]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} />
      </mesh>
    ))}
    {/* Contact shadow, so it is standing ON the map and not hovering over it. */}
    <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.26, 22]} />
      <meshStandardMaterial color="#000000" transparent opacity={0.22} roughness={1} />
    </mesh>
  </group>
);

/** A DIRECTION WITH MAGNITUDE: shaft plus cone head, pointing +Y in its own
 * space so the caller only has to decide where it aims. */
const VectorArrow: React.FC<{ color: string; length: number }> = ({ color, length }) => {
  // SLIM. A vector is read by where it points, and a fat shaft with a blunt
  // head reads as a dart embedded in the object rather than as a quantity
  // coming off it — it also swallows the thing it is describing. Kept thin
  // enough to be a line and headed clearly enough to have a direction.
  const head = 0.26;
  const shaft = Math.max(0.1, length - head);
  return (
    <group>
      <mesh position={[0, shaft / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, shaft, 12]} />
        <meshStandardMaterial color={color} metalness={0.1} roughness={0.55} />
      </mesh>
      <mesh position={[0, shaft + head / 2, 0]}>
        <coneGeometry args={[0.072, head, 18]} />
        <meshStandardMaterial color={color} metalness={0.1} roughness={0.55} />
      </mesh>
    </group>
  );
};

/** A LABELLED SET OF AXES. Attached to the world it is the fixed reference;
 * attached to a body it tumbles with it. Showing both at once, on one turning
 * object, is the clearest statement of orientation this medium can make. */
const Axes: React.FC<{ size: number }> = ({ size }) => {
  const axes: { dir: [number, number, number]; color: string }[] = [
    { dir: [1, 0, 0], color: "#ef4444" },
    { dir: [0, 1, 0], color: "#22c55e" },
    { dir: [0, 0, 1], color: "#3b82f6" },
  ];
  return (
    <group>
      {axes.map((a, i) => (
        <Line
          key={i}
          points={[
            [0, 0, 0],
            [a.dir[0] * size, a.dir[1] * size, a.dir[2] * size],
          ]}
          color={a.color}
          lineWidth={2.4}
        />
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

interface Resolved {
  object: SpatialObject;
  position: THREE.Vector3;
  /** Euler angles, radians. */
  rotation: [number, number, number];
  opacity: number;
  state: string;
}

export const SpatialStage: React.FC<{ data: SpatialData } & SharedVisualProps> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const light = (data.theme ?? "dark") === "light";
  const timeline = data.timeline ?? [];

  // Byte-for-byte the 2D stage's own light panel and ink, so a cut between the
  // two media is a change of dimension and nothing else.
  const ground = light ? "#f8f3e8" : "#080c14";
  const ink = light ? "#1a2338" : "#f4f7ff";
  const ACCENTS = light ? ACCENTS_LIGHT : ACCENTS_DARK;

  // --- resolve every object's state at this instant -----------------------
  const resolved: Resolved[] = React.useMemo(() => {
    const visible = new Map<string, number>();
    const rotations = new Map<string, [number, number, number]>();
    const spins = new Map<string, [number, number, number]>();
    const offsets = new Map<string, THREE.Vector3>();
    const orbitHosts = new Map<string, string>();
    const travelled = new Map<string, THREE.Vector3>();
    const states = new Map<string, string>();

    for (const object of data.objects) {
      visible.set(object.id, timeline.some((a) => a.type === "enter" && a.id === object.id) ? 0 : 1);
      if (object.states && object.states.length > 0) states.set(object.id, object.states[0]);
    }

    for (const action of timeline as SpatialAction[]) {
      switch (action.type) {
        case "enter":
          visible.set(action.id, progress(t, action.startSeconds, action.durationSeconds ?? 0.7));
          break;
        case "exit":
          visible.set(action.id, 1 - progress(t, action.startSeconds, action.durationSeconds ?? 0.6));
          break;
        case "phase":
          if (t >= action.startSeconds) states.set(action.id, action.to);
          break;
        case "rotate": {
          const p = ease(progress(t, action.startSeconds, action.durationSeconds ?? 1.6));
          const from = rotations.get(action.id) ?? [0, 0, 0];
          rotations.set(action.id, [
            from[0] + (action.to[0] * DEG - from[0]) * p,
            from[1] + (action.to[1] * DEG - from[1]) * p,
            from[2] + (action.to[2] * DEG - from[2]) * p,
          ]);
          break;
        }
        case "spin": {
          // Continuous, and it HOLDS its final angle once done rather than
          // snapping back — a planet that stops turning has still turned.
          const p = progress(t, action.startSeconds, action.durationSeconds ?? 4);
          const angle = p * (action.turns ?? 1) * Math.PI * 2;
          const axis = action.axis ?? [0, 1, 0];
          const prev = spins.get(action.id) ?? [0, 0, 0];
          spins.set(action.id, [prev[0] + axis[0] * angle, prev[1] + axis[1] * angle, prev[2] + axis[2] * angle]);
          break;
        }
        case "travel": {
          const p = ease(progress(t, action.startSeconds, action.durationSeconds ?? 2));
          // FROM WHERE IT ACTUALLY IS. Defaulting the origin to (0,0,0) meant
          // the first leg of any journey started at the centre of the world
          // rather than at the object's declared position — so a marker placed
          // at the top of a map teleported to the middle of it before setting
          // off, and every subsequent leg inherited the error.
          const declared = data.objects.find((o) => o.id === action.id)?.at ?? [0, 0, 0];
          const from = travelled.get(action.id) ?? new THREE.Vector3(...(declared as [number, number, number]));
          const target = new THREE.Vector3(...action.to);
          travelled.set(action.id, from.clone().lerp(target, p));
          break;
        }
        case "orbit": {
          const p = progress(t, action.startSeconds, action.durationSeconds ?? 6);
          const angle = p * (action.turns ?? 1) * Math.PI * 2;
          const r = action.radius ?? 4;
          const inc = (action.inclination ?? 24) * DEG;
          // An inclined circle, so an orbit is a path through space rather than
          // a ring lying flat on the floor of the scene.
          const local = new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
          local.applyAxisAngle(new THREE.Vector3(0, 0, 1), inc);
          offsets.set(action.id, local);
          orbitHosts.set(action.id, action.around);
          break;
        }
        default:
          break;
      }
    }

    return data.objects.map((object) => {
      const base = new THREE.Vector3(...(object.at ?? [0, 0, 0]));
      // Bound to a host: it follows where the host ACTUALLY IS this frame, not
      // where it was declared. Adding the host's static coordinate left a
      // heading arrow stranded on the map while the pin it belonged to walked
      // away from it.
      if (object.attachTo) {
        const host = data.objects.find((o) => o.id === object.attachTo);
        if (host) {
          const hostMoved = travelled.get(host.id);
          const hostPos = hostMoved ? hostMoved.clone() : new THREE.Vector3(...(host.at ?? [0, 0, 0]));
          const hostOrbit = offsets.get(host.id);
          if (hostOrbit) hostPos.add(hostOrbit);
          base.add(hostPos);
        }
      }
      const off = offsets.get(object.id);
      if (off) base.add(off);
      const moved = travelled.get(object.id);
      if (moved) base.copy(moved);

      const rot = rotations.get(object.id) ?? [0, 0, 0];
      const spin = spins.get(object.id) ?? [0, 0, 0];
      let rotation: [number, number, number] = [rot[0] + spin[0], rot[1] + spin[1], rot[2] + spin[2]];

      // A BODY-FRAMED child inherits its host's attitude; a WORLD-FRAMED one
      // pointedly does not. That indifference is the entire lesson.
      if (object.frame === "body" && object.attachTo) {
        const hostRot = rotations.get(object.attachTo) ?? [0, 0, 0];
        const hostSpin = spins.get(object.attachTo) ?? [0, 0, 0];
        rotation = [rotation[0] + hostRot[0] + hostSpin[0], rotation[1] + hostRot[1] + hostSpin[1], rotation[2] + hostRot[2] + hostSpin[2]];
      }

      // A SPACECRAFT KEEPS ITS DISH ON THE THING IT IS TALKING TO. Real ones
      // hold an attitude relative to the body they orbit rather than tumbling
      // freely, and letting it drift face-on then edge-on then backwards makes
      // the orbit read as debris rather than as a working satellite. Its dish
      // lies along -X, so that axis is aimed at the host every frame.
      const orbitHost = orbitHosts.get(object.id);
      if (orbitHost) {
        const host = data.objects.find((o) => o.id === orbitHost);
        if (host) {
          const hostPos = new THREE.Vector3(...((host.at ?? [0, 0, 0]) as [number, number, number]));
          const aim = hostPos.clone().sub(base).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), aim);
          const e = new THREE.Euler().setFromQuaternion(q);
          rotation = [e.x, e.y, e.z];
        }
      }

      // A vector aims itself: rotate +Y onto its declared direction.
      if (object.kind === "vector" && object.dir) {
        const d = new THREE.Vector3(...object.dir).normalize();
        // A BODY-framed vector points along its host's CURRENT attitude, so its
        // aim has to be rotated by that attitude before it is used to place it.
        if (object.frame === "body" && object.attachTo) {
          const hr = rotations.get(object.attachTo) ?? [0, 0, 0];
          const hs = spins.get(object.attachTo) ?? [0, 0, 0];
          d.applyEuler(new THREE.Euler(hr[0] + hs[0], hr[1] + hs[1], hr[2] + hs[2]));
        }
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        const e = new THREE.Euler().setFromQuaternion(q);
        rotation = [e.x, e.y, e.z];
        // Rooted at the host's surface, not buried in its middle.
        if (object.attachTo) {
          const host = data.objects.find((o) => o.id === object.attachTo);
          if (host) {
            // The half-extents describe the mesh in ITS OWN frame, so a world
            // direction has to be taken into that frame before it can be asked
            // where the surface is. Skipping this left gravity hanging in space
            // below a tumbling handset instead of sitting on its edge.
            const hr = rotations.get(object.attachTo) ?? [0, 0, 0];
            const hs = spins.get(object.attachTo) ?? [0, 0, 0];
            const hostEuler = new THREE.Euler(hr[0] + hs[0], hr[1] + hs[1], hr[2] + hs[2]);
            const inverse = new THREE.Quaternion().setFromEuler(hostEuler).invert();
            const local = d.clone().applyQuaternion(inverse);
            // Sits ON the surface with a hair of daylight, whatever direction it
            // leaves in and whatever shape it leaves from.
            const clearance = surfaceDistance(host.kind, local, host.scale ?? 1) * 1.04;
            base.add(d.clone().multiplyScalar(clearance));
          }
        }
      }

      return {
        object,
        position: base,
        rotation,
        opacity: visible.get(object.id) ?? 1,
        state: states.get(object.id) ?? "plain",
      };
    });
  }, [data.objects, timeline, t]);

  /** The ring an orbiting body is travelling on. Without it the viewer sees a
   * speck drifting across a planet and has to infer the path; with it the
   * motion is obviously an orbit from the first frame, and the inclination —
   * the thing that makes it a path through space rather than a flat ring — is
   * visible even while the body is on the far side. */
  const orbitPaths = React.useMemo(() => {
    const paths: { id: string; points: [number, number, number][]; centre: THREE.Vector3; visible: boolean }[] = [];
    for (const action of timeline as SpatialAction[]) {
      if (action.type !== "orbit") continue;
      const host = data.objects.find((o) => o.id === action.around);
      const centre = new THREE.Vector3(...((host?.at ?? [0, 0, 0]) as [number, number, number]));
      const r = action.radius ?? 4;
      const inc = (action.inclination ?? 24) * DEG;
      const points: [number, number, number][] = [];
      for (let i = 0; i <= 96; i++) {
        const angle = (i / 96) * Math.PI * 2;
        const v = new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
        v.applyAxisAngle(new THREE.Vector3(0, 0, 1), inc);
        points.push([v.x, v.y, v.z]);
      }
      paths.push({ id: action.id, points, centre, visible: t >= action.startSeconds - 0.4 });
    }
    return paths;
  }, [timeline, data.objects, t]);

  // --- camera --------------------------------------------------------------
  /** The camera OCCUPIES a position and travels between them. Cutting it
   * between fixed poses would throw away the one thing depth buys: the parallax
   * of moving past objects that stand at different distances. */
  const pose = React.useMemo(() => {
    let distance = 7.5;
    let authoredDistance: number | null = null;
    let azimuth = 24;
    let elevation = 16;
    let focus = new THREE.Vector3(0, 0, 0);

    for (const action of timeline as SpatialAction[]) {
      if (action.type !== "camera") continue;
      const p = ease(progress(t, action.startSeconds, action.durationSeconds ?? 2.5));
      if (p <= 0) continue;
      if (action.focus) {
        // WHERE THE SUBJECT IS NOW, not where it was declared. Reading the
        // static coordinate meant a camera told to watch a travelling marker
        // stayed pointed at the spot it set off from, and the framing then had
        // to pull back far enough to keep both in shot — which is why a scene
        // about someone walking through a town kept retreating from it.
        const live = resolved.find((r) => r.object.id === action.focus);
        if (live) focus = live.position.clone();
        else {
          const target = data.objects.find((o) => o.id === action.focus);
          if (target) focus = new THREE.Vector3(...(target.at ?? [0, 0, 0]));
        }
      }
      // Authored distances are intent, resolved against the fit below.
      const current: number = authoredDistance ?? 8;
      const toDistance: number | null =
        action.distance ?? (action.move === "push" ? current * 0.72 : action.move === "pull" ? current * 1.5 : authoredDistance);
      if (toDistance !== null && toDistance !== undefined) {
        authoredDistance = authoredDistance === null ? toDistance : authoredDistance + (toDistance - authoredDistance) * p;
      }
      if (action.elevation !== undefined) elevation = elevation + (action.elevation - elevation) * p;
      if (action.azimuth !== undefined) azimuth = azimuth + (action.azimuth - azimuth) * p;
      if (action.move === "orbit") azimuth += (action.degrees ?? 90) * p;
    }

    // AUTO-FRAMING, ON BOTH AXES. Hand-picked distances were the most
    // persistent fault in this medium, but fitting a bounding SPHERE to the
    // horizontal field of view only swapped one failure for its opposite: a
    // tall, narrow subject — a phone with an arrow under it — got pushed so far
    // back that most of the frame was empty.
    //
    // The content has to satisfy the horizontal and the vertical constraint
    // separately, and the camera takes whichever is tighter. An authored
    // `distance` is honoured only within a band around that fit, so it can
    // express intent (closer, wider) but can never crop the scene or strand it
    // in the middle of an empty frame.
    const vHalf = Math.tan((42 * DEG) / 2);
    const hHalf = vHalf * (width / height);
    // A floor, so a scene whose only actor is a single small marker still shows
    // the neighbourhood around it rather than pushing its nose against it.
    let extentH = 3.4;
    let extentV = 3.4;
    for (const r of resolved) {
      if (r.opacity <= 0.05) continue;
      // A GROUND PLANE IS SCENERY, NOT A SUBJECT. Framing the whole town into
      // shot shrank it to a model village floating in a cream void; a real map
      // fills the view and simply carries on past the edges, which is what
      // tells the viewer the world is bigger than the frame. Only the things
      // ACTING in the scene have to be contained.
      if (r.object.kind === "plane") continue;
      const half = HALF_EXTENTS[r.object.kind] ?? [0.5, 0.5, 0.5];
      const scale = r.object.scale ?? 1;
      const isVector = r.object.kind === "vector";
      const hx = isVector ? (r.object.length ?? 2) * scale : half[0] * scale;
      const hy = isVector ? (r.object.length ?? 2) * scale : half[1] * scale;
      const hz = isVector ? (r.object.length ?? 2) * scale : half[2] * scale;
      // PROJECTED ONTO THE SCREEN AXES, not treated as a sphere. A ground plane
      // is wide and deep and almost nothing high, and its depth foreshortens
      // into vertical screen space rather than adding to horizontal — using one
      // radius for both axes made the camera reserve room for ten units of
      // height that do not exist, which is what left the town stranded in a
      // half-empty frame.
      const az = azimuth * DEG;
      const el = Math.max(8, elevation) * DEG;
      const spanRight = hx * Math.abs(Math.sin(az)) + hz * Math.abs(Math.cos(az));
      const spanDepth = hx * Math.abs(Math.cos(az)) + hz * Math.abs(Math.sin(az));
      const spanUp = hy * Math.cos(el) + spanDepth * Math.sin(el);
      const d = r.position.clone().sub(focus);
      const offRight = Math.abs(-d.x * Math.sin(az) + d.z * Math.cos(az));
      const offUp = Math.abs(d.y) * Math.cos(el) + Math.abs(d.x * Math.cos(az) + d.z * Math.sin(az)) * Math.sin(el);
      extentH = Math.max(extentH, offRight + spanRight);
      extentV = Math.max(extentV, offUp + spanUp);
    }
    const MARGIN = 1.12;
    const fit = Math.max((extentH * MARGIN) / hHalf, (extentV * MARGIN) / vHalf);
    // The fit is a FLOOR, never a suggestion. Letting an authored distance sit
    // 15% inside a fit that only carried 12% margin quietly cancelled the
    // margin and cropped the arrows off three edges — the camera can be pulled
    // further out than the content needs, never closer.
    distance = authoredDistance === null ? fit : Math.max(fit, Math.min(authoredDistance, fit * 1.4));

    const a = azimuth * DEG;
    const e = elevation * DEG;
    return {
      position: [
        focus.x + Math.cos(a) * Math.cos(e) * distance,
        focus.y + Math.sin(e) * distance,
        focus.z + Math.sin(a) * Math.cos(e) * distance,
      ] as [number, number, number],
      target: [focus.x, focus.y, focus.z] as [number, number, number],
      fov: 42,
    };
  }, [timeline, t, data.objects, resolved, width, height]);

  /** CALLOUTS. Not a label on every object — in three dimensions the mesh
   * already says what the thing is, and captioning all of it is clutter that
   * fights the picture. Text here is a timeline event: it appears for the
   * moment it is saying something the shape cannot, then goes.
   *
   * Drawn in SCREEN space rather than modelled into the scene, for two reasons:
   * it stays pin-sharp at any camera distance, and it stays upright — text
   * modelled into the world tips over with the camera and becomes unreadable
   * exactly when the camera is doing the most interesting work. All it borrows
   * from 3D is its POSITION, projected through the same camera the meshes use,
   * so it tracks its subject through every orbit and push-in. */
  const callouts = React.useMemo(() => {
    const active = (timeline as SpatialAction[]).filter(
      (a): a is Extract<SpatialAction, { type: "annotate" }> =>
        a.type === "annotate" && t >= a.startSeconds && t <= a.startSeconds + (a.durationSeconds ?? 2.4),
    );
    if (active.length === 0) return [];

    const camera = new THREE.PerspectiveCamera(pose.fov, width / height, 0.1, 1000);
    camera.position.set(...pose.position);
    camera.lookAt(new THREE.Vector3(...pose.target));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const out: { key: string; text: string; x: number; y: number; opacity: number }[] = [];
    for (const action of active) {
      const subject = resolved.find((r) => r.object.id === action.target);
      if (!subject || subject.opacity <= 0.05) continue;
      const end = action.startSeconds + (action.durationSeconds ?? 2.4);
      const fade = Math.min(1, (t - action.startSeconds) / 0.3, (end - t) / 0.3);
      // Clear of the mesh rather than on top of it: a sphere and an arrow need
      // very different offsets, so the object's own radius sets it.
      const radius = 1.15 * (subject.object.scale ?? 1);
      const centre = subject.position.clone().project(camera);
      if (centre.z > 1) continue;
      const below = subject.position.clone().add(new THREE.Vector3(0, -radius, 0)).project(camera);
      out.push({
        key: `${action.target}-${action.startSeconds}`,
        text: action.text,
        x: (centre.x * 0.5 + 0.5) * width,
        y: (-Math.min(centre.y, below.y) * 0.5 + 0.5) * height,
        opacity: Math.max(0, fade),
      });
    }
    return out;
  }, [resolved, pose, width, height, timeline, t]);

  // --- the spoken beat over the top ---------------------------------------
  const beat = React.useMemo(() => {
    for (const action of timeline as SpatialAction[]) {
      if (action.type !== "beat") continue;
      const end = action.startSeconds + (action.durationSeconds ?? 2.2);
      if (t >= action.startSeconds && t <= end) {
        const fade = Math.min(1, (t - action.startSeconds) / 0.3, (end - t) / 0.3);
        return { ...action, opacity: Math.max(0, fade) };
      }
    }
    return null;
  }, [timeline, t]);

  const beatColor = beat?.tone === "alert" ? (light ? "#c81e3c" : "#f43f5e") : beat?.tone === "reveal" ? (light ? "#0b6b78" : "#22d3ee") : ink;

  return (
    <AbsoluteFill style={{ backgroundColor: ground }}>
      <ThreeCanvas width={width} height={height} camera={{ position: pose.position, fov: pose.fov }}>
        <CameraRig3D pose={pose} />
        <ambientLight intensity={light ? 1.05 : 0.55} />
        <directionalLight position={[6, 10, 8]} intensity={light ? 1.1 : 1.5} />
        <directionalLight position={[-8, -4, -6]} intensity={0.35} />
        {orbitPaths.map((path) =>
          path.visible ? (
            <group key={`orbit-${path.id}`} position={path.centre}>
              <Line points={path.points} color={light ? "#1d4ed8" : "#7dd3fc"} lineWidth={2.4} transparent opacity={light ? 0.9 : 0.45} />
            </group>
          ) : null,
        )}
        {resolved.map((r) => {
          if (r.opacity <= 0.01) return null;
          const colour = ACCENTS[r.object.accent ?? "neutral"] ?? ACCENTS.neutral;
          // Entrances scale up rather than fade: in a lit 3D scene a fade reads
          // as fog, whereas something growing into place reads as arriving.
          const s = (r.object.scale ?? 1) * (0.82 + 0.18 * r.opacity);
          return (
            <group key={r.object.id} position={r.position} rotation={r.rotation} scale={s}>
              {r.object.kind === "globe" ? (
                <Globe
                  color={light ? "#35496f" : "#24406b"}
                  showField={r.state === "field"}
                  fieldColor={colour}
                  lineColor={light ? "#eaf0fc" : "#ffffff"}
                  lineOpacity={light ? 0.3 : 0.24}
                  ocean={light ? "#4a9fd4" : "#2b6fa3"}
                  land={light ? "#8fc47a" : "#5d9a58"}
                  coast={light ? "#2b5f7d" : "#1f4c63"}
                />
              ) : null}
              {r.object.kind === "satellite" ? <Satellite light={light} /> : null}
              {r.object.kind === "phone" ? <Phone color={light ? "#9aa6b8" : "#1e293b"} light={light} /> : null}
              {r.object.kind === "vector" ? <VectorArrow color={colour} length={r.object.length ?? 2} /> : null}
              {r.object.kind === "axes" ? <Axes size={r.object.length ?? 2} /> : null}
              {r.object.kind === "plane" ? <StreetMap light={light} /> : null}
              {r.object.kind === "pin" ? <LocationPin color={colour} /> : null}
              {r.object.kind === "node" ? (
                <mesh>
                  <sphereGeometry args={[0.16, 20, 20]} />
                  <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.4} />
                </mesh>
              ) : null}
            </group>
          );
        })}
      </ThreeCanvas>
      {callouts.map((c) => (
        <div
          key={c.key}
          style={{
            position: "absolute",
            left: c.x,
            top: c.y + height * 0.016,
            transform: "translate(-50%, 0)",
            maxWidth: width * 0.8,
            fontFamily: DISPLAY_FONT_FAMILY,
            fontWeight: 700,
            fontSize: width * 0.038,
            lineHeight: 1.25,
            textAlign: "center",
            color: light ? "#9a3412" : "#ffd76a",
            opacity: c.opacity,
            pointerEvents: "none",
          }}
        >
          {c.text}
        </div>
      ))}
      {/* A SCRIM BEHIND THE HEADLINE. On the flat stage a beat sits on empty
          canvas; here the scene fills the frame, so the same navy type lands on
          grey roads and green blocks and stops being readable. A soft wash of
          the ground colour, fading out, keeps the text legible without drawing
          a box around it. */}
      {beat ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background:
              beat.at === "center"
                ? `radial-gradient(ellipse at center, ${ground} 0%, ${ground}cc 38%, transparent 68%)`
                : beat.at === "bottom"
                  ? `linear-gradient(to top, ${ground} 0%, ${ground}d9 16%, transparent 34%)`
                  : `linear-gradient(to bottom, ${ground} 0%, ${ground}d9 16%, transparent 34%)`,
            opacity: beat.opacity,
          }}
        />
      ) : null}
      {beat ? (
        <AbsoluteFill
          style={{
            justifyContent: beat.at === "center" ? "center" : beat.at === "bottom" ? "flex-end" : "flex-start",
            alignItems: "center",
            padding: height * 0.06,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: DISPLAY_FONT_FAMILY,
              fontWeight: 900,
              fontSize: beat.size === "huge" ? width * 0.105 : width * 0.072,
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              color: beatColor,
              opacity: beat.opacity,
              textAlign: "center",
              maxWidth: "92%",
            }}
          >
            {beat.text}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
