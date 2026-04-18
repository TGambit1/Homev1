import { motion } from 'motion/react';

interface TextureCardProps {
  imageUrl: string;
  label: string;
  index: number;
}

export function TextureCard({ imageUrl, label, index }: TextureCardProps) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="relative h-48 rounded-2xl overflow-hidden shadow-2xl cursor-pointer"
    >
      <img
        src={imageUrl}
        alt={label}
        className="size-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-6">
        <span className="text-white text-xl">{label}</span>
      </div>
    </motion.div>
  );
}
