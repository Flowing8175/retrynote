import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Upload, Trash2, Download, Edit3, RotateCw, Plus } from 'lucide-react';
import type { AxiosError } from 'axios';
import { filesApi } from '@/api';
import { LoadingSpinner, Modal, Pagination, StatusBadge } from '@/components';
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
  const [dragActive, setDragActive] = useState(false);
  const [filePendingDelete, setFilePendingDelete] = useState<FileDetail | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.uploadFile(file, null, null, null),
    onSuccess: () => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      const status = error.response?.status;
      if (status === 413) setUploadError('파일 용량 초과 (최대 5MB)');
      else if (status === 415) setUploadError('지원하지 않는 파일 형식입니다');
      else setUploadError(error.response?.data?.detail ?? '업로드에 실패했습니다');
    },
  });

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setFilePendingDelete(null);
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
    },
  });

  const retryMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.retryFile(fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files'] }),
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) uploadMutation.mutate(e.dataTransfer.files[0]);
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

  if (isLoading) return <LoadingSpinner message="자료실을 불러오고 있습니다" />;

  const files = data?.files ?? [];
  const folders = folderData ?? [];
  const selectedCount = selectedFileIds.length;

  return (
    <div className="max-w-6xl mx-auto space-y-12 py-10">
      {/* Header Section */}
      <section className="animate-fade-in-up space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">자료실</h1>
            <p className="text-base text-content-secondary max-w-xl leading-relaxed">
              지식의 근간이 되는 원천 자료를 관리합니다. 업로드된 데이터는 AI 분석을 거쳐 맞춤형 퀴즈의 재료가 됩니다.
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
      <section className="grid gap-8 lg:grid-cols-[240px_1fr] items-start">
        {/* Sidebar: Folders */}
        <aside className="animate-fade-in-up space-y-6">
          <div className="bg-surface border border-white/[0.05] rounded-3xl p-5 space-y-4">
            <h2 className="text-xs font-semibold text-content-muted px-2">폴더</h2>
            <div className="space-y-1">
              <button
                onClick={() => { setSelectedFolderId(null); setPage(1); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  selectedFolderId === null ? 'bg-surface-raised text-white shadow-sm border border-white/[0.05]' : 'text-content-secondary hover:bg-surface-hover hover:text-white border border-transparent'
                }`}
              >
                <span>모든 자료</span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => { setSelectedFolderId(folder.id); setPage(1); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    selectedFolderId === folder.id ? 'bg-surface-raised text-white shadow-sm border border-white/[0.05]' : 'text-content-secondary hover:bg-surface-hover hover:text-white border border-transparent'
                  }`}
                >
                  <span className="truncate">{folder.name}</span>
                </button>
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
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  uploadMutation.mutate(e.target.files[0]);
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
            {uploadMutation.isPending && (
              <div className="absolute inset-0 bg-surface/80 rounded-3xl flex items-center justify-center backdrop-blur-sm z-10">
                <div className="bg-surface-raised border border-white/[0.1] rounded-2xl px-6 py-4 shadow-xl flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium text-white">업로드 및 처리 중...</span>
                </div>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="bg-semantic-error/10 border border-semantic-error/20 rounded-2xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-semantic-error">{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="text-semantic-error/70 hover:text-semantic-error">✕</button>
            </div>
          )}

          {/* List Section */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.05] pb-4">
              <h2 className="text-xl font-semibold text-white">저장된 자료</h2>
              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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

            {files.length === 0 ? (
              <div className="py-16 text-center bg-surface border border-white/[0.05] rounded-3xl">
                <p className="text-sm text-content-muted">조건에 맞는 자료가 없습니다.</p>
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
                            <h2 className="text-lg font-medium text-white truncate group-hover:text-brand-300 transition-colors">
                              {file.original_filename || '제목 없는 자료'}
                            </h2>
                          )}

                          <div className="flex flex-wrap gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                            <button onClick={() => setFilePendingDelete(file)} className="flex items-center gap-1.5 bg-semantic-error/10 border border-semantic-error/20 rounded-lg px-3 py-1.5 text-xs font-medium text-semantic-error hover:bg-semantic-error/20 transition-colors">
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
                <Pagination currentPage={page} totalPages={Math.ceil(data.total / data.size)} onPageChange={setPage} />
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
                  onClick={() => setMoveDialogOpen(true)}
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
      <Modal isOpen={filePendingDelete !== null} onClose={() => setFilePendingDelete(null)} title="자료 삭제 확인">
        <div className="space-y-6">
          <div className="bg-surface-deep p-5 rounded-2xl border border-white/[0.05]">
            <p className="text-sm text-content-secondary">
              <span className="text-white font-medium">{filePendingDelete?.original_filename}</span> 자료를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
          </div>
          {deleteError && (
            <p className="text-sm text-semantic-error">{deleteError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setFilePendingDelete(null); setDeleteError(null); }} className="flex-1 py-2.5 text-sm font-medium text-content-secondary border border-white/[0.05] bg-surface rounded-xl hover:bg-surface-hover">취소</button>
            <button
              onClick={() => {
                if (!filePendingDelete) return;
                deleteMutation.mutate(filePendingDelete.id);
              }}
              disabled={deleteMutation.isPending}
              className="flex-1 bg-semantic-error text-white py-2.5 text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
            >
              {deleteMutation.isPending ? '삭제 중...' : '삭제하기'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} title="폴더 이동">
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
            <button onClick={() => setMoveDialogOpen(false)} className="flex-1 py-2.5 text-sm font-medium text-content-secondary border border-white/[0.05] bg-surface rounded-xl hover:bg-surface-hover">취소</button>
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
  );
}
