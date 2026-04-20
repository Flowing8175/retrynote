import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutationWithInvalidation } from '@/hooks/useMutationWithInvalidation';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, Trash2, Download, Edit3, RotateCw, Plus, X, BookOpen } from 'lucide-react';
import { filesApi } from '@/api';
import { Modal, Pagination, StatusBadge, SkeletonTransition, UploadQueue } from '@/components';
import { isFileProcessingStatus } from '@/types';
import type { FileDetail } from '@/types';
import { useModalState } from '@/hooks/useModalState';
import { useMultiFileUpload } from '@/hooks/useMultiFileUpload';
import { useAuthStore } from '@/stores/authStore';

const failedStatuses = ['failed_partial', 'failed_terminal'];

function formatFileSize(sizeInBytes: number) {
  const megabyte = 1024 * 1024;
  if (sizeInBytes >= megabyte) {
    return `${(sizeInBytes / megabyte).toFixed(1)} MB`;
  }
  return `${(sizeInBytes / 1024).toFixed(1)} KB`;
}

function formatDateTime(value: string | null) {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFileType(file: FileDetail) {
  if (file.file_type) return file.file_type.toUpperCase();
  return file.source_type === 'upload' ? 'UPLOAD' : 'DATA';
}

function getStatusHint(status: string, parseErrorCode?: string | null): string {
  if (status === 'failed_terminal' && parseErrorCode === 'ocr_not_configured') {
    return 'OCR 설정 오류 — 관리자에게 문의하세요';
  }
  if (parseErrorCode === 'image_too_large') {
    return '이미지가 너무 큽니다 — 해상도를 낮춰 다시 업로드하세요';
  }
  if (parseErrorCode === 'image_unreadable') {
    return '이미지를 읽을 수 없습니다 — 파일이 손상되었을 수 있습니다';
  }
  if (parseErrorCode === 'storage_quota_exceeded') {
    return '일시적인 서비스 용량 한도 — 잠시 후 다시 시도하세요';
  }
  if (parseErrorCode === 'storage_access_denied' || parseErrorCode === 'storage_not_found') {
    return '파일을 찾을 수 없습니다 — 다시 업로드하세요';
  }
  const hints: Record<string, string> = {
    ready: '퀴즈 생성 가능',
    failed_partial: '일부만 사용 가능',
    failed_terminal: '다시 업로드하세요',
  };
  return hints[status.toLowerCase()] || '';
}

function FilesSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-12 py-10 animate-pulse" aria-hidden="true">
      <section className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <div className="skeleton h-9 w-36 rounded-md" />
            <div className="skeleton h-4 w-80 rounded-md" />
          </div>
          <div className="flex gap-3">
            <div className="skeleton h-20 w-28 rounded-2xl" />
            <div className="skeleton h-20 w-28 rounded-2xl" />
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[240px_1fr] items-start">
        <aside className="space-y-2">
          <div className="bg-surface border border-white/[0.05] rounded-3xl p-5 space-y-3">
            <div className="skeleton h-3 w-16 rounded-md mb-4" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full rounded-xl" />
            ))}
          </div>
        </aside>

        <div className="space-y-8">
          <div className="border-2 border-dashed border-white/[0.1] rounded-3xl p-12 flex flex-col items-center gap-4">
            <div className="skeleton h-16 w-16 rounded-full" />
            <div className="skeleton h-5 w-36 rounded-md" />
            <div className="skeleton h-4 w-56 rounded-md" />
            <div className="skeleton h-10 w-28 rounded-xl" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
              <div className="skeleton h-7 w-28 rounded-md" />
              <div className="skeleton h-9 w-32 rounded-xl" />
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-surface border border-white/[0.05] rounded-3xl p-5">
                <div className="flex items-start gap-4">
                  <div className="skeleton h-5 w-5 rounded mt-1 shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="skeleton h-6 w-14 rounded-md" />
                      <div className="skeleton h-4 w-40 rounded-md" />
                    </div>
                    <div className="skeleton h-6 w-64 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Files() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFilename, setEditingFilename] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const moveModal = useModalState();
  const fileDeleteModal = useModalState<FileDetail>();
  const folderDeleteModal = useModalState<{ id: string; name: string }>();
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const maxUploadMB = useAuthStore((s) => s.user?.max_upload_mb);

  const upload = useMultiFileUpload({
    concurrency: 3,
    folderId: selectedFolderId,
    maxSizeMB: maxUploadMB,
  });

  const { data: folderData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => filesApi.listFolders(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['files', page, statusFilter, selectedFolderId],
    queryFn: () => filesApi.listFiles(page, 20, selectedFolderId, statusFilter || null),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.files.some((file) => isFileProcessingStatus(file.status)) ? 3000 : false,
    refetchIntervalInBackground: true,
  });

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      fileDeleteModal.close();
      setDeleteError(null);
    },
    onError: () => {
      setDeleteError('삭제에 실패했습니다. 다시 시도해 주세요.');
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ fileId, newName }: { fileId: string; newName: string }) =>
      filesApi.renameFile(fileId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setEditingFileId(null);
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ fileIds, folderId }: { fileIds: string[]; folderId: string | null }) =>
      Promise.all(fileIds.map((fileId) => filesApi.moveFile(fileId, folderId))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setSelectedFileIds([]);
      moveModal.close();
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

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => filesApi.deleteFolder(folderId),
    onSuccess: (_, folderId) => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setSelectedFolderId((current) => (current === folderId ? null : current));
      folderDeleteModal.close();
    },
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: (fileIds: string[]) =>
      Promise.all(fileIds.map((fileId) => filesApi.deleteFile(fileId))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setSelectedFileIds([]);
    },
  });

  const retryMutation = useMutationWithInvalidation(
    ['files'],
    (fileId: string) => filesApi.retryFile(fileId),
  );

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) upload.enqueue(files);
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((current) =>
      current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]
    );
  };

  const beginRename = (file: FileDetail) => {
    setEditingFileId(file.id);
    setEditingFilename(file.original_filename || '');
  };

  const saveRename = () => {
    if (editingFileId && editingFilename.trim()) {
      renameMutation.mutate({ fileId: editingFileId, newName: editingFilename.trim() });
    }
  };

  const files = data?.files ?? [];
  const folders = folderData ?? [];
  const selectedCount = selectedFileIds.length;

  const visibleFileIds = useMemo(() => files.map((f) => f.id), [files]);
  const selectedVisibleCount = useMemo(
    () => visibleFileIds.filter((id) => selectedFileIds.includes(id)).length,
    [visibleFileIds, selectedFileIds]
  );
  const allVisibleSelected =
    visibleFileIds.length > 0 && selectedVisibleCount === visibleFileIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleFileIds.length;

  useLayoutEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const handleSelectAllToggle = () => {
    if (allVisibleSelected) {
      setSelectedFileIds((prev) => prev.filter((id) => !visibleFileIds.includes(id)));
    } else {
      setSelectedFileIds((prev) => {
        const merged = new Set(prev);
        visibleFileIds.forEach((id) => merged.add(id));
        return Array.from(merged);
      });
    }
  };

  return (
    <SkeletonTransition loading={isLoading} skeleton={<FilesSkeleton />}>
    {isLoading ? null : (
    <div className="max-w-6xl mx-auto space-y-12 py-10 animate-fade-in">
      {/* Header Section */}
      <section className="animate-fade-in-up space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">자료 관리</h1>
            <p className="text-base text-content-secondary max-w-xl leading-relaxed">
              학습 자료를 업로드하고 관리합니다. 업로드된 파일은 AI가 처리해 퀴즈 생성에 활용됩니다.
            </p>
          </div>
          
          <div className="flex gap-3">
            <div className="bg-surface border border-white/[0.05] rounded-2xl px-6 py-3.5 text-center">
              <div className="text-xs font-medium text-content-muted mb-1">전체 자료</div>
              <div className="text-xl font-semibold text-white">{data?.total ?? 0}</div>
            </div>
            <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl px-6 py-3.5 text-center">
              <div className="text-xs font-medium text-brand-300 mb-1">학습 가능</div>
              <div className="text-xl font-semibold text-brand-300">{files.filter(f => f.status === 'ready').length}</div>
            </div>
          </div>
        </div>
      </section>

       {/* Main Grid */}
       <section className="grid gap-8 lg:grid-cols-[240px_1fr] items-start" data-tour="files-area">
        {/* Sidebar: Folders */}
        <aside className="animate-fade-in-up space-y-6">
          <div className="bg-surface border border-white/[0.05] rounded-3xl p-5 space-y-4">
            <h2 className="text-xs font-semibold text-content-muted px-2">폴더</h2>
            <div className="space-y-1">
              <button
                onClick={() => { setSelectedFolderId(null); setPage(1); setSelectedFileIds([]); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  selectedFolderId === null ? 'bg-surface-raised text-white shadow-sm border border-white/[0.05]' : 'text-content-secondary hover:bg-surface-hover hover:text-white border border-transparent'
                }`}
              >
                <span>모든 자료</span>
              </button>
              {folders.map((folder) => (
                <div key={folder.id} className="group/folder relative">
                  <button
                    onClick={() => { setSelectedFolderId(folder.id); setPage(1); setSelectedFileIds([]); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors pr-8 ${
                      selectedFolderId === folder.id ? 'bg-surface-raised text-white shadow-sm border border-white/[0.05]' : 'text-content-secondary hover:bg-surface-hover hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="truncate">{folder.name}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); folderDeleteModal.open({ id: folder.id, name: folder.name }); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-content-muted hover:text-semantic-error hover:bg-semantic-error/10 opacity-0 group-hover/folder:opacity-100 transition-all"
                    title="폴더 삭제"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/[0.05]">
              {creatingFolder ? (
                <div className="space-y-3">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createFolderMutation.mutate(newFolderName.trim())}
                    placeholder="새 폴더 이름"
                    className="w-full bg-surface-deep border border-white/[0.05] rounded-xl text-sm px-3 py-2.5 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => createFolderMutation.mutate(newFolderName.trim())}
                      className="flex-1 bg-brand-500 text-brand-900 rounded-lg py-2 text-xs font-semibold"
                    >
                      확인
                    </button>
                    <button
                      onClick={() => setCreatingFolder(false)}
                      className="flex-1 bg-surface-deep text-content-secondary border border-white/[0.05] rounded-lg py-2 text-xs font-medium hover:bg-surface-hover"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingFolder(true)}
                  className="w-full flex items-center justify-center gap-2 bg-surface-deep py-2.5 rounded-xl text-sm font-medium text-content-secondary hover:text-white hover:bg-surface-hover transition-colors border border-transparent"
                >
                  <Plus size={16} />
                  새 폴더 추가
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="animate-fade-in-up stagger-1 space-y-8">
           {/* Upload Area */}
           <div
             onDragEnter={handleDrag}
             onDragLeave={handleDrag}
             onDragOver={handleDrag}
             onDrop={handleDrop}
             className={`relative group border-2 border-dashed rounded-3xl p-12 transition-all text-center ${
               dragActive ? 'bg-brand-500/5 border-brand-500/50' : 'bg-surface/50 border-white/[0.1] hover:border-brand-500/30 hover:bg-surface'
             }`}
             data-tour="files-upload"
           >
            <input
              type="file"
              id="file-upload"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) {
                  upload.enqueue(files);
                  e.target.value = '';
                }
              }}
            />
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-surface-deep border border-white/[0.05] flex items-center justify-center text-content-muted group-hover:text-brand-300 group-hover:scale-110 transition-all">
                <Upload size={24} />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-1">새 자료 업로드</h3>
                <p className="text-sm text-content-secondary">클릭하거나 파일을 이곳에 드래그 앤 드롭하세요</p>
              </div>
              <label
                htmlFor="file-upload"
                className="inline-flex bg-brand-500 text-brand-900 rounded-xl px-6 py-2.5 text-sm font-semibold cursor-pointer hover:-translate-y-0.5 transition-transform"
              >
                파일 선택
              </label>
            </div>
          </div>

          <UploadQueue
            items={upload.items}
            activeCount={upload.activeCount}
            completedCount={upload.completedCount}
            failedCount={upload.failedCount}
            totalCount={upload.totalCount}
            onCancelItem={upload.cancelItem}
            onRetryItem={upload.retryItem}
            onRemoveItem={upload.removeItem}
            onClearFinished={upload.clearFinished}
            onCancelAll={upload.cancelAll}
          />

          {/* List Section */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.05] pb-4">
              <h2 className="text-xl font-semibold text-white">저장된 자료</h2>
              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); setSelectedFileIds([]); }}
                  className="bg-surface border border-white/[0.05] rounded-xl text-sm px-4 py-2 text-content-primary focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">모든 상태</option>
                  <option value="uploaded">업로드됨</option>
                  <option value="ready">학습 가능</option>
                  <option value="failed_terminal">실패</option>
                </select>
                <Link to="/quiz/new" className="bg-surface-deep border border-white/[0.05] text-white rounded-xl px-5 py-2 text-sm font-medium hover:bg-surface-hover transition-colors">새 퀴즈</Link>
              </div>
            </div>

            {files.length > 0 && (
              <label className="flex items-center gap-4 px-5 py-2 cursor-pointer select-none">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={handleSelectAllToggle}
                  className="w-5 h-5 rounded border-white/[0.1] bg-surface text-brand-500 focus:ring-brand-500"
                  aria-label={allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                />
                <span className="text-xs font-medium text-content-secondary">
                  {allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                </span>
                <span className="ml-auto text-xs tabular-nums text-content-muted">
                  {selectedVisibleCount} / {visibleFileIds.length}
                </span>
              </label>
            )}

            {files.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-4 text-center bg-surface border border-white/[0.05] rounded-3xl">
                <p className="text-sm text-content-secondary">조건에 맞는 자료가 없습니다.</p>
                {statusFilter || selectedFolderId ? (
                  <button
                    onClick={() => { setStatusFilter(''); setSelectedFolderId(null); }}
                    className="text-xs font-medium text-brand-300 hover:text-white transition-colors underline underline-offset-2"
                  >
                    필터 초기화
                  </button>
                ) : (
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center gap-2 bg-brand-500 text-brand-900 rounded-xl px-5 py-2.5 text-sm font-semibold cursor-pointer hover:-translate-y-0.5 transition-transform"
                  >
                    <Upload size={14} />
                    첫 자료 업로드하기
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file) => {
                  const isEditing = editingFileId === file.id;
                  const isSelected = selectedFileIds.includes(file.id);

                  return (
                    <article
                      key={file.id}
                      className={`group relative rounded-3xl border transition-all p-5 ${isSelected ? 'bg-brand-500/5 border-brand-500/30' : 'bg-surface border-white/[0.05] hover:bg-surface-hover'}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="pt-1.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFileSelection(file.id)}
                            className="w-5 h-5 rounded border-white/[0.1] bg-surface-deep text-brand-500 focus:ring-brand-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-medium text-brand-300 bg-brand-500/10 px-2 py-1 rounded-md">
                              {formatFileType(file)}
                            </span>
                            <span className="text-xs text-content-muted">
                              {formatFileSize(file.file_size_bytes)} · {formatDateTime(file.created_at)}
                            </span>
                            <StatusBadge status={file.status} />
                          </div>

                          {isEditing ? (
                            <div className="flex gap-2 max-w-lg">
                              <input
                                autoFocus
                                value={editingFilename}
                                onChange={(e) => setEditingFilename(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                                className="flex-1 bg-surface-deep border border-white/[0.05] rounded-xl text-sm font-medium px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                              />
                              <button onClick={saveRename} className="bg-brand-500 text-brand-900 rounded-xl px-4 py-2 text-xs font-semibold">저장</button>
                              <button onClick={() => setEditingFileId(null)} className="bg-surface-deep text-content-secondary border border-white/[0.05] rounded-xl px-4 py-2 text-xs font-medium">취소</button>
                            </div>
                          ) : (
                            <div>
                              <h2 className="text-lg font-medium text-white truncate group-hover:text-brand-300 transition-colors">
                                {file.original_filename || '제목 없는 자료'}
                              </h2>
                              {getStatusHint(file.status, file.parse_error_code) && (
                                <p className="text-xs text-content-muted mt-0.5">
                                  {getStatusHint(file.status, file.parse_error_code)}
                                </p>
                              )}
                            </div>
                          )}

                           <div className="flex flex-wrap gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             {file.status === 'ready' && (
                               <button onClick={() => navigate(`/study/${file.id}`)} className="flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 transition-colors">
                                 <BookOpen size={14} /> 학습 시작
                               </button>
                             )}
                             <button onClick={() => filesApi.downloadFile(file.id)} className="flex items-center gap-1.5 bg-surface-deep border border-white/[0.05] rounded-lg px-3 py-1.5 text-xs font-medium text-content-secondary hover:text-white transition-colors">
                               <Download size={14} /> 다운로드
                             </button>
                             <button onClick={() => beginRename(file)} className="flex items-center gap-1.5 bg-surface-deep border border-white/[0.05] rounded-lg px-3 py-1.5 text-xs font-medium text-content-secondary hover:text-white transition-colors">
                               <Edit3 size={14} /> 이름 변경
                             </button>
                             {failedStatuses.includes(file.status) && (
                               <button onClick={() => retryMutation.mutate(file.id)} className="flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 transition-colors">
                                 <RotateCw size={14} /> 재시도
                               </button>
                             )}
                              <button onClick={() => fileDeleteModal.open(file)} className="flex items-center gap-1.5 bg-semantic-error/10 border border-semantic-error/20 rounded-lg px-3 py-1.5 text-xs font-medium text-semantic-error hover:bg-semantic-error/20 transition-colors">
                               <Trash2 size={14} /> 삭제
                             </button>
                           </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {data && data.total > data.size && (
              <div className="flex justify-center pt-8">
                <Pagination currentPage={page} totalPages={Math.ceil(data.total / data.size)} onPageChange={(p) => { setPage(p); setSelectedFileIds([]); }} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Floating Batch Actions */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 animate-fade-in-up">
          <div className="max-w-4xl mx-auto mb-6 px-4">
            <div className="bg-surface border border-white/[0.1] rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between shadow-2xl shadow-black/50 backdrop-blur-xl gap-4">
              <div className="text-white flex items-center gap-2">
                <span className="text-xl font-semibold">{selectedCount}</span>
                <span className="text-sm text-content-secondary">개 선택됨</span>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={() => deleteSelectedMutation.mutate(selectedFileIds)}
                  className="flex-1 sm:flex-none text-semantic-error bg-semantic-error/10 px-4 py-2 text-sm font-medium border border-semantic-error/20 rounded-xl hover:bg-semantic-error/20 transition-all"
                >
                  선택 삭제
                </button>
                <button
                  onClick={moveModal.open}
                  className="flex-1 sm:flex-none bg-brand-500 text-brand-900 px-6 py-2 text-sm font-semibold rounded-xl hover:-translate-y-0.5 transition-transform"
                >
                  폴더로 이동
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={fileDeleteModal.isOpen} onClose={fileDeleteModal.close} title="자료 삭제 확인">
        <div className="space-y-6">
          <div className="bg-surface-deep p-5 rounded-2xl border border-white/[0.05]">
            <p className="text-sm text-content-secondary">
              <span className="text-white font-medium">{fileDeleteModal.value?.original_filename}</span> 자료를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
          </div>
          {deleteError && (
            <p className="text-sm text-semantic-error">{deleteError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { fileDeleteModal.close(); setDeleteError(null); }} className="flex-1 py-2.5 text-sm font-medium text-content-secondary border border-white/[0.05] bg-surface rounded-xl hover:bg-surface-hover">취소</button>
            <button
              onClick={() => {
                if (!fileDeleteModal.value) return;
                deleteMutation.mutate(fileDeleteModal.value.id);
              }}
              disabled={deleteMutation.isPending}
              className="flex-1 bg-semantic-error text-white py-2.5 text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
            >
              {deleteMutation.isPending ? '삭제 중...' : '삭제하기'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={folderDeleteModal.isOpen} onClose={folderDeleteModal.close} title="폴더 삭제 확인">
        <div className="space-y-6">
          <div className="bg-surface-deep p-5 rounded-2xl border border-white/[0.05]">
            <p className="text-sm text-content-secondary">
              <span className="text-white font-medium">{folderDeleteModal.value?.name}</span> 폴더를 삭제하시겠습니까? 폴더 안의 파일은 삭제되지 않고 루트로 이동됩니다.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={folderDeleteModal.close} className="flex-1 py-2.5 text-sm font-medium text-content-secondary border border-white/[0.05] bg-surface rounded-xl hover:bg-surface-hover">취소</button>
            <button
              onClick={() => { if (folderDeleteModal.value) deleteFolderMutation.mutate(folderDeleteModal.value.id); }}
              disabled={deleteFolderMutation.isPending}
              className="flex-1 bg-semantic-error text-white py-2.5 text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
            >
              {deleteFolderMutation.isPending ? '삭제 중...' : '삭제하기'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={moveModal.isOpen} onClose={moveModal.close} title="폴더 이동">
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-content-primary">이동할 위치를 선택하세요</label>
            <select
              value={moveTargetFolderId ?? ''}
              onChange={(e) => setMoveTargetFolderId(e.target.value || null)}
              className="w-full bg-surface border border-white/[0.05] text-sm px-4 py-3 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">모든 자료 (루트)</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={moveModal.close} className="flex-1 py-2.5 text-sm font-medium text-content-secondary border border-white/[0.05] bg-surface rounded-xl hover:bg-surface-hover">취소</button>
            <button
              onClick={() => moveMutation.mutate({ fileIds: selectedFileIds, folderId: moveTargetFolderId })}
              className="flex-1 bg-brand-500 text-brand-900 py-2.5 text-sm font-semibold rounded-xl hover:-translate-y-0.5 transition-transform"
            >
              이동하기
            </button>
          </div>
        </div>
      </Modal>
    </div>
    )}
    </SkeletonTransition>
  );
}
