import { motion } from 'motion/react';
import { ReactNode } from 'react';

interface TextureSectionProps {
  imageUrl: string;
  title: string;
  description: string;
  textColor?: string;
  overlay?: string;
  children?: ReactNode;
}

export function TextureSection({
  imageUrl,
  title,
  description,
  textColor = 'text-white',
  overlay = 'bg-black/40',
  children,
}: TextureSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Texture Background */}
      <div className="absolute inset-0">
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
        />
        <div className={`absolute inset-0 ${overlay}`} />
      </div>

      {/* Content */}
      <div className="relative z-10 px-6 py-12 max-w-md mx-auto text-center">
        <motion.h2
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className={`text-4xl mb-6 ${textColor}`}
        >
          {title}
        </motion.h2>
        <motion.p
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className={`text-lg mb-8 leading-relaxed ${textColor}`}
        >
          {description}
        </motion.p>
        {children}
      </div>
    </motion.section>
  );
}
