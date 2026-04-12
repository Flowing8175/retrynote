import type { Step } from 'react-joyride';
import type { NavigateFunction } from 'react-router-dom';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function getTourSteps(navigate: NavigateFunction): Step[] {
  return [
    {
      target: 'body',
      title: 'RetryNote에 오신 것을 환영합니다',
      content: '학습 자료를 업로드하면 AI가 퀴즈를 자동으로 만들고, 오답을 분석해 약점을 보완해드립니다.',
      placement: 'center',
      skipBeacon: true,
    },
    {
      target: '[data-tour="dashboard-stats"]',
      title: '나의 학습 현황',
      content: '정확도, 풀었던 퀴즈 수, 취약 개념을 한눈에 확인할 수 있습니다.',
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="sidebar-nav"]',
      title: '메뉴 구성',
      content: '사이드바에서 파일 관리, 퀴즈 생성, 오답 노트, 재도전으로 이동할 수 있습니다.',
      placement: 'right',
      skipBeacon: true,
    },
    {
      target: '[data-tour="files-area"]',
      title: '학습 자료 관리',
      content: '공부할 PDF, 문서, 이미지를 여기에 업로드합니다. 업로드된 파일이 퀴즈의 원본 자료가 됩니다.',
      placement: 'bottom',
      skipBeacon: true,
      before: async () => {
        navigate('/files');
        await delay(400);
      },
    },
    {
      target: '[data-tour="files-upload"]',
      title: '파일 업로드',
      content: '여기에 파일을 드래그하거나 클릭해서 업로드하세요. PDF, 문서, 이미지 파일을 지원합니다.',
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="quiz-source"]',
      title: '퀴즈 생성',
      content: '업로드한 파일을 선택하면 AI가 해당 내용을 바탕으로 퀴즈를 만들어 드립니다.',
      placement: 'bottom',
      skipBeacon: true,
      before: async () => {
        navigate('/quiz/new');
        await delay(400);
      },
    },
    {
      target: '[data-tour="quiz-options"]',
      title: '퀴즈 설정',
      content: '난이도, 문제 유형, AI 모델을 선택해 원하는 방식으로 퀴즈를 구성하세요.',
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="wrong-notes-list"]',
      title: '오답 노트',
      content: '틀린 문제들이 여기에 자동으로 저장됩니다. 개념별로 정리되어 약점을 파악하기 쉽습니다.',
      placement: 'bottom',
      skipBeacon: true,
      before: async () => {
        navigate('/wrong-notes');
        await delay(400);
      },
    },
    {
      target: '[data-tour="wrong-notes-item"]',
      title: '오답 상세 보기',
      content: '각 오답을 클릭하면 문제, 정답, 해설을 확인할 수 있습니다.',
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="retry-form"]',
      title: '재도전 시스템',
      content: '오답 노트에서 선택한 문제로 맞춤 재도전 퀴즈를 생성합니다. 취약 개념을 집중적으로 복습하세요.',
      placement: 'bottom',
      skipBeacon: true,
      before: async () => {
        navigate('/retry');
        await delay(400);
      },
    },
    {
      target: '[data-tour="settings-account"]',
      title: '계정 설정',
      content: '계정 정보와 구독 설정을 확인할 수 있습니다. 언제든 이 투어를 다시 볼 수 있습니다.',
      placement: 'bottom',
      skipBeacon: true,
      before: async () => {
        navigate('/settings');
        await delay(400);
      },
    },
    {
      target: 'body',
      title: '준비 완료!',
      content: '이제 RetryNote를 시작할 준비가 됐습니다. 파일을 업로드하고 첫 퀴즈를 만들어보세요!',
      placement: 'center',
      skipBeacon: true,
    },
  ];
}
