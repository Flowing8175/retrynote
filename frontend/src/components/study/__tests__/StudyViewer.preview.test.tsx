import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useStudyStatus } from '@/api/study';

vi.mock('@/api/study', () => ({
  useStudyStatus: vi.fn(),
  useTrackStudyVisit: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/study/FilePreview', () => ({
  FilePreview: ({ fileType }: { fileType?: string }) => (
    <div data-testid="file-preview-mock" data-filetype={fileType ?? ''} />
  ),
}));

vi.mock('@/components/study/SummaryTab', () => ({ SummaryTab: () => <div /> }));
vi.mock('@/components/study/FlashcardTab', () => ({ FlashcardTab: () => <div /> }));
vi.mock('@/components/study/MindmapTab', () => ({ MindmapTab: () => <div /> }));
vi.mock('@/components/study/TutorTab', () => ({ TutorTab: () => <div /> }));
vi.mock('@/components/study/MemoryNotesTab', () => ({ MemoryNotesTab: () => <div /> }));
vi.mock('@/api/createApiClient', () => ({ API_BASE_URL: 'http://test' }));

import StudyViewer from '@/pages/StudyViewer';

function setStatus(file_type: string | null) {
  (useStudyStatus as ReturnType<typeof vi.fn>).mockReturnValue({
    data: {
      file_type,
      filename: 'f.x',
      is_short_document: false,
      status: 'ready',
      summary_status: 'not_generated',
      flashcards_status: 'not_generated',
      mindmap_status: 'not_generated',
      concept_notes_status: 'not_generated',
    },
    isLoading: false,
    isError: false,
    error: null,
  });
}

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={['/study/file-1']}>
      <Routes>
        <Route path="/study/:fileId" element={<StudyViewer />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StudyViewer — file preview', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders file-preview-mock with data-filetype for docx', async () => {
    setStatus('docx');
    renderViewer();
    const el = await screen.findByTestId('file-preview-mock');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('data-filetype', 'docx');
  });

  it('renders file-preview-mock and 원본 보기 for png', async () => {
    setStatus('png');
    renderViewer();
    await screen.findByTestId('file-preview-mock');
    expect(screen.getByText('원본 보기')).toBeInTheDocument();
  });

  it('renders file-preview-mock for pdf (regression)', async () => {
    setStatus('pdf');
    renderViewer();
    expect(await screen.findByTestId('file-preview-mock')).toBeInTheDocument();
  });

  it('does not render file-preview-mock when file_type is null', () => {
    setStatus(null);
    renderViewer();
    expect(screen.queryByTestId('file-preview-mock')).toBeNull();
  });
});
