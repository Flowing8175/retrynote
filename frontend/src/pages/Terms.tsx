export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-sm leading-relaxed" style={{ color: 'oklch(0.75 0.01 250)' }}>
      <h1 className="text-2xl font-semibold mb-2" style={{ color: 'oklch(0.92 0.01 250)' }}>이용약관</h1>
      <p className="mb-8 text-xs" style={{ color: 'oklch(0.50 0.01 250)' }}>최종 수정일: 2026년 4월 6일</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제1조 (목적)</h2>
        <p>이 약관은 RetryNote(이하 "서비스")가 제공하는 AI 기반 학습 퀴즈 서비스의 이용 조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제2조 (서비스 내용)</h2>
        <p className="mb-2">RetryNote는 다음의 서비스를 제공합니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>문서 및 노트 업로드 기반 AI 퀴즈 자동 생성</li>
          <li>AI 기반 답변 채점 및 오답 분석</li>
          <li>OCR을 통한 이미지·PDF 텍스트 추출</li>
          <li>학습 이력 관리 및 약점 분석</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제3조 (요금제 및 결제)</h2>
        <p className="mb-2">서비스는 Free, Learner Lite, Learner Pro 요금제를 제공합니다. 유료 요금제는 월간 또는 분기 구독으로 결제됩니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>결제는 Paddle을 통해 처리되며, Paddle이 판매자 역할을 담당합니다.</li>
          <li>구독은 결제일 기준으로 자동 갱신됩니다.</li>
          <li>요금제별 사용 한도(퀴즈 생성 횟수, OCR 페이지, 저장 공간)는 서비스 내 고지된 내용을 따릅니다.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제4조 (이용자 의무)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>이용자는 타인의 저작권을 침해하는 자료를 업로드해서는 안 됩니다.</li>
          <li>서비스를 상업적 목적으로 무단 재배포하거나 자동화된 방식으로 남용하는 행위를 금지합니다.</li>
          <li>계정 정보를 타인과 공유해서는 안 됩니다.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제5조 (서비스 변경 및 중단)</h2>
        <p>서비스는 운영상 필요에 따라 기능을 변경하거나 일시적으로 중단할 수 있습니다. 유료 서비스의 중단 시에는 사전 고지 후 이용 기간에 비례한 환불을 제공합니다.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제6조 (면책)</h2>
        <p>서비스는 AI가 생성한 퀴즈 및 채점 결과의 정확성을 보장하지 않습니다. 학습 보조 도구로 활용하되 최종 판단은 이용자가 직접 하시기 바랍니다.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제7조 (준거법)</h2>
        <p>이 약관은 대한민국 법률에 따라 해석되며, 분쟁 발생 시 대한민국 법원을 관할로 합니다.</p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>제8조 (문의)</h2>
        <p>이용약관에 관한 문의는 <a href="mailto:support@retrynote.cloud" className="underline" style={{ color: 'oklch(0.65 0.15 175)' }}>support@retrynote.cloud</a>로 연락해 주세요.</p>
      </section>
    </div>
  );
}
