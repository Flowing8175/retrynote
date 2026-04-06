export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-sm leading-relaxed" style={{ color: 'oklch(0.75 0.01 250)' }}>
      <h1 className="text-2xl font-semibold mb-2" style={{ color: 'oklch(0.92 0.01 250)' }}>개인정보처리방침</h1>
      <p className="mb-8 text-xs" style={{ color: 'oklch(0.50 0.01 250)' }}>최종 수정일: 2026년 4월 6일</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>1. 수집하는 개인정보</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>회원가입 시:</strong> 이메일 주소, 사용자명, 암호화된 비밀번호</li>
          <li><strong>서비스 이용 시:</strong> 업로드한 파일(학습 자료), 퀴즈 답변 이력, 학습 통계</li>
          <li><strong>결제 시:</strong> 결제 처리는 Paddle이 담당하며, 카드 정보는 당사 서버에 저장되지 않습니다.</li>
          <li><strong>자동 수집:</strong> 서비스 이용 로그, IP 주소(보안 목적)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>2. 개인정보 이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 인증 및 계정 관리</li>
          <li>AI 퀴즈 생성 및 학습 서비스 제공</li>
          <li>구독 및 결제 처리</li>
          <li>서비스 개선 및 오류 분석</li>
          <li>법령상 의무 이행</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>3. 개인정보 보관 기간</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>계정 정보: 회원 탈퇴 후 30일 이내 삭제</li>
          <li>결제 기록: 전자상거래법에 따라 5년 보관</li>
          <li>학습 데이터: 회원 탈퇴 시 즉시 삭제</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>4. 제3자 제공</h2>
        <p className="mb-2">당사는 다음의 경우에만 개인정보를 제3자에게 제공합니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Paddle:</strong> 결제 처리 목적 (이메일, 결제 정보)</li>
          <li><strong>OpenAI / Google:</strong> AI 퀴즈 생성 목적 (업로드된 텍스트 내용)</li>
          <li>법령에 의한 요구가 있는 경우</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>5. 이용자 권리</h2>
        <p>이용자는 언제든지 개인정보 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다. 계정 삭제는 서비스 설정에서 직접 진행하거나 <a href="mailto:support@retrynote.cloud" className="underline" style={{ color: 'oklch(0.65 0.15 175)' }}>support@retrynote.cloud</a>로 요청해 주세요.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>6. 쿠키 및 추적</h2>
        <p>서비스는 로그인 세션 유지를 위해 필수 쿠키만 사용합니다. 광고 추적 쿠키는 사용하지 않습니다.</p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>7. 문의</h2>
        <p>개인정보 관련 문의: <a href="mailto:support@retrynote.cloud" className="underline" style={{ color: 'oklch(0.65 0.15 175)' }}>support@retrynote.cloud</a></p>
      </section>
    </div>
  );
}
