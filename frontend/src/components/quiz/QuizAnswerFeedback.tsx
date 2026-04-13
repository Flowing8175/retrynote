import { CheckCircle2, AlertCircle } from 'lucide-react';

interface QuizAnswerFeedbackProps {
  judgement: string;
  feedbackText?: string | null;
  correctAnswerLabel?: string | null;
}

export default function QuizAnswerFeedback({
  judgement,
  feedbackText,
  correctAnswerLabel,
}: QuizAnswerFeedbackProps) {
  const isCorrect = judgement === 'correct';
  const isPartial = judgement === 'partial';

  return (
    <div className={`animate-fade-in-up p-6 rounded-2xl border ${
      isCorrect
        ? 'bg-brand-500/5 border-brand-500/30'
        : isPartial
          ? 'bg-semantic-warning/5 border-semantic-warning/30'
          : 'bg-semantic-error/5 border-semantic-error/30'
    }`}>
      <div className="flex items-center gap-4 mb-4">
        {isCorrect ? (
          <CheckCircle2 size={24} className="text-brand-300" />
        ) : (
          <AlertCircle size={24} className={isPartial ? 'text-semantic-warning' : 'text-semantic-error'} />
        )}
        <h3 className={`text-lg font-semibold ${
          isCorrect ? 'text-brand-300' : isPartial ? 'text-semantic-warning' : 'text-semantic-error'
        }`}>
          {isCorrect ? '정답입니다' : isPartial ? '부분 정답입니다' : '틀렸습니다'}
        </h3>
      </div>
      {correctAnswerLabel && (
        <p className="text-base text-content-secondary mb-2">
          <span className="font-semibold text-white">정답: </span>
          {correctAnswerLabel}
        </p>
      )}
      {feedbackText && (
        <p className="text-base text-content-secondary leading-relaxed">
          {feedbackText}
        </p>
      )}
    </div>
  );
}
