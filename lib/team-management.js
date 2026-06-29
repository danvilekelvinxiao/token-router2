import crypto from "crypto";
import { hasDatabase, query } from "@/lib/db";
import {
  ensureTeamTokenPoolSchema,
  getUserTeamIds,
  listTeamUsageLogs,
} from "@/lib/team-token-pool";

const ROLE_LABELS = {
  owner: "团队队长",
  admin: "管理员",
  finance: "财务",
  member: "成员",
};

const ROLE_PERMISSIONS = {
  owner: ["manage_team", "manage_members", "manage_limits", "manage_keys", "view_all_logs", "view_billing", "export_billing", "transfer_owner", "delete_team"],
  admin: ["manage_members", "manage_limits", "manage_keys", "view_all_logs", "view_billing"],
  finance: ["view_all_logs", "view_billing", "export_billing"],
  member: ["view_own_logs", "create_own_key"],
};

const memory = {
  teams: [],
  members: [],
  invites: [],
  wallets: [],
  limits: [],
  keyLinks: [],
  walletTransactions: [],
};

let schemaReady = false;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function makeTeamCode(name = "team") {
  const normalized = cleanText(name, "team")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${normalized || "team"}-${crypto.randomBytes(2).toString("hex")}`;
}

function normalizeRole(role = "member") {
  return ["owner", "admin", "finance", "member"].includes(role) ? role : "member";
}

function normalizeLimit(input = {}) {
  const type = cleanText(input.limitType ?? input.type, "none");
  const unit = cleanText(input.limitUnit ?? input.unit, "cny");
  const amount = numberValue(input.limitAmount ?? input.amount);
  const enabled = input.enabled === true && type !== "none" && amount > 0;
  return {
    limitType: ["none", "daily", "weekly", "monthly", "total", "custom"].includes(type) ? type : "none",
    limitUnit: ["cny", "token", "request"].includes(unit) ? unit : "cny",
    limitAmount: amount,
    enabled,
  };
}

function periodForType(limitType = "none", current = new Date()) {
  const start = new Date(current);
  const end = new Date(current);
  if (limitType === "daily") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (limitType === "weekly") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (limitType === "monthly") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setFullYear(end.getFullYear() + 20);
  }
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

function rowToTeam(row = {}) {
  return {
    id: row.id || "",
    name: row.name || "",
    code: row.code || "",
    description: row.description || "",
    type: row.type || "工作室",
    scenario: row.scenario || "综合使用",
    teamSize: row.team_size || "",
    ownerUserId: row.owner_user_id || "",
    status: row.status || "active",
    allowMemberPersonalBalance: row.allow_member_personal_balance === true,
    allowMemberCreateKeys: row.allow_member_create_keys !== false,
    monthlyBudgetCny: Number(row.monthly_budget_cny || 0),
    monthlyTokenBudget: Number(row.monthly_token_budget || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToMember(row = {}) {
  return {
    id: row.id || "",
    teamId: row.team_id || row.teamId || "",
    userId: row.user_id || row.userId || "",
    role: normalizeRole(row.role),
    roleLabel: ROLE_LABELS[normalizeRole(row.role)] || "成员",
    memberName: row.member_name || row.memberName || row.email || row.user_id || "",
    status: row.status || "active",
    invitedBy: row.invited_by || row.invitedBy || "",
    joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : row.joinedAt || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : row.updatedAt || "",
  };
}

function rowToLimit(row = {}) {
  return {
    id: row.id || "",
    teamId: row.team_id || "",
    userId: row.user_id || "",
    limitType: row.limit_type || "none",
    limitUnit: row.limit_unit || "cny",
    limitAmount: Number(row.limit_amount || 0),
    periodStart: row.period_start ? new Date(row.period_start).toISOString() : "",
    periodEnd: row.period_end ? new Date(row.period_end).toISOString() : "",
    usedCny: Number(row.used_cny || 0),
    usedTokens: Number(row.used_tokens || 0),
    usedRequests: Number(row.used_requests || 0),
    enabled: row.enabled === true,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToWallet(row = {}) {
  return {
    id: row.id || "",
    teamId: row.team_id || "",
    balanceCny: Number(row.balance_cny || 0),
    giftBalanceCny: Number(row.gift_balance_cny || 0),
    packageTokens: Number(row.package_tokens || 0),
    membershipTokens: Number(row.membership_tokens || 0),
    status: row.status || "active",
  };
}

export async function ensureTeamManagementSchema() {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return;
  if (schemaReady) return;
  await query(`
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS type TEXT DEFAULT '工作室';
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS scenario TEXT DEFAULT '综合使用';
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_size TEXT DEFAULT '';
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS allow_member_personal_balance BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS allow_member_create_keys BOOLEAN NOT NULL DEFAULT true;

    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invited_by TEXT DEFAULT '';
    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS member_name TEXT DEFAULT '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_unique_active ON team_members(team_id, user_id);

    CREATE TABLE IF NOT EXISTS team_invites (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      invite_code TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      default_quota_type TEXT DEFAULT 'none',
      default_quota_amount NUMERIC(18, 6) NOT NULL DEFAULT 0,
      default_quota_unit TEXT DEFAULT 'cny',
      expires_at TIMESTAMPTZ,
      max_uses INTEGER NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_wallets (
      id TEXT PRIMARY KEY,
      team_id TEXT UNIQUE NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      balance_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      gift_balance_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      package_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
      membership_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_member_limits (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      limit_type TEXT NOT NULL DEFAULT 'none',
      limit_unit TEXT NOT NULL DEFAULT 'cny',
      limit_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      used_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      used_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
      used_requests INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS team_api_keys (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      api_key_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'member',
      shared BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, api_key_id)
    );

    CREATE TABLE IF NOT EXISTS team_wallet_transactions (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT DEFAULT '',
      type TEXT NOT NULL,
      amount_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      related_order_id TEXT DEFAULT '',
      request_id TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_team_limits_team_user ON team_member_limits(team_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_team_key_links_team ON team_api_keys(team_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_team_wallet_transactions_team ON team_wallet_transactions(team_id, created_at DESC);
  `);
  schemaReady = true;
}

export function roleCan(role = "member", permission = "") {
  return (ROLE_PERMISSIONS[normalizeRole(role)] || []).includes(permission);
}

export async function getTeamMembership(userId = "", teamId = "") {
  await ensureTeamManagementSchema();
  if (!userId || !teamId) return null;
  if (!hasDatabase()) {
    const team = memory.teams.find((item) => item.id === teamId);
    const member = memory.members.find((item) => item.teamId === teamId && item.userId === userId && item.status === "active");
    if (team?.ownerUserId === userId) return { team, member: member || { teamId, userId, role: "owner", memberName: "队长", status: "active" }, role: "owner" };
    return member ? { team, member, role: member.role } : null;
  }
  const result = await query(
    `SELECT t.*, m.id AS member_row_id, m.user_id AS member_user_id, m.role AS member_role,
            m.member_name, m.status AS member_status, m.invited_by, m.joined_at
     FROM teams t
     LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = $1
     WHERE t.id = $2 AND t.status = 'active'
     LIMIT 1`,
    [userId, teamId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.owner_user_id !== userId && (!row.member_user_id || row.member_status !== "active")) return null;
  const role = row.owner_user_id === userId ? "owner" : normalizeRole(row.member_role);
  return {
    team: rowToTeam(row),
    role,
    member: rowToMember({
      id: row.member_row_id || "",
      team_id: row.id,
      user_id: userId,
      role,
      member_name: row.member_name || "",
      status: row.member_status || "active",
      invited_by: row.invited_by || "",
      joined_at: row.joined_at,
    }),
  };
}

export async function listTeamsForUser(userId = "") {
  await ensureTeamManagementSchema();
  if (!userId) return [];
  if (!hasDatabase()) {
    return memory.teams
      .filter((team) => team.ownerUserId === userId || memory.members.some((m) => m.teamId === team.id && m.userId === userId && m.status === "active"))
      .map((team) => {
        const member = memory.members.find((m) => m.teamId === team.id && m.userId === userId);
        const role = team.ownerUserId === userId ? "owner" : normalizeRole(member?.role);
        return { ...team, role, roleLabel: ROLE_LABELS[role] };
      });
  }
  const result = await query(
    `SELECT DISTINCT ON (t.id) t.*, COALESCE(m.role, CASE WHEN t.owner_user_id = $1 THEN 'owner' ELSE 'member' END) AS current_role
     FROM teams t
     LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = $1 AND m.status = 'active'
     WHERE t.status = 'active' AND (t.owner_user_id = $1 OR m.user_id = $1)
     ORDER BY t.id, t.created_at ASC`,
    [userId],
  );
  return result.rows.map((row) => {
    const role = row.owner_user_id === userId ? "owner" : normalizeRole(row.current_role);
    return { ...rowToTeam(row), role, roleLabel: ROLE_LABELS[role] || "成员" };
  });
}

export async function createTeamForUser(userId = "", input = {}) {
  await ensureTeamManagementSchema();
  if (!userId) throw new Error("请先登录后再创建团队");
  const team = {
    id: makeId("team"),
    name: cleanText(input.name, "我的团队"),
    code: makeTeamCode(input.name || "team"),
    description: cleanText(input.description, "团队版 AI Token 管理空间"),
    type: cleanText(input.type, "工作室"),
    scenario: cleanText(input.scenario, "综合使用"),
    teamSize: cleanText(input.teamSize || input.team_size, "1-5人"),
    ownerUserId: userId,
    status: "active",
    allowMemberPersonalBalance: input.allowMemberPersonalBalance === true,
    allowMemberCreateKeys: input.allowMemberCreateKeys !== false,
  };
  if (!hasDatabase()) {
    memory.teams.push({ ...team, createdAt: nowIso(), updatedAt: nowIso() });
    memory.members.push({ id: makeId("tm"), teamId: team.id, userId, role: "owner", memberName: "团队队长", status: "active", joinedAt: nowIso() });
    memory.wallets.push({ id: makeId("tw"), teamId: team.id, balanceCny: 0, giftBalanceCny: 0, packageTokens: 0, membershipTokens: 0, status: "active" });
    return { ...team, role: "owner", roleLabel: ROLE_LABELS.owner };
  }
  const result = await query(
    `INSERT INTO teams (id, name, code, description, owner_user_id, type, scenario, team_size, allow_member_personal_balance, allow_member_create_keys, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [team.id, team.name, team.code, team.description, team.ownerUserId, team.type, team.scenario, team.teamSize, team.allowMemberPersonalBalance, team.allowMemberCreateKeys, team.status],
  );
  await query(
    `INSERT INTO team_members (id, team_id, user_id, role, member_name, status, invited_by, joined_at)
     VALUES ($1,$2,$3,'owner','团队队长','active',$3,NOW())
     ON CONFLICT (team_id, user_id) DO UPDATE SET role = 'owner', status = 'active', updated_at = NOW()`,
    [makeId("tm"), team.id, userId],
  );
  await query(
    `INSERT INTO team_wallets (id, team_id, balance_cny, gift_balance_cny, package_tokens, membership_tokens)
     VALUES ($1,$2,0,0,0,0)
     ON CONFLICT (team_id) DO NOTHING`,
    [makeId("tw"), team.id],
  );
  return { ...rowToTeam(result.rows[0]), role: "owner", roleLabel: ROLE_LABELS.owner };
}

async function getTeamWallet(teamId = "") {
  await ensureTeamManagementSchema();
  if (!teamId) return null;
  if (!hasDatabase()) return memory.wallets.find((wallet) => wallet.teamId === teamId) || null;
  const result = await query("SELECT * FROM team_wallets WHERE team_id = $1 LIMIT 1", [teamId]);
  if (result.rows[0]) return rowToWallet(result.rows[0]);
  const inserted = await query(
    `INSERT INTO team_wallets (id, team_id) VALUES ($1,$2) ON CONFLICT (team_id) DO UPDATE SET updated_at = NOW() RETURNING *`,
    [makeId("tw"), teamId],
  );
  return rowToWallet(inserted.rows[0]);
}

async function getMemberLimits(teamId = "", userIds = []) {
  await ensureTeamManagementSchema();
  const ids = userIds.filter(Boolean);
  if (!teamId || !ids.length) return [];
  if (!hasDatabase()) return memory.limits.filter((item) => item.teamId === teamId && ids.includes(item.userId)).map(rowToLimit);
  const result = await query(
    `SELECT * FROM team_member_limits WHERE team_id = $1 AND user_id = ANY($2::text[])`,
    [teamId, ids],
  );
  return result.rows.map(rowToLimit);
}

function usageSummaryForMember(logs = [], userId = "") {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const own = logs.filter((log) => log.userId === userId);
  const success = own.filter((log) => log.success !== false);
  return {
    todayRequests: own.filter((log) => String(log.createdAt || "").startsWith(today)).length,
    monthRequests: own.filter((log) => String(log.createdAt || "").startsWith(month)).length,
    todayTokens: own.filter((log) => String(log.createdAt || "").startsWith(today)).reduce((sum, log) => sum + Number(log.totalTokens || 0), 0),
    monthTokens: own.filter((log) => String(log.createdAt || "").startsWith(month)).reduce((sum, log) => sum + Number(log.totalTokens || 0), 0),
    todayCostCny: own.filter((log) => String(log.createdAt || "").startsWith(today)).reduce((sum, log) => sum + Number(log.actualCostCny || 0), 0),
    monthCostCny: own.filter((log) => String(log.createdAt || "").startsWith(month)).reduce((sum, log) => sum + Number(log.actualCostCny || 0), 0),
    totalTokens: own.reduce((sum, log) => sum + Number(log.totalTokens || 0), 0),
    totalCostCny: own.reduce((sum, log) => sum + Number(log.actualCostCny || 0), 0),
    successRate: own.length ? Number(((success.length / own.length) * 100).toFixed(1)) : 100,
    lastUsedAt: own[0]?.createdAt || "",
  };
}

export async function listTeamMembersForUser(userId = "", teamId = "") {
  await ensureTeamManagementSchema();
  const selectedTeamId = teamId || (await listTeamsForUser(userId))[0]?.id || "";
  const membership = await getTeamMembership(userId, selectedTeamId);
  if (!membership) return { error: "你没有权限查看这个团队" };
  const canViewAll = roleCan(membership.role, "view_all_logs") || roleCan(membership.role, "view_billing") || roleCan(membership.role, "manage_members");
  if (!hasDatabase()) {
    const rows = memory.members.filter((member) => member.teamId === membership.team.id && member.status === "active");
    const scoped = canViewAll ? rows : rows.filter((member) => member.userId === userId);
    const logs = await listTeamUsageLogs({ teamId: membership.team.id, limit: 500 });
    const limits = await getMemberLimits(membership.team.id, scoped.map((member) => member.userId));
    return { team: membership.team, role: membership.role, members: scoped.map((member) => ({ ...member, usage: usageSummaryForMember(logs, member.userId), limit: limits.find((item) => item.userId === member.userId) || null })) };
  }
  const result = await query(
    `SELECT m.*, c.email, c.company, c.name
     FROM team_members m
     LEFT JOIN customers c ON c.id = m.user_id
     WHERE m.team_id = $1 AND m.status = 'active'
     ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'finance' THEN 3 ELSE 4 END, m.created_at ASC`,
    [membership.team.id],
  );
  const allMembers = result.rows.map((row) => rowToMember({ ...row, member_name: row.member_name || row.name || row.company || row.email || row.user_id }));
  const scoped = canViewAll ? allMembers : allMembers.filter((member) => member.userId === userId);
  const logs = await listTeamUsageLogs({ teamId: membership.team.id, limit: 500 });
  const limits = await getMemberLimits(membership.team.id, scoped.map((member) => member.userId));
  return {
    team: membership.team,
    role: membership.role,
    roleLabel: ROLE_LABELS[membership.role],
    canViewAll,
    members: scoped.map((member) => ({
      ...member,
      permissions: ROLE_PERMISSIONS[member.role] || [],
      usage: usageSummaryForMember(logs, member.userId),
      limit: limits.find((item) => item.userId === member.userId) || null,
    })),
  };
}

export async function setTeamMemberLimitForUser(actorUserId = "", teamId = "", targetUserId = "", input = {}) {
  await ensureTeamManagementSchema();
  const membership = await getTeamMembership(actorUserId, teamId);
  if (!membership || !roleCan(membership.role, "manage_limits")) return { error: "只有队长或管理员可以设置成员限制" };
  const targetMembership = await getTeamMembership(targetUserId, teamId);
  if (!targetMembership) return { error: "目标成员不属于当前团队" };
  if (targetMembership.role === "owner" && membership.role !== "owner") return { error: "管理员不能修改团队队长限制" };
  const limit = normalizeLimit(input);
  const period = periodForType(limit.limitType);
  if (!hasDatabase()) {
    const index = memory.limits.findIndex((item) => item.teamId === teamId && item.userId === targetUserId);
    const saved = { id: index >= 0 ? memory.limits[index].id : makeId("tml"), teamId, userId: targetUserId, ...limit, ...period, usedCny: 0, usedTokens: 0, usedRequests: 0, createdAt: nowIso(), updatedAt: nowIso() };
    if (index >= 0) memory.limits[index] = { ...memory.limits[index], ...saved };
    else memory.limits.push(saved);
    return { limit: saved };
  }
  const result = await query(
    `INSERT INTO team_member_limits (
       id, team_id, user_id, limit_type, limit_unit, limit_amount, period_start, period_end, enabled
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (team_id, user_id) DO UPDATE SET
       limit_type = EXCLUDED.limit_type, limit_unit = EXCLUDED.limit_unit, limit_amount = EXCLUDED.limit_amount,
       period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end, enabled = EXCLUDED.enabled,
       used_cny = CASE WHEN team_member_limits.limit_type = EXCLUDED.limit_type THEN team_member_limits.used_cny ELSE 0 END,
       used_tokens = CASE WHEN team_member_limits.limit_type = EXCLUDED.limit_type THEN team_member_limits.used_tokens ELSE 0 END,
       used_requests = CASE WHEN team_member_limits.limit_type = EXCLUDED.limit_type THEN team_member_limits.used_requests ELSE 0 END,
       updated_at = NOW()
     RETURNING *`,
    [makeId("tml"), teamId, targetUserId, limit.limitType, limit.limitUnit, limit.limitAmount, period.periodStart, period.periodEnd, limit.enabled],
  );
  return { limit: rowToLimit(result.rows[0]) };
}

export async function updateTeamMemberForUser(actorUserId = "", teamId = "", targetUserId = "", input = {}) {
  await ensureTeamManagementSchema();
  const membership = await getTeamMembership(actorUserId, teamId);
  if (!membership || !roleCan(membership.role, "manage_members")) return { error: "只有队长或管理员可以管理成员" };
  const targetMembership = await getTeamMembership(targetUserId, teamId);
  if (!targetMembership) return { error: "成员不存在" };
  if (targetMembership.role === "owner" && membership.role !== "owner") return { error: "管理员不能修改团队队长权限" };
  if (membership.role !== "owner" && ["owner", "admin", "finance"].includes(targetMembership.role) && targetMembership.member?.userId !== actorUserId) {
    return { error: "管理员只能管理普通成员" };
  }
  const role = String(input.role || "").trim()
    ? normalizeRole(input.role)
    : normalizeRole(targetMembership.role);
  if (role === "owner" && membership.role !== "owner") return { error: "只有队长可以转让队长权限" };
  if (!hasDatabase()) {
    const member = memory.members.find((item) => item.teamId === teamId && item.userId === targetUserId);
    if (!member) return { error: "成员不存在" };
    if (role === "owner") {
      const team = memory.teams.find((item) => item.id === teamId);
      if (team) team.ownerUserId = targetUserId;
      const currentOwner = memory.members.find((item) => item.teamId === teamId && item.userId === actorUserId);
      if (currentOwner && actorUserId !== targetUserId) currentOwner.role = "admin";
    }
    member.role = role;
    member.status = input.status || member.status;
    member.updatedAt = nowIso();
    return { member };
  }
  const result = await query(
    `UPDATE team_members
     SET role = $3, status = COALESCE($4, status), member_name = COALESCE($5, member_name), updated_at = NOW()
     WHERE team_id = $1 AND user_id = $2
     RETURNING *`,
    [teamId, targetUserId, role, input.status || null, input.memberName || null],
  );
  if (!result.rows[0]) return { error: "成员不存在" };
  if (role === "owner") {
    await query("UPDATE teams SET owner_user_id = $2, updated_at = NOW() WHERE id = $1", [teamId, targetUserId]);
    if (actorUserId !== targetUserId) {
      await query("UPDATE team_members SET role = 'admin', updated_at = NOW() WHERE team_id = $1 AND user_id = $2", [teamId, actorUserId]);
    }
  }
  return { member: rowToMember(result.rows[0]) };
}

export async function createTeamInviteForUser(actorUserId = "", teamId = "", input = {}) {
  await ensureTeamManagementSchema();
  const membership = await getTeamMembership(actorUserId, teamId);
  if (!membership || !roleCan(membership.role, "manage_members")) return { error: "只有队长或管理员可以邀请成员" };
  const limit = normalizeLimit(input);
  const inviteRole = normalizeRole(input.role || "member");
  if (membership.role !== "owner" && inviteRole !== "member") return { error: "只有团队队长可以邀请管理员或财务" };
  const invite = {
    id: makeId("tinv"),
    teamId,
    inviteCode: crypto.randomBytes(6).toString("hex"),
    role: inviteRole,
    defaultQuotaType: limit.limitType,
    defaultQuotaAmount: limit.limitAmount,
    defaultQuotaUnit: limit.limitUnit,
    expiresAt: input.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    maxUses: Math.max(0, Number(input.maxUses || 0)),
    usedCount: 0,
    enabled: true,
    createdBy: actorUserId,
  };
  if (!hasDatabase()) {
    memory.invites.unshift({ ...invite, createdAt: nowIso(), updatedAt: nowIso() });
    return { invite };
  }
  const result = await query(
    `INSERT INTO team_invites (
       id, team_id, invite_code, role, default_quota_type, default_quota_amount, default_quota_unit,
       expires_at, max_uses, enabled, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
     RETURNING *`,
    [invite.id, invite.teamId, invite.inviteCode, invite.role, invite.defaultQuotaType, invite.defaultQuotaAmount, invite.defaultQuotaUnit, invite.expiresAt, invite.maxUses, invite.createdBy],
  );
  return { invite: { ...invite, ...result.rows[0], inviteUrl: `/invite/team/${invite.inviteCode}` } };
}

export async function joinTeamByInvite(userId = "", inviteCode = "") {
  await ensureTeamManagementSchema();
  if (!userId) return { error: "请先登录后再加入团队" };
  const code = cleanText(inviteCode);
  if (!code) return { error: "邀请码不能为空" };
  if (!hasDatabase()) {
    const invite = memory.invites.find((item) => item.inviteCode === code && item.enabled);
    if (!invite) return { error: "邀请链接无效或已关闭" };
    memory.members.push({ id: makeId("tm"), teamId: invite.teamId, userId, role: invite.role, memberName: "团队成员", status: "active", invitedBy: invite.createdBy, joinedAt: nowIso() });
    invite.usedCount += 1;
    return { ok: true };
  }
  const invite = await query(
    `SELECT * FROM team_invites
     WHERE invite_code = $1 AND enabled = true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses = 0 OR used_count < max_uses)
     LIMIT 1`,
    [code],
  );
  const row = invite.rows[0];
  if (!row) return { error: "邀请链接无效、过期或人数已满" };
  await query(
    `INSERT INTO team_members (id, team_id, user_id, role, member_name, status, invited_by, joined_at)
     VALUES ($1,$2,$3,$4,'团队成员','active',$5,NOW())
     ON CONFLICT (team_id, user_id) DO UPDATE SET status = 'active', role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, updated_at = NOW()`,
    [makeId("tm"), row.team_id, userId, normalizeRole(row.role), row.created_by || ""],
  );
  await query("UPDATE team_invites SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1", [row.id]);
  if (row.default_quota_type && row.default_quota_type !== "none" && Number(row.default_quota_amount || 0) > 0) {
    await setTeamMemberLimitForUser(row.created_by || userId, row.team_id, userId, {
      enabled: true,
      type: row.default_quota_type,
      unit: row.default_quota_unit || "cny",
      amount: Number(row.default_quota_amount || 0),
    });
  }
  return { ok: true, teamId: row.team_id };
}

export async function linkTeamApiKey({ teamId = "", userId = "", apiKeyId = "", scope = "member", shared = false } = {}) {
  await ensureTeamManagementSchema();
  if (!teamId || !userId || !apiKeyId) return null;
  if (!hasDatabase()) {
    const link = { id: makeId("tak"), teamId, userId, apiKeyId, scope, shared, status: "active", createdAt: nowIso() };
    memory.keyLinks.push(link);
    return link;
  }
  const result = await query(
    `INSERT INTO team_api_keys (id, team_id, user_id, api_key_id, scope, shared, status)
     VALUES ($1,$2,$3,$4,$5,$6,'active')
     ON CONFLICT (team_id, api_key_id) DO UPDATE SET user_id = EXCLUDED.user_id, scope = EXCLUDED.scope, shared = EXCLUDED.shared, status = 'active', updated_at = NOW()
     RETURNING *`,
    [makeId("tak"), teamId, userId, apiKeyId, scope, shared === true],
  );
  return result.rows[0];
}

export async function assertCanCreateTeamApiKey(userId = "", teamId = "", { shared = false } = {}) {
  if (!teamId) return { ok: true };
  const membership = await getTeamMembership(userId, teamId);
  if (!membership) return { ok: false, error: "你不是这个团队的成员，不能创建团队 API Key" };
  if (roleCan(membership.role, "manage_keys")) return { ok: true, role: membership.role };
  if (!shared && membership.team.allowMemberCreateKeys) return { ok: true, role: membership.role };
  return { ok: false, error: "当前团队不允许成员自行创建团队 API Key，请联系队长" };
}

export async function enforceTeamMemberLimit({ teamId = "", userId = "", estimatedCostCny = 0, estimatedTokens = 0, estimatedRequests = 1 } = {}) {
  await ensureTeamManagementSchema();
  if (!teamId || !userId) return { limited: false };
  const membership = await getTeamMembership(userId, teamId);
  if (!membership) return { limited: true, code: "TEAM_ACCESS_FORBIDDEN", message: "你没有权限使用这个团队空间" };
  const limits = await getMemberLimits(teamId, [userId]);
  const limit = limits.find((item) => item.enabled);
  if (!limit) return { limited: false, role: membership.role };
  let current = limit;
  const expired = current.periodEnd && new Date(current.periodEnd).getTime() < Date.now() && current.limitType !== "total";
  if (expired) {
    const period = periodForType(current.limitType);
    if (hasDatabase()) {
      const reset = await query(
        `UPDATE team_member_limits
         SET period_start = $3, period_end = $4, used_cny = 0, used_tokens = 0, used_requests = 0, updated_at = NOW()
         WHERE team_id = $1 AND user_id = $2 RETURNING *`,
        [teamId, userId, period.periodStart, period.periodEnd],
      );
      current = rowToLimit(reset.rows[0]);
    } else {
      Object.assign(current, period, { usedCny: 0, usedTokens: 0, usedRequests: 0 });
    }
  }
  const used = current.limitUnit === "token"
    ? current.usedTokens
    : current.limitUnit === "request"
      ? current.usedRequests
      : current.usedCny;
  const estimate = current.limitUnit === "token"
    ? numberValue(estimatedTokens)
    : current.limitUnit === "request"
      ? numberValue(estimatedRequests, 1)
      : numberValue(estimatedCostCny);
  if (current.limitAmount > 0 && used + estimate > current.limitAmount) {
    return {
      limited: true,
      code: "TEAM_MEMBER_QUOTA_EXCEEDED",
      message: "你已达到团队分配限制，请联系团队队长调整。",
      limit: current,
      used,
      estimate,
      remaining: Math.max(0, current.limitAmount - used),
    };
  }
  return { limited: false, limit: current, role: membership.role };
}

export async function recordTeamMemberUsage({ teamId = "", userId = "", requestId = "", costCny = 0, tokens = 0, requests = 1, success = true } = {}) {
  await ensureTeamManagementSchema();
  if (!teamId || !userId || success === false) return null;
  const amount = Math.max(0, numberValue(costCny));
  const usedTokens = Math.max(0, Math.floor(numberValue(tokens)));
  const usedRequests = Math.max(0, Math.floor(numberValue(requests, 1)));
  if (!hasDatabase()) {
    const limit = memory.limits.find((item) => item.teamId === teamId && item.userId === userId && item.enabled);
    if (limit) {
      limit.usedCny = numberValue(limit.usedCny) + amount;
      limit.usedTokens = numberValue(limit.usedTokens) + usedTokens;
      limit.usedRequests = numberValue(limit.usedRequests) + usedRequests;
      limit.updatedAt = nowIso();
    }
    memory.walletTransactions.unshift({ id: makeId("twt"), teamId, userId, type: "consume", amountCny: amount, tokens: usedTokens, requestId, description: "团队成员模型调用扣费", createdAt: nowIso() });
    return { ok: true };
  }
  await query(
    `UPDATE team_member_limits
     SET used_cny = used_cny + $3,
         used_tokens = used_tokens + $4,
         used_requests = used_requests + $5,
         updated_at = NOW()
     WHERE team_id = $1 AND user_id = $2 AND enabled = true`,
    [teamId, userId, amount, usedTokens, usedRequests],
  );
  await query(
    `INSERT INTO team_wallet_transactions (id, team_id, user_id, type, amount_cny, tokens, description, request_id)
     VALUES ($1,$2,$3,'consume',$4,$5,'团队成员模型调用扣费',$6)`,
    [makeId("twt"), teamId, userId, amount, usedTokens, requestId],
  );
  return { ok: true };
}

export async function getTeamBillingForUser(userId = "", requestedTeamId = "") {
  await ensureTeamManagementSchema();
  const teams = await listTeamsForUser(userId);
  if (requestedTeamId && !teams.some((team) => team.id === requestedTeamId)) {
    return { error: "你没有权限查看这个团队账单" };
  }
  const teamId = requestedTeamId || teams[0]?.id || "";
  if (!teamId) return { teams: [], members: [], logs: [], transactions: [], summary: {}, role: "member" };
  const membership = await getTeamMembership(userId, teamId);
  if (!membership) return { error: "你没有权限查看这个团队账单" };
  const canViewAll = roleCan(membership.role, "view_billing") || roleCan(membership.role, "view_all_logs");
  const logs = await listTeamUsageLogs({ teamId, limit: 1000 });
  const scopedLogs = canViewAll ? logs : logs.filter((log) => log.userId === userId);
  const membersResult = await listTeamMembersForUser(userId, teamId);
  const wallet = await getTeamWallet(teamId);
  let transactions = [];
  if (hasDatabase()) {
    const result = await query(
      `SELECT * FROM team_wallet_transactions WHERE team_id = $1 ORDER BY created_at DESC LIMIT 500`,
      [teamId],
    );
    transactions = result.rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      userId: row.user_id || "",
      type: row.type,
      amountCny: Number(row.amount_cny || 0),
      tokens: Number(row.tokens || 0),
      description: row.description || "",
      requestId: row.request_id || "",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    }));
  } else {
    transactions = memory.walletTransactions.filter((row) => row.teamId === teamId);
  }
  const success = scopedLogs.filter((log) => log.success !== false);
  const modelMap = new Map();
  const keyMap = new Map();
  for (const log of scopedLogs) {
    const model = log.model || "unknown";
    modelMap.set(model, {
      model,
      tokens: Number(modelMap.get(model)?.tokens || 0) + Number(log.totalTokens || 0),
      costCny: Number(modelMap.get(model)?.costCny || 0) + Number(log.actualCostCny || 0),
      requests: Number(modelMap.get(model)?.requests || 0) + 1,
    });
    const key = log.apiKeyId || "unknown";
    keyMap.set(key, {
      apiKeyId: key,
      tokens: Number(keyMap.get(key)?.tokens || 0) + Number(log.totalTokens || 0),
      costCny: Number(keyMap.get(key)?.costCny || 0) + Number(log.actualCostCny || 0),
      requests: Number(keyMap.get(key)?.requests || 0) + 1,
    });
  }
  return {
    teams,
    team: membership.team,
    role: membership.role,
    roleLabel: ROLE_LABELS[membership.role],
    canViewAll,
    wallet,
    members: membersResult.members || [],
    logs: scopedLogs,
    transactions: canViewAll ? transactions : transactions.filter((item) => item.userId === userId),
    modelCosts: [...modelMap.values()].sort((a, b) => b.costCny - a.costCny),
    apiKeyCosts: [...keyMap.values()].sort((a, b) => b.costCny - a.costCny),
    summary: {
      requestCount: scopedLogs.length,
      successRate: scopedLogs.length ? Number(((success.length / scopedLogs.length) * 100).toFixed(1)) : 100,
      totalTokens: scopedLogs.reduce((sum, log) => sum + Number(log.totalTokens || 0), 0),
      totalCostCny: scopedLogs.reduce((sum, log) => sum + Number(log.actualCostCny || 0), 0),
      savedCny: scopedLogs.reduce((sum, log) => sum + Number(log.savedCny || 0), 0),
      topModel: [...modelMap.values()].sort((a, b) => b.requests - a.requests)[0]?.model || "",
      mostExpensiveMember: (membersResult.members || []).sort((a, b) => Number(b.usage?.totalCostCny || 0) - Number(a.usage?.totalCostCny || 0))[0]?.memberName || "",
      walletBalanceCny: wallet?.balanceCny || 0,
    },
  };
}

export async function getTeamDashboardForUser(userId = "", requestedTeamId = "") {
  const billing = await getTeamBillingForUser(userId, requestedTeamId);
  if (billing.error) return billing;
  const allowedTeamIds = await getUserTeamIds(userId);
  return {
    ...billing,
    allowedTeamIds,
    rolePermissions: ROLE_PERMISSIONS[billing.role] || [],
    roleLabels: ROLE_LABELS,
  };
}
