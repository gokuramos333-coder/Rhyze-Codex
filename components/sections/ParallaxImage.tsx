'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';

type Props = {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

export function ParallaxImage({
  src,
  alt,
  className,
  priority,
  sizes = '(max-width: 1024px) 100vw, 50vw',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], ['-10%', '10%']);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-3xl ${className ?? ''}`}
    >
      <motion.div style={{ y }} className="absolute inset-[-10%]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </motion.div>
      <div className="grain absolute inset-0 opacity-30 mix-blend-overlay" />
    </div>
  );
}
