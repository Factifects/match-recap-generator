import React from "react";
import { staticFile, Img } from "remotion";
import { luminance } from "../brandTile";
import type { StageBox } from "../../script/stageLayout";

// The Stage medium's object vocabulary, as drawn shapes.
//
// THE RULE EVERY SHAPE HERE OBEYS: a silhouette must be recognisable WITHOUT
// its label. That is a much harder bar than "visually distinct", and it is the
// one this project has failed before — a hexagon and a diamond were
// geometrically different and meant nothing to a viewer. So every kind here is
// either a real-world object with a universal outline (a padlock, a phone, a
// TV, a database cylinder, a rack) or an explicitly generic card (`note`,
// `service`) that is honest about being generic.
//
// The corollary matters just as much: a rounded rectangle with three ticks
// inside it is not a silhouette, it is a rectangle. If a kind cannot be given a
// genuinely recognisable outline, it should not be a kind — it should be a
// `service` with a good label.
//
// Split out of StageCard.tsx purely for size: that file owns timing, folding
// and composition, this one owns nothing but geometry.

export interface SilhouetteProps {
  box: StageBox;
  stroke: string;
  fill: string;
  strokeWidth: number;
}

export const Silhouette: React.FC<SilhouetteProps> = ({ box, stroke, fill, strokeWidth }) => {
  return (
    <g>
      <Shape box={box} stroke={stroke} fill={fill} strokeWidth={strokeWidth} />
      {box.replicas > 1 ? <Multiplicity box={box} stroke={stroke} /> : null}
    </g>
  );
};

/** The REAL brand mark, resolved from Simple Icons and cached at generation
 * time (assets/brandRegistry.ts). When an object is a recognisable product, a
 * hand-drawn approximation of its logo is never acceptable and a generic
 * silhouette is a last resort — the mark is that object's identity, and the
 * silhouette underneath it carries what KIND of thing it is. A monochrome mark
 * is tinted to the object's own accent so it participates in state changes
 * (a service going red takes its logo with it) instead of sitting on top as a
 * sticker; a multi-colour mark is left alone, because recolouring a brand's own
 * palette misrepresents it. */
export const BrandMark: React.FC<{ box: StageBox; size: number; cx: number; cy: number }> = ({ box, size, cx, cy }) => {
  if (!box.logoPath) return null;
  const href = staticFile(box.logoPath);
  // CONTRAST, decided from the brand's OWN colour rather than guessed.
  // Simple Icons ships a hex per brand, so relative luminance tells us whether
  // a mark can survive on this stage's near-black ground:
  //   - a bright monochrome mark (Netflix #E50914) is painted in its own colour;
  //   - a dark one (GitHub, OpenAI, Anthropic are all effectively black) would
  //     vanish, so it is painted light instead — recognisable beats literal;
  //   - a FULL-COLOUR mark carries its own palette, often including dark
  //     elements we must not repaint, so it gets a light plate behind it.
  // This is the same rule brandTile.ts already applies on the diagram side; the
  // two now agree instead of each deciding contrast for themselves.
  const brandLum = box.logoHex ? luminance(box.logoHex) : 1;
  const tooDarkForStage = brandLum < 0.06;
  const paint = box.logoHex && !tooDarkForStage ? `#${box.logoHex.replace("#", "")}` : "#f2f6ff";
  const needsPlate = !box.logoMonochrome;
  // A monochrome Simple Icons mark is a BLACK shape on a transparent ground.
  // Drawing it directly onto a near-black stage renders it invisible — which is
  // exactly what happened to Cassandra. It has to be TINTED, and the only way
  // to recolour an external SVG is to use it as a mask and paint through it.
  // `foreignObject` is what lets that CSS technique live inside the camera's
  // transformed coordinate space alongside everything else.
  //
  // A full-colour mark is drawn as-is: masking it would throw away the colour
  // that makes it recognisable in the first place.
  return (
    <>
      {needsPlate ? (
        <rect
          x={cx - size * 0.62}
          y={cy - size * 0.62}
          width={size * 1.24}
          height={size * 1.24}
          rx={size * 0.2}
          fill="rgba(244, 247, 255, 0.94)"
        />
      ) : null}
    <foreignObject x={cx - size / 2} y={cy - size / 2} width={size} height={size}>
      <div
        style={
          box.logoMonochrome
            ? {
                width: "100%",
                height: "100%",
                backgroundColor: paint,
                WebkitMaskImage: `url(${href})`,
                maskImage: `url(${href})`,
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }
            : {
                width: "100%",
                height: "100%",
                backgroundImage: `url(${href})`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backgroundSize: "contain",
              }
        }
      />
    </foreignObject>
    </>
  );
};


/** The drawn fallback when no real code could be fetched.
 *
 * Deliberately structural rather than random-looking: three finder squares in
 * the corners and a field of modules between them. Those three squares are what
 * makes the shape read instantly as a QR code at a glance, and — for the video
 * this was built for — they are also the part that error correction does NOT
 * protect. The module field is seeded from its own coordinates so it is stable
 * across frames; a pattern that reshuffled every frame would strobe. */
const QrModules: React.FC<{ cx: number; cy: number; side: number }> = ({ cx, cy, side }) => {
  const N = 25;
  const cell = side / N;
  const left = cx - side / 2;
  const top = cy - side / 2;
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);

  const modules: React.ReactNode[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (inFinder(r, c)) continue;
      // Cheap deterministic hash — stable per cell, visually unpatterned.
      const h = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
      if (h - Math.floor(h) < 0.48) continue;
      modules.push(<rect key={`${r}-${c}`} x={left + c * cell} y={top + r * cell} width={cell} height={cell} fill="#0b0f16" />);
    }
  }

  const finder = (r: number, c: number) => (
    <g key={`f-${r}-${c}`}>
      <rect x={left + c * cell} y={top + r * cell} width={cell * 7} height={cell * 7} fill="#0b0f16" />
      <rect x={left + (c + 1) * cell} y={top + (r + 1) * cell} width={cell * 5} height={cell * 5} fill="#f7f9fc" />
      <rect x={left + (c + 2) * cell} y={top + (r + 2) * cell} width={cell * 3} height={cell * 3} fill="#0b0f16" />
    </g>
  );

  return (
    <g>
      {modules}
      {finder(0, 0)}
      {finder(0, N - 7)}
      {finder(N - 7, 0)}
    </g>
  );
};




/** WHERE THE STREETS ARE, as numbers — exported so anything travelling on them
 * (cars, a route, a rider walking a block) runs down an actual road instead of
 * floating across the map on its own private path. Uneven spacing from a fixed
 * sequence, so blocks differ in size the way real ones do. */
export function cityStreetLines(w: number, h: number): { verticals: number[]; horizontals: number[] } {
  const spread = (n: number, seed: number, span: number) => {
    const out: number[] = [];
    let at = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.sin(i * seed) * 1000;
      at += 0.55 + (j - Math.floor(j)) * 0.9;
      out.push(at);
    }
    const total = out[out.length - 1];
    return out.map((v) => (v / total) * span);
  };
  return { verticals: spread(9, 12.9898, w), horizontals: spread(13, 78.233, h) };
}

/** A STREET NETWORK, drawn to look like somewhere rather than like graph paper.
 *
 * The difference is irregularity and hierarchy: real cities have a few wide
 * arterials, many narrow streets at uneven spacing, blocks of different sizes,
 * usually something cutting across the grain, and a river or park that the grid
 * has to work around. An even lattice of identical squares reads as a
 * coordinate system, which is exactly the note this replaced. Everything here
 * is deterministic — a city that reshuffled every frame would strobe. */
export const CityMap: React.FC<{ x: number; y: number; w: number; h: number; atSeconds?: number }> = ({ x, y, w, h, atSeconds = 0 }) => {
  const { verticals, horizontals } = cityStreetLines(w, h);
  const road = Math.max(3, w * 0.011);
  const casing = road * 1.9;
  // The river's horizontal position at a given depth, so bridges can be put
  // exactly where roads cross it instead of floating near it.
  const riverAt = (ty: number) => x + w * (0.63 + Math.sin(ty * 5.6) * 0.075);

  return (
    <g fill="none">
      {/* BLOCKS first, so the roads are drawn ON them and read as cut through
          the city rather than laid beside it. Filled, never outlined: their
          outlines were what made this frame noisy, and a map with no blocks at
          all is just graph paper with a river on it. */}
      <g fill="rgba(150, 172, 216, 0.11)" stroke="none">
        {horizontals.slice(0, -1).map((hh, r) =>
          verticals.slice(0, -1).map((v, c) => {
            const bw = verticals[c + 1] - v;
            const bh = horizontals[r + 1] - hh;
            if (bw < w * 0.03 || bh < h * 0.02) return null;
            const seed = Math.sin(r * 41.3 + c * 17.7) * 6521.9;
            const rand = seed - Math.floor(seed);
            if (rand < 0.14) return null;
            const inset = 0.1 + rand * 0.12;
            return (
              <rect
                key={`b${r}-${c}`}
                x={x + v + bw * inset}
                y={y + hh + bh * inset}
                width={bw * (1 - inset * 2)}
                height={bh * (1 - inset * 2)}
                rx={Math.min(bw, bh) * 0.06}
              />
            );
          }),
        )}
      </g>

      {/* ROADS, drawn as a dark casing with a lighter core. That pairing is why
          a road on a map reads as a road and a line on a chart reads as a line —
          the casing separates it from whatever it crosses. */}
      <g strokeLinecap="butt">
        <g stroke="rgba(6, 9, 14, 0.9)" strokeWidth={casing}>
          {verticals.map((v, i) => (
            <line key={`vc${i}`} x1={x + v} y1={y} x2={x + v} y2={y + h} />
          ))}
          {horizontals.map((hh, i) => (
            <line key={`hc${i}`} x1={x} y1={y + hh} x2={x + w} y2={y + hh} />
          ))}
        </g>
        <g stroke="rgba(168, 190, 232, 0.3)" strokeWidth={road}>
          {verticals.map((v, i) => (
            <line key={`v${i}`} x1={x + v} y1={y} x2={x + v} y2={y + h} />
          ))}
          {horizontals.map((hh, i) => (
            <line key={`h${i}`} x1={x} y1={y + hh} x2={x + w} y2={y + hh} />
          ))}
        </g>
      </g>

      {/* JUNCTIONS. Every crossing gets a node, which is the detail that turns a
          lattice into a street network — you can see where you would be able to
          turn. */}
      <g fill="rgba(190, 208, 240, 0.34)">
        {horizontals.map((hh, r) =>
          verticals.map((v, c) => (
            <rect
              key={`j${r}-${c}`}
              x={x + v - road * 0.62}
              y={y + hh - road * 0.62}
              width={road * 1.24}
              height={road * 1.24}
              rx={road * 0.3}
            />
          )),
        )}
      </g>

      {/* THE RIVER, drawn over the roads so it cuts them — then the bridges put
          three of them back. A river that everything drives straight through is
          not a river. */}
      <path
        d={`M ${riverAt(0)} ${y} C ${riverAt(0.2)} ${y + h * 0.24}, ${riverAt(0.45)} ${y + h * 0.42}, ${riverAt(0.6)} ${y + h * 0.62} S ${riverAt(0.85)} ${y + h * 0.88}, ${riverAt(1)} ${y + h}`}
        stroke="rgba(38, 96, 128, 0.85)"
        strokeWidth={Math.max(6, w * 0.03)}
        strokeLinecap="round"
      />

      {/* BRIDGES: the roads that survive the water, with their decks picked out.
          Three of them, at the horizontals nearest the crossings. */}
      <g>
        {[0.22, 0.5, 0.78].map((ty, i) => {
          const cy = y + h * ty;
          const cx = riverAt(ty);
          const span = Math.max(14, w * 0.06);
          return (
            <g key={`br${i}`}>
              <rect x={cx - span} y={cy - casing * 0.75} width={span * 2} height={casing * 1.5} fill="rgba(10, 14, 20, 0.95)" rx={road * 0.2} />
              <rect x={cx - span} y={cy - road * 0.5} width={span * 2} height={road} fill="rgba(198, 216, 248, 0.5)" />
              {/* Rails, so it reads as a bridge and not as a patched road. */}
              <rect x={cx - span} y={cy - casing * 0.75} width={span * 2} height={road * 0.28} fill="rgba(198, 216, 248, 0.4)" />
              <rect x={cx - span} y={cy + casing * 0.55} width={span * 2} height={road * 0.28} fill="rgba(198, 216, 248, 0.4)" />
            </g>
          );
        })}
      </g>

      {/* TRAFFIC. `atSeconds` is supplied by the caller and can simply stop
          advancing — when the explanation moves from "this is a city" to "this
          is how it is divided", the cars holding still is what lets the viewer
          read the grid instead of chasing movement. */}
      <g>
        {Array.from({ length: 20 }, (_, i) => {
          const seed = Math.sin(i * 57.31) * 8123.7;
          const rand = seed - Math.floor(seed);
          const horizontal = i % 2 === 0;
          const speed = 0.05 + rand * 0.06;
          const along = ((atSeconds * speed + rand) % 1.2) - 0.1;
          if (along < 0 || along > 1) return null;
          const lane = horizontal ? horizontals[i % horizontals.length] : verticals[i % verticals.length];
          const forward = i % 4 < 2;
          const t = forward ? along : 1 - along;
          const cx = horizontal ? x + w * t : x + lane;
          const cy = horizontal ? y + lane : y + h * t;
          const size = Math.max(3.5, Math.min(w, h) * 0.012);
          return (
            <g key={`car${i}`}>
              <rect
                x={cx - (horizontal ? size : size * 0.62)}
                y={cy - (horizontal ? size * 0.62 : size)}
                width={horizontal ? size * 2 : size * 1.24}
                height={horizontal ? size * 1.24 : size * 2}
                rx={size * 0.42}
                fill="rgba(240, 246, 255, 0.9)"
              />
              <rect
                x={cx + (horizontal ? (forward ? size : -size * 2.6) : -size * 0.31)}
                y={cy + (horizontal ? -size * 0.31 : forward ? size : -size * 2.6)}
                width={horizontal ? size * 1.6 : size * 0.62}
                height={horizontal ? size * 0.62 : size * 1.6}
                fill="rgba(245, 200, 120, 0.32)"
              />
            </g>
          );
        })}
      </g>
    </g>
  );
};

/** THE CELLS OF A HEX MAP, as geometry — exported so the shape and anything
 * drawn on top of it (heat, a highlighted cell, a rider crossing a boundary)
 * agree on where every cell is instead of each computing its own and drifting
 * apart by a pixel. Flat-topped rows, offset every other row, which is how a
 * real tiling of a city looks. */
export function hexCells(
  box: { x: number; y: number; width: number; height: number },
  mode: "grid" | "neighbours",
  cols: number,
): { cx: number; cy: number; r: number; index: number }[] {
  if (mode === "neighbours") {
    // One cell and the six that touch it. The point being made is that all six
    // are the SAME distance from the middle, so they are placed from a circle
    // rather than from a grid.
    const r = Math.min(box.width, box.height) * 0.19;
    const step = r * Math.sqrt(3);
    const cells = [{ cx: box.x, cy: box.y, r, index: 0 }];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      cells.push({ cx: box.x + Math.cos(angle) * step, cy: box.y + Math.sin(angle) * step, r, index: i + 1 });
    }
    return cells;
  }

  const r = box.width / (cols * Math.sqrt(3));
  const stepX = r * Math.sqrt(3);
  const stepY = r * 1.5;
  const rows = Math.max(3, Math.round(box.height / stepY));
  const cells: { cx: number; cy: number; r: number; index: number }[] = [];
  let index = 0;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? stepX / 2 : 0;
    for (let col = 0; col < cols; col++) {
      const cx = box.x - box.width / 2 + stepX / 2 + col * stepX + offset;
      const cy = box.y - box.height / 2 + r + row * stepY;
      if (cx + r > box.x + box.width / 2 + 1) continue;
      cells.push({ cx, cy, r, index: index++ });
    }
  }
  return cells;
}

/** One pointy-topped hexagon as a path. */
export function hexPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push(`${(cx + Math.cos(angle) * r).toFixed(2)} ${(cy + Math.sin(angle) * r).toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

/** HOW MANY, without drawing the box again.
 *
 * Offsetting N ghost copies behind a shape was the obvious first idea and it is
 * a bad one: at any real N it degenerates into a pile of overlapping rectangles
 * with no readable outline, it fights every label sitting on top of it, and it
 * makes a fleet look like a rendering artefact rather than a quantity.
 *
 * Instead the count lives INSIDE the object as a row of instance pips plus an
 * explicit multiplier. That reads as "one thing, many instances" — which is
 * what a replica set actually is — stays legible at any N, and never disturbs
 * the silhouette the viewer is using to identify the object. */
const Multiplicity: React.FC<{ box: StageBox; stroke: string }> = ({ box, stroke }) => {
  const shown = Math.min(box.replicas, 12);
  const railW = box.width * 0.62;
  const pipR = Math.max(2.5, Math.min(railW / (shown * 2.6), box.height * 0.035));
  const gap = shown > 1 ? (railW - pipR * 2) / (shown - 1) : 0;
  const startX = box.x - railW / 2 + pipR;
  const pipY = box.y + box.height / 2 - box.height * 0.075;
  const badge = box.height * 0.16;

  return (
    <g>
      {Array.from({ length: shown }, (_, i) => (
        <circle key={i} cx={startX + i * gap} cy={pipY} r={pipR} fill={stroke} opacity={0.85} />
      ))}
      <text
        x={box.x + box.width / 2 - box.width * 0.06}
        y={box.y - box.height / 2 + badge * 1.3}
        textAnchor="end"
        fill={stroke}
        fontFamily='"JetBrains Mono", "SF Mono", Menlo, monospace'
        fontWeight={700}
        fontSize={badge}
      >
        {`\u00d7${box.replicas}`}
      </text>
    </g>
  );
};

const Shape: React.FC<SilhouetteProps> = ({ box, stroke, fill, strokeWidth }) => {
  const w = box.width;
  const h = box.height;
  const x = box.x - w / 2;
  const y = box.y - h / 2;
  const cx = box.x;
  const cy = box.y;
  const common = { stroke, fill, strokeWidth, strokeLinejoin: "round" as const };
  const line = { stroke, fill: "none", strokeWidth: strokeWidth * 0.8, strokeLinecap: "round" as const };

  switch (box.kind) {
    // ---- typography -------------------------------------------------------
    case "phrase":
      // NO SHAPE AT ALL. The words are the object; a frame around them would
      // turn a sentence back into a card, which is the thing this kind exists
      // to avoid.
      return null;

    // ---- quantities -------------------------------------------------------
    case "clock": {
      // TIME. A dial with a sweep hand — the one drawing of duration that
      // needs no label in any language.
      const r = Math.min(w, h) * 0.42;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} {...common} />
          <circle cx={cx} cy={cy} r={r * 0.86} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.5} opacity={0.5} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (Math.PI / 6) * i;
            const inner = r * (i % 3 === 0 ? 0.66 : 0.76);
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * inner}
                y1={cy + Math.sin(a) * inner}
                x2={cx + Math.cos(a) * r * 0.88}
                y2={cy + Math.sin(a) * r * 0.88}
                stroke={stroke}
                strokeWidth={strokeWidth * (i % 3 === 0 ? 0.9 : 0.5)}
                strokeLinecap="round"
              />
            );
          })}
          <line x1={cx} y1={cy} x2={cx} y2={cy - r * 0.55} {...line} strokeWidth={strokeWidth * 1.1} />
          <line x1={cx} y1={cy} x2={cx + r * 0.42} y2={cy + r * 0.18} {...line} strokeWidth={strokeWidth * 1.1} />
          <circle cx={cx} cy={cy} r={r * 0.07} fill={stroke} />
        </g>
      );
    }
    case "road": {
      // DISTANCE. A road running to a vanishing point, with the centre line
      // dashed — how far, drawn as the thing you travel along.
      const topW = w * 0.24;
      const botW = w * 0.86;
      const top = cy - h * 0.4;
      const bot = cy + h * 0.4;
      return (
        <g>
          <path d={`M ${cx - topW / 2} ${top} L ${cx + topW / 2} ${top} L ${cx + botW / 2} ${bot} L ${cx - botW / 2} ${bot} Z`} {...common} />
          <line x1={cx} y1={top + h * 0.06} x2={cx} y2={bot - h * 0.04} {...line} strokeWidth={strokeWidth * 1.1} strokeDasharray={`${h * 0.09} ${h * 0.07}`} />
        </g>
      );
    }
    case "money": {
      // AN AMOUNT. A banknote with a second note behind it, which reads as
      // money at any size without needing a currency symbol that would tie the
      // shape to one country.
      const noteW = w * 0.82;
      const noteH = h * 0.62;
      return (
        <g>
          <rect x={cx - noteW / 2 + w * 0.05} y={cy - noteH / 2 - h * 0.09} width={noteW} height={noteH} rx={noteH * 0.12} {...common} opacity={0.55} />
          <rect x={cx - noteW / 2} y={cy - noteH / 2 + h * 0.06} width={noteW} height={noteH} rx={noteH * 0.12} {...common} />
          <circle cx={cx} cy={cy + h * 0.06} r={noteH * 0.24} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.8} />
          <line x1={cx - noteW * 0.36} y1={cy + h * 0.06} x2={cx - noteW * 0.26} y2={cy + h * 0.06} {...line} />
          <line x1={cx + noteW * 0.26} y1={cy + h * 0.06} x2={cx + noteW * 0.36} y2={cy + h * 0.06} {...line} />
        </g>
      );
    }

    // ---- maps -------------------------------------------------------------
    case "hexmap": {
      // A CITY AS TILES — and it has to read as a CITY first, or the tiling is
      // just a honeycomb. So the streets are drawn INSIDE the map's own bounds,
      // underneath the cells, and the cells are translucent outlines laid over
      // them. That is also what the real thing looks like: every surge map any
      // rider has ever seen is a see-through overlay on a road network, not an
      // opaque grid floating on its own.
      const mode = box.hex?.mode ?? "grid";
      // Nothing of its own. The city is the BACKDROP, running edge to edge, and
      // the tiling is laid over it by the renderer — a boxed mini-map floating
      // on a background that was already a city read as two cities at once.
      void mode;
      return null;
    }

    // ---- encodings --------------------------------------------------------
    case "qr": {
      // A QR CODE, dark-on-light because that is what a scanner needs and what
      // a viewer recognises. The light plate is not decoration: inverted codes
      // do not reliably scan, so a code drawn in the stage's own palette would
      // stop being a QR code and become a picture of one.
      const side = Math.min(w, h);
      const quiet = side * 0.055;
      return (
        <g>
          <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} rx={side * 0.035} fill="#f7f9fc" stroke={stroke} strokeWidth={strokeWidth} />
          {box.qrPath ? (
            // Remotion's <Img> inside a foreignObject: the renderer waits for
            // it, which matters more here than anywhere else in the medium —
            // half a QR code is not a slightly worse frame, it is a code that
            // does not resolve.
            <foreignObject x={cx - side / 2 + quiet} y={cy - side / 2 + quiet} width={side - quiet * 2} height={side - quiet * 2}>
              <Img src={staticFile(box.qrPath)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </foreignObject>
          ) : (
            <QrModules cx={cx} cy={cy} side={side - quiet * 2} />
          )}
        </g>
      );
    }

    // ---- structure --------------------------------------------------------
    case "region":
      // A quiet frame BEHIND its children. Nesting must read as depth, not as
      // another box competing for attention, so this is deliberately the
      // faintest thing the medium draws.
      return <rect x={x} y={y} width={w} height={h} rx={16} fill="rgba(148,163,184,0.04)" stroke={stroke} strokeWidth={strokeWidth * 0.7} strokeDasharray="14 10" opacity={0.7} />;

    // ---- devices ----------------------------------------------------------
    case "tv": {
      const screenH = h * 0.76;
      return (
        <g>
          <rect x={x} y={y} width={w} height={screenH} rx={8} {...common} />
          <line x1={cx} y1={y + screenH} x2={cx} y2={y + h * 0.9} {...line} />
          <line x1={cx - w * 0.2} y1={y + h * 0.9} x2={cx + w * 0.2} y2={y + h * 0.9} {...line} strokeWidth={strokeWidth * 1.3} />
        </g>
      );
    }
    case "phone": {
      // Corner radius scales with WIDTH, and generously. A phone is identifiable
      // by being tall, narrow and very round-cornered; capping the radius at a
      // fixed 18px meant any large phone rendered as a plain rectangle.
      const r = w * 0.17;
      const bezel = w * 0.075;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={r} {...common} />
          {/* The inset screen is most of what makes the outline read as a
              handset rather than as a card. */}
          <rect
            x={x + bezel}
            y={y + bezel * 1.7}
            width={w - bezel * 2}
            height={h - bezel * 3.6}
            rx={r * 0.65}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth * 0.55}
            opacity={0.5}
          />
          <rect x={cx - w * 0.13} y={y + bezel * 0.55} width={w * 0.26} height={Math.max(3, h * 0.011)} rx={3} fill={stroke} opacity={0.8} />
          <line x1={cx - w * 0.15} y1={y + h - bezel * 0.85} x2={cx + w * 0.15} y2={y + h - bezel * 0.85} {...line} strokeWidth={strokeWidth * 0.9} />
        </g>
      );
    }
    case "laptop": {
      const screenH = h * 0.72;
      return (
        <g>
          <rect x={x + w * 0.08} y={y} width={w * 0.84} height={screenH} rx={6} {...common} />
          <path d={`M ${x} ${y + h} L ${x + w * 0.06} ${y + screenH} L ${x + w * 0.94} ${y + screenH} L ${x + w} ${y + h} Z`} {...common} />
        </g>
      );
    }
    case "browser": {
      const barH = Math.min(h * 0.24, 34);
      const dotR = Math.min(barH * 0.16, 6);
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={12} {...common} />
          <line x1={x} y1={y + barH} x2={x + w} y2={y + barH} stroke={stroke} strokeWidth={strokeWidth * 0.7} opacity={0.75} />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={x + 18 + i * (dotR * 3.2)} cy={y + barH / 2} r={dotR} fill={stroke} opacity={0.85} />
          ))}
        </g>
      );
    }
    case "client": {
      const headR = Math.min(h * 0.16, 20);
      const headY = y + h * 0.28;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={14} {...common} />
          <circle cx={cx} cy={headY} r={headR} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.9} />
          <path d={`M ${cx - headR * 1.7} ${headY + headR * 2.1} A ${headR * 1.7} ${headR * 1.5} 0 0 1 ${cx + headR * 1.7} ${headY + headR * 2.1}`} {...line} />
        </g>
      );
    }

    // ---- network ----------------------------------------------------------
    case "cdn": {
      // A globe with edge nodes on it — "the same content, near everybody".
      const r = Math.min(w, h) * 0.36;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} {...common} />
          <ellipse cx={cx} cy={cy} rx={r * 0.45} ry={r} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={0.65} />
          <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} {...line} strokeWidth={strokeWidth * 0.6} opacity={0.65} />
          {[-0.62, 0, 0.62].map((a, i) => (
            <circle key={i} cx={cx + Math.cos(a * Math.PI + Math.PI / 2) * r} cy={cy + Math.sin(a * Math.PI + Math.PI / 2) * r} r={Math.max(3, r * 0.13)} fill={stroke} />
          ))}
        </g>
      );
    }
    case "gateway": {
      // A portal — the thing a request passes THROUGH. Confined to the bottom
      // third so it cannot strike through the node's own centred label.
      const archW = Math.min(w * 0.3, h * 0.5);
      const archTop = y + h * 0.62;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={10} {...common} />
          <path
            d={`M ${cx - archW / 2} ${y + h - h * 0.08} L ${cx - archW / 2} ${archTop} A ${archW / 2} ${archW / 2} 0 0 1 ${cx + archW / 2} ${archTop} L ${cx + archW / 2} ${y + h - h * 0.08}`}
            {...line}
            opacity={0.8}
          />
        </g>
      );
    }
    case "loadBalancer": {
      // One line in, three out — the shape IS the behaviour.
      const inX = x + w * 0.14;
      const splitX = cx;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={10} {...common} />
          <line x1={inX} y1={cy} x2={splitX} y2={cy} {...line} />
          {[-1, 0, 1].map((d, i) => (
            <path key={i} d={`M ${splitX} ${cy} Q ${splitX + w * 0.18} ${cy} ${x + w * 0.86} ${cy + d * h * 0.26}`} {...line} opacity={0.85} />
          ))}
        </g>
      );
    }

    // ---- compute ----------------------------------------------------------
    case "server": {
      // A RACK: stacked units with their own bezels and LEDs.
      const units = 3;
      const pad = h * 0.055;
      const unitH = (h - pad * (units + 1)) / units;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={8} {...common} />
          {Array.from({ length: units }, (_, i) => {
            const uy = y + pad + i * (unitH + pad);
            return (
              <g key={i}>
                <rect x={x + w * 0.055} y={uy} width={w * 0.89} height={unitH} rx={4} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={0.6} />
                <circle cx={x + w * 0.12} cy={uy + unitH / 2} r={Math.max(2.5, unitH * 0.12)} fill={stroke} opacity={0.9} />
                <circle cx={x + w * 0.19} cy={uy + unitH / 2} r={Math.max(2.5, unitH * 0.12)} fill={stroke} opacity={0.42} />
              </g>
            );
          })}
        </g>
      );
    }
    case "container": {
      // A shipping container: corrugated body with end caps.
      const ribs = 5;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={5} {...common} />
          <line x1={x + w * 0.12} y1={y} x2={x + w * 0.12} y2={y + h} stroke={stroke} strokeWidth={strokeWidth * 0.7} opacity={0.7} />
          <line x1={x + w * 0.88} y1={y} x2={x + w * 0.88} y2={y + h} stroke={stroke} strokeWidth={strokeWidth * 0.7} opacity={0.7} />
          {Array.from({ length: ribs }, (_, i) => {
            const rx2 = x + w * (0.22 + (i * 0.56) / (ribs - 1));
            return <line key={i} x1={rx2} y1={y + h * 0.12} x2={rx2} y2={y + h * 0.88} stroke={stroke} strokeWidth={strokeWidth * 0.45} opacity={0.4} />;
          })}
        </g>
      );
    }
    case "worker": {
      // A cog — the universal "something is doing work" mark.
      const r = Math.min(w, h) * 0.3;
      const teeth = 8;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={10} {...common} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.9} />
          <circle cx={cx} cy={cy} r={r * 0.42} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.7} opacity={0.8} />
          {Array.from({ length: teeth }, (_, i) => {
            const a = (i / teeth) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * r}
                y1={cy + Math.sin(a) * r}
                x2={cx + Math.cos(a) * r * 1.32}
                y2={cy + Math.sin(a) * r * 1.32}
                stroke={stroke}
                strokeWidth={strokeWidth * 0.9}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      );
    }
    case "function":
      // A lambda — short-lived compute, no machine implied.
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={12} {...common} />
          <path d={`M ${cx - w * 0.14} ${cy - h * 0.2} q ${w * 0.06} ${-h * 0.06} ${w * 0.1} ${h * 0.06} l ${w * 0.14} ${h * 0.42}`} {...line} strokeWidth={strokeWidth * 1.1} />
          <path d={`M ${cx + w * 0.14} ${cy - h * 0.2} l ${-w * 0.26} ${h * 0.48}`} {...line} strokeWidth={strokeWidth * 1.1} />
        </g>
      );

    // ---- state ------------------------------------------------------------
    case "database": {
      const lip = Math.min(h * 0.17, 26);
      return (
        <g>
          <path d={`M ${x} ${y + lip} L ${x} ${y + h - lip} A ${w / 2} ${lip} 0 0 0 ${x + w} ${y + h - lip} L ${x + w} ${y + lip} Z`} {...common} />
          <ellipse cx={cx} cy={y + lip} rx={w / 2} ry={lip} {...common} />
        </g>
      );
    }
    case "cache": {
      // A chip: body plus pins down both sides.
      const pin = Math.min(w * 0.07, 16);
      return (
        <g>
          <rect x={x + pin} y={y} width={w - pin * 2} height={h} rx={8} {...common} />
          {[0, 1, 2].map((i) => {
            const py = y + h * (0.25 + i * 0.25);
            return (
              <g key={i}>
                <line x1={x} y1={py} x2={x + pin} y2={py} {...line} />
                <line x1={x + w - pin} y1={py} x2={x + w} y2={py} {...line} />
              </g>
            );
          })}
        </g>
      );
    }
    case "storage": {
      // A bucket — object storage, distinct from a relational cylinder.
      const lip = h * 0.13;
      return (
        <g>
          <ellipse cx={cx} cy={y + lip} rx={w / 2} ry={lip} {...common} />
          <path d={`M ${x} ${y + lip} L ${x + w * 0.14} ${y + h - lip * 0.6} A ${w * 0.36} ${lip} 0 0 0 ${x + w - w * 0.14} ${y + h - lip * 0.6} L ${x + w} ${y + lip}`} {...common} />
        </g>
      );
    }
    case "table": {
      // A real table: header row plus body rows and a column rule.
      const headerH = h * 0.26;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={6} {...common} />
          <line x1={x} y1={y + headerH} x2={x + w} y2={y + headerH} stroke={stroke} strokeWidth={strokeWidth * 0.8} />
          <line x1={x + w * 0.42} y1={y + headerH} x2={x + w * 0.42} y2={y + h} stroke={stroke} strokeWidth={strokeWidth * 0.5} opacity={0.5} />
          {[0.5, 0.72].map((f, i) => (
            <line key={i} x1={x} y1={y + h * f} x2={x + w} y2={y + h * f} stroke={stroke} strokeWidth={strokeWidth * 0.4} opacity={0.4} />
          ))}
        </g>
      );
    }
    case "queue": {
      const slots = 4;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={8} {...common} />
          {Array.from({ length: slots - 1 }, (_, i) => (
            <line key={i} x1={x + (w / slots) * (i + 1)} y1={y} x2={x + (w / slots) * (i + 1)} y2={y + h} stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={0.55} />
          ))}
        </g>
      );
    }

    // ---- media & data -----------------------------------------------------
    case "stream": {
      // A waveform — media in motion, not a file at rest.
      const bars = 11;
      const step = (w * 0.8) / bars;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={10} {...common} />
          {Array.from({ length: bars }, (_, i) => {
            const amp = Math.abs(Math.sin(i * 1.1)) * h * 0.3 + h * 0.05;
            const bx = x + w * 0.1 + i * step + step / 2;
            return <line key={i} x1={bx} y1={cy - amp} x2={bx} y2={cy + amp} stroke={stroke} strokeWidth={Math.max(2, step * 0.34)} strokeLinecap="round" opacity={0.85} />;
          })}
        </g>
      );
    }
    case "code": {
      // An editor pane: gutter, plus placeholder rules ONLY when the object
      // carries no real source. Drawing the fake lines underneath real code
      // renders ghost rules through the text — scenery competing with the thing
      // it was standing in for.
      const gutter = w * 0.13;
      const rows = 5;
      const hasRealCode = !!box.code && box.code.length > 0;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={8} {...common} />
          <line x1={x + gutter} y1={y} x2={x + gutter} y2={y + h} stroke={stroke} strokeWidth={strokeWidth * 0.5} opacity={0.5} />
          {hasRealCode ? null : (
          <>{Array.from({ length: rows }, (_, i) => {
            const ly = y + h * (0.2 + i * 0.16);
            const indent = i === 1 || i === 2 ? w * 0.1 : 0;
            const len = [0.6, 0.42, 0.5, 0.3, 0.55][i] * w;
            return <line key={i} x1={x + gutter + w * 0.06 + indent} y1={ly} x2={x + gutter + w * 0.06 + indent + len} y2={ly} stroke={stroke} strokeWidth={strokeWidth * 0.8} opacity={0.6} strokeLinecap="round" />;
          })}</>
          )}
        </g>
      );
    }

    // ---- security ---------------------------------------------------------
    case "token": {
      // A ticket with a punched notch — a bearer credential.
      const notch = h * 0.2;
      return (
        <g>
          <path
            d={`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${cy - notch} A ${notch} ${notch} 0 0 0 ${x + w} ${cy + notch} L ${x + w} ${y + h} L ${x} ${y + h} L ${x} ${cy + notch} A ${notch} ${notch} 0 0 0 ${x} ${cy - notch} Z`}
            {...common}
          />
          <line x1={x + w * 0.68} y1={y + h * 0.2} x2={x + w * 0.68} y2={y + h * 0.8} stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeDasharray="5 5" opacity={0.7} />
        </g>
      );
    }
    case "lock": {
      // A padlock. Nothing else means "this is closed" as immediately.
      const bodyY = y + h * 0.42;
      const shackleR = w * 0.26;
      return (
        <g>
          <path d={`M ${cx - shackleR} ${bodyY} L ${cx - shackleR} ${y + h * 0.26} A ${shackleR} ${shackleR} 0 0 1 ${cx + shackleR} ${y + h * 0.26} L ${cx + shackleR} ${bodyY}`} {...line} strokeWidth={strokeWidth * 1.1} />
          <rect x={cx - w * 0.38} y={bodyY} width={w * 0.76} height={h * 0.5} rx={7} {...common} />
          <circle cx={cx} cy={bodyY + h * 0.22} r={Math.max(3, w * 0.06)} fill={stroke} />
        </g>
      );
    }

    case "note":
      return <rect x={x} y={y} width={w} height={h} rx={10} {...common} strokeDasharray="10 8" />;
    case "service":
    default:
      return <rect x={x} y={y} width={w} height={h} rx={14} {...common} />;
  }
};

/** Where a silhouette's own label may sit without colliding with the artwork
 * drawn inside it. Shapes that occupy their own centre push their text clear. */
export function labelOffsetFor(box: StageBox): number {
  switch (box.kind) {
    case "browser":
      return box.height * 0.16;
    case "client":
      return box.height * 0.26;
    case "database":
    case "storage":
      return box.height * 0.1;
    case "tv":
    case "laptop":
      return -box.height * 0.06;
    // These draw artwork through their own middle, so the label rides above it.
    case "gateway":
    case "worker":
    case "cdn":
    case "function":
    case "stream":
    case "loadBalancer":
      return -box.height * 0.17;
    case "lock":
      return -box.height * 0.34;
    case "code":
    case "table":
      return -box.height * 0.36;
    // A region labels itself in its own header band, above its children.
    case "region":
      return -box.height * 0.4;
    default:
      return 0;
  }
}


/** The internal zones of an object box.
 *
 * Text clashes inside a box were being fixed one at a time — a label over a
 * rack's bezels, a plate over a brand mark, a sublabel over the replica pips —
 * and each fix created the next collision. They all have the same cause: four
 * different pieces of content were each positioned against the box independently
 * with no shared notion of what space was already taken. This computes the
 * whole stack ONCE, top to bottom, so the pieces cannot collide with each other
 * however the silhouette underneath is drawn.
 *
 * Order down the box: badge (its own corner), logo, label, sublabel, pips rail. */
export interface BoxZones {
  logo: { cx: number; cy: number; size: number } | null;
  labelY: number;
  sublabelY: number;
  plate: { x: number; y: number; width: number; height: number } | null;
}

export function boxZones(box: StageBox, labelPx: number, subPx: number, offset: number): BoxZones {
  const top = box.y - box.height / 2;
  const hasLogo = !!box.logoPath;
  const hasSub = !!box.sublabel;
  const pipsReserve = box.replicas > 1 ? box.height * 0.16 : box.height * 0.06;

  // Vertical budget for the text stack, below the logo and above the pips.
  const logoSize = hasLogo ? Math.min(box.width * 0.42, box.height * 0.4) : 0;
  const logoTop = top + box.height * 0.09;
  const stackTop = hasLogo ? logoTop + logoSize + box.height * 0.05 : top + box.height * 0.2;
  const stackBottom = box.y + box.height / 2 - pipsReserve;
  const stackH = labelPx + (hasSub ? subPx * 1.35 : 0);
  // Centre the text stack in whatever room is left, then apply the shape's own
  // offset (a gateway's arch, a lock's shackle) but never past the pips.
  let stackY = stackTop + Math.max(0, (stackBottom - stackTop - stackH) / 2);
  stackY = Math.min(Math.max(stackY, stackTop), Math.max(stackTop, stackBottom - stackH));
  if (!hasLogo) stackY += offset;

  const labelY = stackY + labelPx * 0.82;
  const sublabelY = labelY + subPx * 1.25;
  const plateW = Math.min(box.width * 0.94, Math.max(120, (box.label?.length ?? 0) * labelPx * 0.58 + labelPx * 0.6));

  return {
    logo: hasLogo ? { cx: box.x, cy: logoTop + logoSize / 2, size: logoSize } : null,
    labelY,
    sublabelY,
    plate: box.label
      ? { x: box.x - plateW / 2, y: stackY - labelPx * 0.28, width: plateW, height: stackH + labelPx * 0.4 }
      : null,
  };
}
