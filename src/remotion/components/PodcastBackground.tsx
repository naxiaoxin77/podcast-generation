import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config.js";
import { fontFamily } from "../fonts.js";

interface Particle {
  x: number;      // % from left
  y: number;      // % from top
  size: number;   // px
  opacity: number;
  speedX: number; // fraction of width per second
  speedY: number;
  phase: number;  // phase offset for breathing
}

// Deterministic pseudo-random seeded particles (stable across frames)
function createParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const seed = i * 137.508; // golden angle
    particles.push({
      x: ((Math.sin(seed) * 0.5 + 0.5) * 90 + 5),
      y: ((Math.cos(seed * 1.3) * 0.5 + 0.5) * 80 + 10),
      size: designConfig.particles.minSize + (Math.abs(Math.sin(seed * 2)) * (designConfig.particles.maxSize - designConfig.particles.minSize)),
      opacity: designConfig.particles.minOpacity + (Math.abs(Math.cos(seed * 3)) * (designConfig.particles.maxOpacity - designConfig.particles.minOpacity)),
      speedX: (Math.sin(seed * 5) * 0.004),
      speedY: (Math.cos(seed * 7) * 0.003),
      phase: seed % (Math.PI * 2),
    });
  }
  return particles;
}

const PARTICLES = createParticles(designConfig.particles.count);

export const PodcastBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps; // time in seconds

  return (
    <AbsoluteFill
      style={{
        background: designConfig.theme.background,
        fontFamily,
      }}
    >
      {PARTICLES.map((p, i) => {
        // Slow drift
        const x = (p.x + p.speedX * t * 100) % 100;
        const y = (p.y + p.speedY * t * 100) % 100;
        // Breathing opacity
        const breathe = Math.sin(t * 0.5 + p.phase) * 0.15;
        const opacity = Math.max(0.1, Math.min(0.8, p.opacity + breathe));

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: designConfig.particles.color,
              opacity,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
