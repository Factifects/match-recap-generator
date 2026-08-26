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
/** The machine palette: blue is memory in use, orange is pressure, green is
 * memory handed back. Harder and cooler than the illustrated set, because this
 * world is a desktop rather than a page. */
const ACCENTS_COOL: Record<string, string> = {
  neutral: "#39414d",
  primary: "#1668d8",
  warn: "#d1600a",
  success: "#11855a",
  danger: "#c02434",
  profile: "#5b48b8",
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
  plane: [8.25, 0.05, 21.45],
  pin: [0.3, 1.0, 0.3],
  axes: [0, 0, 0],
  vector: [0, 0, 0],
  image: [1.5, 1.5, 0.02],
  pixelGrid: [1.5, 1.5, 0.02],
  terrain: [1.5, 0.9, 1.5],
  edgeMap: [1.5, 1.5, 0.02],
  scatter: [1.6, 1.6, 1.6],
  bars: [1.75, 1.3, 0.05],
  memory: [2.15, 1.0, 0.1],
  browserWindow: [1.4, 0.95, 0.1],
  laptop: [1.75, 1.2, 1.2],
  workload: [1.05, 0.65, 0.02],
  tabCard: [0.8, 0.5, 0.02],
  decode: [2.5, 1.15, 0.02],
  layers: [1.3, 1.3, 2.2],
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
  const ROWS = 13;
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


// ---------------------------------------------------------------------------
// One picture, several representations
// ---------------------------------------------------------------------------

/** THE SOURCE PICTURE, painted once to a canvas.
 *
 * Everything downstream — the pixel grid, the terrain, the edge map — SAMPLES
 * this. That is not an implementation convenience, it is the whole argument of
 * the episode: a viewer is being told that a photograph, a wall of numbers and
 * a landscape are the same information wearing different clothes, and that
 * claim is only honest if they genuinely are. Redrawing each stage by hand
 * would make the video an assertion with illustrations.
 *
 * Deliberately shaded rather than flat: brightness is what the heightfield
 * reads as altitude, so a flat-colour cat would extrude into a plateau and the
 * signature shot would have nothing to fly over. */
function drawCat(ctx: CanvasRenderingContext2D, W: number, H: number, variant: "cat" | "cat-alt" | "dog"): void {
  const cat = variant !== "dog";
  const coat = variant === "cat" ? ["#d98b4a", "#c2762f", "#a55f22"] : variant === "cat-alt" ? ["#5c6470", "#474e58", "#343a42"] : ["#b98a5e", "#a0714a", "#835a38"];

  // Ground: a soft vignette so the subject sits in a scene rather than floating.
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.42, W * 0.1, W * 0.5, H * 0.5, W * 0.72);
  bg.addColorStop(0, "#39404e");
  bg.addColorStop(1, "#20252f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.5;
  const cy = H * 0.54;
  const r = W * 0.26;

  // Ears first, so the head overlaps their bases.
  const ear = (side: number) => {
    ctx.beginPath();
    if (cat) {
      ctx.moveTo(cx + side * r * 0.82, cy - r * 0.52);
      ctx.lineTo(cx + side * r * 1.02, cy - r * 1.5);
      ctx.lineTo(cx + side * r * 0.16, cy - r * 0.95);
    } else {
      ctx.moveTo(cx + side * r * 0.9, cy - r * 0.6);
      ctx.quadraticCurveTo(cx + side * r * 1.5, cy - r * 0.1, cx + side * r * 1.05, cy + r * 0.55);
      ctx.quadraticCurveTo(cx + side * r * 0.8, cy + r * 0.1, cx + side * r * 0.7, cy - r * 0.35);
    }
    ctx.closePath();
    ctx.fillStyle = coat[2];
    ctx.fill();
    if (cat) {
      ctx.beginPath();
      ctx.moveTo(cx + side * r * 0.78, cy - r * 0.62);
      ctx.lineTo(cx + side * r * 0.92, cy - r * 1.28);
      ctx.lineTo(cx + side * r * 0.34, cy - r * 0.92);
      ctx.closePath();
      ctx.fillStyle = "#e6a394";
      ctx.fill();
    }
  };
  ear(-1);
  ear(1);

  // Head, lit from upper left so the surface has relief to extrude.
  const face = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  face.addColorStop(0, coat[0]);
  face.addColorStop(0.55, coat[1]);
  face.addColorStop(1, coat[2]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 1.12, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();

  // Muzzle.
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.42, r * 0.62, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f0e6d8";
  ctx.fill();

  // Eyes: the highest-contrast thing in the frame, which is what makes the
  // edge map and the terrain both legible.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * r * 0.42, cy - r * 0.12, r * 0.2, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f7f4ec";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + side * r * 0.42, cy - r * 0.12, r * (cat ? 0.075 : 0.12), r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1b1f26";
    ctx.fill();
  }

  // Nose and mouth.
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.34);
  ctx.lineTo(cx - r * 0.13, cy + r * 0.16);
  ctx.lineTo(cx + r * 0.13, cy + r * 0.16);
  ctx.closePath();
  ctx.fillStyle = "#c4636a";
  ctx.fill();
  ctx.strokeStyle = "#3a3129";
  ctx.lineWidth = W * 0.006;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.34);
  ctx.lineTo(cx, cy + r * 0.5);
  ctx.stroke();

  if (cat) {
    ctx.lineWidth = W * 0.004;
    ctx.strokeStyle = "rgba(58, 49, 41, 0.75)";
    for (const side of [-1, 1]) {
      for (const k of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.4, cy + r * 0.4 + k * r * 0.09);
        ctx.lineTo(cx + side * r * 1.25, cy + r * 0.3 + k * r * 0.22);
        ctx.stroke();
      }
    }
    // Tabby markings — texture for the pattern stage to find.
    ctx.strokeStyle = "rgba(90, 60, 25, 0.5)";
    ctx.lineWidth = W * 0.012;
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + k * r * 0.22, cy - r * 0.78);
      ctx.lineTo(cx + k * r * 0.3, cy - r * 0.45);
      ctx.stroke();
    }
  }
}

interface ImageData2 {
  /** Downsampled cells: colour and brightness for each. */
  cells: { r: number; g: number; b: number; lum: number }[];
  detail: number;
  texture: THREE.CanvasTexture | null;
}

/** Paints the source picture and reads it back at whatever resolution a
 * representation needs. One draw, many readings. */
function useSourceImage(variant: "cat" | "cat-alt" | "dog", detail: number): ImageData2 {
  return React.useMemo(() => {
    if (typeof document === "undefined") return { cells: [], detail, texture: null };
    const W = 512;
    const H = 512;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { cells: [], detail, texture: null };
    drawCat(ctx, W, H, variant);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // Read the picture back at grid resolution by averaging each cell, which
    // is exactly what downsampling an image is — not a stylised approximation
    // of it.
    const cells: { r: number; g: number; b: number; lum: number }[] = [];
    const step = Math.floor(W / detail);
    const raw = ctx.getImageData(0, 0, W, H).data;
    for (let gy = 0; gy < detail; gy++) {
      for (let gx = 0; gx < detail; gx++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let y = gy * step; y < (gy + 1) * step; y += 2) {
          for (let x = gx * step; x < (gx + 1) * step; x += 2) {
            const i = (y * W + x) * 4;
            r += raw[i];
            g += raw[i + 1];
            b += raw[i + 2];
            n++;
          }
        }
        r /= n;
        g /= n;
        b /= n;
        cells.push({ r, g, b, lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 });
      }
    }
    let lo = 1;
    let hi = 0;
    for (const c of cells) {
      lo = Math.min(lo, c.lum);
      hi = Math.max(hi, c.lum);
    }
    const span = Math.max(0.001, hi - lo);
    for (const c of cells) c.lum = (c.lum - lo) / span;
    return { cells, detail, texture };
  }, [variant, detail]);
}


/** THE PICTURE, as a picture. Nothing clever — it exists so the viewer has
 * something to recognise before it is taken apart, and so the taking-apart has
 * a "before" to be measured against. */
const SourceImage: React.FC<{ variant: "cat" | "cat-alt" | "dog" }> = ({ variant }) => {
  const img = useSourceImage(variant, 8);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3, 3]} />
      {img.texture ? (
        <meshBasicMaterial map={img.texture} toneMapped={false} side={THREE.DoubleSide} />
      ) : (
        <meshBasicMaterial color="#c9c2b3" side={THREE.DoubleSide} />
      )}
    </mesh>
  );
};

/** THE SAME PICTURE AS CELLS, each one a flat tile of that cell's average
 * colour. `spread` pushes them apart, which is how the photograph visibly
 * stops being a photograph and becomes a collection of independent values —
 * the moment the episode turns on. */
const PixelGrid: React.FC<{ variant: "cat" | "cat-alt" | "dog"; detail: number; spread: number; shuffled: number }> = ({
  variant,
  detail,
  spread,
  shuffled,
}) => {
  const img = useSourceImage(variant, detail);
  const size = 3 / detail;
  /** A fixed permutation, so the scramble is the same every frame — a shuffle
   * that re-rolls per frame reads as static, not as rearrangement. */
  const order = React.useMemo(() => {
    const idx = img.cells.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453);
      const j = Math.floor((r - Math.floor(r)) * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [img.cells]);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {img.cells.map((c, i) => {
        const gx = i % detail;
        const gy = Math.floor(i / detail);
        const x = (gx - (detail - 1) / 2) * size;
        const y = -(gy - (detail - 1) / 2) * size;
        // Cells drift apart along their own offset from centre, so the picture
        // dilates outward rather than every tile sliding the same way.
        const push = 1 + spread * 1.4;
        // Each cell slides toward the slot the permutation gives it.
        const dest = order[i] ?? i;
        const dx = ((dest % detail) - (detail - 1) / 2) * size;
        const dy = -(Math.floor(dest / detail) - (detail - 1) / 2) * size;
        const px = (x + (dx - x) * shuffled) * push;
        const py = (y + (dy - y) * shuffled) * push;
        return (
          <mesh key={i} position={[px, py, 0]}>
            <planeGeometry args={[size * 0.92, size * 0.92]} />
            <meshBasicMaterial color={`rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
};

/** THE SAME PICTURE AS A LANDSCAPE: brightness becomes altitude.
 *
 * This is the signature shot. A viewer told "to a computer it is just numbers"
 * has been given a claim; a viewer flown across a terrain whose hills ARE the
 * cat's bright fur and whose valleys ARE its eyes has been shown one. Nothing
 * here is invented — the heights are the luminance values read back from the
 * same canvas the photograph is drawn on. */
const ImageTerrain: React.FC<{ variant: "cat" | "cat-alt" | "dog"; detail: number; relief: number; colored: number; risen: number }> = ({
  variant,
  detail,
  relief,
  colored,
  risen,
}) => {
  const img = useSourceImage(variant, detail);
  const size = 3 / detail;
  return (
    <group>
      {img.cells.map((c, i) => {
        const gx = i % detail;
        const gy = Math.floor(i / detail);
        const x = (gx - (detail - 1) / 2) * size;
        const z = (gy - (detail - 1) / 2) * size;
        // At rest it lies flat and IS the photograph; the rise is what the
        // viewer has to see happen.
        const h = Math.max(0.015, c.lum * relief * risen);
        // Fades from the picture's own colours toward a single data-blue as the
        // representation stops being a picture and starts being values.
        const src = new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
        const data = new THREE.Color("#1d4ed8").lerp(new THREE.Color("#7dd3fc"), c.lum);
        const col = src.clone().lerp(data, colored);
        return (
          <mesh key={i} position={[x, h / 2, z]}>
            <boxGeometry args={[size * 0.9, h, size * 0.9]} />
            <meshStandardMaterial color={col} roughness={0.75} metalness={0.05} />
          </mesh>
        );
      })}
    </group>
  );
};

/** THE SAME PICTURE REDUCED TO WHERE IT CHANGES. Computed by comparing each
 * cell to its neighbours, so it is genuinely derived from the image rather
 * than a stylised outline drawn to look like edge detection. */
const EdgeMap: React.FC<{ variant: "cat" | "cat-alt" | "dog"; detail: number; ink: string }> = ({ variant, detail, ink }) => {
  const img = useSourceImage(variant, detail);
  const size = 3 / detail;
  const at = (gx: number, gy: number) => img.cells[gy * detail + gx]?.lum ?? 0;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {img.cells.map((_, i) => {
        const gx = i % detail;
        const gy = Math.floor(i / detail);
        // Simple gradient magnitude: how much brightness changes across this
        // cell horizontally and vertically.
        const dx = Math.abs(at(Math.min(gx + 1, detail - 1), gy) - at(Math.max(gx - 1, 0), gy));
        const dy = Math.abs(at(gx, Math.min(gy + 1, detail - 1)) - at(gx, Math.max(gy - 1, 0)));
        const edge = Math.min(1, Math.hypot(dx, dy) * 2.6);
        if (edge < 0.12) return null;
        const x = (gx - (detail - 1) / 2) * size;
        const y = -(gy - (detail - 1) / 2) * size;
        return (
          <mesh key={i} position={[x, y, 0]}>
            <planeGeometry args={[size * 0.9, size * 0.9]} />
            <meshBasicMaterial color={ink} opacity={edge} transparent toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
};


/** POINTS IN A SPACE, grouped by what they are.
 *
 * The honest caveat lives in the script rather than the mesh: a real learned
 * representation has hundreds of dimensions and no human-readable "cat corner".
 * What survives the simplification, and what the scene is actually for, is the
 * one true idea — things the model treats as similar end up near each other,
 * and a new example is judged by where it lands. */
const ScatterSpace: React.FC<{ points: number; colors: string[]; query: number }> = ({ points, colors, query }) => {
  const groups = React.useMemo(() => {
    const centres: [number, number, number][] = [
      [-1.1, 0.35, -0.5],
      [1.15, -0.2, 0.45],
      [0.1, 0.95, 1.15],
    ];
    const out: { pos: [number, number, number]; group: number }[] = [];
    for (let i = 0; i < points; i++) {
      const g = i % centres.length;
      const seed = (n: number) => {
        const v = Math.sin(i * 37.7 + n * 91.3) * 43758.5453;
        return (v - Math.floor(v)) - 0.5;
      };
      out.push({
        pos: [centres[g][0] + seed(1) * 0.75, centres[g][1] + seed(2) * 0.7, centres[g][2] + seed(3) * 0.75],
        group: g,
      });
    }
    return out;
  }, [points]);

  // The new example travels in from outside and settles among its own kind.
  const from = new THREE.Vector3(2.6, 1.9, 2.4);
  const to = new THREE.Vector3(-1.0, 0.3, -0.42);
  const at = from.clone().lerp(to, query);

  return (
    <group>
      {groups.map((p, i) => (
        <mesh key={i} position={p.pos}>
          <sphereGeometry args={[0.075, 12, 12]} />
          <meshStandardMaterial color={colors[p.group]} roughness={0.5} />
        </mesh>
      ))}
      {query > 0.01 ? (
        <mesh position={at}>
          <sphereGeometry args={[0.15, 18, 18]} />
          <meshStandardMaterial color="#15803d" emissive="#15803d" emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      ) : null}
    </group>
  );
};


/** COMPETING SCORES, as bars whose LENGTH is the number.
 *
 * A dial borrowed from another video showed a percentage counting down while
 * the shape beside it barely moved — the viewer was asked to read the digits,
 * which is not animation, it is a caption. A score is a quantity, and the only
 * honest picture of a quantity is an extent the eye can compare against its
 * rivals without reading anything. Showing every option at once matters just as
 * much: the model is never asked "is this a cat", it scores everything it knows
 * and one of them wins. */
const ScoreBars: React.FC<{
  series: { label: string; value: number }[];
  values: number[];
  colors: string[];
  dim: string;
}> = ({ series, values, colors, dim }) => {
  const W = 3.4;
  const rowH = 0.46;
  const top = ((series.length - 1) * rowH) / 2;
  return (
    <group>
      {series.map((s, i) => {
        const v = Math.max(0, Math.min(1, values[i] ?? s.value));
        const y = top - i * rowH;
        const len = Math.max(0.02, v * W);
        const lead = i === 0 || v >= Math.max(...values);
        return (
          <group key={s.label} position={[0, y, 0]}>
            {/* The track: how long the bar COULD be, so a short bar reads as
                short rather than merely small. */}
            <mesh position={[0, 0, -0.02]}>
              <planeGeometry args={[W, rowH * 0.52]} />
              <meshBasicMaterial color={dim} toneMapped={false} />
            </mesh>
            <mesh position={[-W / 2 + len / 2, 0, 0]}>
              <planeGeometry args={[len, rowH * 0.52]} />
              <meshBasicMaterial color={lead ? colors[i % colors.length] : colors[i % colors.length]} opacity={lead ? 1 : 0.55} transparent toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

/** A STACK OF TRANSFORMATIONS, and something passing through it.
 *
 * Replaces a card captioned "the network", which named a thing without showing
 * it do anything. What a network IS, for this explanation, is a series of steps
 * that each rewrite the representation — so the picture of it has to be the
 * representation entering, being altered, and leaving different. The travelling
 * slab changes colour at every layer it crosses, from raw-data blue toward the
 * abstract purple, which is the one claim the scene is making. */
const LayerStack: React.FC<{ progress: number; variant: "cat" | "cat-alt" | "dog"; from: string; to: string; frame: string }> = ({
  progress,
  variant,
  from,
  to,
  frame,
}) => {
  const N = 4;
  const detail = 22;
  const img = useSourceImage(variant, detail);
  const gap = 1.05;
  const span = (N - 1) * gap;

  // PROCESSING HAPPENS IN STEPS, so the motion has to be stepped. Gliding
  // smoothly from one end to the other read as a thing drifting past some
  // sheets — no arrival, no event, nothing done to it. Each segment is a
  // TRAVEL to the next layer and then a DWELL at it, and the transformation
  // lands during the dwell, so every change is something that visibly happened
  // AT a step rather than a continuous blur across all of them.
  const seg = Math.max(0, Math.min(N - 0.0001, progress * N));
  const idx = Math.floor(seg);
  const f = seg - idx;
  const TRAVEL = 0.55;
  const moving = f < TRAVEL;
  const move = moving ? ease(f / TRAVEL) : 1;
  // ONCE THE LAST STEP IS DONE, THE RESULT COMES OUT. It used to stop at the
  // final plane, so what the process had actually derived sat buried behind
  // four translucent sheets — the one thing the scene builds to was the one
  // thing you could not see. After the last transformation it glides clear of
  // the stack and the steps fade back behind it.
  const exiting = idx === N - 1 && !moving ? Math.min(1, (f - TRAVEL) / (1 - TRAVEL)) : 0;
  const z = -span / 2 + Math.min(N - 1, idx + move) * gap + ease(exiting) * 1.5;
  // Discrete: how many layers have actually been applied.
  const applied = Math.min(N, idx + (moving ? 0 : 1));
  const stage = applied / N;
  // How settled the current step is, for the little arrival flare.
  const dwell = moving ? 0 : Math.min(1, (f - TRAVEL) / 0.2);
  const size = 1.7 / detail;

  const at = (gx: number, gy: number) => img.cells[gy * detail + gx]?.lum ?? 0;

  return (
    <group>
      {Array.from({ length: N }).map((_, i) => {
        // The step currently doing the work is lit; the ones already done stay
        // faintly on; the ones ahead are barely there. Without this the stack
        // was four identical sheets and nothing marked where the work happened.
        const done = i < applied;
        const active = i === Math.min(N - 1, idx) && !moving;
        return (
          <group key={i} position={[0, 0, -span / 2 + i * gap]}>
            <mesh>
              <planeGeometry args={[2.6, 2.6]} />
              <meshBasicMaterial
                color={active ? to : frame}
                opacity={(active ? 0.1 + dwell * 0.22 : done ? 0.16 : 0.07) * (1 - exiting * 0.85)}
                transparent
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            {/* A frame around each step, so it reads as a stage to pass through
                rather than a sheet of fog. */}
            <lineSegments>
              <edgesGeometry args={[new THREE.PlaneGeometry(2.6, 2.6)]} />
              <lineBasicMaterial
                color={active ? to : frame}
                transparent
                opacity={(active ? 0.9 : done ? 0.5 : 0.22) * (1 - exiting * 0.85)}
                toneMapped={false}
              />
            </lineSegments>
          </group>
        );
      })}

      {/* THE REPRESENTATION ITSELF makes the journey, and stops being a picture
          as it goes. An abstract slab drifting between sheets said nothing: the
          viewer could not tell what was being transformed, or that anything was.
          Here the cat enters as the cat, loses its colour to the data palette,
          keeps only the places where it changes, and finally scatters into
          values that no longer sit where the animal was — which is the scene's
          entire claim, watched rather than asserted. */}
      <group position={[0, 0, z]}>
        {(() => {
          // WHICH CELLS SURVIVE, worked out once, so the ones that make it
          // through can be given tidy places in the final block rather than
          // being scattered. The last stage has to read as REFINED — reduced to
          // what matters and reorganised — not as debris. Jittering them apart
          // made the representation look destroyed, which is the opposite of
          // what deeper layers do.
          const survivors: number[] = [];
          img.cells.forEach((_, i) => {
            const gx = i % detail;
            const gy = Math.floor(i / detail);
            const dx = Math.abs(at(Math.min(gx + 1, detail - 1), gy) - at(Math.max(gx - 1, 0), gy));
            const dy = Math.abs(at(gx, Math.min(gy + 1, detail - 1)) - at(gx, Math.max(gy - 1, 0)));
            if (Math.min(1, Math.hypot(dx, dy) * 2.6) >= 0.28) survivors.push(i);
          });
          const cols = Math.max(3, Math.round(Math.sqrt(survivors.length)));
          const slot = new Map<number, [number, number]>();
          const pitch = size * 1.25;
          survivors.forEach((idx, k) => {
            const cx2 = ((k % cols) - (cols - 1) / 2) * pitch;
            const cy2 = -(Math.floor(k / cols) - (Math.ceil(survivors.length / cols) - 1) / 2) * pitch;
            slot.set(idx, [cx2, cy2]);
          });
          return img.cells.map((c, i) => {
          const gx = i % detail;
          const gy = Math.floor(i / detail);
          const dx = Math.abs(at(Math.min(gx + 1, detail - 1), gy) - at(Math.max(gx - 1, 0), gy));
          const dy = Math.abs(at(gx, Math.min(gy + 1, detail - 1)) - at(gx, Math.max(gy - 1, 0)));
          const edge = Math.min(1, Math.hypot(dx, dy) * 2.6);

          // Past the halfway mark only the changing places survive.
          const keep = stage < 0.45 ? 1 : Math.max(0, 1 - (stage - 0.45) / 0.3) + edge;
          if (keep < 0.15) return null;

          const x = (gx - (detail - 1) / 2) * size;
          const y = -(gy - (detail - 1) / 2) * size;
          // Past the last layer, what survived GATHERS into a compact ordered
          // block: fewer values, tidily arranged, nothing where the picture used
          // to be. Distilled rather than broken.
          const gather = Math.max(0, Math.min(1, (stage - 0.62) / 0.34));
          const target = slot.get(i);
          const tx = target ? x + (target[0] - x) * gather : x;
          const ty = target ? y + (target[1] - y) * gather : y;
          const src = new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
          const col = src.clone().lerp(new THREE.Color(from).lerp(new THREE.Color(to), stage), Math.min(1, stage * 1.5));
          // Cells with nowhere to go in the final block fade out as it forms.
          const alpha = target ? Math.min(1, keep) : Math.min(1, keep) * (1 - gather);
          if (alpha < 0.04) return null;

          return (
            <mesh key={i} position={[tx * (1 + exiting * 0.35), ty * (1 + exiting * 0.35), 0]}>
              <planeGeometry args={[size * (target ? 0.88 + gather * 0.16 : 0.88), size * (target ? 0.88 + gather * 0.16 : 0.88)]} />
              <meshBasicMaterial color={col} opacity={alpha} transparent toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          );
          });
        })()}
      </group>
    </group>
  );
};



/** THE PEELING BROWSER — the episode's front stage.
 *
 * Closed, it is deliberately unremarkable: a window, a tab strip, an address
 * bar, a page with a heading, an image, a video and a button. That ordinariness
 * is the setup, because the whole thesis is that this simple-looking thing is
 * hiding an enormous amount of work.
 *
 * Opening it is one continuous move rather than a cut. The chrome lifts off the
 * page, the tabs detach and fan, and the page's own regions come away as the
 * WORK behind them — travelling right, across the frame, toward the memory
 * workspace that will allocate them. Its motion language is peel, detach,
 * unfold, expand, activate, which is deliberately nothing like the workspace's
 * fill, breathe, calm, reclaim: two objects, two personalities, and the moment
 * they meet is the point of the episode. */
const BrowserWindow: React.FC<{
  peel: number;
  tabs: string[];
  workloads: { label: string; accent?: string }[];
  light: boolean;
  accents: Record<string, string>;
}> = ({ peel, tabs, workloads, light, accents }) => {
  const W = 2.6;
  const H = 1.75;
  const chromeH = 0.32;
  const frame = light ? "#d7dbe2" : "#2b3140";
  const chrome = light ? "#c3c9d3" : "#39414d";
  const page = light ? "#ffffff" : "#161b24";
  const line = light ? "#aab2bf" : "#4a5464";

  const e = ease(Math.max(0, Math.min(1, peel)));
  // Staged so the opening reads as a sequence rather than everything moving at
  // once: the lid lifts, then the tabs come away, then the page's contents do.
  const lift = Math.min(1, e / 0.35);
  const detach = Math.max(0, Math.min(1, (e - 0.25) / 0.35));
  const unfold = Math.max(0, Math.min(1, (e - 0.5) / 0.5));

  return (
    <group>
      {/* The window itself. */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0, -0.03]}>
          <planeGeometry args={[W + 0.08, H + 0.08]} />
          <meshBasicMaterial color={frame} toneMapped={false} />
        </mesh>
        <mesh>
          <planeGeometry args={[W, H - chromeH]} />
          <meshBasicMaterial color={page} toneMapped={false} />
        </mesh>

        {/* Page furniture: a heading, an image block, a video block, a button.
            Recognisable as a webpage without being a screenshot of one. */}
        <mesh position={[-W * 0.24, H * 0.22, 0.01]}>
          <planeGeometry args={[W * 0.42, 0.09]} />
          <meshBasicMaterial color={line} toneMapped={false} />
        </mesh>
        <mesh position={[-W * 0.3, H * 0.02, 0.01]} scale={[1 - unfold, 1 - unfold, 1]}>
          <planeGeometry args={[W * 0.3, H * 0.26]} />
          <meshBasicMaterial color={accents.primary} opacity={0.5} transparent toneMapped={false} />
        </mesh>
        <mesh position={[W * 0.16, H * 0.02, 0.01]} scale={[1 - unfold, 1 - unfold, 1]}>
          <planeGeometry args={[W * 0.36, H * 0.26]} />
          <meshBasicMaterial color={accents.danger} opacity={0.45} transparent toneMapped={false} />
        </mesh>
        <mesh position={[-W * 0.3, -H * 0.24, 0.01]} scale={[1 - unfold * 0.9, 1 - unfold * 0.9, 1]}>
          <planeGeometry args={[W * 0.2, 0.12]} />
          <meshBasicMaterial color={accents.success} opacity={0.6} transparent toneMapped={false} />
        </mesh>
      </group>

      {/* CHROME LIFTS AWAY from the page — the first sign that the window is
          not one solid thing. */}
      <group position={[0, H / 2 - chromeH / 2 + lift * 0.55, lift * 0.5]} rotation={[-lift * 0.42, 0, 0]}>
        <mesh>
          <planeGeometry args={[W + 0.08, chromeH]} />
          <meshBasicMaterial color={chrome} toneMapped={false} />
        </mesh>
        <mesh position={[0, -chromeH * 0.16, 0.01]}>
          <planeGeometry args={[W * 0.62, 0.075]} />
          <meshBasicMaterial color={light ? "#eef1f5" : "#222834"} toneMapped={false} />
        </mesh>
      </group>

      {/* TABS DETACH and fan out above the window. */}
      {tabs.map((label, i) => {
        const n = Math.max(1, tabs.length);
        const homeX = -W / 2 + 0.28 + i * 0.5;
        const fanX = (i - (n - 1) / 2) * 0.72;
        const x = homeX + (fanX - homeX) * detach;
        return (
          <mesh
            key={label}
            position={[x, H / 2 - chromeH * 0.35 + lift * 0.55 + detach * 0.5, lift * 0.5 + detach * 0.35]}
            rotation={[-lift * 0.42 * (1 - detach), 0, 0]}
          >
            <planeGeometry args={[0.44, 0.16]} />
            <meshBasicMaterial color={i === 0 ? accents.primary : chrome} opacity={i === 0 ? 0.9 : 0.75} transparent toneMapped={false} />
          </mesh>
        );
      })}

      {/* THE WORK COMES AWAY, travelling right toward the workspace. Each slab
          is a workload the page needs in order to function — not a card naming
          one. */}
      {workloads.map((wl, i) => {
        const n = Math.max(1, workloads.length);
        // Staggered: each piece has its own slice of the peel, so they arrive in
        // sequence rather than in a heap.
        const slice = 1 / n;
        const own = Math.max(0, Math.min(1, (unfold - i * slice * 0.55) / (1 - i * slice * 0.55 || 1)));
        if (own <= 0.01) return null;
        const e2 = ease(own);
        // Fanned across the width and brought forward toward the camera.
        const spreadX = (i - (n - 1) / 2) * 1.15;
        const col = accents[wl.accent ?? (i % 3 === 0 ? "primary" : i % 3 === 1 ? "danger" : "success")] ?? accents.primary;
        return (
          <group key={wl.label} position={[spreadX * e2, -H * 0.1 - i * 0.06, 0.25 + e2 * 1.5]} scale={0.55 + e2 * 0.5}>
            <mesh>
              <planeGeometry args={[1.0, 0.62]} />
              <meshBasicMaterial color={light ? "#ffffff" : "#161b24"} opacity={0.96} transparent toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, 0.002]}>
              <planeGeometry args={[1.0, 0.14]} />
              <meshBasicMaterial color={col} opacity={0.9} transparent toneMapped={false} />
            </mesh>
            <lineSegments>
              <edgesGeometry args={[new THREE.PlaneGeometry(1.0, 0.62)]} />
              <lineBasicMaterial color={col} transparent opacity={0.95} toneMapped={false} />
            </lineSegments>
          </group>
        );
      })}
    </group>
  );
};





/** A COMPRESSED FILE OPENING INTO ITS DECODED PIXELS.
 *
 * The card on the left is what a person recognises: a filename and a size off
 * their own disk. What grows out of it is what the browser actually has to hold
 * to put that picture on screen. Nothing here is a metaphor — the small thing
 * really does become the large thing, and the size of the gap IS the point.
 * Saying "decoded images are larger than their files" asks to be believed;
 * watching one open asks nothing. */
const DecodeBlock: React.FC<{ label: string; color: string; light: boolean; opened: number; t: number }> = ({ label, color, light, opened, t }) => {
  const COLS = 26;
  const ROWS = 16;
  const cell = 0.14;
  const e = ease(Math.max(0, Math.min(1, opened)));

  const fileTexture = React.useMemo(() => {
    if (typeof document === "undefined") return null;
    const W = 320;
    const H = 200;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = light ? "#ffffff" : "#161b24";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillText(label, 16, 31);
    ctx.fillStyle = light ? "#12161c" : "#e6ebf5";
    ctx.font = "700 40px system-ui, sans-serif";
    ctx.fillText("420 KB", 16, 116);
    ctx.fillStyle = light ? "#9aa3b0" : "#6b7280";
    ctx.font = "400 18px system-ui, sans-serif";
    ctx.fillText("on disk", 16, 150);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [label, color, light]);

  return (
    <group>
      {/* The file, shrinking away as what it contains takes over. */}
      <group position={[-1.9, 0, 0.02]} scale={1 - e * 0.35}>
        <mesh>
          <planeGeometry args={[1.5, 0.94]} />
          {fileTexture ? <meshBasicMaterial map={fileTexture} toneMapped={false} /> : <meshBasicMaterial color={color} />}
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(1.5, 0.94)]} />
          <lineBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
        </lineSegments>
      </group>

      {/* The pixels it becomes: dealt out row by row, so the viewer sees the
          cost being paid rather than a big rectangle appearing. */}
      {Array.from({ length: COLS * ROWS }).map((_, i) => {
        const gx = i % COLS;
        const gy = Math.floor(i / COLS);
        const order = (gy * COLS + gx) / (COLS * ROWS);
        const on = Math.max(0, Math.min(1, (e - order * 0.55) / 0.45));
        if (on <= 0.02) return null;
        const x = 0.55 + (gx - (COLS - 1) / 2) * cell;
        const y = -(gy - (ROWS - 1) / 2) * cell;
        const shimmer = 0.82 + 0.18 * Math.sin(t * 2.2 + i * 0.35);
        return (
          <mesh key={i} position={[x, y, 0]} scale={on}>
            <planeGeometry args={[cell * 0.88, cell * 0.88]} />
            <meshBasicMaterial color={color} opacity={0.35 + shimmer * 0.5} transparent toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
};

/** AN OPEN TAB, as a card carrying its own colour and title.
 *
 * The title is painted into the card rather than floated beside it, so it stays
 * attached and stays crisp however close the camera gets. The colour is the
 * point: the same one shows up in the memory wall, sized by what this tab
 * costs, which is how "which tab is eating my memory" gets answered by looking
 * instead of by reading a key. */
const TabCard: React.FC<{ label: string; color: string; light: boolean; alive: number; failing: number; t: number }> = ({ label, color, light, alive, failing, t }) => {
  const texture = React.useMemo(() => {
    if (typeof document === "undefined") return null;
    const W = 512;
    const H = 320;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = light ? "#ffffff" : "#161b24";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, 74);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText(label, 26, 50);
    // A hint of page content, so it reads as a tab rather than a swatch.
    ctx.fillStyle = light ? "#e3e7ee" : "#2b3140";
    ctx.fillRect(26, 116, 340, 20);
    ctx.fillRect(26, 152, 250, 20);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(26, 200, 200, 84);
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [label, color, light]);

  // Working tabs stir very slightly, so a page that is doing something is
  // distinguishable from one merely sitting open.
  const breathe = alive > 0 ? 1 + Math.sin(t * 2.4) * 0.008 * alive : 1;
  // A FAILING TAB JUDDERS AND DRAINS. Fast irregular movement reads as
  // something losing control in a way a colour change never does, and the
  // colour going out of it says it has stopped doing its job — both before any
  // word appears.
  const shake = failing > 0.02 ? Math.sin(t * 47) * 0.045 * failing : 0;
  const tilt = failing > 0.02 ? Math.sin(t * 31) * 0.06 * failing : 0;

  return (
    <group scale={breathe} position={[shake, shake * 0.6, 0]} rotation={[0, 0, tilt]}>
      <mesh>
        <planeGeometry args={[1.6, 1.0]} />
        {texture ? (
          <meshBasicMaterial map={texture} toneMapped={false} opacity={1 - failing * 0.55} transparent />
        ) : (
          <meshBasicMaterial color={color} />
        )}
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(1.6, 1.0)]} />
        <lineBasicMaterial
          color={failing > 0.35 ? "#b91c1c" : color}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
};

/** ONE PIECE OF WORK behind the page, as a panel standing in space.
 *
 * Deliberately simple: a lit face, a coloured header bar, a bright edge. It
 * exists to be FLOWN PAST rather than examined, and its job is done by where it
 * sits — one of several receding behind the screen, so travelling through them
 * is what shows that a page is many things at once. It brightens as the camera
 * reaches it, which is what marks arrival without a label having to announce
 * it. */
const WorkloadPanel: React.FC<{ color: string; light: boolean; near: number }> = ({ color, light, near }) => (
  <group>
    <mesh>
      <planeGeometry args={[2.1, 1.3]} />
      <meshBasicMaterial color={light ? "#ffffff" : "#161b24"} opacity={0.55 + near * 0.42} transparent toneMapped={false} />
    </mesh>
    <mesh position={[0, 0.52, 0.003]}>
      <planeGeometry args={[2.1, 0.26]} />
      <meshBasicMaterial color={color} opacity={0.55 + near * 0.45} transparent toneMapped={false} />
    </mesh>
    <lineSegments>
      <edgesGeometry args={[new THREE.PlaneGeometry(2.1, 1.3)]} />
      <lineBasicMaterial color={color} transparent opacity={0.4 + near * 0.6} toneMapped={false} />
    </lineSegments>
  </group>
);

/** THE BROWSER, PAINTED ONTO A SCREEN.
 *
 * Drawn to a canvas rather than built from meshes so it stays crisp as the
 * camera closes on it — a screen you can push right up to has to hold up at
 * arm's length, and geometry that fine would be thousands of little planes. */
function useScreenTexture(light: boolean): THREE.CanvasTexture | null {
  return React.useMemo(() => {
    if (typeof document === "undefined") return null;
    const W = 1280;
    const H = 800;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const chrome = light ? "#c9cfd8" : "#2b3140";
    const page = "#ffffff";
    const faint = light ? "#dfe3ea" : "#39414d";

    ctx.fillStyle = chrome;
    ctx.fillRect(0, 0, W, H);

    const tabs = ["YouTube", "Gmail", "News"];
    tabs.forEach((label, i) => {
      const x = 28 + i * 210;
      ctx.fillStyle = i === 0 ? "#ffffff" : light ? "#dde2e9" : "#333b48";
      ctx.beginPath();
      ctx.roundRect(x, 18, 196, 52, [10, 10, 0, 0]);
      ctx.fill();
      ctx.fillStyle = i === 0 ? "#12161c" : light ? "#6b7280" : "#9aa3b2";
      ctx.font = "600 22px system-ui, sans-serif";
      ctx.fillText(label, x + 22, 51);
    });

    ctx.fillStyle = light ? "#eef1f5" : "#222834";
    ctx.beginPath();
    ctx.roundRect(28, 84, W - 56, 46, 23);
    ctx.fill();
    ctx.fillStyle = light ? "#9aa3b0" : "#6b7280";
    ctx.font = "400 20px system-ui, sans-serif";
    ctx.fillText("youtube.com/watch", 56, 114);

    ctx.fillStyle = page;
    ctx.fillRect(0, 146, W, H - 146);

    ctx.fillStyle = "#1b1f26";
    ctx.beginPath();
    ctx.roundRect(48, 186, 740, 416, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(392, 358);
    ctx.lineTo(392, 430);
    ctx.lineTo(456, 394);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#12161c";
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText("Why is this using so much memory?", 48, 654);
    ctx.fillStyle = faint;
    ctx.fillRect(48, 682, 520, 12);
    ctx.fillRect(48, 706, 400, 12);

    for (let i = 0; i < 3; i++) {
      const y = 186 + i * 140;
      ctx.fillStyle = faint;
      ctx.beginPath();
      ctx.roundRect(830, y, 400, 118, 10);
      ctx.fill();
      ctx.fillStyle = light ? "#aab2bf" : "#4a5464";
      ctx.beginPath();
      ctx.roundRect(844, y + 12, 150, 94, 8);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, [light]);
}

/** A REAL CIRCUIT BOARD, lying flat as the ground for a components scene.
 * PCB green with etched trace lines, scattered via dots, and a handful of
 * small discrete parts (capacitors, resistors) — the specific furniture that
 * makes a board read as a board at a glance, rather than a green rectangle
 * with a few chips floating over it. Modelled after the familiar isometric
 * "PCB clipart" register: legible, a little stylised, colour used to tell
 * components apart rather than for realism's own sake. */
const Motherboard: React.FC<{ width: number; depth: number; light: boolean }> = ({ width, depth, light }) => {
  const board = light ? "#1c5943" : "#0f3527";
  const traceColor = light ? "#8fe3c4" : "#4fae8c";
  const viaColor = "#7ddc8a";
  const capBody = light ? "#232a36" : "#161b26";
  const capCap = light ? "#c7cdd6" : "#8a93a3";
  const resistorColors = ["#e0574a", "#3f7fd4", "#e0b23f"];

  const rand = (seed: number, n: number) => {
    const v = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  // A handful of right-angled trace paths — one bend each, which is the
  // single strongest visual signature a real PCB has and the thing a scatter
  // of plain rectangles never reads as. Deterministic (Math.sin, not
  // Math.random) so a re-render draws the identical board.
  const traces = Array.from({ length: 9 }, (_, i) => {
    const x0 = (rand(i, 1) - 0.5) * (width - 1.2);
    const z0 = (rand(i, 2) - 0.5) * (depth - 1.2);
    const runX = 0.5 + rand(i, 3) * 1.4;
    const runZ = 0.5 + rand(i, 4) * 1.1;
    const horizontalFirst = rand(i, 5) > 0.5;
    return { x0, z0, runX, runZ, horizontalFirst };
  });

  const vias = Array.from({ length: 22 }, (_, i) => ({
    x: (rand(i + 40, 1) - 0.5) * (width - 0.6),
    z: (rand(i + 40, 2) - 0.5) * (depth - 0.6),
  }));

  const capacitors: [number, number][] = [
    [-width / 2 + 0.9, -depth / 2 + 1.0],
    [width / 2 - 1.0, depth / 2 - 0.7],
  ];
  const resistors: [number, number, number][] = [
    [-width / 2 + 1.6, depth / 2 - 0.5, 0],
    [width / 2 - 1.7, -depth / 2 + 0.55, 1],
    [-width / 2 + 0.7, depth / 2 - 1.7, 2],
  ];

  const TRACE_W = 0.028;

  return (
    <group>
      <mesh position={[0, -0.075, 0]}>
        <boxGeometry args={[width, 0.15, depth]} />
        <meshStandardMaterial color={board} metalness={0.25} roughness={0.55} />
      </mesh>
      {traces.map((t, i) => {
        const legA = t.horizontalFirst ? { w: t.runX, d: TRACE_W, x: t.x0 + t.runX / 2, z: t.z0 } : { w: TRACE_W, d: t.runZ, x: t.x0, z: t.z0 + t.runZ / 2 };
        const legBX = t.horizontalFirst ? t.x0 + t.runX : t.x0;
        const legBZ = t.horizontalFirst ? t.z0 : t.z0 + t.runZ;
        const legB = t.horizontalFirst
          ? { w: TRACE_W, d: t.runZ, x: legBX, z: t.z0 + t.runZ / 2 }
          : { w: t.runX, d: TRACE_W, x: t.x0 + t.runX / 2, z: legBZ };
        return (
          <group key={i}>
            <mesh position={[legA.x, 0.003, legA.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[legA.w, legA.d]} />
              <meshStandardMaterial color={traceColor} metalness={0.5} roughness={0.35} />
            </mesh>
            <mesh position={[legB.x, 0.003, legB.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[legB.w, legB.d]} />
              <meshStandardMaterial color={traceColor} metalness={0.5} roughness={0.35} />
            </mesh>
          </group>
        );
      })}
      {vias.map((v, i) => (
        <mesh key={i} position={[v.x, 0.004, v.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.035, 10]} />
          <meshStandardMaterial color={viaColor} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
      {capacitors.map(([x, z], i) => (
        <group key={i} position={[x, 0.09, z]}>
          <mesh>
            <cylinderGeometry args={[0.11, 0.11, 0.18, 16]} />
            <meshStandardMaterial color={capBody} metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.115, 0.115, 0.01, 16]} />
            <meshStandardMaterial color={capCap} metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
      ))}
      {resistors.map(([x, z, c], i) => (
        <mesh key={i} position={[x, 0.03, z]} rotation={[0, rand(i, 9) * Math.PI, 0]}>
          <boxGeometry args={[0.24, 0.06, 0.09]} />
          <meshStandardMaterial color={resistorColors[c]} metalness={0.2} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
};

/** THE PROCESSOR — a socket base with a squarer metal heat-spreader lid on
 * top. The one component a viewer can point to on any real board by its size
 * and position alone, so it does not need to look like anything else. */
const CpuChip: React.FC<{ light: boolean }> = ({ light }) => (
  <group>
    <RoundedBox args={[0.95, 0.07, 0.95]} radius={0.02} smoothness={2} position={[0, 0.035, 0]}>
      <meshStandardMaterial color={light ? "#2a2f3a" : "#111827"} metalness={0.3} roughness={0.6} />
    </RoundedBox>
    <RoundedBox args={[0.62, 0.09, 0.62]} radius={0.03} smoothness={3} position={[0, 0.115, 0]}>
      <meshStandardMaterial color={light ? "#c3c9d3" : "#9aa4b2"} metalness={0.85} roughness={0.25} />
    </RoundedBox>
  </group>
);

/** A MEMORY MODULE — the unmistakable RAM silhouette: thin, tall, short in
 * depth, standing upright with gold contacts along its bottom edge. The
 * proportions alone read as "RAM" the way a phone's proportions read as
 * "phone", without needing a label. */
const RamStick: React.FC<{ light: boolean }> = ({ light }) => {
  const pcb = light ? "#20242e" : "#14171f";
  const chipColor = light ? "#0d0f14" : "#05070a";
  return (
    <group position={[0, 0.45, 0]}>
      <mesh>
        <boxGeometry args={[1.05, 0.86, 0.07]} />
        <meshStandardMaterial color={pcb} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Gold contact fingers along the bottom edge, where it seats in the slot. */}
      <mesh position={[0, -0.41, 0]}>
        <boxGeometry args={[1.0, 0.06, 0.072]} />
        <meshStandardMaterial color={light ? "#d4af37" : "#b8860b"} metalness={0.9} roughness={0.3} />
      </mesh>
      {[-0.3, 0, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 0.1, 0.041]}>
          <boxGeometry args={[0.22, 0.46, 0.012]} />
          <meshStandardMaterial color={chipColor} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
};

/** A STORAGE DRIVE — a small flat slab lying down, physically apart from the
 * socket cluster. Lying flat where RAM stands upright is deliberate: the two
 * components should never read as interchangeable silhouettes. */
const StorageDrive: React.FC<{ light: boolean }> = ({ light }) => (
  <group position={[0, 0.03, 0]}>
    <RoundedBox args={[1.15, 0.06, 0.32]} radius={0.015} smoothness={2}>
      <meshStandardMaterial color={light ? "#2a2f3a" : "#161b26"} metalness={0.4} roughness={0.45} />
    </RoundedBox>
    <mesh position={[0.05, 0.033, 0]}>
      <planeGeometry args={[0.62, 0.2]} />
      <meshStandardMaterial color={light ? "#9aa4b2" : "#5b6472"} metalness={0.2} roughness={0.6} />
    </mesh>
    <mesh position={[-0.52, 0.033, 0]}>
      <boxGeometry args={[0.1, 0.005, 0.28]} />
      <meshStandardMaterial color={light ? "#d4af37" : "#b8860b"} metalness={0.9} roughness={0.3} />
    </mesh>
  </group>
);

/** A LAPTOP. The one object in this episode that genuinely needs depth: a real
 * machine sitting in a room, which the camera can approach and travel into. */
const Laptop: React.FC<{ light: boolean }> = ({ light }) => {
  const screen = useScreenTexture(light);
  const shell = light ? "#b9c0ca" : "#39414d";
  const shellDark = light ? "#9aa3b0" : "#2b3140";
  const TILT = -0.28;

  return (
    <group>
      <mesh position={[0, -0.04, 0.9]}>
        <boxGeometry args={[3.5, 0.11, 2.3]} />
        <meshStandardMaterial color={shell} metalness={0.45} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.021, 0.62]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.9, 1.15]} />
        <meshStandardMaterial color={shellDark} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.022, 1.66]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.15, 0.72]} />
        <meshStandardMaterial color={shellDark} roughness={0.6} />
      </mesh>
      <group position={[0, 0, -0.2]} rotation={[TILT, 0, 0]}>
        <mesh position={[0, 1.06, -0.03]}>
          <boxGeometry args={[3.5, 2.16, 0.07]} />
          <meshStandardMaterial color={shell} metalness={0.45} roughness={0.42} />
        </mesh>
        <mesh position={[0, 1.06, 0.012]}>
          <planeGeometry args={[3.3, 1.98]} />
          {screen ? <meshBasicMaterial map={screen} toneMapped={false} /> : <meshBasicMaterial color="#ffffff" />}
        </mesh>
      </group>
    </group>
  );
};

/** THE MEMORY WORKSPACE — the episode's signature object.
 *
 * A number in a task manager tells a viewer nothing. A floor of blocks that
 * visibly fills as tabs open, crowds as work piles up, and hands whole regions
 * back when the system asks, tells them what the number MEANS — and answers the
 * question the whole episode turns on, which is not "how much" but "of what".
 *
 * The states have BEHAVIOUR, not just colour, because that is the difference
 * between a legend and a picture of a working system:
 *   active      — breathes, because something is using it right now;
 *   reusable    — allocated but calm, held in case it is wanted again;
 *   reclaimable — amber and still, waiting to be taken back;
 *   free        — barely there, and reddens as the field runs out of room.
 *
 * Laid out wide on purpose: this is a 16:9 subject and a memory field is the
 * one object that genuinely wants the horizontal canvas. */
const MemoryField: React.FC<{
  capacity: number;
  regions: { label: string; blocks: number; state: "active" | "reusable" | "reclaimable"; accent?: string }[];
  t: number;
  cool: boolean;
}> = ({ capacity, regions, t, cool }) => {
  // Squarer than a strip: a workspace should read as a floor you could walk
  // across, not a progress bar lying on its side.
  const COLS = 22;
  const rows = Math.max(1, Math.ceil(capacity / COLS));
  // SIZED TO A TARGET WIDTH, not to a fixed block size. With the block size
  // fixed, a bigger capacity made a bigger wall — backwards, since capacity is
  // how much memory the machine HAS, and more memory should not mean an object
  // that takes over the frame. The wall stays the same size and its blocks get
  // finer, which is also what more memory actually looks like.
  const TARGET_W = 4.2;
  const cell = TARGET_W / (COLS * 1.16);
  const gap = cell * 0.16;
  const pitch = cell + gap;

  /** State no longer decides the colour — the TAB does. State decides how the
   * block is treated: solid and stirring while in use, flatter when merely kept
   * around, hollow once it is a candidate to be taken back. */
  const STATE_ALPHA: Record<string, number> = { active: 1, reusable: 0.62, reclaimable: 0.3 };
  const freeColor = cool ? "#c9cfd8" : "#39414d";

  // Which region each block belongs to, laid down in order.
  const owner: { region: (typeof regions)[number]; index: number }[] = [];
  regions.forEach((r, ri) => {
    for (let i = 0; i < r.blocks && owner.length < capacity; i++) owner.push({ region: r, index: ri });
  });
  const used = owner.length;
  const pressure = Math.max(0, Math.min(1, (used / capacity - 0.72) / 0.28));

  return (
    <group>
      {Array.from({ length: capacity }).map((_, i) => {
        const gx = i % COLS;
        const gy = Math.floor(i / COLS);
        // A WALL, NOT A FLOOR. As a floor it needed a top-down camera while the
        // browser needed a face-on one, so the episode's key composition —
        // browser, then the work, then the memory receiving it, all in one
        // frame — could never resolve: one object was always edge-on. Standing
        // the field up lets both read from the same angle, and blocks now grow
        // TOWARD the viewer as they come alive, which is a better picture of
        // memory being taken than a floor tile getting taller.
        const x = (gx - (COLS - 1) / 2) * pitch;
        const y = -(gy - (rows - 1) / 2) * pitch;
        const slot = owner[i];

        if (!slot) {
          // Free space. It reddens as the field fills, so running out of room
          // is something the viewer sees before it is said.
          const c = new THREE.Color(freeColor).lerp(new THREE.Color("#c02434"), pressure * 0.75);
          return (
            <mesh key={i} position={[x, y, 0]}>
              <planeGeometry args={[cell, cell]} />
              <meshBasicMaterial color={c} opacity={0.16 + pressure * 0.4} transparent toneMapped={false} />
            </mesh>
          );
        }

        // Active memory breathes; everything else is still. The pulse is
        // deliberately small and out of phase per block — a field throbbing in
        // unison reads as decoration, a field where individual blocks stir
        // reads as work being done in them.
        const region = slot.region;
        const alive = region.state === "active" ? 1 : 0;
        const beat = alive ? 0.5 + 0.5 * Math.sin(t * 3.1 + i * 0.7) : 0;
        const h = (region.state === "reclaimable" ? 0.06 : 0.12) + beat * 0.08;
        // Neighbouring regions in the same state are shaded apart, so the field
        // shows WHAT the memory is being used for and not merely how much of it
        // is gone — which is the question the whole episode turns on.
        const base = new THREE.Color(region.accent ?? "#1668d8");
        const col = slot.index % 2 === 0 ? base : base.clone().offsetHSL(0, -0.05, 0.06);
        const alpha = STATE_ALPHA[region.state] ?? 1;
        return (
          <mesh key={i} position={[x, y, h / 2]}>
            <boxGeometry args={[cell, cell, h]} />
            <meshStandardMaterial
              color={col}
              emissive={col}
              emissiveIntensity={alive ? 0.12 + beat * 0.22 : 0.04}
              transparent
              opacity={alpha}
              roughness={0.55}
              metalness={0.05}
            />
          </mesh>
        );
      })}
    </group>
  );
};

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
  /** How far a flat representation has risen into a dimensional one, 0..1. */
  extrude: number;
  /** Current bar lengths, 0..1. */
  scores: number[];
  /** Current memory allocation. */
  regions: { label: string; blocks: number; state: "active" | "reusable" | "reclaimable"; accent?: string }[];
  /** How far the browser has opened itself up, 0..1. */
  peel: number;
  /** How far this object has gone wrong, 0..1. */
  failing: number;
}

export const SpatialStage: React.FC<{ data: SpatialData } & SharedVisualProps> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const groundName = data.theme ?? "dark";
  const cool = groundName === "cool";
  const light = groundName === "light" || cool;
  const timeline = data.timeline ?? [];

  // Byte-for-byte the 2D stage's own light panel and ink, so a cut between the
  // two media is a change of dimension and nothing else.
  const ground = cool ? "#eceef2" : light ? "#f8f3e8" : "#080c14";
  const ink = cool ? "#12161c" : light ? "#1a2338" : "#f4f7ff";
  const ACCENTS = cool ? ACCENTS_COOL : light ? ACCENTS_LIGHT : ACCENTS_DARK;

  // --- resolve every object's state at this instant -----------------------
  const resolved: Resolved[] = React.useMemo(() => {
    const visible = new Map<string, number>();
    const rotations = new Map<string, [number, number, number]>();
    const spins = new Map<string, [number, number, number]>();
    const offsets = new Map<string, THREE.Vector3>();
    const orbitHosts = new Map<string, string>();
    const travelled = new Map<string, THREE.Vector3>();
    const extrusions = new Map<string, number>();
    const scores = new Map<string, number[]>();
    const peels = new Map<string, number>();
    const failures = new Map<string, number>();
    const allocations = new Map<string, { label: string; blocks: number; state: "active" | "reusable" | "reclaimable"; accent?: string }[]>();
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
        case "destabilise": {
          const p = progress(t, action.startSeconds, action.durationSeconds ?? 2);
          const from = failures.get(action.id) ?? 0;
          failures.set(action.id, from + (action.to - from) * p);
          break;
        }
        case "peel": {
          const p = ease(progress(t, action.startSeconds, action.durationSeconds ?? 2.6));
          const from = peels.get(action.id) ?? 0;
          peels.set(action.id, from + (action.to - from) * p);
          break;
        }
        case "allocate": {
          const p = ease(progress(t, action.startSeconds, action.durationSeconds ?? 1.8));
          const obj = data.objects.find((o) => o.id === action.id);
          const start = allocations.get(action.id) ?? obj?.regions ?? [];
          // Regions grow and shrink toward the new allocation rather than
          // snapping, so memory is seen being taken and given back.
          allocations.set(
            action.id,
            action.to.map((r) => {
              const was = start.find((x) => x.label === r.label);
              const from = was ? was.blocks : 0;
              return { label: r.label, blocks: Math.round(from + (r.blocks - from) * p), state: r.state, accent: r.accent };
            }),
          );
          break;
        }
        case "score": {
          const p = ease(progress(t, action.startSeconds, action.durationSeconds ?? 2));
          const obj = data.objects.find((o) => o.id === action.id);
          const start = scores.get(action.id) ?? (obj?.series ?? []).map((x) => x.value);
          scores.set(action.id, action.to.map((v, i) => (start[i] ?? 0) + (v - (start[i] ?? 0)) * p));
          break;
        }
        case "extrude": {
          const p = ease(progress(t, action.startSeconds, action.durationSeconds ?? 2.2));
          const from = extrusions.get(action.id) ?? 0;
          extrusions.set(action.id, from + (action.to - from) * p);
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
        extrude: extrusions.get(object.id) ?? 0,
        scores: scores.get(object.id) ?? (object.series ?? []).map((x) => x.value),
        regions: allocations.get(object.id) ?? object.regions ?? [],
        peel: peels.get(object.id) ?? 0,
        failing: failures.get(object.id) ?? 0,
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
      // `frame` ESTABLISHES, it does not travel. Every scene was starting from
      // one global default pose and sweeping to wherever its first action
      // pointed, which gave all eleven scenes the identical opening sway — the
      // camera announcing itself instead of the subject. A framing is where the
      // shot begins; only orbit, push, pull and dolly are moves through it.
      const isEstablish = action.move === "frame";
      const p = isEstablish ? (t >= action.startSeconds ? 1 : 0) : ease(progress(t, action.startSeconds, action.durationSeconds ?? 2.5));
      if (p <= 0) continue;
      // FOCUS INTERPOLATES, so camera actions behave as keyframes rather than
      // as cuts. It used to snap to each action's subject, which meant any move
      // between two subjects had to be split across separate scenes — and a cut
      // in the middle of what should be one continuous journey is exactly the
      // disconnect this medium exists to avoid.
      if (action.focus) {
        // WHERE THE SUBJECT IS NOW, not where it was declared. Reading the
        // static coordinate meant a camera told to watch a travelling marker
        // stayed pointed at the spot it set off from, and the framing then had
        // to pull back far enough to keep both in shot — which is why a scene
        // about someone walking through a town kept retreating from it.
        const live = resolved.find((r) => r.object.id === action.focus);
        let target: THREE.Vector3 | null = null;
        if (live) target = live.position.clone();
        else {
          const declared = data.objects.find((o) => o.id === action.focus);
          if (declared) target = new THREE.Vector3(...(declared.at ?? [0, 0, 0]));
        }
        if (target) {
          if (action.focusOffset) target.add(new THREE.Vector3(...action.focusOffset));
          focus = isEstablish ? target : focus.clone().lerp(target, p);
        }
      } else if (action.focusOffset) {
        const target = focus.clone().add(new THREE.Vector3(...action.focusOffset));
        focus = isEstablish ? target : focus.clone().lerp(target, p);
      }
      // Authored distances are intent, resolved against the fit below.
      const current: number = authoredDistance ?? 8;
      // A DOLLY TRAVELS PAST, it does not swing around. Every scene opening on
      // the same arc-and-settle made the camera feel like one fixed rig that
      // could only do one thing — a dolly changes the viewer's position through
      // the scene rather than their angle on it, which is a different sentence.
      const toDistance: number | null =
        action.distance ??
        (action.move === "push" || action.move === "dolly"
          ? current * 0.72
          : action.move === "pull"
            ? current * 1.5
            : authoredDistance);
      if (toDistance !== null && toDistance !== undefined) {
        authoredDistance = authoredDistance === null ? toDistance : authoredDistance + (toDistance - authoredDistance) * p;
      }
      if (action.elevation !== undefined) elevation = elevation + (action.elevation - elevation) * p;
      if (action.azimuth !== undefined) azimuth = azimuth + (action.azimuth - azimuth) * p;
      if (action.move === "orbit") azimuth += (action.degrees ?? 90) * p;
      // A dolly drifts the bearing only slightly while closing distance, so the
      // subject grows and slides rather than rotating on a turntable.
      if (action.move === "dolly") azimuth += (action.degrees ?? 12) * p;
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
    // A FRAMING MUST NOT CROP BY ACCIDENT. A PUSH IS ALLOWED TO ON PURPOSE.
    // The fit is a floor for `frame` and `orbit`, which exist to show the whole
    // subject — but a dolly into a screen is a deliberate crop, and holding it
    // out at the fit distance meant the camera could never actually arrive.
    // An explicit distance on a push or dolly is therefore an instruction
    // rather than a hint.
    // AN EXPLICIT DISTANCE IS AN INSTRUCTION. The auto-fit exists so a scene
    // that says nothing about its camera still frames itself sensibly — it was
    // never meant to overrule an author who has stated where the camera goes.
    // Clamping stated distances to the fit is what left every subject stranded
    // small in the middle of the frame however close the shot asked to be.
    distance = authoredDistance === null ? fit : authoredDistance;

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

  /** ROW LABELS FOR SCORES. A bar chart without names is a set of coloured
   * rectangles — the whole point is that CAT is longer than DOG, which cannot
   * land if neither is named. Projected through the same camera as the meshes
   * so they track the bars through any move, and drawn in screen space so they
   * stay upright and sharp however the camera is angled. */
  const barLabels = React.useMemo(() => {
    const rows: { key: string; text: string; value: number; x: number; y: number; opacity: number }[] = [];
    const bars = resolved.filter((r) => r.object.kind === "bars" && r.opacity > 0.05);
    if (bars.length === 0) return rows;

    const camera = new THREE.PerspectiveCamera(pose.fov, width / height, 0.1, 1000);
    camera.position.set(...pose.position);
    camera.lookAt(new THREE.Vector3(...pose.target));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    for (const b of bars) {
      const series = b.object.series ?? [];
      const scale = b.object.scale ?? 1;
      const rowH = 0.46 * scale;
      const top = ((series.length - 1) * rowH) / 2;
      const left = -(3.4 * scale) / 2;
      series.forEach((sr, i) => {
        const world = b.position.clone().add(new THREE.Vector3(left, top - i * rowH, 0));
        const p = world.project(camera);
        if (p.z > 1) return;
        rows.push({
          key: `${b.object.id}-${sr.label}`,
          text: sr.label,
          value: b.scores[i] ?? sr.value,
          x: (p.x * 0.5 + 0.5) * width,
          y: (-p.y * 0.5 + 0.5) * height,
          opacity: b.opacity,
        });
      });
    }
    return rows;
  }, [resolved, pose, width, height]);

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
              {r.object.kind === "image" ? <SourceImage variant={r.object.source ?? "cat"} /> : null}
              {r.object.kind === "pixelGrid" ? (
                <PixelGrid
                  variant={r.object.source ?? "cat"}
                  detail={r.object.detail ?? 24}
                  spread={r.state === "apart" || r.state === "shuffled" ? 1 : 0}
                  shuffled={r.state === "shuffled" ? 1 : 0}
                />
              ) : null}
              {r.object.kind === "terrain" ? (
                <ImageTerrain
                  variant={r.object.source ?? "cat"}
                  detail={r.object.detail ?? 28}
                  relief={r.object.relief ?? 1.4}
                  colored={r.state === "data" ? 1 : 0}
                  risen={r.extrude}
                />
              ) : null}
              {r.object.kind === "edgeMap" ? <EdgeMap variant={r.object.source ?? "cat"} detail={r.object.detail ?? 40} ink={ACCENTS.profile} /> : null}
              {r.object.kind === "scatter" ? (
                <ScatterSpace points={r.object.points ?? 60} colors={[ACCENTS.profile, ACCENTS.warn, ACCENTS.primary]} query={r.extrude} />
              ) : null}
              {r.object.kind === "bars" ? (
                <ScoreBars
                  series={r.object.series ?? []}
                  values={r.scores}
                  colors={[ACCENTS.success, ACCENTS.warn, ACCENTS.primary, ACCENTS.profile]}
                  dim={light ? "#ded9cc" : "#22293a"}
                />
              ) : null}
              {r.object.kind === "layers" ? (
                <LayerStack progress={r.extrude} variant={r.object.source ?? "cat"} from={ACCENTS.primary} to={ACCENTS.profile} frame={light ? "#1f2a44" : "#94a3b8"} />
              ) : null}
              {r.object.kind === "browserWindow" ? (
                <BrowserWindow
                  peel={r.peel}
                  tabs={r.object.tabs ?? ["Tab", "Tab", "Tab"]}
                  workloads={r.object.workloads ?? []}
                  light={light}
                  accents={ACCENTS}
                />
              ) : null}
              {r.object.kind === "laptop" ? <Laptop light={light} /> : null}
              {r.object.kind === "decode" ? (
                <DecodeBlock
                  label={r.object.label ?? "photo.jpg"}
                  color={ACCENTS[r.object.accent ?? "primary"] ?? ACCENTS.primary}
                  light={light}
                  opened={r.extrude}
                  t={t}
                />
              ) : null}
              {r.object.kind === "tabCard" ? (
                <TabCard
                  label={r.object.label ?? "Tab"}
                  color={ACCENTS[r.object.accent ?? "primary"] ?? ACCENTS.primary}
                  light={light}
                  alive={r.extrude}
                  failing={r.failing}
                  t={t}
                />
              ) : null}
              {r.object.kind === "workload" ? (
                <WorkloadPanel
                  color={ACCENTS[r.object.accent ?? "primary"] ?? ACCENTS.primary}
                  light={light}
                  near={r.extrude}
                />
              ) : null}
              {r.object.kind === "memory" ? (
                <MemoryField capacity={r.object.capacity ?? 240} regions={r.regions} t={t} cool={cool} />
              ) : null}
              {r.object.kind === "plane" ? <StreetMap light={light} /> : null}
              {r.object.kind === "pin" ? <LocationPin color={colour} /> : null}
              {r.object.kind === "motherboard" ? <Motherboard width={6.2} depth={4.6} light={light} /> : null}
              {r.object.kind === "cpuChip" ? <CpuChip light={light} /> : null}
              {r.object.kind === "ramStick" ? <RamStick light={light} /> : null}
              {r.object.kind === "storageDrive" ? <StorageDrive light={light} /> : null}
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
      {barLabels.map((r) => (
        <div
          key={r.key}
          style={{
            position: "absolute",
            left: r.x,
            top: r.y,
            transform: "translate(-100%, -50%)",
            paddingRight: width * 0.022,
            fontFamily: DISPLAY_FONT_FAMILY,
            fontWeight: 800,
            fontSize: width * 0.036,
            color: ink,
            opacity: r.opacity,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            textAlign: "right",
          }}
        >
          {r.text}
          <span style={{ opacity: 0.55, fontWeight: 600, marginLeft: width * 0.014, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(r.value * 100)}
          </span>
        </div>
      ))}
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
      {/* A SOLID BAND BEHIND THE HEADLINE, not a wash.
          A gradient scrim only lightens whatever is behind the type, so red on
          red stayed red on red. A band of the ground colour guarantees the
          headline reads over anything the scene happens to put there. */}
      {beat ? (
        <AbsoluteFill style={{ pointerEvents: "none", opacity: beat.opacity }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              ...(beat.at === "bottom"
                ? { bottom: height * 0.1, height: height * 0.4 }
                : beat.at === "center"
                  ? { top: height * 0.3, height: height * 0.4 }
                  : { top: 0, height: height * 0.34 }),
              background: `linear-gradient(to bottom, transparent 0%, ${ground} 18%, ${ground} 82%, transparent 100%)`,
            }}
          />
        </AbsoluteFill>
      ) : null}
      {beat ? (
        <AbsoluteFill
          style={{
            justifyContent: beat.at === "center" ? "center" : beat.at === "bottom" ? "flex-end" : "flex-start",
            alignItems: "center",
            padding: height * 0.06,
            // THE SUBTITLE OWNS THE BOTTOM OF THE FRAME. A headline pinned to
            // the same edge lands straight on top of the spoken caption and
            // both become unreadable — two pieces of type competing for one
            // band. The headline clears it.
            paddingBottom: beat.at === "bottom" ? height * 0.2 : height * 0.06,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: DISPLAY_FONT_FAMILY,
              fontWeight: 900,
              // SIZED OFF THE SHORTER SIDE. Deriving it from width meant the
              // same headline came out at 78px in portrait and 138px on a
              // 16:9 canvas — nearly double, purely because the frame got
              // wider. The shorter dimension is the one that governs how big
              // type feels, and it makes both aspects agree.
              fontSize: Math.min(width, height) * (beat.size === "huge" ? 0.105 : 0.072),
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
