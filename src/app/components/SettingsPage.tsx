import { motion } from 'motion/react';
import { ArrowLeft, Link2, Moon, Lock, User } from 'lucide-react';

interface SettingsPageProps {
  onBack?: () => void;
  onConnectionsClick?: () => void;
  onAccountClick?: () => void;
  onAppearanceClick?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  accentColor?: string;
  onLogout?: () => void;
}

export default function SettingsPage({ onBack, onConnectionsClick, onAccountClick, onAppearanceClick, theme = 'light', accentColor = '#7eb6eb', onLogout }: SettingsPageProps) {
  const settingItems = [
    { icon: User, label: 'Account', description: 'Manage your profile' },
    { icon: Link2, label: 'Connections', description: 'Linked accounts & integrations' },
    { icon: Moon, label: 'Appearance', description: 'Theme and display' },
    { icon: Lock, label: 'Privacy', description: 'Data and permissions' },
  ];

  const isDark = theme === 'dark';

  return (
    <div className={`size-full overflow-y-auto overflow-x-hidden ${
      isDark 
        ? 'bg-gradient-to-b from-slate-900 to-slate-800' 
        : 'bg-gradient-to-b from-rose-50 to-orange-50'
    }`}>
      <div className="min-h-screen px-6 py-8">
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
            Settings
          </motion.h1>
          
          <div className="w-10" /> {/* Spacer for alignment */}
        </div>

        {/* Settings List */}
        <div className="max-w-md mx-auto space-y-3">
          {settingItems.map((item, index) => (
            <motion.button
              key={item.label}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
              onClick={
                item.label === 'Connections' ? onConnectionsClick :
                item.label === 'Account' ? onAccountClick :
                item.label === 'Appearance' ? onAppearanceClick :
                item.label === 'Privacy' ? () => window.open('https://www.socialcompanyofus.com/#privacy', '_blank') :
                undefined
              }
              className={`w-full backdrop-blur-sm rounded-2xl p-5 flex items-center gap-4 transition-all active:scale-98 ${
                isDark 
                  ? 'bg-slate-700/40 hover:bg-slate-700/60' 
                  : 'bg-white/40 hover:bg-white/60'
              }`}
            >
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: `${accentColor}20` }}
              >
                <item.icon size={22} style={{ color: accentColor }} />
              </div>
              
              <div className="flex-1 text-left">
                <h3 className={`text-base font-medium ${
                  isDark ? 'text-slate-100' : 'text-blue-900/90'
                }`}>
                  {item.label}
                </h3>
                <p className={`text-sm ${
                  isDark ? 'text-slate-400' : 'text-blue-800/50'
                }`}>
                  {item.description}
                </p>
              </div>
              
              <svg
                width="8"
                height="14"
                viewBox="0 0 8 14"
                fill="none"
                className="opacity-30"
              >
                <path
                  d="M1 1L7 7L1 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.button>
          ))}
        </div>

        {/* Version Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1 }}
          className="mt-16 space-y-4"
        >
          <div
            className={`text-center text-sm ${
              isDark ? 'text-slate-500' : 'text-blue-800/40'
            }`}
          >
            Version 1.0.0
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className={`w-full max-w-md mx-auto block py-3 rounded-2xl font-medium border text-sm transition-colors
                ${
                  isDark
                    ? 'border-red-400/60 text-red-300 hover:bg-red-500/10'
                    : 'border-red-200 text-red-600 hover:bg-red-50'
                }`}
            >
              Log Out
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}