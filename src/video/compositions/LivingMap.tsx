import React from "react";
import * as THREE from "three";
import { Billboard, Html, Line } from "@react-three/drei";
import { DISPLAY_FONT_FAMILY } from "../theme";

/**
 * THE LIVING MAP — the signature object of the "Google Maps at scale" episode.
 *
 * The episode's whole argument is that a system survives scale by changing
 * WHAT THE DATA LOOKS LIKE, not by rendering more of it. So this is the one
 * object in this codebase whose representation is driven by live camera
 * distance rather than by an authored state: close in, it draws a handful of
 * individual agents on real roads; pulled back, those give way to a capped
 * field of pulsing points (never literally thousands of meshes — the brief
 * itself asks for "millions of agents without rendering millions of literal
 * cars"); pulled back further, points give way to a soft glow over named
 * regions. Three fixed tiers, cross-faded by distance, not authored per scene.
 *
 * Named "arterial" roads (see NETWORK below) are the only roads a scene can
 * address directly (closures, congestion) — the rest of the grid exists to
 * make the city read as a real network, not as six roads floating alone.
 */

export interface LivingMapRegionDecl {
  id: string;
  label: string;
  /** Fraction of the map's half-extents, -1..1 on each axis. */
  at: [number, number];
  radius: number;
}

export interface LivingMapProps {
  light: boolean;
  t: number;
  cameraDistance: number;
  agentCount: number;
  regions: LivingMapRegionDecl[];
  regionReveal: Record<string, number>;
  tilesReveal: number;
  tilesAt: [number, number];
  roadState: Record<string, "clear" | "congested" | "closed">;
  roadChangedAt: Record<string, number>;
  roadRipple: { roadId: string; startSeconds: number } | null;
}

// ---------------------------------------------------------------------------
// A deterministic city — same seeded-sine trick StreetMap uses, so nothing
// here depends on Math.random() and every render of the same frame is
// pixel-identical.
// ---------------------------------------------------------------------------

function rand(i: number): number {
  const v = Math.sin(i * 127.1) * 43758.5453;
  return v - Math.floor(v);
}

type Road = { id: string; axis: "x" | "z"; pos: number; named?: string };

const NETWORK = (() => {
  const COLS = 8;
  const ROWS = 6;
  const BLOCK = 4.2;
  const ROAD_W = 1.0;
  const PITCH = BLOCK + ROAD_W;
  const centreOf = (i: number, n: number) => (i - (n - 1) / 2) * PITCH;
  // A JITTERED grid, not a perfect one — an untouched uniform lattice is what
  // reads as a UI wireframe instead of a place. The jitter is small enough
  // that the grid a viewer can still count blocks on, but large enough that
  // no two streets sit exactly the "textbook" distance apart, which is what
  // an organic street pattern actually looks like from above.
  const roadsX = Array.from({ length: COLS + 1 }, (_, i) => centreOf(i, COLS) - PITCH / 2 + (rand(i * 3 + 7) - 0.5) * PITCH * 0.22);
  const roadsZ = Array.from({ length: ROWS + 1 }, (_, i) => centreOf(i, ROWS) - PITCH / 2 + (rand(i * 5 + 31) - 0.5) * PITCH * 0.22);
  const halfX = (COLS * PITCH) / 2;
  const halfZ = (ROWS * PITCH) / 2;

  const roads: Road[] = [
    ...roadsX.map((pos, i) => ({ id: `v${i}`, axis: "x" as const, pos })),
    ...roadsZ.map((pos, i) => ({ id: `h${i}`, axis: "z" as const, pos })),
  ];
  // Six named arterials, spread through the grid rather than at its edges —
  // so a closure always has a real alternate on both sides of it (Scene 7).
  const V_NAMED = [1, 4, 7];
  const H_NAMED = [1, 3, 5];
  V_NAMED.forEach((i, k) => {
    const r = roads.find((r) => r.id === `v${i}`);
    if (r) r.named = `arterial-${k + 1}`;
  });
  H_NAMED.forEach((i, k) => {
    const r = roads.find((r) => r.id === `h${i}`);
    if (r) r.named = `arterial-${k + 4}`;
  });
  return { roads, halfX, halfZ };
})();

const ROAD_LOOKUP: Record<string, Road> = Object.fromEntries(NETWORK.roads.filter((r) => r.named).map((r) => [r.named as string, r]));

// Every authored close-in camera shot in this episode frames the map at its
// origin — so the handful of individual agents a street-tier shot can afford
// have to actually BE near the origin, not scattered uniformly across a city
// four times wider than the close-up frame. Sorted nearest-road-first, so a
// count of 1 always lands the hero near the centre rather than off-frame.
const CENTER_SORTED_ROADS = [...NETWORK.roads].sort((a, b) => Math.abs(a.pos) - Math.abs(b.pos));

function roadPoint(road: Road, f: number, y: number): [number, number, number] {
  const wrapped = ((f % 1) + 1) % 1;
  if (road.axis === "x") return [road.pos, y, -NETWORK.halfZ + wrapped * NETWORK.halfZ * 2];
  return [-NETWORK.halfX + wrapped * NETWORK.halfX * 2, y, road.pos];
}

function roadMidpoint(road: Road): [number, number, number] {
  return road.axis === "x" ? [road.pos, 0.06, 0] : [0, 0.06, road.pos];
}

// ---------------------------------------------------------------------------
// LOD math
// ---------------------------------------------------------------------------

const STREET_MAX = 9;
const CITY_MAX = 26;
const BAND = 3;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const p = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return p * p * (3 - 2 * p);
}

const PALETTE = {
  // A DAYLIGHT MAP, not a nighttime data-vis grid — the brief's own palette
  // direction (muted land, deep roads, clear water, warm traffic) describes
  // a real cartographic look, and this is the default this episode uses.
  light: {
    land: "#e7e2d5",
    building: "#c7bfa9",
    minorRoad: "#ffffff",
    arterialRoad: "#f0cf7d",
    roadCongested: "#e8952f",
    roadClosed: "#d1453f",
    water: "#8fb9d9",
    park: "#a3c78a",
    agent: "#2f6fed",
    hero: "#1d4ed8",
    region: ["#3f7d9e", "#8a5aa8", "#c47a2e", "#4d7a5f"],
    glow: "#c9b98f",
    tile: "#5b5347",
  },
  // Kept for a future night-mode scene; not used by this episode's script.
  dark: {
    land: "#342c1c",
    building: "#443a24",
    minorRoad: "#8a8168",
    arterialRoad: "#e0b95f",
    roadCongested: "#e0952f",
    roadClosed: "#e0524f",
    water: "#3f6f8f",
    park: "#3f6b45",
    agent: "#4f8bff",
    hero: "#7dd3fc",
    region: ["#4fae82", "#7c8fe0", "#e08a5f", "#a37ce0"],
    glow: "#ffe08a",
    tile: "#cdd8f0",
  },
};

// ---------------------------------------------------------------------------
// The city artwork — painted once to a canvas, same technique this file
// already uses for the planet's continents (useEarthTexture, above).
//
// A handful of straight `<Line>` objects can never read as a real map: real
// streets subdivide a city into dozens of irregular blocks, and hand-placing
// that many WebGL line objects would be both slow and still visibly a grid.
// A texture has neither problem — arbitrary density and organic shape cost
// nothing once painted, and it paints once, memoized on the palette, not
// every frame. The six NAMED arterials are painted here at their resting
// colour too (so the network reads as one continuous artwork, not a texture
// with lines floating disconnected above it) and then repainted LIVE as thin
// `<Line>` overlays in exactly the same positions when their state changes —
// the only thing that needs to react per-frame is six roads, not the whole
// city.
// ---------------------------------------------------------------------------

type PaletteShape = (typeof PALETTE)["light"];

function useCityTexture(pal: PaletteShape): THREE.CanvasTexture | null {
  return React.useMemo(() => {
    if (typeof document === "undefined") return null;
    const W = 1800;
    const H = Math.round((W * NETWORK.halfZ) / NETWORK.halfX);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { halfX, halfZ } = NETWORK;
    const project = (x: number, z: number): [number, number] => [((x + halfX) / (halfX * 2)) * W, ((z + halfZ) / (halfZ * 2)) * H];

    ctx.fillStyle = pal.land;
    ctx.fillRect(0, 0, W, H);

    // Parks — irregular wobbled blobs, off the street grid entirely, drawn
    // before streets so a street visibly cuts across one the way it would in
    // a real park bordering a road.
    const parkCentres: { x: number; z: number; r: number }[] = [];
    let seed = 1;
    for (let i = 0; i < 11; i++) {
      const cx = (rand(seed++) - 0.5) * halfX * 1.7;
      const cz = (rand(seed++) - 0.5) * halfZ * 1.7;
      const rWorld = 0.9 + rand(seed++) * 1.7;
      parkCentres.push({ x: cx, z: cz, r: rWorld });
      const r = rWorld * (W / (halfX * 2));
      const [px, py] = project(cx, cz);
      ctx.beginPath();
      const pts = 10;
      for (let k = 0; k <= pts; k++) {
        const ang = (k / pts) * Math.PI * 2;
        const wobble = 0.65 + rand(seed++) * 0.55;
        const x = px + Math.cos(ang) * r * wobble;
        const y = py + Math.sin(ang) * r * wobble * 0.72;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = pal.park;
      ctx.fill();
    }

    // River — a smooth curve through a handful of control points, not a
    // straight band, with a soft pale bank on either side.
    const riverPts: [number, number][] = [
      [-halfX * 1.15, -halfZ * 0.55],
      [-halfX * 0.55, -halfZ * 0.18],
      [-halfX * 0.12, halfZ * 0.12],
      [halfX * 0.2, halfZ * 0.42],
      [halfX * 0.65, halfZ * 0.7],
      [halfX * 1.15, halfZ * 1.05],
    ].map(([x, z]) => project(x, z)) as [number, number][];
    const drawRiverPath = () => {
      ctx.beginPath();
      ctx.moveTo(riverPts[0][0], riverPts[0][1]);
      for (let i = 1; i < riverPts.length - 1; i++) {
        const mx = (riverPts[i][0] + riverPts[i + 1][0]) / 2;
        const my = (riverPts[i][1] + riverPts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(riverPts[i][0], riverPts[i][1], mx, my);
      }
      ctx.lineTo(riverPts[riverPts.length - 1][0], riverPts[riverPts.length - 1][1]);
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = pal.water;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = W * 0.05;
    drawRiverPath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.water;
    ctx.lineWidth = W * 0.024;
    drawRiverPath();
    ctx.stroke();

    // Streets — a recursive irregular block subdivision rather than a
    // uniform grid: real cities are made of blocks of varying size, and a
    // street only sometimes runs the full width of the map. Each split
    // becomes one segment bounded to the rectangle it actually divides,
    // which is what produces streets that start and stop rather than every
    // line spanning edge to edge.
    type Seg = { a: [number, number]; b: [number, number] };
    type Leaf = { x0: number; z0: number; x1: number; z1: number };
    const segs: Seg[] = [];
    const leaves: Leaf[] = [];
    let sc = 900;
    const subdivide = (x0: number, z0: number, x1: number, z1: number, depth: number) => {
      const w = x1 - x0;
      const h = z1 - z0;
      if (depth <= 0 || (w < 2.4 && h < 2.4)) {
        leaves.push({ x0, z0, x1, z1 });
        return;
      }
      const vertical = w >= h;
      const t = 0.3 + rand(sc++) * 0.4;
      if (vertical) {
        const sx = x0 + w * t;
        segs.push({ a: [sx, z0], b: [sx, z1] });
        subdivide(x0, z0, sx, z1, depth - 1);
        subdivide(sx, z0, x1, z1, depth - 1);
      } else {
        const sz = z0 + h * t;
        segs.push({ a: [x0, sz], b: [x1, sz] });
        subdivide(x0, z0, x1, sz, depth - 1);
        subdivide(x0, sz, x1, z1, depth - 1);
      }
    };
    subdivide(-halfX, -halfZ, halfX, halfZ, 6);
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = W * 0.0032;
    for (const s of segs) {
      const [ax, ay] = project(...s.a);
      const [bx, by] = project(...s.b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Building footprints — a soft inset block in a random subset of leaves,
    // just enough to say "something is built here" at close range without
    // pretending to be illustrated architecture. Skipped near the river so
    // nothing appears to be floating on water.
    let bc = 4000;
    for (const leaf of leaves) {
      if (rand(bc++) > 0.62) continue;
      const cx = (leaf.x0 + leaf.x1) / 2;
      const cz = (leaf.z0 + leaf.z1) / 2;
      const nearPark = parkCentres.some((p) => Math.hypot(cx - p.x, cz - p.z) < p.r * 1.05);
      if (nearPark) continue;
      const [cpx, cpy] = project(cx, cz);
      const riverPxAt = riverPts.reduce((closest, p) => (Math.hypot(p[0] - cpx, p[1] - cpy) < Math.hypot(closest[0] - cpx, closest[1] - cpy) ? p : closest), riverPts[0]);
      if (Math.hypot(cpx - riverPxAt[0], cpy - riverPxAt[1]) < W * 0.035) continue;
      const inset = 0.22 + rand(bc++) * 0.14;
      const bx0 = leaf.x0 + (leaf.x1 - leaf.x0) * inset;
      const bz0 = leaf.z0 + (leaf.z1 - leaf.z0) * inset;
      const bx1 = leaf.x1 - (leaf.x1 - leaf.x0) * inset;
      const bz1 = leaf.z1 - (leaf.z1 - leaf.z0) * inset;
      const [px0, py0] = project(bx0, bz0);
      const [px1, py1] = project(bx1, bz1);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(px0 + 2, py0 + 3, px1 - px0, py1 - py0);
      ctx.fillStyle = pal.building;
      ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
    }

    // Named arterials, baked at their resting colour — the live overlay
    // repaints exactly these when a scene changes their state.
    ctx.strokeStyle = pal.arterialRoad;
    ctx.lineWidth = W * 0.008;
    for (const road of NETWORK.roads.filter((r) => r.named)) {
      const a: [number, number] = road.axis === "x" ? [road.pos, -halfZ] : [-halfX, road.pos];
      const b: [number, number] = road.axis === "x" ? [road.pos, halfZ] : [halfX, road.pos];
      const [ax, ay] = project(...a);
      const [bx, by] = project(...b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [pal]);
}

export const LivingMap: React.FC<LivingMapProps> = ({
  light,
  t,
  cameraDistance,
  agentCount,
  regions,
  regionReveal,
  tilesReveal,
  tilesAt,
  roadState,
  roadChangedAt,
  roadRipple,
}) => {
  const pal = light ? PALETTE.light : PALETTE.dark;
  const cityTexture = useCityTexture(pal);

  // Cross-fade weights, not a hard cut — the representation change is the
  // lesson, so it has to be watched happening rather than popping.
  const streetWeight = 1 - smoothstep(STREET_MAX - BAND, STREET_MAX + BAND, cameraDistance);
  const continentWeight = smoothstep(CITY_MAX - BAND, CITY_MAX + BAND, cameraDistance);
  const cityWeight = Math.max(0, 1 - streetWeight - continentWeight);
  const roadWeight = Math.max(streetWeight, cityWeight);

  // --- roads ---------------------------------------------------------------
  // Only the six NAMED arterials get a live overlay line — every other
  // street is baked into the city texture above and never changes, so it
  // costs nothing to redraw it every frame. This is what a scene's
  // congestion/closure colour actually animates.
  const roadLines = React.useMemo(() => {
    return NETWORK.roads
      .filter((road) => road.named)
      .map((road) => {
        const state = roadState[road.named as string] ?? "clear";
        const changedAt = roadChangedAt[road.named as string] ?? -10;
        const blend = Math.min(1, Math.max(0, (t - changedAt) / 0.6));
        const targetColor = state === "closed" ? pal.roadClosed : state === "congested" ? pal.roadCongested : pal.arterialRoad;
        const color = new THREE.Color(pal.arterialRoad).lerp(new THREE.Color(targetColor), blend).getStyle();
        const a = road.axis === "x" ? ([road.pos, 0.045, -NETWORK.halfZ] as [number, number, number]) : ([-NETWORK.halfX, 0.045, road.pos] as [number, number, number]);
        const b = road.axis === "x" ? ([road.pos, 0.045, NETWORK.halfZ] as [number, number, number]) : ([NETWORK.halfX, 0.045, road.pos] as [number, number, number]);
        return { id: road.id, points: [a, b], color, opacity: 0.95 * roadWeight };
      });
  }, [t, roadState, roadChangedAt, roadWeight, pal]);

  // --- street-tier individual agents ---------------------------------------
  const STREET_CAP = 22;
  const streetAgents = React.useMemo(() => {
    const n = Math.min(agentCount, STREET_CAP);
    const list: { key: string; pos: [number, number, number]; hero: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const road = CENTER_SORTED_ROADS[i % CENTER_SORTED_ROADS.length];
      // A slow crawl clustered around the middle third of the road, not a
      // fast full-length transit — this is a close-up meant to hold a viewer's
      // eye on a couple of individual journeys, not simulate real traffic.
      const speed = 0.008 + rand(i) * 0.012;
      const offset = 0.35 + rand(i + 50) * 0.3;
      const f = offset + speed * t;
      // A road just marked "closed" bends nearby traffic onto the parallel
      // road one lane over instead of letting it drive straight through —
      // the local reroute the ripple beat needs, without real pathfinding.
      let lateral = 0;
      if (road.named && roadState[road.named] === "closed") lateral = 1.4;
      const [x, y, z] = roadPoint(road, f, 0.1);
      const pos: [number, number, number] = road.axis === "x" ? [x + lateral, y, z] : [x, y, z + lateral];
      list.push({ key: `s${i}`, pos, hero: i === 0 });
    }
    return list;
  }, [agentCount, t, roadState]);

  // --- city-tier capped point field -----------------------------------------
  const cityPoints = React.useMemo(() => {
    const n = Math.min(200, Math.max(10, Math.round(agentCount / 40)));
    const list: { key: string; pos: [number, number, number]; phase: number }[] = [];
    for (let i = 0; i < n; i++) {
      const road = NETWORK.roads[i % NETWORK.roads.length];
      const speed = 0.03 + rand(i + 300) * 0.04;
      const offset = rand(i + 700);
      const f = offset + speed * t;
      list.push({ key: `c${i}`, pos: roadPoint(road, f, 0.08), phase: rand(i + 900) });
    }
    return list;
  }, [agentCount, t]);

  // --- ripple ----------------------------------------------------------------
  const ripple = React.useMemo(() => {
    if (!roadRipple) return null;
    const road = ROAD_LOOKUP[roadRipple.roadId];
    if (!road) return null;
    const elapsed = t - roadRipple.startSeconds;
    if (elapsed < 0 || elapsed > 2.2) return null;
    const p = elapsed / 2.2;
    return { center: roadMidpoint(road), radius: 1 + p * 7, opacity: (1 - p) * 0.8 };
  }, [roadRipple, t]);

  const glowIntensity = Math.min(1, Math.log10(agentCount + 1) / 3.5);

  return (
    <group>
      {/* Ground — self-lit a little, not just directional-lit: a flat top-down
          shot barely catches any directional light at all, and a dark theme's
          land colour is dark BY DESIGN (it has to hold against a glowing
          agent field), so without its own glow it reads as pure void instead
          of a paved surface. */}
      {/* Sized many times past the actual city footprint, deliberately — at
          the widest authored continent shot, a plane sized to just the road
          network showed its own straight edge as a floating card in a void.
          The real world does not stop at the edge of the mapped city; the
          land keeps going, just featureless past what this city bothered to
          build roads on. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[NETWORK.halfX * 9, NETWORK.halfZ * 9]} />
        <meshStandardMaterial color={pal.land} roughness={1} emissive={pal.land} emissiveIntensity={light ? 0 : 0.55} />
      </mesh>

      {/* The painted city — streets, blocks, parks and the river, all one
          texture (see useCityTexture above). Fades in as the camera nears
          street/city distance and back out at continent distance, so the
          continent tier keeps showing the plain, honest "no detail resolved
          from here" land instead of a shrunk copy of the close-up artwork. */}
      {cityTexture && roadWeight > 0.02 ? (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[NETWORK.halfX * 2.15, NETWORK.halfZ * 2.15]} />
          <meshBasicMaterial map={cityTexture} transparent opacity={roadWeight} toneMapped={false} />
        </mesh>
      ) : null}

      {/* The six named arterials, live on top of the baked artwork — the
          only roads a scene's congestion/closure state actually animates. */}
      {roadLines.map((r) => (r.opacity > 0.02 ? <Line key={r.id} points={r.points} color={r.color} lineWidth={4.2} transparent opacity={r.opacity} /> : null))}

      {/* Ripple: the local consequence of a road event, expanding and fading. */}
      {ripple ? (
        <mesh position={ripple.center} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(0.1, ripple.radius - 0.35), ripple.radius, 48]} />
          <meshBasicMaterial color={pal.roadClosed} transparent opacity={ripple.opacity} />
        </mesh>
      ) : null}

      {/* Street tier: individual agents, visible close in. */}
      {streetWeight > 0.03
        ? streetAgents.map((a) => (
            <group key={a.key} position={a.pos}>
              <mesh>
                <sphereGeometry args={[a.hero ? 0.16 : 0.11, 12, 12]} />
                <meshStandardMaterial
                  color={a.hero ? pal.hero : pal.agent}
                  emissive={a.hero ? pal.hero : pal.agent}
                  emissiveIntensity={a.hero ? 0.9 : 0.5}
                  transparent
                  opacity={streetWeight}
                />
              </mesh>
            </group>
          ))
        : null}

      {/* City tier: a capped field of pulsing points standing in for "many". */}
      {cityWeight > 0.03
        ? cityPoints.map((p) => {
            const pulse = 0.6 + 0.4 * Math.sin(t * 2 + p.phase * Math.PI * 2);
            return (
              <mesh key={p.key} position={p.pos}>
                <sphereGeometry args={[0.06, 6, 6]} />
                <meshBasicMaterial color={pal.agent} transparent opacity={cityWeight * pulse} />
              </mesh>
            );
          })
        : null}

      {/* Continent tier: agents give way entirely to a soft glow. */}
      {continentWeight > 0.03 ? (
        <group>
          {[1, 0.6, 0.32].map((f, i) => (
            <mesh key={`glow${i}`} position={[0, 0.03 + i * 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[Math.max(NETWORK.halfX, NETWORK.halfZ) * (0.5 + i * 0.35), 48]} />
              <meshBasicMaterial color={pal.glow} transparent opacity={continentWeight * glowIntensity * f * 0.22} />
            </mesh>
          ))}
        </group>
      ) : null}

      {/* Regions: declared once, revealed on cue. */}
      {regions.map((region, i) => {
        const reveal = regionReveal[region.id] ?? 0;
        if (reveal <= 0.01) return null;
        const worldX = region.at[0] * NETWORK.halfX * 0.82;
        const worldZ = region.at[1] * NETWORK.halfZ * 0.82;
        const color = pal.region[i % pal.region.length];
        return (
          <group key={region.id}>
            <mesh position={[worldX, 0.02, worldZ]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[region.radius, 40]} />
              <meshBasicMaterial color={color} transparent opacity={0.22 * reveal} />
            </mesh>
            <Billboard position={[worldX, 1.6, worldZ]}>
              <Html center distanceFactor={11} style={{ pointerEvents: "none", opacity: reveal }}>
                <div
                  style={{
                    fontFamily: DISPLAY_FONT_FAMILY,
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color,
                    textShadow: light ? "0 1px 3px rgba(255,255,255,0.9)" : "0 1px 4px rgba(0,0,0,0.8)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {region.label}
                </div>
              </Html>
            </Billboard>
          </group>
        );
      })}

      {/* Tiles: a small grid patch reveals near the point currently in focus. */}
      {tilesReveal > 0.02 ? (
        <group>
          {(() => {
            const cx = tilesAt[0] * NETWORK.halfX * 0.7;
            const cz = tilesAt[1] * NETWORK.halfZ * 0.7;
            const size = 2.6;
            const cells: React.ReactNode[] = [];
            for (let gx = -1; gx <= 1; gx++) {
              for (let gz = -1; gz <= 1; gz++) {
                const x0 = cx + gx * size - size / 2;
                const z0 = cz + gz * size - size / 2;
                const pts: [number, number, number][] = [
                  [x0, 0.07, z0],
                  [x0 + size, 0.07, z0],
                  [x0 + size, 0.07, z0 + size],
                  [x0, 0.07, z0 + size],
                  [x0, 0.07, z0],
                ];
                cells.push(<Line key={`${gx}-${gz}`} points={pts} color={pal.tile} lineWidth={1.4} transparent opacity={tilesReveal * (streetWeight + cityWeight)} />);
              }
            }
            return cells;
          })()}
        </group>
      ) : null}
    </group>
  );
};
