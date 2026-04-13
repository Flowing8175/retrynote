import { OptionGroup } from '@/components/ui';
import { QUESTION_COUNT_PRESETS } from '@/utils/quizConstants';

interface QuestionCountPickerProps {
  questionCount: number;
  autoCount: boolean;
  onChange: (value: number | 'auto') => void;
  autoLabel?: string;
  autoDescription?: string;
}

export function QuestionCountPicker({
  questionCount,
  autoCount,
  onChange,
  autoLabel = 'AI 결정',
  autoDescription = 'AI가 분량에 맞게 자동 선택',
}: QuestionCountPickerProps) {
  return (
    <OptionGroup
      options={[
        ...QUESTION_COUNT_PRESETS.map((p) => ({ value: String(p), label: String(p) })),
        { value: 'auto', label: autoLabel, description: autoDescription },
      ]}
      value={autoCount ? 'auto' : String(questionCount)}
      onChange={(v) => {
        if (v === 'auto') {
          onChange('auto');
        } else {
          onChange(Number(v as string));
        }
      }}
      size="md"
      layout="wrap"
    />
  );
}
