import type { ModelUsageResponse } from '@/types';

interface AdminModelsTabProps {
  modelData: ModelUsageResponse | undefined;
}

export default function AdminModelsTab({ modelData }: AdminModelsTabProps) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
      <h2 className="text-xl font-semibold text-content-primary">모델 사용량</h2>
      <p className="mt-2 text-sm leading-6 text-content-secondary">요청 수와 토큰 사용량을 함께 보면서 운영 부담을 차분하게 확인할 수 있습니다.</p>
      {modelData?.usage.map((model) => (
        <div key={model.model_name} className="mt-5 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5 first:mt-6">
          <div className="text-lg font-semibold text-content-primary">{model.model_name}</div>
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
              <div className="text-content-secondary">요청 수</div>
              <div className="font-mono font-medium text-content-primary">{model.request_count.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
              <div className="text-content-secondary">입력 토큰</div>
              <div className="font-mono font-medium text-content-primary">{model.input_tokens.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
              <div className="text-content-secondary">출력 토큰</div>
              <div className="font-mono font-medium text-content-primary">{model.output_tokens.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
              <div className="text-content-secondary">실패 건수</div>
               <div className={`font-mono font-medium ${model.failure_count > 0 ? 'text-semantic-error' : 'text-content-primary'}`}>
                 {model.failure_count}
               </div>
            </div>
          </div>
        </div>
      ))}
      {(!modelData || modelData.usage.length === 0) && (
        <p className="mt-8 text-center text-sm text-content-muted">모델 사용 데이터가 없습니다.</p>
      )}
    </section>
  );
}
