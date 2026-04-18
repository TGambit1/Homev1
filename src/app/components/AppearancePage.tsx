import { motion } from 'motion/react';
import { ArrowLeft, Sun, Moon, Smartphone } from 'lucide-react';
import { useState } from 'react';

interface AppearancePageProps {
  onBack?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
  accentColor?: string;
  onAccentColorChange?: (color: string) => void;
}

export default function AppearancePage({ onBack, theme = 'light', onThemeChange, accentColor = '#7eb6eb', onAccentColorChange }: AppearancePageProps) {
  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'auto' as const, label: 'Auto', icon: Smartphone },
  ];

  const colorSchemes = [
    { name: 'Ocean Blue', color: '#7eb6eb' },
    { name: 'Forest Green', color: '#4ade80' },
    { name: 'Sunset Orange', color: '#fb923c' },
    { name: 'Lavender', color: '#c084fc' },
    { name: 'Rose Pink', color: '#fb7185' },
  ];

  const isDark = theme === 'dark';

  return (
    <div className={`size-full overflow-y-auto overflow-x-hidden ${
      isDark 
        ? 'bg-gradient-to-b from-slate-900 to-slate-800' 
        : 'bg-gradient-to-b from-rose-50 to-orange-50'
    }`}>
      <div className="min-h-screen px-6 py-8 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <motion.button
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            onClick={onBack}
            className={`p-2 rounded-full transition-colors ${
              isDark ? 'hover:bg-slate-700/30' : 'hover:bg-white/30'
            }`}
            style={{ color: accentColor }}
          >
            <ArrowLeft size={24} />
          </motion.button>
          
          <motion.h1
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={`text-2xl font-light ${
              isDark ? 'text-slate-100' : 'text-blue-900/80'
            }`}
          >
            Appearance
          </motion.h1>
          
          <div className="w-10" /> {/* Spacer for alignment */}
        </div>

        <div className="max-w-md mx-auto space-y-8">
          {/* Theme Selection */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h2 className={`text-sm font-medium mb-3 px-2 ${
              isDark ? 'text-slate-300' : 'text-blue-900/60'
            }`}>
              Theme
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option, index) => (
                <motion.button
                  key={option.value}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.05 }}
                  onClick={() => onThemeChange && onThemeChange(option.value)}
                  className={`p-4 rounded-2xl backdrop-blur-sm transition-all ${
                    theme === option.value
                      ? isDark 
                        ? `bg-slate-700/60 ring-2`
                        : `bg-white/60 ring-2`
                      : isDark
                        ? 'bg-slate-700/40 hover:bg-slate-700/50'
                        : 'bg-white/40 hover:bg-white/50'
                  }`}
                  style={theme === option.value ? { borderColor: accentColor } : {}}
                >
                  <div className="flex flex-col items-center gap-2">
                    <option.icon 
                      size={24} 
                      style={{ color: theme === option.value ? accentColor : isDark ? '#cbd5e1' : '#1e3a8a80' }}
                    />
                    <span className={`text-sm font-medium ${
                      theme === option.value 
                        ? isDark ? 'text-slate-100' : 'text-blue-900/90'
                        : isDark ? 'text-slate-400' : 'text-blue-900/60'
                    }`}>
                      {option.label}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Color Scheme */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <h2 className={`text-sm font-medium mb-3 px-2 ${
              isDark ? 'text-slate-300' : 'text-blue-900/60'
            }`}>
              Accent Color
            </h2>
            <div className={`backdrop-blur-sm rounded-2xl p-5 ${
              isDark ? 'bg-slate-700/40' : 'bg-white/40'
            }`}>
              <div className="flex items-center justify-between gap-3">
                {colorSchemes.map((scheme, index) => (
                  <motion.button
                    key={scheme.name}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.6 + index * 0.05 }}
                    className="relative"
                    onClick={() => onAccentColorChange && onAccentColorChange(scheme.color)}
                  >
                    <div
                      className="size-12 rounded-full transition-all hover:scale-110"
                      style={{ backgroundColor: scheme.color }}
                    />
                    {scheme.color === accentColor && (
                      <div 
                        className="absolute inset-0 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path 
                            d="M3 8L6.5 11.5L13 4" 
                            stroke="white" 
                            strokeWidth="2.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}