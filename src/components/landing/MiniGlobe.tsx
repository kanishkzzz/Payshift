"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";

interface MiniGlobeProps {
  className?: string;
  size?: number;
}

export default function MiniGlobe({ className = "", size = 112 }: MiniGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let phi = 0;
    let frame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi,
      theta: 0.22,
      dark: 0.6,
      diffuse: 1.35,
      mapSamples: 9000,
      mapBrightness: 4.5,
      baseColor: [0.2, 0.32, 0.76],
      markerColor: [0.43, 0.5, 1],
      glowColor: [0.38, 0.44, 0.94],
      opacity: 0.92,
      scale: 0.9,
      offset: [0, 0],
      markers: [],
    });

    if (!reducedMotion) {
      const rotate = () => {
        phi += 0.003;
        globe.update({ phi });
        frame = window.requestAnimationFrame(rotate);
      };
      frame = window.requestAnimationFrame(rotate);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      globe.destroy();
    };
  }, [size]);

  return (
    <span className={`tracky-mini-globe ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </span>
  );
}
