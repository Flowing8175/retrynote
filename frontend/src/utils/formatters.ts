/**
 * Format a byte count as a human-readable file size string.
 * Examples: 512 → "0KB", 1536 → "2KB", 2097152 → "2.0MB"
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0KB';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Format a decimal ratio (0–1) as a percentage string with one decimal place.
 * Example: 0.753 → "75.3%"
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Translate a quiz question_type slug to its Korean display label.
 */
export function formatQuestionType(type: string): string {
  switch (type) {
    case 'multiple_choice':
      return '객관식';
    case 'ox':
      return 'OX';
    case 'short_answer':
      return '단답형';
    case 'fill_blank':
      return '빈칸형';
    case 'essay':
      return '서술형';
    default:
      return type;
  }
}

/**
 * Translate a file source_type slug to its Korean display label.
 */
export function formatFileSource(sourceType: string): string {
  switch (sourceType) {
    case 'upload':
      return '업로드 자료';
    case 'manual_text':
      return '직접 입력';
    case 'url':
      return '외부 링크';
    default:
      return '기타 자료';
  }
}

/**
 * Format an ISO datetime string into a localized Korean date/time string.
 * Returns empty string for null/undefined input.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
