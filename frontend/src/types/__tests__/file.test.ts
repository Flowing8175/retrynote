import {
  FILE_PROCESSING_STATUSES,
  isFileProcessingStatus,
  fileProcessingStatusLabels,
} from '@/types/file';

describe('FILE_PROCESSING_STATUSES', () => {
  it('contains expected statuses', () => {
    expect(FILE_PROCESSING_STATUSES).toContain('uploaded');
    expect(FILE_PROCESSING_STATUSES).toContain('parsing');
    expect(FILE_PROCESSING_STATUSES).toContain('parsed');
    expect(FILE_PROCESSING_STATUSES).toContain('ocr_pending');
    expect(FILE_PROCESSING_STATUSES).toContain('ocr_processing');
    expect(FILE_PROCESSING_STATUSES).toContain('embedding_pending');
    expect(FILE_PROCESSING_STATUSES).toContain('embedding_processing');
  });
});

describe('isFileProcessingStatus', () => {
  it('returns true for processing statuses', () => {
    expect(isFileProcessingStatus('uploaded')).toBe(true);
    expect(isFileProcessingStatus('parsing')).toBe(true);
    expect(isFileProcessingStatus('ocr_processing')).toBe(true);
    expect(isFileProcessingStatus('embedding_processing')).toBe(true);
  });

  it('returns false for non-processing statuses', () => {
    expect(isFileProcessingStatus('ready')).toBe(false);
    expect(isFileProcessingStatus('failed_terminal')).toBe(false);
    expect(isFileProcessingStatus('failed_partial')).toBe(false);
    expect(isFileProcessingStatus('deleted')).toBe(false);
  });
});

describe('fileProcessingStatusLabels', () => {
  it('has entries for all processing statuses', () => {
    for (const status of FILE_PROCESSING_STATUSES) {
      expect(fileProcessingStatusLabels[status]).toBeDefined();
    }
  });

  it('has Korean labels', () => {
    expect(fileProcessingStatusLabels.uploaded).toBe('처리 대기');
    expect(fileProcessingStatusLabels.parsing).toBe('자료 분석 중');
    expect(fileProcessingStatusLabels.ocr_processing).toBe('텍스트 추출 중');
  });
});
