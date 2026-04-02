export interface FileUploadResponse {
  file_id: string;
  status: string;
  job_id: string | null;
}

export const FILE_PROCESSING_STATUSES = [
  'uploaded',
  'parsing',
  'parsed',
  'ocr_pending',
  'ocr_processing',
  'embedding_pending',
  'embedding_processing',
] as const;

export const fileProcessingStatusLabels: Record<string, string> = {
  uploaded: '처리 대기',
  parsing: '자료 분석 중',
  parsed: '분석 완료',
  ocr_pending: '텍스트 추출 대기',
  ocr_processing: '텍스트 추출 중',
  embedding_pending: '검색 준비 대기',
  embedding_processing: '검색 준비 중',
  failed_partial: '일부 처리 실패',
  failed_terminal: '처리 실패',
};

export const isFileProcessingStatus = (status: string) =>
  FILE_PROCESSING_STATUSES.includes(status as (typeof FILE_PROCESSING_STATUSES)[number]);

export interface FileDetail {
  id: string;
  original_filename: string | null;
  file_type: string | null;
  file_size_bytes: number;
  source_type: string;
  source_url: string | null;
  stored_path: string | null;
  status: string;
  parse_error_code: string | null;
  ocr_required: boolean;
  retry_count: number;
  is_searchable: boolean;
  is_quiz_eligible: boolean;
  processing_started_at: string | null;
  processing_finished_at: string | null;
  folder_id: string | null;
  created_at: string;
}

export interface FileFolder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  sort_order: number;
  status: string;
  created_at: string;
}

export interface FileListResponse {
  files: FileDetail[];
  total: number;
  page: number;
  size: number;
}

export interface FileRetryResponse {
  job_id: string;
  status: string;
}
