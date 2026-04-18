interface Message {
  id: string;
  sender: 'you' | 'partner' | 'ai';
  text: string;
  timestamp: Date;
  imageUrl?: string;
  isOnboarding?: boolean;
  onboardingType?: 'greeting' | 'names' | 'schedules' | 'bank' | 'investments' | 'complete';
}

interface ChatBubbleProps {
  message: Message;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const { sender, text, timestamp, imageUrl, isOnboarding, onboardingType } = message;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const isYou = sender === 'you';
  const isPartner = sender === 'partner';
  const isAI = sender === 'ai';

  return (
    <div className={`flex flex-col mb-3 ${isYou ? 'items-end' : 'items-start'}`}>
      {/* Sender label for non-you messages */}
      {!isYou && (
        <div className="mb-1 ml-1 text-xs text-gray-500 dark:text-gray-400">
          {isAI ? 'Homebase' : 'Partner'}
        </div>
      )}
      
      <div className={`flex items-end gap-1 max-w-[75%] ${isYou ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className={`rounded-[18px] px-4 py-2 ${
            isYou
              ? 'bg-[#007AFF] text-white rounded-br-[4px]'
              : isPartner
              ? 'bg-[#34C759] text-white rounded-bl-[4px]'
              : 'rounded-bl-[4px] bg-[#E5E5EA] text-black dark:bg-gray-700 dark:text-gray-100'
          }`}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Calendar"
              className="rounded-lg max-w-full w-full max-h-[280px] object-contain mb-2"
            />
          )}
          <p className="text-sm leading-relaxed break-words">{text}</p>
        </div>
      </div>
      
      {/* Timestamp */}
      <div className={`mt-1 text-[10px] text-gray-400 dark:text-gray-500 ${isYou ? 'mr-2' : 'ml-2'}`}>
        {formatTime(timestamp)}
      </div>
    </div>
  );
}