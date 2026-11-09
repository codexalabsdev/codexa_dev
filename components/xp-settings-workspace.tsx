"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Edit3,
  History,
  Layers3,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";

type Setting = {
  action_key: string;
  label: string;
  xp_amount: number;
  is_active: boolean;
  description: string;
  category: string;
  sort_order: number;
  condition_config: Record<string, unknown>;
};
type Level = {
  id: string;
  level: number;
  name: string;
  description: string;
  min_xp: number;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
};
type HistoryItem = {
  id: string;
  member_id: string;
  action_key: string;
  entity_type: string;
  xp_amount: number;
  created_at: string;
  source: string;
  reason: string | null;
  member: { full_name: string; email: string } | null;
};
type TeamMember = { id: string; full_name: string; email: string };

const emptyLevel = {
  level: 1,
  name: "",
  description: "",
  minXp: 0,
  icon: "star",
  color: "#60a5fa",
  sortOrder: 1,
  isActive: true,
};

export function XpSettingsWorkspace() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"levels" | "rules" | "ledger">(
    "levels",
  );
  const [levelsExpanded, setLevelsExpanded] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [showLevelForm, setShowLevelForm] = useState(false);
  const [levelForm, setLevelForm] = useState(emptyLevel);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySource, setHistorySource] = useState("all");
  const [adjustment, setAdjustment] = useState({
    memberId: "",
    amount: "",
    reason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const [response, membersResponse] = await Promise.all([
      fetch("/api/admin/xp-settings", { cache: "no-store" }),
      fetch("/api/admin/rbac/users", { cache: "no-store" }),
    ]);
    const data = await response.json();
    const memberData = await membersResponse.json();
    if (!response.ok)
      setMessage(data.error ?? "Não foi possível carregar a gamificação.");
    setSettings(data.settings ?? []);
    setLevels(data.levels ?? []);
    setHistory(data.history ?? []);
    setMembers(
      (memberData.members ?? []).filter((member: TeamMember) => member.id),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSetting(setting: Setting, patch: Partial<Setting>) {
    setSaving(setting.action_key);
    setMessage("");
    const response = await fetch("/api/admin/xp-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionKey: setting.action_key,
        xpAmount: patch.xp_amount ?? setting.xp_amount,
        isActive: patch.is_active ?? setting.is_active,
        description: patch.description ?? setting.description,
        category: patch.category ?? setting.category,
        sortOrder: patch.sort_order ?? setting.sort_order,
        conditionConfig: patch.condition_config ?? setting.condition_config,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      setMessage(data.error ?? "Não foi possível salvar a regra.");
    else
      setSettings((current) =>
        current.map((item) =>
          item.action_key === setting.action_key ? data.setting : item,
        ),
      );
    setSaving("");
  }

  async function saveLevel() {
    setSaving("level");
    setMessage("");
    const payload = { ...levelForm, id: editingLevel?.id };
    const response = await fetch("/api/admin/gamification/levels", {
      method: editingLevel ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok)
      setMessage(data.error ?? "Não foi possível salvar o nível.");
    else {
      setEditingLevel(null);
      setShowLevelForm(false);
      setLevelForm(emptyLevel);
      await load();
    }
    setSaving("");
  }

  async function archiveLevel(level: Level) {
    if (
      !window.confirm(
        `Desativar o nível ${level.level} · ${level.name}? O registro será preservado.`,
      )
    )
      return;
    setSaving(level.id);
    setMessage("");
    const response = await fetch("/api/admin/gamification/levels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: level.id }),
    });
    const data = await response.json();
    if (!response.ok)
      setMessage(data.error ?? "Não foi possível desativar o nível.");
    else {
      setMessage("Nível desativado; o registro foi preservado.");
      await load();
    }
    setSaving("");
  }

  async function adjustXp() {
    setSaving("adjustment");
    setMessage("");
    const response = await fetch("/api/admin/xp-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: adjustment.memberId,
        amount: Number(adjustment.amount),
        reason: adjustment.reason,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      setMessage(data.error ?? "Não foi possível ajustar o XP.");
    else {
      setAdjustment({ memberId: "", amount: "", reason: "" });
      await load();
    }
    setSaving("");
  }

  const categories = useMemo(
    () => [...new Set(settings.map((setting) => setting.category || "Outros"))],
    [settings],
  );
  const filteredHistory = useMemo(
    () =>
      history.filter((item) => {
        const text =
          `${item.member?.full_name ?? ""} ${item.member?.email ?? ""} ${item.action_key} ${item.reason ?? ""}`.toLowerCase();
        return (
          text.includes(historyQuery.toLowerCase()) &&
          (historySource === "all" || item.source === historySource)
        );
      }),
    [history, historyQuery, historySource],
  );
  return (
    <main className="space-y-6">
      <header className="rounded-2xl border border-blue-400/15 bg-gradient-to-br from-[#172131] to-[#11161e] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300">
              Gamificação
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Configuração de XP
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Configure níveis, regras, condições e ajustes manuais sem perder o
              histórico de conquistas.
            </p>
          </div>
          <Sparkles className="size-6 text-blue-300" />
        </div>
      </header>
      {message && (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {message}
        </p>
      )}
      <nav
        className="flex gap-1 overflow-x-auto border-b border-white/10"
        role="tablist"
        aria-label="Administração de XP"
      >
        {[
          ["levels", "Níveis", Layers3],
          ["rules", "Regras de XP", SlidersHorizontal],
          ["ledger", "Ajustes e histórico", History],
        ].map(([tab, label, Icon]) => (
          <button
            key={String(tab)}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm transition ${activeTab === tab ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-400 hover:text-white"}`}
          >
            <Icon className="size-4" />
            {String(label)}
          </button>
        ))}
      </nav>
      <details
        open={activeTab === "levels" && levelsExpanded}
        hidden={activeTab !== "levels"}
        onToggle={(event) => setLevelsExpanded(event.currentTarget.open)}
        className="rounded-2xl border border-white/[0.07] bg-[#11161e] p-5 sm:p-6"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Progressão</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Níveis e marcos de XP</h2>
            <p className="mt-1 text-xs text-slate-500">{levels.length} {levels.length === 1 ? "nível cadastrado" : "níveis cadastrados"} · {levels.filter((level) => level.is_active).length} ativos</p>
          </div>
          <ChevronDown className="size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {levels.map((level) => (
            <div
              key={level.id}
              className="rounded-xl border border-white/[0.07] bg-[#0d1118] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Nível {level.level}
                  </p>
                  <h3 className="mt-1 font-semibold text-white">
                    {level.name}
                  </h3>
                </div>
                <span
                  className="rounded-full px-2 py-1 text-[10px] font-semibold"
                  style={{
                    color: level.color,
                    backgroundColor: `${level.color}20`,
                  }}
                >
                  {level.min_xp} XP
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {level.description || "Sem descrição."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingLevel(level);
                  setShowLevelForm(true);
                  setLevelForm({
                    level: level.level,
                    name: level.name,
                    description: level.description,
                    minXp: level.min_xp,
                    icon: level.icon,
                    color: level.color,
                    sortOrder: level.sort_order,
                    isActive: level.is_active,
                  });
                }}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200"
              >
                <Edit3 className="size-3.5" />
                Editar nível
              </button>
              {level.is_active && (
                <button
                  type="button"
                  disabled={saving === level.id}
                  onClick={() => void archiveLevel(level)}
                  className="ml-4 inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 disabled:opacity-50"
                >
                  {saving === level.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Desativar
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setEditingLevel(null);
              setShowLevelForm(true);
              setLevelForm({
                ...emptyLevel,
                level: levels.length + 1,
                sortOrder: levels.length + 1,
              });
            }}
            className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] text-xs font-medium text-slate-400 hover:border-blue-400/40 hover:text-blue-300"
          >
            <Plus className="size-4" />
            Adicionar nível
          </button>
        </div>
        {showLevelForm && (
          <div className="mt-5 grid gap-3 border-t border-white/[0.06] pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <input
              type="number"
              value={levelForm.level}
              onChange={(event) =>
                setLevelForm({
                  ...levelForm,
                  level: Number(event.target.value),
                })
              }
              placeholder="Nível"
              className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
            />
            <input
              value={levelForm.name}
              onChange={(event) =>
                setLevelForm({ ...levelForm, name: event.target.value })
              }
              placeholder="Nome do nível"
              className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
            />
            <input
              type="number"
              value={levelForm.minXp}
              onChange={(event) =>
                setLevelForm({
                  ...levelForm,
                  minXp: Number(event.target.value),
                })
              }
              placeholder="XP mínimo"
              className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
            />
            <input
              value={levelForm.color}
              onChange={(event) =>
                setLevelForm({ ...levelForm, color: event.target.value })
              }
              placeholder="Cor"
              className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
            />
            <textarea
              value={levelForm.description}
              onChange={(event) =>
                setLevelForm({ ...levelForm, description: event.target.value })
              }
              placeholder="Descrição"
              className="field min-h-20 sm:col-span-2"
            />
            <button
              type="button"
              onClick={() => {
                setShowLevelForm(false);
                setEditingLevel(null);
                setLevelForm(emptyLevel);
              }}
              className="rounded-lg px-4 py-2 text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void saveLevel()}
              disabled={saving === "level"}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving === "level" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Salvar nível
            </button>
          </div>
        )}
      </details>
      <section
        hidden={activeTab !== "rules"}
        className="rounded-2xl border border-white/[0.07] bg-[#11161e] p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Regras ativas
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Ações e condições de XP
            </h2>
          </div>
          <SlidersHorizontal className="size-5 text-slate-500" />
        </div>
        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Carregando regras...</p>
        ) : (
          <div className="mt-5 space-y-4">
            {categories.map((category) => (
              <details
                key={category}
                className="group rounded-xl border border-white/[0.06] bg-[#0d1118]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-200">
                  <span>{category}</span>
                  <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-2 border-t border-white/[0.06] p-3">
                  {settings
                    .filter(
                      (setting) => (setting.category || "Outros") === category,
                    )
                    .map((setting) => (
                      <div
                        key={setting.action_key}
                        className="grid gap-3 rounded-lg border border-white/[0.06] p-3 lg:grid-cols-[1fr_110px_110px_100px]"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-200">
                            {setting.label}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {setting.description || setting.action_key}
                          </p>
                          <input
                            aria-label={`Condição para ${setting.label}`}
                            value={JSON.stringify(
                              setting.condition_config ?? {},
                            )}
                            onChange={(event) => {
                              try {
                                const condition_config = JSON.parse(
                                  event.target.value,
                                );
                                setSettings((current) =>
                                  current.map((item) =>
                                    item.action_key === setting.action_key
                                      ? { ...item, condition_config }
                                      : item,
                                  ),
                                );
                              } catch {}
                            }}
                            className="mt-2 w-full rounded-lg border border-white/[0.08] bg-[#0a0e14] px-2 py-1.5 text-[11px] text-slate-400 outline-none focus:border-blue-400/50"
                            placeholder="Condição JSON opcional"
                          />
                        </div>
                        <input
                          aria-label={`XP para ${setting.label}`}
                          type="number"
                          min="0"
                          max="10000"
                          value={setting.xp_amount}
                          onChange={(event) =>
                            setSettings((current) =>
                              current.map((item) =>
                                item.action_key === setting.action_key
                                  ? {
                                      ...item,
                                      xp_amount: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
                        />
                        <select
                          value={setting.is_active ? "active" : "inactive"}
                          onChange={(event) =>
                            void saveSetting(setting, {
                              is_active: event.target.value === "active",
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
                        >
                          <option value="active">Ativa</option>
                          <option value="inactive">Inativa</option>
                        </select>
                        <button
                          type="button"
                          disabled={saving === setting.action_key}
                          onClick={() =>
                            void saveSetting(setting, {
                              xp_amount: setting.xp_amount,
                            })
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 hover:border-blue-400/40 hover:text-blue-200 disabled:opacity-50"
                        >
                          {saving === setting.action_key ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Save className="size-3.5" />
                          )}
                          Salvar
                        </button>
                      </div>
                    ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
      <section
        hidden={activeTab !== "ledger"}
        className="rounded-2xl border border-white/[0.07] bg-[#11161e] p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <Target className="size-5 text-amber-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Administração
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Ajuste manual
            </h2>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_150px_2fr_auto]">
          <select
            value={adjustment.memberId}
            onChange={(event) =>
              setAdjustment({ ...adjustment, memberId: event.target.value })
            }
            className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
          >
            <option value="">Selecionar membro</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name} · {member.email}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={adjustment.amount}
            onChange={(event) =>
              setAdjustment({ ...adjustment, amount: event.target.value })
            }
            placeholder="+/- XP"
            className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
          />
          <input
            value={adjustment.reason}
            onChange={(event) =>
              setAdjustment({ ...adjustment, reason: event.target.value })
            }
            placeholder="Justificativa obrigatória"
            className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 outline-none transition focus:border-blue-400/50"
          />
          <button
            type="button"
            disabled={
              saving === "adjustment" ||
              !adjustment.memberId ||
              !adjustment.amount ||
              adjustment.reason.length < 5
            }
            onClick={() => void adjustXp()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving === "adjustment" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Registrar
          </button>
        </div>
      </section>
      <section
        hidden={activeTab !== "ledger"}
        className="rounded-2xl border border-white/[0.07] bg-[#11161e] p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <History className="size-5 text-slate-500" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Auditoria
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Histórico de XP
            </h2>
          </div>
        </div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Buscar membro, ação ou justificativa"
            aria-label="Filtrar histórico de XP"
            className="w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 sm:max-w-sm"
          />
          <select
            value={historySource}
            onChange={(event) => setHistorySource(event.target.value)}
            aria-label="Filtrar origem do XP"
            className="rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200 sm:w-48"
          >
            <option value="all">Todas as origens</option>
            <option value="manual">Manual</option>
            <option value="automatic">Automática</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-3">Membro</th>
                <th className="pb-3">Ação</th>
                <th className="pb-3">Origem</th>
                <th className="pb-3">XP</th>
                <th className="pb-3">Data</th>
                <th className="pb-3">Justificativa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredHistory.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 text-slate-200">
                    {item.member?.full_name ?? "Membro"}
                  </td>
                  <td className="py-3 text-slate-400">{item.action_key}</td>
                  <td className="py-3 text-slate-400">
                    {item.source === "manual" ? "Manual" : "Automática"}
                  </td>
                  <td className="py-3 font-semibold text-blue-300">
                    +{item.xp_amount}
                  </td>
                  <td className="py-3 text-slate-500">
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 text-slate-500">{item.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredHistory.length && (
            <p className="py-8 text-center text-xs text-slate-500">
              Nenhum evento registrado.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
