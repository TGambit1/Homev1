import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

export default function OptionA() {
  return (
    <div className="size-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-amber-50 to-orange-50">
      {/* Hero Section - Watercolor Leather */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Painted Background Effect */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 2, ease: 'easeOut' }}
            className="relative w-[85%] h-[70%]"
          >
            <img
              src="https://images.unsplash.com/photo-1770983355300-f4a076a99e98?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2Z0JTIwbGVhdGhlciUyMHRleHR1cmUlMjB3YXJtJTIwYmVpZ2V8ZW58MXx8fHwxNzcxNzAyMzk2fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt=""
              className="size-full object-cover rounded-3xl"
              style={{
                maskImage: 'radial-gradient(ellipse 80% 70% at center, black 30%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at center, black 30%, transparent 70%)',
                filter: 'saturate(0.8) brightness(1.1)',
                opacity: 0.6
              }}
            />
          </motion.div>
        </div>

        {/* Content */}
        <div className="relative z-10 px-8 text-center max-w-md mx-auto">
          <motion.p
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xs uppercase tracking-[0.3em] text-amber-700/70 mb-8"
          >
            Crafted Materials
          </motion.p>

          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-6xl mb-6 text-amber-900/80 tracking-tight leading-tight"
          >
            Touch
            <br />
            Luxury
          </motion.h1>

          <motion.p
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="text-base text-amber-800/60 mb-12 leading-relaxed"
          >
            Every grain tells a story of timeless elegance
          </motion.p>

          <motion.button
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-amber-700/20 backdrop-blur-sm text-amber-900 px-10 py-4 rounded-full text-base inline-flex items-center gap-2 shadow-lg border border-amber-300/30"
          >
            Discover More
            <ArrowRight className="size-5" />
          </motion.button>
        </div>
      </section>
    </div>
  );
}