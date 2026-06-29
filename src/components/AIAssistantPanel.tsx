import { Bot, CheckCircle2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import type { AssistantDraft, AssistantScope } from "../core/aiAssistant";

interface AIAssistantPanelProps {
  draft?: AssistantDraft;
  busy: boolean;
  error?: string;
  selectedSkuCode: string;
  skuCount: number;
  onGenerate: (prompt: string, scope: AssistantScope) => Promise<void>;
  onApplyDraft: () => void;
}

export function AIAssistantPanel({
  draft,
  busy,
  error,
  selectedSkuCode,
  skuCount,
  onGenerate,
  onApplyDraft,
}: AIAssistantPanelProps) {
  const [prompt, setPrompt] = useState("深蓝底板，产品放大，标题醒目，工程图更大，全部 SKU");
  const [scope, setScope] = useState<AssistantScope>("all-skus");
  const trimmedPrompt = prompt.trim();

  return (
    <section className="panel-section ai-assistant">
      <div className="section-title">
        <Bot size={16} />
        <span>AI 批量套版</span>
      </div>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
        rows={4}
        placeholder="深蓝底板，产品放大，标题醒目，工程图更大"
      />

      <div className="assistant-scope">
        <button
          type="button"
          className={scope === "current-sku" ? "active" : ""}
          onClick={() => setScope("current-sku")}
        >
          当前 {selectedSkuCode}
        </button>
        <button
          type="button"
          className={scope === "all-skus" ? "active" : ""}
          onClick={() => setScope("all-skus")}
        >
          全部 {skuCount} 个 SKU
        </button>
      </div>

      <button
        type="button"
        className="icon-button wide assistant-generate"
        disabled={!trimmedPrompt || busy}
        onClick={() => onGenerate(trimmedPrompt, scope)}
      >
        <Sparkles size={15} />
        <span>{busy ? "DeepSeek 思考中" : "生成套版方案"}</span>
      </button>

      {error ? <div className="assistant-error">{error}</div> : null}

      {draft ? (
        <div className="assistant-draft">
          <div className="assistant-draft-head">
            <Wand2 size={15} />
            <strong>{draft.name}</strong>
            <span>{draft.provider === "deepseek" ? `DeepSeek · ${draft.model ?? "model"}` : "本地后备"}</span>
          </div>
          <div className="assistant-confidence">{draft.confidence === "high" ? "高置信" : "需确认"}</div>
          <p>{draft.summary}</p>
          {draft.theme ? (
            <div className="assistant-theme">
              <strong>将统一配色</strong>
              <span>
                {draft.theme.name}
                <small>{draft.theme.primary}</small>
              </span>
            </div>
          ) : null}
          {draft.materialCreations.length ? (
            <div className="assistant-material-creations" aria-label="AI 将创建的新素材">
              <strong>将创建 {draft.materialCreations.length} 个素材</strong>
              {draft.materialCreations.map((creation) => (
                <span key={creation.id}>
                  {creation.name}
                  <small>基于 {creation.fromMaterialId} 改色</small>
                </span>
              ))}
            </div>
          ) : null}
          {draft.templateCreations.length ? (
            <div className="assistant-template-creations" aria-label="AI 将创建的新模板">
              <strong>将创建 {draft.templateCreations.length} 个新模板</strong>
              {draft.templateCreations.map((creation) => (
                <span key={creation.id}>
                  {creation.name}
                  <small>基于 {creation.fromTemplateId}</small>
                </span>
              ))}
            </div>
          ) : null}
          <div className="assistant-actions">
            {draft.actions.map((action) => (
              <div key={action.id} className="assistant-action">
                <CheckCircle2 size={14} />
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </span>
              </div>
            ))}
          </div>
          {draft.warnings.length ? (
            <div className="assistant-warnings">
              {draft.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
          <button type="button" className="icon-button wide assistant-apply" onClick={onApplyDraft}>
            <CheckCircle2 size={15} />
            <span>确认应用到成品图</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
