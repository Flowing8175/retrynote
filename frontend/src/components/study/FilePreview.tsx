import { lazy, Suspense, ComponentType } from 'react';

interface FilePreviewProps {
  url: string;
  fileType: string | null | undefined;
}

const PdfViewer = lazy(() =>
  import('./PdfViewer').then((m) => ({ default: m.PdfViewer }))
);
const ImageViewer = lazy(() =>
  import('./ImageViewer').then((m) => ({ default: m.ImageViewer }))
);
const TextViewer = lazy(() =>
  import('./TextViewer').then((m) => ({ default: m.TextViewer }))
);
const MarkdownViewer = lazy(() =>
  import('./MarkdownViewer').then((m) => ({ default: m.MarkdownViewer }))
);
const DocxViewer = lazy(() =>
  import('./DocxViewer').then((m) => ({ default: m.DocxViewer }))
);
const PptxViewer = lazy(() =>
  import('./PptxViewer').then((m) => ({ default: m.PptxViewer }))
);

export function FilePreview({ url, fileType }: FilePreviewProps) {
  const t = fileType?.toLowerCase();
  let Viewer: ComponentType<{ url: string }> | null = null;

  switch (t) {
    case 'pdf':
      Viewer = PdfViewer as ComponentType<{ url: string }>;
      break;
    case 'png':
    case 'jpg':
    case 'jpeg':
      Viewer = ImageViewer;
      break;
    case 'txt':
      Viewer = TextViewer;
      break;
    case 'md':
      Viewer = MarkdownViewer;
      break;
    case 'docx':
      Viewer = DocxViewer;
      break;
    case 'pptx':
      Viewer = PptxViewer;
      break;
    default:
      return null;
  }

  return (
    <div data-testid="file-preview" className="h-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
          </div>
        }
      >
        <Viewer url={url} />
      </Suspense>
    </div>
  );
}
