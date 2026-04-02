import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { filesApi } from '@/api';
import { EmptyState, LoadingSpinner, Modal, Pagination, StatusBadge } from '@/components';
import { isFileProcessingStatus } from '@/types';
import type { FileDetail } from '@/types';

const failedStatuses = ['failed_partial', 'failed_terminal'];

function formatFileSize(sizeInBytes: number) {
  const megabyte = 1024 * 1024;

  if (sizeInBytes >= megabyte) {
    return `${(sizeInBytes / megabyte).toFixed(1)} MB`;
  }

  return `${(sizeInBytes / 1024).toFixed(1)} KB`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '기록 없음';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFileType(file: FileDetail) {
  if (file.file_type) {
    return file.file_type.toUpperCase();
  }

  return file.source_type === 'upload' ? '업로드 자료' : '자료';
}

function getStatusHint(file: FileDetail) {
  if (file.status === 'ready') {
    return '';
  }

  if (failedStatuses.includes(file.status)) {
    return '재시도 필요';
  }

  if (isFileProcessingStatus(file.status)) {
    return '';
  }

  return '';
}

function getCapabilityClass(enabled: boolean) {
  return enabled
    ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success'
    : 'border-white/[0.07] bg-surface-hover text-content-secondary';
}

export default function Files() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFilename, setEditingFilename] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [filePendingDelete, setFilePendingDelete] = useState<FileDetail | null>(null);
  const queryClient = useQueryClient();

  const { data: folderData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => filesApi.listFolders(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['files', page, statusFilter, selectedFolderId],
    queryFn: () => filesApi.listFiles(page, 20, selectedFolderId, statusFilter || null),
    refetchInterval: (query) =>
      query.state.data?.files.some((file) => isFileProcessingStatus(file.status)) ? 3000 : false,
    refetchIntervalInBackground: true,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.uploadFile(file, null, null, null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ fileId, newName }: { fileId: string; newName: string }) =>
      filesApi.renameFile(fileId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setEditingFileId(null);
      setEditingFilename('');
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ fileIds, folderId }: { fileIds: string[]; folderId: string | null }) =>
      Promise.all(fileIds.map((fileId) => filesApi.moveFile(fileId, folderId))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setSelectedFileIds([]);
      setMoveDialogOpen(false);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => filesApi.createFolder(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setCreatingFolder(false);
      setNewFolderName('');
    },
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: (fileIds: string[]) =>
      Promise.all(fileIds.map((fileId) => filesApi.deleteFile(fileId))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setSelectedFileIds([]);
      setDeleteSelectedOpen(false);
    },
  });

  const retryMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.retryFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadMutation.mutate(e.dataTransfer.files[0]);
    }
  };

  useEffect(() => {
    setSelectedFileIds([]);
    setEditingFileId(null);
    setEditingFilename('');
  }, [page, statusFilter, selectedFolderId]);

  if (isLoading) {
    return <LoadingSpinner message="자료 목록 불러오는 중" />;
  }

  const files = data?.files ?? [];
  const folders = folderData ?? [];
  const readyCount = files.filter((file) => file.status === 'ready').length;
  const processingCount = files.filter((file) => isFileProcessingStatus(file.status)).length;
  const failedCount = files.filter((file) => failedStatuses.includes(file.status)).length;
  const selectedCount = selectedFileIds.length;

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((current) =>
      current.includes(fileId) ? current.filter((selectedId) => selectedId !== fileId) : [...current, fileId]
    );
  };

  const toggleAllFiles = () => {
    if (files.length > 0 && selectedFileIds.length === files.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(files.map((f) => f.id));
    }
  };

  const beginRename = (file: FileDetail) => {
    setEditingFileId(file.id);
    setEditingFilename(file.original_filename || '');
  };

  const saveRename = () => {
    if (!editingFileId) {
      return;
    }

    const nextName = editingFilename.trim();
    if (!nextName) {
      return;
    }

    renameMutation.mutate({ fileId: editingFileId, newName: nextName });
  };

  const createFolder = () => {
    const nextName = newFolderName.trim();
    if (!nextName) {
      return;
    }

    createFolderMutation.mutate(nextName);
  };

  const moveSelectedFiles = () => {
    if (selectedFileIds.length === 0) {
      return;
    }

    moveMutation.mutate({ fileIds: selectedFileIds, folderId: moveTargetFolderId });
  };

  const deleteSelectedFiles = () => {
    if (selectedFileIds.length === 0) {
      return;
    }

    deleteSelectedMutation.mutate(selectedFileIds);
  };

  return (
    <div className="space-y-8">
      <header className="animate-fade-in-up px-1 pb-2 pt-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">
            자료 관리
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-surface-deep px-3 py-1 text-xs">
              <span className="font-semibold text-content-primary">{data?.total ?? 0}</span>
              <span className="text-content-muted">전체</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-semantic-success-border bg-semantic-success-bg px-3 py-1 text-xs">
              <span className="font-semibold text-semantic-success">{readyCount}</span>
              <span className="text-content-muted">준비 완료</span>
            </span>
            {(processingCount + failedCount) > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-semantic-warning-border bg-semantic-warning-bg px-3 py-1 text-xs">
                <span className="font-semibold text-semantic-warning">{processingCount + failedCount}</span>
                <span className="text-content-muted">확인 필요</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-white/[0.07] bg-surface px-5 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-content-primary">폴더</h2>
              <p className="mt-1 text-sm text-content-secondary">자료를 폴더별로 묶어 보세요.</p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={() => {
                setSelectedFolderId(null);
                setPage(1);
              }}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                selectedFolderId === null
                  ? 'border-brand-500/30 bg-brand-500/10 text-brand-300'
                  : 'border-white/[0.07] bg-surface-deep text-content-primary hover:bg-surface-hover'
              }`}
            >
              <span>전체 자료</span>
            </button>

            {folders.length > 0 ? (
              folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setPage(1);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                    selectedFolderId === folder.id
                      ? 'border-brand-500/30 bg-brand-500/10 text-brand-300'
                      : 'border-white/[0.07] bg-surface-deep text-content-primary hover:bg-surface-hover'
                  }`}
                >
                  <span className="truncate">{folder.name}</span>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.12] px-4 py-6 text-sm text-content-secondary">
                아직 폴더가 없습니다.
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-white/[0.07] pt-5">
            {creatingFolder ? (
              <div className="space-y-3">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      createFolder();
                    }
                  }}
                  placeholder="새 폴더 이름"
                  className="w-full rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary placeholder:text-content-muted"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={createFolder}
                    disabled={createFolderMutation.isPending}
                    className="flex-1 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createFolderMutation.isPending ? '생성 중…' : '생성'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingFolder(false);
                      setNewFolderName('');
                    }}
                    className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreatingFolder(true)}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
              >
                새 폴더 만들기
              </button>
            )}
          </div>
        </aside>

        <div className="space-y-6">
          <div
            className={`rounded-3xl border-2 border-dashed px-6 py-8 transition-colors sm:px-8 ${
              dragActive
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-white/[0.12] bg-surface hover:border-brand-500/40 hover:bg-brand-500/[0.03]'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  uploadMutation.mutate(e.target.files[0]);
                }
              }}
            />

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.07] bg-surface-deep text-content-secondary">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-content-primary">파일 업로드</h2>
                  <p className="mt-0.5 text-sm text-content-secondary">
                    PDF, DOCX, PPTX, TXT, MD, PNG, JPG 지원
                  </p>
                </div>
              </div>

              <label
                htmlFor="file-upload"
                className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-5 py-3 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600"
              >
                파일 선택
              </label>
            </div>

            {uploadMutation.isPending && (
              <div className="mt-5 flex items-center gap-2 text-sm text-content-secondary">
                <span className="rounded-full border border-white/[0.07] bg-surface-deep px-3 py-1.5">업로드 중…</span>
              </div>
            )}
          </div>

          <section className="rounded-3xl border border-white/[0.07] bg-surface px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-medium text-content-primary">상태별로 자료 보기</div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary"
                >
                  <option value="">전체 상태</option>
                  <option value="uploaded">업로드됨</option>
                  <option value="parsing">파싱 중</option>
                  <option value="ready">준비 완료</option>
                  <option value="failed_partial">부분 실패</option>
                  <option value="failed_terminal">실패</option>
                </select>

                <Link
                  to="/quiz/new"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600"
                >
                  새 퀴즈 만들기
                </Link>
              </div>
            </div>
          </section>

          {!data || files.length === 0 ? (
            <EmptyState
              title={statusFilter || selectedFolderId ? '조건에 맞는 자료가 없습니다' : '업로드한 자료가 없습니다'}
              message={
                statusFilter || selectedFolderId
                  ? '필터를 바꾸거나 새 자료를 올려 보세요.'
                  : 'PDF, 문서, 이미지 파일을 올리면 AI가 분석하고 퀴즈에 활용할 수 있도록 준비합니다.'
              }
              actions={
                <label
                  htmlFor="file-upload"
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600"
                >
                  파일 업로드
                </label>
              }
            />
          ) : (
            <section className="space-y-4">
              <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
                <div className="flex flex-col gap-3 border-b border-white/[0.07] px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="mt-2 text-2xl font-semibold text-content-primary">
                      {statusFilter ? '선택한 상태의 자료' : selectedFolderId ? '선택한 폴더의 자료' : '업로드한 자료 전체'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-content-secondary">
                      {data.total}개 중 {files.length}개 표시
                    </p>
                  </div>

                  {processingCount > 0 && (
                    <div className="rounded-2xl border border-semantic-warning-border bg-semantic-warning-bg px-4 py-3 text-sm text-semantic-warning">
                      처리 중 {processingCount}개
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-2">
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-content-muted"
                    fill="none"
                    viewBox="0 0 14 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
                    <path d="M4 7l2 2 4-3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs text-content-muted">파일을 선택하면 일괄 삭제·이동할 수 있어요</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/[0.07]">
                    <thead className="bg-surface-raised">
                      <tr>
                        <th className="w-12 px-4 py-3 text-left">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="checkbox"
                              checked={files.length > 0 && selectedFileIds.length === files.length}
                              onChange={toggleAllFiles}
                              className="h-4 w-4 rounded border-white/[0.07] bg-surface-deep text-brand-500 focus:ring-brand-500"
                              aria-label="전체 선택"
                            />
                            <span className="whitespace-nowrap text-[10px] leading-none text-content-muted">전체</span>
                          </div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                          자료
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                          상태
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                          활용
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                          업로드 정보
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                          작업
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.07] bg-surface">
                      {files.map((file) => {
                        const isEditing = editingFileId === file.id;

                        return (
                          <tr key={file.id} className="align-top transition-colors hover:bg-surface-hover">
                            <td className="px-4 py-5 align-top">
                              <input
                                type="checkbox"
                                checked={selectedFileIds.includes(file.id)}
                                onChange={() => toggleFileSelection(file.id)}
                                className="mt-1 h-4 w-4 rounded border-white/[0.07] bg-surface-deep text-brand-500 focus:ring-brand-500"
                              />
                            </td>
                            <td className="px-6 py-5">
                              <div className="min-w-[16rem] max-w-md space-y-3">
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <input
                                      value={editingFilename}
                                      onChange={(e) => setEditingFilename(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          saveRename();
                                        }
                                      }}
                                      className="w-full rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary placeholder:text-content-muted"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={saveRename}
                                        disabled={renameMutation.isPending}
                                        className="rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {renameMutation.isPending ? '저장 중…' : '저장'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingFileId(null);
                                          setEditingFilename('');
                                        }}
                                        className="rounded-xl border border-white/[0.07] px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-sm font-medium text-content-primary">
                                      {file.original_filename || '이름 없는 자료'}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
                                      <span className="rounded-full border border-white/[0.07] bg-surface-deep px-2.5 py-1">
                                        {formatFileType(file)}
                                      </span>
                                      <span>{formatFileSize(file.file_size_bytes)}</span>
                                      {file.retry_count > 0 && <span>재시도 {file.retry_count}회</span>}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="space-y-2">
                                <StatusBadge status={file.status} />
                                {getStatusHint(file) ? (
                                  <p className="max-w-[16rem] text-sm leading-6 text-content-secondary">
                                    {getStatusHint(file)}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex min-w-[12rem] flex-wrap gap-2 text-xs font-medium">
                                <span className={`rounded-full border px-2.5 py-1 ${getCapabilityClass(file.is_searchable)}`}>
                                  검색 {file.is_searchable ? '가능' : '대기'}
                                </span>
                                <span
                                  className={`rounded-full border px-2.5 py-1 ${getCapabilityClass(file.is_quiz_eligible)}`}
                                >
                                  퀴즈 {file.is_quiz_eligible ? '가능' : '대기'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="min-w-[11rem] space-y-1 text-sm text-content-secondary">
                                <div>업로드 {formatDateTime(file.created_at)}</div>
                                <div>최근 처리 {formatDateTime(file.processing_finished_at)}</div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex min-w-[14rem] flex-wrap justify-end gap-2">
                                {(file.stored_path || file.status === 'ready') && (
                                  <button
                                    type="button"
                                    onClick={() => filesApi.downloadFile(file.id)}
                                    className="inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-surface-deep px-3 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
                                  >
                                    다운로드
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => beginRename(file)}
                                  className="inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-surface-deep px-3 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
                                >
                                  이름 변경
                                </button>
                                {(file.status === 'failed_partial' || file.status === 'failed_terminal') && (
                                  <button
                                    type="button"
                                    onClick={() => retryMutation.mutate(file.id)}
                                    disabled={retryMutation.isPending}
                                    className="inline-flex items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    재시도
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setFilePendingDelete(file)}
                                  className="inline-flex items-center justify-center rounded-xl border border-semantic-error-border bg-semantic-error-bg px-3 py-2 text-sm font-medium text-semantic-error transition-colors hover:bg-semantic-error-bg/50"
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {data.total > data.size && (
                <Pagination currentPage={page} totalPages={Math.ceil(data.total / data.size)} onPageChange={setPage} />
              )}
            </section>
          )}
        </div>
      </section>

      {selectedCount > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-surface px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="text-sm text-content-primary">
            <span className="font-semibold">{selectedCount}개</span> 선택됨
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeleteSelectedOpen(true)}
              className="rounded-xl border border-semantic-error-border bg-semantic-error-bg px-4 py-2 text-sm font-medium text-semantic-error transition-colors hover:bg-semantic-error-bg/50"
            >
              선택 삭제
            </button>
            <button
              type="button"
              onClick={() => {
                setMoveTargetFolderId(null);
                setMoveDialogOpen(true);
              }}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600"
            >
              폴더 이동
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={filePendingDelete !== null}
        onClose={() => setFilePendingDelete(null)}
        title="자료를 삭제할까요?"
      >
        <div className="space-y-5">
          <p className="text-sm leading-7 text-content-secondary">
            <span className="font-medium text-content-primary">
              {filePendingDelete?.original_filename || '이 자료'}
            </span>
            를 삭제할까요?
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFilePendingDelete(null)}
              className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              취소
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!filePendingDelete) {
                  return;
                }

                deleteMutation.mutate(filePendingDelete.id, {
                  onSuccess: () => {
                    setFilePendingDelete(null);
                  },
                });
              }}
              className="rounded-xl bg-semantic-error px-4 py-2.5 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteMutation.isPending ? '삭제 중…' : '삭제하기'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={deleteSelectedOpen} onClose={() => setDeleteSelectedOpen(false)} title="선택한 자료를 삭제할까요?">
        <div className="space-y-5">
          <p className="text-sm leading-7 text-content-secondary">
            선택한 <span className="font-medium text-content-primary">{selectedCount}개</span> 자료를 삭제할까요?
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteSelectedOpen(false)}
              className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              취소
            </button>
            <button
              type="button"
              disabled={deleteSelectedMutation.isPending}
              onClick={deleteSelectedFiles}
              className="rounded-xl bg-semantic-error px-4 py-2.5 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteSelectedMutation.isPending ? '삭제 중…' : '삭제하기'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} title="폴더로 이동">
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-content-primary">이동할 폴더</label>
            <select
              value={moveTargetFolderId ?? ''}
              onChange={(e) => setMoveTargetFolderId(e.target.value || null)}
              className="w-full rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary"
            >
              <option value="">루트로 이동</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setMoveDialogOpen(false)}
              className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              취소
            </button>
            <button
              type="button"
              disabled={moveMutation.isPending}
              onClick={moveSelectedFiles}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {moveMutation.isPending ? '이동 중…' : '이동하기'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
