import React from "react";
import { staticFile } from "remotion";

// The CONCRETE WORLD vocabulary — the minimum needed to show a viewer where
// information comes from before anything is abstracted.
//
// Three composable graphics, not a scene library and not a character system. A
// facade becomes a gym because of the word on its sign; a phone becomes the
// narrative anchor because of what is on its screen. Nothing here knows anything
// about advertising, and nothing here should ever grow a per-episode variant.
//
// Style is deliberately flat and editorial: a stylised device reads instantly as
// a phone, where an attempt at a realistic one would land in the same trap as
// the rendered city — a viewer having to work out what they are looking at
// before they can start learning.

export interface WorldObjectProps {
  /** Centre, in projected px. */
  x: number;
  y: number;
  /** Longest dimension, in projected px. */
  size: number;
  color: string;
  accent: string;
  opacity: number;
}

/** A phone. The narrative anchor: it asks the question in the first shot (an ad
 * nobody can explain) and answers it in the last. Its microphone is drawn as a
 * real, addressable feature rather than an icon, because one beat of the episode
 * is the camera going to it and watching nothing come out. */
export const DeviceGraphic: React.FC<
  WorldObjectProps & {
    screen?: {
      kind?: "blank" | "ad" | "search" | "map" | "home";
      text?: string;
      logoPath?: string;
      logoHex?: string;
      micHighlight?: boolean;
    };
    /** 0..1 pulse for the microphone ring, when highlighted. */
    pulse?: number;
  }
> = ({ x, y, size, color, accent, opacity, screen, pulse = 0 }) => {
  const height = size;
  const width = size * 0.49;
  const left = x - width / 2;
  const top = y - height / 2;
  const radius = width * 0.13;
  const bezel = width * 0.055;
  const screenX = left + bezel;
  const screenY = top + bezel * 2.2;
  const screenW = width - bezel * 2;
  const screenH = height - bezel * 4.4;
  const micY = top + height - bezel * 1.1;
  const kind = screen?.kind ?? "blank";

  return (
    <g opacity={opacity}>
      <rect x={left} y={top} width={width} height={height} rx={radius} fill={color} />
      <rect x={screenX} y={screenY} width={screenW} height={screenH} rx={radius * 0.7} fill="#fbf9f3" />
      {/* Earpiece slot and the microphone opening. The mic is its own element so
          a beat can point the camera at it. */}
      <rect x={x - width * 0.11} y={top + bezel * 0.9} width={width * 0.22} height={bezel * 0.5} rx={bezel * 0.25} fill="#fbf9f3" opacity={0.45} />
      <circle cx={x} cy={micY} r={bezel * 0.42} fill="#fbf9f3" opacity={0.55} />
      {screen?.micHighlight ? (
        <>
          <circle cx={x} cy={micY} r={bezel * (1.6 + pulse * 1.9)} fill="none" stroke={accent} strokeWidth={2} opacity={0.75 * (1 - pulse)} />
          <circle cx={x} cy={micY} r={bezel * 0.42} fill={accent} />
        </>
      ) : null}

      {kind === "ad" ? (
        <g>
          <rect x={screenX + screenW * 0.08} y={screenY + screenH * 0.2} width={screenW * 0.84} height={screenH * 0.5} rx={radius * 0.6} fill="#ffffff" stroke="#e2ddd0" strokeWidth={1.5} />
          {screen?.logoPath ? (
            <image
              href={staticFile(screen.logoPath)}
              x={x - screenW * 0.12}
              y={screenY + screenH * 0.26}
              width={screenW * 0.24}
              height={screenW * 0.24}
              preserveAspectRatio="xMidYMid meet"
            />
          ) : null}
          <text x={x} y={screenY + screenH * 0.58} fill="#1b1a16" fontSize={screenW * 0.1} fontWeight={800} textAnchor="middle" fontFamily='"Inter", sans-serif'>
            {screen?.text ?? ""}
          </text>
          <text x={x} y={screenY + screenH * 0.66} fill="#9a9384" fontSize={screenW * 0.062} textAnchor="middle" fontFamily='"Inter", sans-serif' letterSpacing={1}>
            SPONSORED
          </text>
        </g>
      ) : null}

      {kind === "search" ? (
        <g>
          <rect x={screenX + screenW * 0.08} y={screenY + screenH * 0.14} width={screenW * 0.84} height={screenH * 0.11} rx={screenH * 0.055} fill="#ffffff" stroke="#d8d2c4" strokeWidth={1.5} />
          <circle cx={screenX + screenW * 0.17} cy={screenY + screenH * 0.195} r={screenW * 0.028} fill="none" stroke="#9a9384" strokeWidth={2} />
          <text x={screenX + screenW * 0.24} y={screenY + screenH * 0.215} fill="#1b1a16" fontSize={screenW * 0.072} fontFamily='"Inter", sans-serif'>
            {screen?.text ?? ""}
          </text>
          {/* A caret, so the screen reads as being typed into right now. */}
          <rect x={screenX + screenW * 0.24 + (screen?.text?.length ?? 0) * screenW * 0.039} y={screenY + screenH * 0.155} width={2} height={screenH * 0.075} fill={accent} opacity={pulse > 0.5 ? 1 : 0.15} />
        </g>
      ) : null}

      {kind === "map" ? (
        <g stroke="#ddd6c6" strokeWidth={2} fill="none">
          <path d={`M ${screenX} ${screenY + screenH * 0.35} L ${screenX + screenW} ${screenY + screenH * 0.3}`} />
          <path d={`M ${screenX} ${screenY + screenH * 0.62} L ${screenX + screenW} ${screenY + screenH * 0.68}`} />
          <path d={`M ${screenX + screenW * 0.35} ${screenY} L ${screenX + screenW * 0.42} ${screenY + screenH}`} />
          <circle cx={x} cy={screenY + screenH * 0.5} r={screenW * 0.07} fill={accent} stroke="none" />
        </g>
      ) : null}

      {kind === "home" ? (
        <g fill="#e6e0d2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect
              key={i}
              x={screenX + screenW * (0.16 + (i % 3) * 0.26)}
              y={screenY + screenH * (0.22 + Math.floor(i / 3) * 0.22)}
              width={screenW * 0.17}
              height={screenW * 0.17}
              rx={screenW * 0.045}
            />
          ))}
        </g>
      ) : null}
    </g>
  );
};

/** A place. Doorway, sign, a couple of structural details — and the sign is what
 * makes it a gym or a sports shop. One object, many places, on purpose. */
export const FacadeGraphic: React.FC<WorldObjectProps & { sign?: string }> = ({ x, y, size, color, accent, opacity, sign }) => {
  const width = size;
  const height = size * 0.78;
  const left = x - width / 2;
  const top = y - height / 2;
  const signHeight = height * 0.22;
  const doorWidth = width * 0.26;

  return (
    <g opacity={opacity}>
      <rect x={left} y={top + signHeight} width={width} height={height - signHeight} rx={width * 0.02} fill="none" stroke={color} strokeWidth={2.5} />
      {/* Sign board — the thing that names the place. */}
      <rect x={left} y={top} width={width} height={signHeight} rx={width * 0.015} fill={accent} />
      <text
        x={x}
        y={top + signHeight * 0.62}
        fill="#fbf9f3"
        fontSize={Math.min(signHeight * 0.52, width * 0.11)}
        fontWeight={800}
        letterSpacing={1.6}
        textAnchor="middle"
        fontFamily='"Inter", sans-serif'
      >
        {sign ?? ""}
      </text>
      {/* Doorway, centred, open — a figure can walk into it. */}
      <rect x={x - doorWidth / 2} y={top + height - height * 0.46} width={doorWidth} height={height * 0.46} rx={doorWidth * 0.06} fill={color} opacity={0.14} stroke={color} strokeWidth={2} />
      {/* Two windows, purely so the elevation reads as a building. */}
      <rect x={left + width * 0.08} y={top + signHeight + height * 0.14} width={width * 0.22} height={height * 0.2} fill={color} opacity={0.1} />
      <rect x={left + width * 0.7} y={top + signHeight + height * 0.14} width={width * 0.22} height={height * 0.2} fill={color} opacity={0.1} />
    </g>
  );
};

/** Minimal human presence — a silhouette, for orientation and causality only.
 * Not a rig, not a character, and not to be extended into one. */
export const FigureGraphic: React.FC<WorldObjectProps & { pose?: "stand" | "walk" | "enterLeft" | "enterRight" }> = ({ x, y, size, color, opacity, pose = "stand" }) => {
  const height = size;
  const top = y - height / 2;
  const headR = height * 0.13;
  const shoulder = top + headR * 2.4;
  const hip = top + height * 0.58;
  const foot = top + height;
  const stride = pose === "walk" ? height * 0.11 : height * 0.045;
  const lean = pose === "enterLeft" ? -height * 0.05 : pose === "enterRight" ? height * 0.05 : 0;

  return (
    <g opacity={opacity} fill="none" stroke={color} strokeWidth={Math.max(2.5, height * 0.055)} strokeLinecap="round">
      <circle cx={x + lean} cy={top + headR} r={headR} fill={color} stroke="none" />
      <path d={`M ${x + lean} ${shoulder} L ${x + lean * 0.6} ${hip}`} />
      <path d={`M ${x + lean * 0.6} ${hip} L ${x - stride} ${foot}`} />
      <path d={`M ${x + lean * 0.6} ${hip} L ${x + stride} ${foot}`} />
      {/* One arm only, held close — the hand that carries the phone. */}
      <path d={`M ${x + lean} ${shoulder + height * 0.06} L ${x + lean + stride * 0.8} ${hip - height * 0.02}`} />
    </g>
  );
};
