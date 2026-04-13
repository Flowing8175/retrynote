import { CheckCircle2, AlertCircle } from 'lucide-react';

interface QuizAnswerFeedbackProps {
  judgement: string;
  feedbackText?: string | null;
  correctAnswerLabel?: string | null;
  headline?: string | null;
}

export default function QuizAnswerFeedback({
  judgement,
  feedbackText,
  correctAnswerLabel,
  headline,
}: QuizAnswerFeedbackProps) {
  const isCorrect = judgement === 'correct';
  const isPartial = judgement === 'partial';
  const displayHeadline = headline ?? (isCorrect ? '정답입니다' : isPartial ? '부분 정답입니다' : '틀렸습니다');

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
          {displayHeadline}
        </h3>
      </div>
      {correctAnswerLabel && (
        <p className="text-base text-content-secondary mb-3">
          <span className="font-semibold text-white">정답: </span>
          {correctAnswerLabel}
        </p>
      )}
      {feedbackText && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-content-muted">해설</div>
          <p className="text-base text-content-secondary leading-relaxed">
            {feedbackText}
          </p>
        </div>
      )}
    </div>
  );
}
