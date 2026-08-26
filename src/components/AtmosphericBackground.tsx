import { useMemo } from 'react';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function generateStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.5 + 0.5,
      duration: Math.random() * 4 + 2,
      delay: Math.random() * 5,
      opacity: Math.random() * 0.5 + 0.2,
    });
  }
  return stars;
}

export default function AtmosphericBackground() {
  const stars = useMemo(() => generateStars(80), []);

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      style={{ backgroundColor: 'var(--color-app-bg)' }}
    >
      {/* Deep space gradient layers */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(8,25,60,0.6) 0%, transparent 60%), ' +
            'radial-gradient(ellipse at 80% 20%, rgba(12,30,70,0.4) 0%, transparent 50%)',
        }}
      />

      {/* Subtle bronze mission glow — top right */}
      <div
        className="absolute top-0 right-0 rounded-full"
        style={{
          width: '40vw',
          height: '40vw',
          background: 'radial-gradient(circle, rgba(184,122,85,0.04) 0%, transparent 70%)',
          transform: 'translate(15%, -15%)',
        }}
      />

      {/* Subtle deep blue atmosphere — bottom left */}
      <div
        className="absolute bottom-0 left-0 rounded-full"
        style={{
          width: '55vw',
          height: '45vw',
          background: 'radial-gradient(circle, rgba(10,40,90,0.35) 0%, transparent 70%)',
          transform: 'translate(-20%, 20%)',
        }}
      />

      {/* Stars */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full star-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: star.id % 7 === 0 ? '#D6A84F' : '#E8E2D9',
            opacity: star.opacity,
            '--duration': `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          } as React.CSSProperties}
        />
      ))}

      {/* Extremely faint nav grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(30,60,100,0.05) 1px, transparent 1px), ' +
            'linear-gradient(to bottom, rgba(30,60,100,0.05) 1px, transparent 1px)',
          backgroundSize: '6rem 6rem',
        }}
      />
    </div>
  );
}
