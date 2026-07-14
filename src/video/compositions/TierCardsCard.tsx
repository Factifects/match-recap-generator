import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";
import type { SharedVisualProps, TierCardsData } from "../sharedVisualProps";

const CARD_WIDTH = 320;
const CARD_WIDTH_PORTRAIT = 280;

/** A row of pricing/package tiers — for "here's the ladder of options" beats
 * (edition pricing, membership levels) that Bar Chart/Treemap can size but
 * can't caption with a name + price + tagline per entry. `featured` raises
 * and highlights one tier (a bold accent border, lifted a little above the
 * others) rather than every tier competing for the same weight. */
export const TierCardsCard: React.FC<{ data: TierCardsData } & SharedVisualProps> = ({
  data: { title, tiers },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const cardWidth = isPortrait ? CARD_WIDTH_PORTRAIT : CARD_WIDTH;
  const titleOpacity = fadeIn(frame, 0, 10);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div>
        {title && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 48 }}>{title}</div>}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap", justifyContent: "center", maxWidth: isPortrait ? 900 : 1700 }}>
          {tiers.map((tier, index) => {
            const start = 12 + index * 8;
            const opacity = fadeIn(frame, start, 14);
            const y = slideIn(frame, start, 16, 30);

            return (
              <div
                key={tier.name}
                style={{
                  opacity,
                  transform: `translateY(${y - (tier.featured ? 24 : 0)}px)`,
                  width: cardWidth,
                  background: tier.featured ? "#20264a" : COLORS.panel,
                  border: `2px solid ${tier.featured ? COLORS.accent : COLORS.border}`,
                  borderRadius: 22,
                  padding: "36px 28px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: tier.featured ? `0 0 40px rgba(79,107,255,0.35)` : "none",
                }}
              >
                {tier.featured && (
                  <div
                    style={{
                      fontFamily: FONT_FAMILY,
                      fontWeight: 700,
                      fontSize: 16,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: COLORS.accent,
                    }}
                  >
                    Featured
                  </div>
                )}
                <div
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontWeight: 700,
                    fontSize: 24,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: COLORS.textDim,
                    textAlign: "center",
                  }}
                >
                  {tier.name}
                </div>
                <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: 64, color: COLORS.text, lineHeight: 1 }}>{tier.price}</div>
                {tier.tagline && (
                  <div style={{ fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: 20, color: COLORS.textDim, textAlign: "center" }}>
                    {tier.tagline}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
