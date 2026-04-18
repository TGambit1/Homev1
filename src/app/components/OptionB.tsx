import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

export default function OptionB() {
  return (
    <div className="size-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50 to-blue-50">
      {/* Hero Section - Watercolor Water */}
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
              src="https://images.unsplash.com/photo-1759036170298-8616a009de22?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYWxtJTIwd2F0ZXIlMjBvY2VhbiUyMHdhdmVzJTIwcGVhY2VmdWx8ZW58MXx8fHwxNzcxNzAyMzk3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt=""
              className="size-full object-cover rounded-3xl"
              style={{
                maskImage: 'radial-gradient(ellipse 80% 70% at center, black 30%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at center, black 30%, transparent 70%)',
                filter: 'saturate(0.7) brightness(1.2)',
                opacity: 0.5
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
            className="text-xs uppercase tracking-[0.3em] text-blue-700/70 mb-8"
          >
            Flowing Elements
          </motion.p>

          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-6xl mb-6 text-blue-900/80 tracking-tight leading-tight"
          >
            Fluid
            <br />
            Motion
          </motion.h1>

          <motion.p
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="text-base text-blue-800/60 mb-12 leading-relaxed"
          >
            Where calm waves meet endless horizons
          </motion.p>

          <motion.button
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-blue-700/20 backdrop-blur-sm text-blue-900 px-10 py-4 rounded-full text-base inline-flex items-center gap-2 shadow-lg border border-blue-300/30"
          >
            Dive Deeper
            <ArrowRight className="size-5" />
          </motion.button>
        </div>
      </section>
    </div>
  );
}