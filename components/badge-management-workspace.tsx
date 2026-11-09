"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Archive,
  Award,
  Copy,
  ChevronDown,
  Crown,
  Edit3,
  ImagePlus,
  Loader2,
  Plus,
  Search,
  Save,
  ShieldCheck,
  Trash2,
  Trophy,
  UserPlus,
} from "lucide-react";
import { BadgeDisplay } from "@/components/gamification/badge-display";

type Badge = {
  id: string;
  name: string;
  description: string;
  color: string;
  image_url?: string | null;
  image_path?: string | null;
  member_id?: string | null;
  category: string;
  rarity: string;
  unlock_criteria: Record<string, unknown>;
  is_active: boolean;
  archived_at?: string | null;
  grant_count: number;
  is_temporary: boolean;
  duration_days: number | null;
};
type Member = {
  id: string;
  full_name: string;
  email: string;
  role_name: string;
  xp: number;
  level: number;
  status: string;
};
const categories = [
  "Produtividade",
  "Desenvolvimento",
  "Organização",
  "Atendimento",
  "Colaboração",
  "Liderança",
  "Metas",
  "Conquistas especiais",
];
const rarities = [
  ["common", "Comum"],
  ["uncommon", "Incomum"],
  ["rare", "Raro"],
  ["epic", "Épico"],
  ["legendary", "Lendário"],
  ["special", "Especial"],
] as const;
const inputClass =
  "mt-2 w-full rounded-lg border border-white/10 bg-[#0b1118] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-300/50";

export function BadgeManagementWorkspace() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("cyan");
  const [category, setCategory] = useState("Conquistas especiais");
  const [rarity, setRarity] = useState("common");
  const [unlockCriteria, setUnlockCriteria] = useState("{}");
  const [file, setFile] = useState<File | null>(null);
  const [isTemporary, setIsTemporary] = useState(false);
  const [durationDays, setDurationDays] = useState(30);
  const [isActive, setIsActive] = useState(true);
  const [editingBadge, setEditingBadge] = useState<Badge | null>(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [expandedBadgeId, setExpandedBadgeId] = useState<string | null>(null);
  const [optionsBadgeId, setOptionsBadgeId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/badges", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setBadges(data.badges ?? []);
      setMembers(data.members ?? []);
      setMigrationRequired(Boolean(data.migrationRequired));
    } else
      setMessage(data.error ?? "Não foi possível carregar a área de emblemas.");
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);
  async function saveBadge(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData();
    if (editingBadge) form.set("id", editingBadge.id);
    if (duplicateSourceId) form.set("source_badge_id", duplicateSourceId);
    form.set("name", name);
    form.set("description", description);
    form.set("color", color);
    form.set("category", category);
    form.set("rarity", rarity);
    form.set("unlock_criteria", unlockCriteria);
    form.set("is_active", String(isActive));
    if (file) form.set("image", file);
    form.set("is_temporary", String(isTemporary));
    form.set("duration_days", String(durationDays));
    const response = await fetch("/api/admin/badges", {
      method: editingBadge ? "PATCH" : "POST",
      body: form,
    });
    const data = await response.json();
    if (!response.ok)
      setMessage(data.error ?? "Não foi possível salvar o emblema.");
    else {
      setMessage(
        editingBadge
          ? "Emblema atualizado."
          : duplicateSourceId
            ? "Variação criada."
            : "Emblema criado.",
      );
      setName("");
      setDescription("");
      setCategory("Conquistas especiais");
      setRarity("common");
      setUnlockCriteria("{}");
      setFile(null);
      setIsTemporary(false);
      setIsActive(true);
      setEditingBadge(null);
      setDuplicateSourceId("");
      await load();
    }
    setSaving(false);
  }
  function populateForm(badge: Badge) {
    setName(badge.name);
    setDescription(badge.description ?? "");
    setColor(badge.color);
    setCategory(badge.category ?? "Conquistas especiais");
    setRarity(badge.rarity ?? "common");
    setUnlockCriteria(JSON.stringify(badge.unlock_criteria ?? {}, null, 2));
    setIsTemporary(Boolean(badge.is_temporary));
    setDurationDays(badge.duration_days ?? 30);
    setIsActive(badge.is_active !== false);
    setFile(null);
  }
  async function archiveBadge(badge: Badge) {
    if (
      !window.confirm(
        `Arquivar "${badge.name}"? As conquistas já concedidas serão preservadas.`,
      )
    )
      return;
    setSaving(true);
    const response = await fetch("/api/admin/badges", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: badge.id }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? `"${badge.name}" arquivado com histórico preservado.`
        : (data.error ?? "Não foi possível arquivar o emblema."),
    );
    if (response.ok) {
      if (selectedBadge === badge.id) setSelectedBadge("");
      await load();
    }
    setSaving(false);
  }
  async function deleteBadge(badge: Badge) {
    if (badge.grant_count > 0) {
      setMessage("Este emblema possui conquistas registradas. Use Arquivar para preservar o histórico.");
      return;
    }
    if (!window.confirm(`Excluir "${badge.name}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/badges", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: badge.id, mode: "delete" }),
    });
    const data = await response.json();
    setMessage(response.ok ? `"${badge.name}" excluído.` : data.error ?? "Não foi possível excluir o emblema.");
    if (response.ok) {
      if (selectedBadge === badge.id) setSelectedBadge("");
      setExpandedBadgeId(null);
      setOptionsBadgeId(null);
      await load();
    }
    setSaving(false);
  }
  const filtered = members.filter((member) =>
    `${member.full_name} ${member.email} ${member.role_name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="mt-6 space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-300">
            Administração
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            Emblemas e reconhecimento
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerencie o catálogo, preserve conquistas e reconheça a equipe.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
          <ShieldCheck className="size-4" />
          Acesso controlado por permissão
        </div>
      </header>
      <div className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]">
        <section className="rounded-2xl border border-white/[.08] bg-[#11161e] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <ImagePlus className="size-5 text-cyan-300" />
            <div>
              <h2 className="font-semibold text-white">
                {editingBadge
                  ? "Editar emblema"
                  : duplicateSourceId
                    ? "Duplicar emblema"
                    : "Novo emblema"}
              </h2>
              <p className="text-xs text-slate-500">
                Use uma imagem própria ou adicione depois.
              </p>
            </div>
          </div>
          <form onSubmit={saveBadge} className="mt-5 space-y-4">
            <label className="block text-xs text-slate-400">
              Nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Descrição
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-slate-400">
                Cor
                <select
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#171d27] px-3 py-3 text-sm text-white outline-none"
                >
                  <option value="cyan">Ciano</option>
                  <option value="violet">Violeta</option>
                  <option value="amber">Âmbar</option>
                  <option value="emerald">Esmeralda</option>
                  <option value="rose">Rosa</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Categoria
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={inputClass}
                >
                  {categories.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Raridade
                <select
                  value={rarity}
                  onChange={(event) => setRarity(event.target.value)}
                  className={inputClass}
                >
                  {rarities.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Imagem
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-2 file:text-xs file:text-slate-200"
                />
              </label>
              <label className="col-span-full text-xs text-slate-400">
                Critérios de desbloqueio (JSON)
                <textarea
                  value={unlockCriteria}
                  onChange={(event) => setUnlockCriteria(event.target.value)}
                  rows={3}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder='{"activity":"complete_task","count":10}'
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                Disponível para atribuição
              </label>
              <label className="col-span-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={isTemporary}
                  onChange={(event) => setIsTemporary(event.target.checked)}
                  className="size-4 accent-cyan-300"
                />
                Emblema temporário
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    disabled={!isTemporary}
                    value={durationDays}
                    onChange={(event) =>
                      setDurationDays(Number(event.target.value))
                    }
                    className="w-20 rounded-lg border border-white/10 bg-[#171d27] px-2 py-1.5 text-right text-xs text-white disabled:opacity-40"
                  />
                  <span className="text-slate-500">dias</span>
                </div>
              </label>
            </div>
            <button
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-[#071016] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : editingBadge ? (
                <Save className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {saving
                ? "Salvando..."
                : editingBadge
                  ? "Salvar alterações"
                  : duplicateSourceId
                    ? "Criar variação"
                    : "Criar emblema"}
            </button>
            {(editingBadge || duplicateSourceId) && (
              <button
                type="button"
                onClick={() => {
                  setEditingBadge(null);
                  setDuplicateSourceId("");
                  setName("");
                  setDescription("");
                  setFile(null);
                  setUnlockCriteria("{}");
                  setIsActive(true);
                }}
                className="ml-3 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            )}
          </form>
        </section>
        <section className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#11161e]">
          <button
            type="button"
            aria-expanded={libraryOpen}
            aria-controls="badge-library-content"
            onClick={() => {
              setLibraryOpen((open) => !open);
              setExpandedBadgeId(null);
              setOptionsBadgeId(null);
            }}
            className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-white/[.025] sm:p-6"
          >
            <span className="flex min-w-0 items-center gap-3">
              <Award className="size-5 shrink-0 text-amber-300" />
              <span>
                <span className="block font-semibold text-white">
                  Biblioteca de emblemas
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Abra para consultar conquistas e administrar o catálogo.
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline">
                {badges.filter((badge) => badge.is_active).length} ativos ·{" "}
                {badges.length} no catálogo
              </span>
              <ChevronDown
                className={`size-4 text-slate-400 transition-transform ${libraryOpen ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          {libraryOpen && (
            <div
              id="badge-library-content"
              className="border-t border-white/[.07] px-4 pb-4 sm:px-6 sm:pb-6"
            >
              {!badges.length ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Crie o primeiro emblema para começar.
                </p>
              ) : (
                <div className="divide-y divide-white/[.07]">
                  {badges.map((badge) => {
                    const expanded = expandedBadgeId === badge.id;
                    const optionsOpen = optionsBadgeId === badge.id;
                    return (
                      <article
                        key={badge.id}
                        className={`${badge.is_active ? "" : "opacity-60"}`}
                      >
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={`badge-details-${badge.id}`}
                          onClick={() => {
                            setExpandedBadgeId(expanded ? null : badge.id);
                            setOptionsBadgeId(null);
                          }}
                          className="flex w-full items-center gap-4 py-4 text-left"
                        >
                          <BadgeDisplay
                            name={badge.name}
                            description={badge.description}
                            color={badge.color}
                            imageUrl={badge.image_url}
                            size="sm"
                            showLabel={false}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-100">
                              {badge.name}
                            </span>
                            <span className="mt-1 block text-[11px] text-slate-500">
                              {badge.is_active ? "Ativo" : "Arquivado"} ·{" "}
                              {badge.grant_count ?? 0} concedidos
                            </span>
                          </span>
                          <ChevronDown
                            className={`size-4 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        </button>
                        {expanded && (
                          <div
                            id={`badge-details-${badge.id}`}
                            className="pb-4 pl-14"
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Categoria e raridade
                                </p>
                                <p className="mt-1 text-xs text-slate-200">
                                  {badge.category || "Conquistas especiais"} ·{" "}
                                  {rarities.find(
                                    ([value]) => value === badge.rarity,
                                  )?.[1] ?? "Comum"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Descrição
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-300">
                                  {badge.description || "Sem descrição."}
                                </p>
                              </div>
                              <div className="sm:col-span-2">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Critério
                                </p>
                                <p className="mt-1 break-words font-mono text-[11px] text-slate-400">
                                  {JSON.stringify(badge.unlock_criteria ?? {})}
                                </p>
                              </div>
                            </div>
                            <div className="mt-4 border-t border-white/[.06] pt-3">
                              <button
                                type="button"
                                aria-expanded={optionsOpen}
                                onClick={() =>
                                  setOptionsBadgeId(
                                    optionsOpen ? null : badge.id,
                                  )
                                }
                                className="inline-flex items-center gap-2 text-xs font-medium text-cyan-200 hover:text-cyan-100"
                              >
                                <ChevronDown
                                  className={`size-3.5 transition-transform ${optionsOpen ? "rotate-180" : ""}`}
                                />
                                Opções do emblema
                              </button>
                              {optionsOpen && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {badge.is_active && badge.grant_count > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedBadge(badge.id)}
                                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${selectedBadge === badge.id ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-300 hover:bg-white/[.04]"}`}
                                    >
                                      <UserPlus className="size-3.5" />
                                      {selectedBadge === badge.id
                                        ? "Selecionado para atribuição"
                                        : "Selecionar para atribuição"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingBadge(badge);
                                      setDuplicateSourceId("");
                                      populateForm(badge);
                                      window.scrollTo({
                                        top: 0,
                                        behavior: "smooth",
                                      });
                                    }}
                                    className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[.04]"
                                  >
                                    <Edit3 className="size-3.5" />
                                    Editar
                                  </button>
                                  {badge.is_active && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingBadge(null);
                                        setDuplicateSourceId(badge.id);
                                        populateForm(badge);
                                        setName(
                                          `${badge.name} II`.slice(0, 80),
                                        );
                                        window.scrollTo({
                                          top: 0,
                                          behavior: "smooth",
                                        });
                                      }}
                                      className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[.04]"
                                    >
                                      <Copy className="size-3.5" />
                                      Duplicar
                                    </button>
                                  )}
                                  {badge.is_active && (
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => void archiveBadge(badge)}
                                      className="inline-flex items-center gap-2 rounded-md border border-amber-300/20 px-3 py-2 text-xs text-amber-200 hover:bg-amber-300/[.06] disabled:opacity-40"
                                    >
                                      <Archive className="size-3.5" />
                                      Arquivar
                                    </button>
                                  )}
                                  {badge.grant_count === 0 && (
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => void deleteBadge(badge)}
                                      className="inline-flex items-center gap-2 rounded-md border border-rose-300/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-300/[.06] disabled:opacity-40"
                                    >
                                      <Trash2 className="size-3.5" />
                                      Excluir
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <section className="rounded-2xl border border-white/[.08] bg-[#11161e] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Trophy className="size-5 text-amber-300" />
            <div>
              <h2 className="font-semibold text-white">Ranking da empresa</h2>
              <p className="text-xs text-slate-500">
                Acompanhe a evolução da equipe por XP.
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-3 size-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pessoa..."
              className="w-full rounded-xl border border-white/10 bg-white/[.03] py-2.5 pl-9 pr-3 text-xs text-white outline-none"
            />
          </div>
        </div>
        <div className="mt-5 divide-y divide-white/[.06]">
          {loading ? (
            <p className="py-8 text-center text-xs text-slate-500">
              Carregando ranking...
            </p>
          ) : (
            filtered.map((member, index) => (
              <div key={member.id} className="flex items-center gap-3 py-3">
                <span
                  className={`grid size-8 place-items-center rounded-lg text-xs font-bold ${index === 0 ? "bg-amber-300/15 text-amber-200" : "bg-white/[.04] text-slate-400"}`}
                >
                  {index < 3 ? <Crown className="size-4" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {member.full_name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {member.role_name} · nível {member.level}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-cyan-300">
                    {member.xp} XP
                  </span>
                  {selectedBadge && (
                    <button
                      type="button"
                      onClick={async () => {
                        const response = await fetch(
                          "/api/admin/badges/assign",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              badgeId: selectedBadge,
                              memberId: member.id,
                            }),
                          },
                        );
                        const data = await response.json();
                        setMessage(
                          response.ok
                            ? `${data.badge} atribuído a ${member.full_name}.`
                            : data.error,
                        );
                        if (response.ok) await load();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-300/10 px-2 py-1.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-300/20"
                    >
                      <UserPlus className="size-3" />
                      Atribuir
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      {message && (
        <p role="status" className="text-sm text-emerald-300">
          {message}
        </p>
      )}
      {migrationRequired && (
        <p
          role="status"
          className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100"
        >
          Catálogo em modo compatível. Aplique a migration{" "}
          <span className="font-mono">
            20261031100000_gamification_badge_catalog
          </span>{" "}
          para habilitar edição, categorias, raridade e arquivamento.
        </p>
      )}
    </div>
  );
}
