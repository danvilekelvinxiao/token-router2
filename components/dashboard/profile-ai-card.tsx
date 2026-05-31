import Link from "next/link";
import ModelBrandIcon from "@/components/common/model-brand-icon";
import LiveNumber from "@/components/ui/live-number";

type ModelSummary = {
  name?: string;
  provider?: string;
  calls?: number;
  spendCny?: number;
};

type ProfileAiCardProps = {
  greeting?: string;
  user: {
    name?: string;
    email?: string;
    avatarInitial?: string;
    membershipName?: string;
    isMember?: boolean;
  };
  profile: {
    hasStartedCalling?: boolean;
    totalCalls?: number;
    balanceAvailable?: boolean;
    balanceCny?: number;
    mostUsedModel?: ModelSummary | null;
    mostExpensiveModel?: ModelSummary | null;
    avgCostPerCallCny?: number | null;
  };
  sourceLabel?: string;
  onOpenBalance?: () => void;
  onOpenCalls?: () => void;
  onOpenModel?: (model?: ModelSummary | null) => void;
  onOpenMembership?: () => void;
};

function formatCny(value: unknown, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无数据";
  return `¥${number.toFixed(digits)}`;
}

function modelName(model?: ModelSummary | null) {
  return model?.name || "完成真实调用后生成";
}

export default function ProfileAiCard({
  greeting = "你好",
  user,
  profile,
  sourceLabel,
  onOpenBalance,
  onOpenCalls,
  onOpenModel,
  onOpenMembership,
}: ProfileAiCardProps) {
  const hasCalls = Boolean(profile.hasStartedCalling && Number(profile.totalCalls || 0) > 0);
  const memberText = user.isMember ? user.membershipName || "FLOWAPI 黑金会员" : "普通用户";

  return (
    <article className="profile-ai-card">
      <div className="profile-ai-card-top">
        <div className="profile-ai-avatar">{user.avatarInitial || "F"}</div>
        <div className="profile-ai-identity">
          <span>{greeting}</span>
          <strong>{user.name || "FlowAPI 用户"}</strong>
          <small>{user.email || "邮箱同步中"}</small>
        </div>
        <button
          type="button"
          className={`profile-ai-member ${user.isMember ? "is-member" : ""}`}
          onClick={onOpenMembership}
        >
          {memberText}
        </button>
      </div>
      {sourceLabel ? <span className="profile-ai-source">{sourceLabel}</span> : null}

      <div className="profile-ai-tags">
        <span className={hasCalls ? "active" : ""}>{hasCalls ? "已开始调用" : "等待首次调用"}</span>
        <button type="button" onClick={onOpenCalls}>
          <LiveNumber value={Number(profile.totalCalls || 0)} /> 次调用
        </button>
        <button type="button" className={profile.balanceAvailable ? "active" : ""} onClick={onOpenBalance}>
          余额可用
        </button>
      </div>

      <p className="profile-ai-desc">
        {hasCalls
          ? "你的常用模型、消耗模型和活跃趋势已基于真实调用记录生成。"
          : "完成真实模型调用后，系统会根据你的常用模型、消耗模型和活跃趋势生成个人 AI 画像。"}
      </p>

      <div className="profile-ai-main">
        <button type="button" className="profile-ai-balance" onClick={onOpenBalance}>
          <span>当前余额</span>
          <strong><LiveNumber value={formatCny(profile.balanceCny)} /></strong>
        </button>
        <button type="button" className="profile-ai-calls" onClick={onOpenCalls}>
          <span>真实调用次数</span>
          <strong>
            <LiveNumber value={Number(profile.totalCalls || 0)} />
            <small>次</small>
          </strong>
        </button>
      </div>

      {hasCalls ? (
        <div className="profile-ai-models">
          <button type="button" onClick={() => onOpenModel?.(profile.mostUsedModel)}>
            <span>最常用模型</span>
            <b>
              <ModelBrandIcon model={profile.mostUsedModel?.name} provider={profile.mostUsedModel?.provider} size={26} />
              <em>{modelName(profile.mostUsedModel)}</em>
            </b>
            <small>{profile.mostUsedModel?.calls || 0} 次调用</small>
          </button>
          <button type="button" onClick={() => onOpenModel?.(profile.mostExpensiveModel)}>
            <span>最耗费模型</span>
            <b>
              <ModelBrandIcon model={profile.mostExpensiveModel?.name} provider={profile.mostExpensiveModel?.provider} size={26} />
              <em>{modelName(profile.mostExpensiveModel)}</em>
            </b>
            <small>{formatCny(profile.mostExpensiveModel?.spendCny, 4)} 累计消耗</small>
          </button>
          <div>
            <span>平均单次成本</span>
            <strong>{formatCny(profile.avgCostPerCallCny, 4)}</strong>
            <small>按真实调用扣费计算</small>
          </div>
        </div>
      ) : (
        <div className="profile-ai-empty">
          <strong>暂无 AI 画像</strong>
          <p>完成真实调用后生成模型画像。</p>
          <div>
            <Link href="/api-management">去创建 API Key</Link>
            <Link href="/models">去大模型接入</Link>
          </div>
        </div>
      )}
    </article>
  );
}
