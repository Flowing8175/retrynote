import { normalizeOxValue } from '@/utils/quizConstants';

interface QuizChoiceOptionsProps {
  options: Record<string, string>;
  optionDescriptions?: Record<string, string | null> | null;
  selectedAnswer: string;
  correctAnswer?: string | null;
  judgement?: string | null;
  questionType: string;
  isResultShown: boolean;
  isDisabled: boolean;
  onSelect: (key: string) => void;
}

export default function QuizChoiceOptions({
  options,
  optionDescriptions,
  selectedAnswer,
  correctAnswer,
  judgement,
  questionType,
  isResultShown,
  isDisabled,
  onSelect,
}: QuizChoiceOptionsProps) {
  const isOxQuestion = questionType === 'ox';

  return (
    <div className="grid gap-3">
      {Object.entries(options).map(([key, text]) => {
        const isSelected = isOxQuestion
          ? normalizeOxValue(selectedAnswer) === normalizeOxValue(key)
          : selectedAnswer === key;
        const isCorrectAnswer = isOxQuestion
          ? normalizeOxValue(correctAnswer) === normalizeOxValue(key)
          : correctAnswer === key;
        const isWrong = isResultShown && isSelected && judgement !== 'correct';
        const shouldShowCorrect = isResultShown && isCorrectAnswer;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            disabled={isDisabled}
            className={`relative group flex items-start gap-4 p-5 rounded-2xl text-left transition-all border ${
              isWrong
                ? 'bg-semantic-error/10 text-semantic-error border-semantic-error/40 ring-1 ring-inset ring-semantic-error/30'
                : shouldShowCorrect
                  ? 'bg-semantic-success/10 text-semantic-success border-semantic-success/40 ring-1 ring-inset ring-semantic-success/30'
                  : isSelected
                    ? 'bg-brand-500/15 text-brand-200 border-brand-500/30 ring-1 ring-inset ring-brand-500/30 shadow-sm shadow-brand-900/20'
                    : 'bg-surface text-content-primary border-white/[0.05] hover:bg-surface-hover'
            }`}
          >
            <span className={`text-base font-semibold tabular-nums mt-0.5 ${
              isWrong ? 'text-semantic-error' : shouldShowCorrect ? 'text-semantic-success' : isSelected ? 'text-brand-100' : 'text-content-muted'
            }`}>
              {key.toUpperCase()}
            </span>
            <div className="flex flex-col gap-1">
              <span className={`text-base font-medium leading-relaxed ${isSelected && !isWrong ? 'text-brand-50' : ''}`}>
                {text}
              </span>
              {isResultShown && optionDescriptions?.[key] && (
                <span className="text-sm text-content-muted leading-snug">{optionDescriptions[key]}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
