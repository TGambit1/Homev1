export function TypingIndicator() {
  return (
    <div className="mb-3 flex flex-col items-start">
      <div className="mb-1 ml-1 text-xs text-gray-500 dark:text-gray-400">
        Homebase
      </div>
      <div className="flex items-center gap-1 rounded-[18px] rounded-bl-[4px] bg-[#E5E5EA] px-4 py-3 dark:bg-gray-700">
        <div className="flex gap-1">
          <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500 dark:bg-gray-400" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500 dark:bg-gray-400" style={{ animationDelay: '150ms', animationDuration: '1s' }}></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500 dark:bg-gray-400" style={{ animationDelay: '300ms', animationDuration: '1s' }}></div>
        </div>
      </div>
    </div>
  );
}