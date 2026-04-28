import type { UseMutationResult } from '@tanstack/react-query';
import type { ModelUsageResponse, ModelSettingsUpdate } from '@/types';

interface AdminModelsTabProps {
  modelData: ModelUsageResponse | undefined;
  isSuperAdmin: boolean;
  modelForm: ModelSettingsUpdate;
  setModelForm: React.Dispatch<React.SetStateAction<ModelSettingsUpdate>>;
  modelSaveMsg: string | null;
  updateModelSettingsMutation: UseMutationResult<
    {
      status: string;
      settings: {
        active_generation_model: string | null;
        fallback_generation_model: string | null;
      };
    },
    unknown,
    ModelSettingsUpdate
  >;
}

export default function AdminModelsTab({
  modelData,
  isSuperAdmin,
  modelForm,
  setModelForm,
  modelSaveMsg,
  updateModelSettingsMutation,
}: AdminModelsTabProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
        <h2 className="text-xl font-semibold text-content-primary">사용량 통계</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">요청 수와 토큰 사용량을 함께 보면서 운영 부담을 차분하게 확인할 수 있습니다.</p>
        {modelData?.usage.map((model) => (
          <div key={model.model_name} className="mt-5 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5 first:mt-6">
            <div className="text-lg font-semibold text-content-primary">{model.model_name}</div>
            <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
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
            </div>
          </div>
        ))}
        {(!modelData || modelData.usage.length === 0) && (
          <p className="mt-8 text-center text-sm text-content-muted">모델 사용 데이터가 없습니다.</p>
        )}
      </section>

      <section className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
        <h2 className="text-xl font-semibold text-content-primary">설정</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">
          AI 문제 생성 및 채점에 사용할 모델을 변경합니다. super_admin 권한이 필요합니다.
        </p>
        {isSuperAdmin ? (
          <div className="mt-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ms-gen">생성 모델</label>
              <input
                id="ms-gen"
                type="text"
                value={modelForm.active_generation_model ?? ''}
                onChange={(e) => setModelForm((f) => ({ ...f, active_generation_model: e.target.value || null }))}
                placeholder="gpt-4o"
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ms-gen-fb">생성 폴백 모델</label>
              <input
                id="ms-gen-fb"
                type="text"
                value={modelForm.fallback_generation_model ?? ''}
                onChange={(e) => setModelForm((f) => ({ ...f, fallback_generation_model: e.target.value || null }))}
                placeholder="gpt-4o-mini"
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
              />
            </div>
            {modelSaveMsg && (
              <div
                className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  modelSaveMsg.includes('저장되었습니다')
                    ? 'border border-semantic-success-border bg-semantic-success-bg text-semantic-success'
                    : 'border border-semantic-error-border bg-semantic-error-bg text-semantic-error'
                }`}
              >
                {modelSaveMsg}
              </div>
            )}
            <button
              onClick={() => updateModelSettingsMutation.mutate(modelForm)}
              disabled={updateModelSettingsMutation.isPending}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {updateModelSettingsMutation.isPending ? '저장 중…' : '설정 저장'}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-content-muted">모델 설정 변경에는 super_admin 권한이 필요합니다.</p>
        )}
      </section>
    </div>
  );
}
