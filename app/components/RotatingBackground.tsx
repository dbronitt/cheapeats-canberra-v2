'use client';

import { useEffect, useState } from 'react';

// Background images from public/images folder
const backgroundImages = [
  '/images/daniel-morton-V_pvQ96focY-unsplash.jpg',
  '/images/harry-burk-27ERaPj8bPs-unsplash.jpg',
  '/images/social-estate-P-t9yap_20M-unsplash.jpg',
];

export default function RotatingBackground() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % backgroundImages.length);
    }, 8000); // Change image every 8 seconds

    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 overflow-hidden" 
      style={{ 
        zIndex: -10,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
      }}
    >
      {backgroundImages.map((src, index) => (
        <div
          key={src}
          className={`absolute inset-0 ${
            index === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transition: 'opacity 2s ease-in-out',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            position: 'absolute',
            width: '100%',
            height: '100%',
            filter: 'brightness(0.85)',
          }}
        >
          <img
            src={src}
            alt={`Background ${index + 1}`}
            className="object-cover w-full h-full"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(e) => {
              console.error('Background image failed to load:', src);
            }}
            onLoad={() => {
              console.log('Background image loaded:', src);
            }}
          />
        </div>
      ))}
    </div>
  );
}
