interface Message {
  id: string;
  sender: 'you' | 'partner' | 'ai';
  text: string;
  timestamp: Date;
  isOnboarding?: boolean;
  onboardingType?: 'greeting' | 'names' | 'schedules' | 'bank' | 'investments' | 'goal' | 'complete';
}

interface OnboardingMessageProps {
  message: Message;
  onGoalSelect: (goal: string) => void;
}

export function OnboardingMessage({ message, onGoalSelect }: OnboardingMessageProps) {
  const { text, timestamp, onboardingType } = message;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getButtonConfig = () => {
    if (onboardingType === 'schedules') {
      return [
        { label: 'Connect Google Calendar', action: 'Connected Google Calendar' },
        { label: 'Connect Apple Calendar', action: 'Connected Apple Calendar' },
        { label: 'Skip for now', action: 'Skipped calendar' }
      ];
    }
    if (onboardingType === 'bank') {
      return [
        { label: 'Connect Bank Account', action: 'Connected bank account' },
        { label: 'Skip for now', action: 'Skipped bank account' }
      ];
    }
    if (onboardingType === 'investments') {
      return [
        { label: 'Connect Investment Account', action: 'Connected investment account' },
        { label: 'Skip for now', action: 'Skipped investments' }
      ];
    }
    return [];
  };

  const buttons = getButtonConfig();

  return (
    <div className="flex flex-col items-start mb-3">
      <div className="text-xs text-gray-500 mb-1 ml-1">
        Homebase
      </div>
      
      <div className="max-w-[75%]">
        <div className="bg-[#E5E5EA] text-black rounded-[18px] rounded-bl-[4px] px-4 py-2 mb-2">
          <p className="text-sm leading-relaxed break-words">{text}</p>
        </div>

        {/* Goal Selection Buttons */}
        <div className="flex flex-col gap-2 mt-2">
          {buttons.map((button) => (
            <button
              key={button.label}
              onClick={() => onGoalSelect(button.action)}
              className={`${
                button.label.includes('Skip') 
                  ? 'bg-white border-2 border-gray-300 text-gray-600'
                  : 'bg-white border-2 border-[#007AFF] text-[#007AFF]'
              } rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[#007AFF] hover:text-white hover:border-[#007AFF] transition-colors active:scale-95 transform`}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="text-[10px] text-gray-400 mt-1 ml-2">
        {formatTime(timestamp)}
      </div>
    </div>
  );
}