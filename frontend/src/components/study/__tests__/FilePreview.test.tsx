import { render, screen } from '@testing-library/react';

vi.mock('../PdfViewer', () => ({ PdfViewer: () => <div data-testid="pdf-mock" /> }));
vi.mock('../ImageViewer', () => ({ ImageViewer: () => <div data-testid="image-mock" /> }));
vi.mock('../TextViewer', () => ({ TextViewer: () => <div data-testid="text-mock" /> }));
vi.mock('../MarkdownViewer', () => ({ MarkdownViewer: () => <div data-testid="markdown-mock" /> }));
vi.mock('../DocxViewer', () => ({ DocxViewer: () => <div data-testid="docx-mock" /> }));
vi.mock('../PptxViewer', () => ({ PptxViewer: () => <div data-testid="pptx-mock" /> }));

import { FilePreview } from '../FilePreview';

describe('FilePreview', () => {
  it.each([
    ['pdf', 'pdf-mock'],
    ['png', 'image-mock'],
    ['jpg', 'image-mock'],
    ['jpeg', 'image-mock'],
    ['JPG', 'image-mock'],
    ['PDF', 'pdf-mock'],
    ['docx', 'docx-mock'],
    ['pptx', 'pptx-mock'],
    ['txt', 'text-mock'],
    ['md', 'markdown-mock'],
  ])('fileType=%s renders %s', async (fileType, testId) => {
    render(<FilePreview url="/test" fileType={fileType} />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it.each([[null], [undefined], ['xyz']])(
    'fileType=%s renders nothing',
    (fileType) => {
      const { container } = render(
        <FilePreview url="/test" fileType={fileType as string | null | undefined} />,
      );
      expect(container.firstChild).toBeNull();
    },
  );
});
