import type { UseMutationResult } from '@tanstack/react-query';
import type { ModelSettingsUpdate } from '@/types';

interface AdminModelSettingsTabProps {
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

export default function AdminModelSettingsTab({
  modelForm,
  setModelForm,
  modelSaveMsg,
  updateModelSettingsMutation,
}: AdminModelSettingsTabProps) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
      <h2 className="text-xl font-semibold text-content-primary">모델 설정</h2>
      <p className="mt-2 text-sm leading-6 text-content-secondary">
        AI 문제 생성 및 채점에 사용할 모델을 변경합니다. super_admin 권한이 필요합니다.
      </p>

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
    </section>
  );
}
