import { motion } from 'motion/react';
import { Settings, Home } from 'lucide-react';
import logoImage from '../../assets/508fa746b183626a8fca6be4c02b3aa5a88b1f8f.png';

interface OptionCProps {
  onSettingsClick?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  accentColor?: string;
}

export default function OptionC({ onSettingsClick, theme = 'light', accentColor = '#7eb6eb' }: OptionCProps) {
  const isDark = theme === 'dark';
  const twilioHelperNumberE164 = '+18446707482';
  
  return (
    <div className={`size-full overflow-y-auto overflow-x-hidden ${
      isDark 
        ? 'bg-gradient-to-b from-slate-900 to-slate-800' 
        : 'bg-gradient-to-b from-rose-50 to-orange-50'
    }`}>
      {/* Hero Section - Watercolor Brooklyn Bridge */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Home Button */}
        <motion.button
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          onClick={() => {
            // Opens the user's default SMS app (Messages on iOS/macOS, etc.)
            window.location.href = `sms:${twilioHelperNumberE164}`;
          }}
          className="absolute top-8 left-8 z-20 p-2 rounded-full hover:bg-white/20 transition-colors"
          style={{ color: accentColor }}
          aria-label="Text Homebase (Twilio helper number)"
        >
          <Home size={24} />
        </motion.button>

        {/* Logo at top center */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="absolute top-8 left-1/2 -translate-x-1/2 z-20"
        >
          <img 
            src={logoImage} 
            alt="Social Company" 
            className="w-[400px] h-auto"
          />
        </motion.div>

        {/* Settings Button */}
        <motion.button
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          onClick={onSettingsClick}
          className="absolute top-8 right-8 z-20 p-2 rounded-full hover:bg-white/20 transition-colors"
          style={{ color: accentColor }}
        >
          <Settings size={24} />
        </motion.button>

        {/* Painted Background Effect */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 2, ease: 'easeOut' }}
            className="relative w-full h-full"
          >
            <img
              src="https://images.unsplash.com/photo-1548904228-89fb49c5489f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxicm9va2x5biUyMGJyaWRnZSUyMHN1bnNldCUyMGFydGlzdGljfGVufDF8fHx8MTc3MTcwMjM5N3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt=""
              className="w-full h-full object-cover"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 100%)',
                filter: 'saturate(0.75) brightness(1.15)',
                opacity: 0.55
              }}
            />
            
            {/* Welcome Text */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full text-center"
            >
              <h1 
                className="text-6xl font-light tracking-wide"
                style={{ 
                  color: accentColor,
                  textShadow: isDark 
                    ? '0 2px 20px rgba(0,0,0,0.5)' 
                    : '0 2px 20px rgba(255,255,255,0.8)'
                }}
              >
                Welcome Home
              </h1>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer links */}
      <footer className="w-full border-t border-black bg-black py-6 mt-0">
        <div className="max-w-4xl mx-auto px-6 text-xs text-white">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div id="privacy" className="space-y-1 max-w-md">
              <h2 className="font-semibold text-white text-xs">Privacy Policy</h2>
              <p className="text-[11px] text-white/80">
                Learn how The Social Company of Us collects, uses, and protects your
                data. For full details, visit our privacy policy.
              </p>
            </div>
            <div id="terms" className="space-y-1 max-w-md">
              <h2 className="font-semibold text-white text-xs">Terms of Service</h2>
              <p className="text-[11px] text-white/80">
                Review the terms and conditions that govern your use of The Social
                Company of Us.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-6 text-[11px] text-white">
            <a
              href="https://www.socialcompanyofus.com/#privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Privacy Policy
            </a>
            <span className="opacity-50">•</span>
            <a
              href="https://www.socialcompanyofus.com/#terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}