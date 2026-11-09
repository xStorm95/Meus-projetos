"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Store, Sliders, Palette, FileCheck2, ShieldCheck, Save, Upload, Trash2, Info, Database, Pipette, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { cn, maskDocument, maskPhone, maskZip } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, Modal, Tabs } from "@/components/ui/primitives";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { extractLogoColors, type ExtractedColor } from "@/components/settings/logo-colors";

type Settings = {
  appName: string;
  companyName: string;
  companyLegalName: string | null;
  companyDocument: string | null;
  companyStateRegistration: string | null;
  companyCityRegistration: string | null;
  companyAddress: string | null;
  companyAddressNumber: string | null;
  companyDistrict: string | null;
  companyCity: string | null;
  companyState: string | null;
  companyZip: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  logoUrl: string | null;
  printFooter: string | null;
  lgpdPrivacyContact: string | null;
  lgpdRetentionMonths: number;
  allowNegativeStock: boolean;
  lowStockDefault: number;
  defaultMaxDiscount: string;
  sellerMaxDiscount: string;
  requireDiscountReason: boolean;
  creditDefaultLimit: string;
  creditInterestRate: string;
  creditPenaltyRate: string;
  creditDailyInterest: string;
  creditGraceDays: number;
  accentColor: string;
  whatsappEnabled: boolean;
  fiscalProvider: string | null;
  fiscalEnvironment: "HOMOLOGATION" | "PRODUCTION";
  fiscalSeriesNfce: number;
  fiscalNextNumberNfce: number;
  fiscalSeriesNfe: number;
  fiscalNextNumberNfe: number;
  fiscalCscId: string | null;
  fiscalCscToken: string | null;
  fiscalCertificateName: string | null;
  fiscalDefaultCfop: string;
  fiscalDefaultNcm: string | null;
  fiscalDefaultCsosn: string;
};

type Tab = "COMPANY" | "RULES" | "BRANDING" | "FISCAL" | "SECURITY";

const ACCENTS: Array<{ value: string; label: string; swatch: string }> = [
  { value: "gold", label: "Dourado", swatch: "#c9a227" },
  { value: "rose", label: "Rosé", swatch: "#c2707f" },
  { value: "emerald", label: "Esmeralda", swatch: "#0f766e" },
  { value: "navy", label: "Marinho", swatch: "#1e3a5f" },
  { value: "indigo", label: "Índigo", swatch: "#4f46e5" },
  { value: "graphite", label: "Grafite", swatch: "#3f3f46" },
];

export function SettingsView({
  settings,
  permissions,
}: {
  settings: Settings;
  permissions: { canManage: boolean; canBackup: boolean; isDemo: boolean };
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("COMPANY");
  const [saving, setSaving] = React.useState(false);
  const [company, setCompany] = React.useState({
    appName: settings.appName,
    companyName: settings.companyName,
    companyLegalName: settings.companyLegalName ?? "",
    companyDocument: settings.companyDocument ? maskDocument(settings.companyDocument) : "",
    companyStateRegistration: settings.companyStateRegistration ?? "",
    companyCityRegistration: settings.companyCityRegistration ?? "",
    companyAddress: settings.companyAddress ?? "",
    companyAddressNumber: settings.companyAddressNumber ?? "",
    companyDistrict: settings.companyDistrict ?? "",
    companyCity: settings.companyCity ?? "",
    companyState: settings.companyState ?? "",
    companyZip: settings.companyZip ?? "",
    companyPhone: settings.companyPhone ? maskPhone(settings.companyPhone) : "",
    companyEmail: settings.companyEmail ?? "",
    printFooter: settings.printFooter ?? "",
  });
  const [rules, setRules] = React.useState({
    allowNegativeStock: settings.allowNegativeStock,
    lowStockDefault: settings.lowStockDefault,
    defaultMaxDiscount: Number(settings.defaultMaxDiscount),
    sellerMaxDiscount: Number(settings.sellerMaxDiscount),
    requireDiscountReason: settings.requireDiscountReason,
    creditDefaultLimit: Number(settings.creditDefaultLimit),
    creditInterestRate: Number(settings.creditInterestRate),
    creditPenaltyRate: Number(settings.creditPenaltyRate),
    creditDailyInterest: Number(settings.creditDailyInterest),
    creditGraceDays: settings.creditGraceDays,
    whatsappEnabled: settings.whatsappEnabled,
  });
  const [branding, setBranding] = React.useState({ logoUrl: settings.logoUrl, accentColor: settings.accentColor, appName: settings.appName });
  /** Cor livre (a cor da logo) — guardada como "custom:#rrggbb". */
  const [customHex, setCustomHex] = React.useState<string>(
    settings.accentColor?.startsWith("custom:") ? settings.accentColor.slice(7) : "#c9a227",
  );
  const [customActive, setCustomActive] = React.useState<boolean>(
    Boolean(settings.accentColor?.startsWith("custom:")),
  );
  const [logoSuggestions, setLogoSuggestions] = React.useState<ExtractedColor[]>([]);
  const [readingLogo, setReadingLogo] = React.useState(false);
  const [fiscal, setFiscal] = React.useState({
    fiscalProvider: settings.fiscalProvider ?? "",
    fiscalEnvironment: settings.fiscalEnvironment,
    fiscalSeriesNfce: settings.fiscalSeriesNfce,
    fiscalNextNumberNfce: settings.fiscalNextNumberNfce,
    fiscalSeriesNfe: settings.fiscalSeriesNfe,
    fiscalNextNumberNfe: settings.fiscalNextNumberNfe,
    fiscalCscId: settings.fiscalCscId ?? "",
    fiscalCscToken: settings.fiscalCscToken ?? "",
    fiscalCertificateName: settings.fiscalCertificateName ?? "",
    fiscalDefaultCfop: settings.fiscalDefaultCfop,
    fiscalDefaultNcm: settings.fiscalDefaultNcm ?? "",
    fiscalDefaultCsosn: settings.fiscalDefaultCsosn,
  });
  const [security, setSecurity] = React.useState({
    lgpdPrivacyContact: settings.lgpdPrivacyContact ?? "",
    lgpdRetentionMonths: settings.lgpdRetentionMonths,
  });
  const [backupOpen, setBackupOpen] = React.useState(false);

  async function saveCompany() {
    setSaving(true);
    try {
      await api.patch("/api/settings", {
        section: "company",
        company: {
          ...company,
          companyDocument: company.companyDocument.replace(/\D/g, "") || null,
          companyZip: company.companyZip.replace(/\D/g, "") || null,
        },
      });
      toast.success("Dados da empresa salvos.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveRules() {
    setSaving(true);
    try {
      await api.patch("/api/settings", { section: "rules", rules });
      toast.success("Regras atualizadas.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /** Aplica a cor na hora (prévia ao vivo, antes de salvar). */
  function previewAccent(hex: string) {
    const root = document.documentElement;
    const value = `custom:${hex}`;
    setBranding((prev) => ({ ...prev, accentColor: value }));
    setCustomActive(true);
    setCustomHex(hex);
    // Prévia: tons derivados rapidamente no cliente (o servidor refaz ao salvar).
    root.setAttribute("data-accent-hex", hex);
    const rgb = hex.replace("#", "").match(/.{2}/g);
    if (rgb) {
      const [r, g, b] = rgb.map((v) => parseInt(v, 16) / 255);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      root.style.setProperty("--accent-custom", hex);
      root.style.setProperty("--accent-custom-soft", `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.10)`);
      root.style.setProperty("--accent-custom-contrast", lum > 0.55 ? "#14140f" : "#ffffff");
      root.style.setProperty("--accent-custom-dark", lum < 0.28 ? `color-mix(in srgb, ${hex} 58%, white)` : hex);
      root.style.setProperty("--accent-custom-soft-dark", `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.16)`);
    }
    root.setAttribute("data-accent-tone", "light");
  }

  /** Lê as cores dominantes da logo (tudo no navegador, nada é enviado). */
  async function readLogoColors(image: string | null) {
    if (!image) return setLogoSuggestions([]);
    setReadingLogo(true);
    try {
      const colors = await extractLogoColors(image, 6);
      setLogoSuggestions(colors);
      if (colors.length === 0) toast.info("A logo é neutra (preto/branco) — escolha a cor na paleta.");
    } catch {
      setLogoSuggestions([]);
    } finally {
      setReadingLogo(false);
    }
  }

  React.useEffect(() => {
    // Ao abrir a aba, sugere as cores da logo que já está salva.
    if (tab === "BRANDING" && branding.logoUrl && logoSuggestions.length === 0) {
      void readLogoColors(branding.logoUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, branding.logoUrl]);

  async function saveBranding() {
    setSaving(true);
    try {
      const accentColor = customActive ? `custom:${customHex}` : branding.accentColor;
      await api.patch("/api/settings/branding", {
        logoUrl: branding.logoUrl,
        appName: branding.appName,
        accentColor,
      });
      document.documentElement.setAttribute("data-accent", accentColor.replace(/[^a-z]/g, "") || "gold");
      if (customActive) {
        document.documentElement.setAttribute("data-accent-hex", customHex);
      } else {
        document.documentElement.removeAttribute("data-accent-hex");
      }
      toast.success("Identidade visual atualizada.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveFiscal() {
    setSaving(true);
    try {
      await api.patch("/api/settings", { section: "fiscal", fiscal });
      toast.success("Parâmetros fiscais salvos.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveSecurity() {
    setSaving(true);
    try {
      await api.patch("/api/settings", { section: "company", company: security });
      toast.success("Parâmetros de segurança e LGPD salvos.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function pickLogo(file: File) {
    if (file.size > 400 * 1024) return toast.error("Logo maior que 400 KB. Reduza a imagem.");
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      return toast.error("Use PNG, JPG, WEBP ou SVG.");
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setBranding((prev) => ({ ...prev, logoUrl: dataUrl }));
      void readLogoColors(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  const readOnly = !permissions.canManage;

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-xs text-[var(--text-muted)]">
          Dados da empresa, regras de operação, identidade visual, fiscal e segurança.
          {readOnly && " Somente leitura para o seu perfil."}
        </p>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "COMPANY", label: "Empresa" },
          { value: "RULES", label: "Operação" },
          { value: "BRANDING", label: "Aparência" },
          { value: "FISCAL", label: "Fiscal" },
          { value: "SECURITY", label: "LGPD e segurança" },
        ]}
      />

      {tab === "COMPANY" && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[var(--accent-strong)]" />
            <h2 className="text-sm font-semibold">Dados da empresa</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do sistema" required hint="Aparece na barra lateral e no título do navegador">
              <Input value={company.appName} disabled={readOnly} onChange={(e) => setCompany({ ...company, appName: e.target.value })} />
            </Field>
            <Field label="Nome da loja" required>
              <Input value={company.companyName} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} />
            </Field>
            <Field label="Razão social">
              <Input value={company.companyLegalName} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyLegalName: e.target.value })} />
            </Field>
            <Field label="CNPJ / CPF">
              <Input value={company.companyDocument} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyDocument: maskDocument(e.target.value) })} />
            </Field>
            <Field label="Inscrição estadual">
              <Input value={company.companyStateRegistration} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyStateRegistration: e.target.value })} />
            </Field>
            <Field label="Inscrição municipal">
              <Input value={company.companyCityRegistration} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyCityRegistration: e.target.value })} />
            </Field>
            <Field label="Telefone">
              <Input value={company.companyPhone} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyPhone: maskPhone(e.target.value) })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={company.companyEmail} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyEmail: e.target.value })} />
            </Field>
            <Field label="Endereço" className="sm:col-span-2">
              <Input value={company.companyAddress} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyAddress: e.target.value })} />
            </Field>
            <Field label="Número">
              <Input value={company.companyAddressNumber} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyAddressNumber: e.target.value })} />
            </Field>
            <Field label="Bairro">
              <Input value={company.companyDistrict} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyDistrict: e.target.value })} />
            </Field>
            <Field label="CEP">
              <Input value={company.companyZip} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyZip: maskZip(e.target.value) })} />
            </Field>
            <Field label="Cidade">
              <Input value={company.companyCity} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyCity: e.target.value })} />
            </Field>
            <Field label="UF">
              <Input maxLength={2} value={company.companyState} disabled={readOnly} onChange={(e) => setCompany({ ...company, companyState: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Rodapé do comprovante" className="sm:col-span-2" hint="Mensagem impressa nos comprovantes e orçamentos">
              <Textarea value={company.printFooter} disabled={readOnly} onChange={(e) => setCompany({ ...company, printFooter: e.target.value })} />
            </Field>
          </div>
          {permissions.canManage && (
            <div className="flex justify-end">
              <Button size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />} onClick={() => void saveCompany()}>
                Salvar dados
              </Button>
            </div>
          )}
        </Card>
      )}

      {tab === "RULES" && (
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[var(--accent-strong)]" />
              <h2 className="text-sm font-semibold">Vendas, descontos e estoque</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Desconto máximo (%)" hint="Gerentes e administradores">
                <Input type="number" min={0} max={100} step={0.5} value={rules.defaultMaxDiscount} disabled={readOnly} onChange={(e) => setRules({ ...rules, defaultMaxDiscount: Number(e.target.value) })} />
              </Field>
              <Field label="Desconto máximo — vendedor (%)">
                <Input type="number" min={0} max={100} step={0.5} value={rules.sellerMaxDiscount} disabled={readOnly} onChange={(e) => setRules({ ...rules, sellerMaxDiscount: Number(e.target.value) })} />
              </Field>
              <Field label="Estoque mínimo padrão">
                <Input type="number" min={0} value={rules.lowStockDefault} disabled={readOnly} onChange={(e) => setRules({ ...rules, lowStockDefault: Number(e.target.value) })} />
              </Field>
            </div>
            <Switch
              checked={rules.requireDiscountReason}
              onChange={(v) => setRules({ ...rules, requireDiscountReason: v })}
              label="Exigir justificativa em todo desconto"
              description="O desconto fica registrado na venda e na auditoria."
              disabled={readOnly}
            />
            <Switch
              checked={rules.allowNegativeStock}
              onChange={(v) => setRules({ ...rules, allowNegativeStock: v })}
              label="Permitir venda com estoque negativo"
              description="Recomendado manter desligado. Usuários com permissão específica podem autorizar."
              disabled={readOnly}
            />
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Crediário</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Limite padrão (R$)" hint="Aplicado a novos clientes">
                <Input type="number" min={0} value={rules.creditDefaultLimit} disabled={readOnly} onChange={(e) => setRules({ ...rules, creditDefaultLimit: Number(e.target.value) })} />
              </Field>
              <Field label="Juros ao mês (%)">
                <Input type="number" min={0} step={0.01} value={rules.creditInterestRate} disabled={readOnly} onChange={(e) => setRules({ ...rules, creditInterestRate: Number(e.target.value) })} />
              </Field>
              <Field label="Multa por atraso (%)">
                <Input type="number" min={0} step={0.01} value={rules.creditPenaltyRate} disabled={readOnly} onChange={(e) => setRules({ ...rules, creditPenaltyRate: Number(e.target.value) })} />
              </Field>
              <Field label="Juros de mora ao dia (%)">
                <Input type="number" min={0} step={0.001} value={rules.creditDailyInterest} disabled={readOnly} onChange={(e) => setRules({ ...rules, creditDailyInterest: Number(e.target.value) })} />
              </Field>
              <Field label="Carência (dias)">
                <Input type="number" min={0} value={rules.creditGraceDays} disabled={readOnly} onChange={(e) => setRules({ ...rules, creditGraceDays: Number(e.target.value) })} />
              </Field>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Multa e juros são calculados no recebimento e ficam registrados na parcela. Alterações aqui valem para
              novas cobranças.
            </p>
          </Card>

          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-semibold">Integrações</h2>
            <Switch
              checked={rules.whatsappEnabled}
              onChange={(v) => setRules({ ...rules, whatsappEnabled: v })}
              label="Habilitar envio por WhatsApp"
              description="Abre o WhatsApp Web/app do operador (wa.me). Não há disparo automático sem provedor configurado."
              disabled={readOnly}
            />
          </Card>

          {permissions.canManage && (
            <div className="flex justify-end">
              <Button size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />} onClick={() => void saveRules()}>
                Salvar regras
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === "BRANDING" && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--accent-strong)]" />
              <h2 className="text-sm font-semibold">Identidade visual</h2>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              Nome da loja
              <Input
                value={branding.appName}
                disabled={readOnly}
                onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
                className="h-8 w-44"
                placeholder="Passarela da Moda"
              />
            </label>
          </div>

          {/* Prévia: como a marca aparece no menu e nos botões */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/50 p-3">
            <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-surface)] px-3 py-2 shadow-sm">
              <span
                className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg text-[13px] font-bold"
                style={{ background: customActive ? customHex : "var(--accent)", color: "var(--accent-contrast)" }}
              >
                {branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  (branding.appName || "P").trim().charAt(0).toUpperCase()
                )}
              </span>
              <span className="leading-tight">
                <span className="block text-[13px] font-semibold">{branding.appName || "Passarela da Moda"}</span>
                <span className="block text-[10.5px] text-[var(--text-muted)]">
                  {settings.companyName} · menu e cupons
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={readOnly}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold shadow-sm transition-transform hover:-translate-y-px"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                Nova venda
              </button>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
                Etiqueta
              </span>
            </div>
            <p className="flex-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
              Assim a marca aparece no dia a dia. A cor vale para o sistema todo — inclusive no cupom impresso.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]">
                {branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logoUrl} alt="Logo da loja" className="max-h-28 max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)]">Sem logo</span>
                )}
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) pickLogo(file);
                    }}
                  />
                  <Button variant="outline" size="sm" className="w-full" leftIcon={<Upload className="h-3.5 w-3.5" />} disabled={readOnly} onClick={(e) => {
                    const input = (e.currentTarget.parentElement as HTMLLabelElement).querySelector("input");
                    input?.click();
                  }}>
                    Enviar
                  </Button>
                </label>
                {branding.logoUrl && (
                  <Button variant="ghost" size="icon-sm" title="Remover logo" disabled={readOnly} onClick={() => setBranding({ ...branding, logoUrl: null })}>
                    <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="label">Cor da logo → cor do site</p>
                {logoSuggestions.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {logoSuggestions.map((color) => (
                        <button
                          key={color.hex}
                          type="button"
                          disabled={readOnly}
                          title={`Usar ${color.hex} (${Math.round(color.weight * 100)}% da logo)`}
                          onClick={() => previewAccent(color.hex)}
                          className={cn(
                            "group relative h-9 w-9 rounded-xl border-2 transition-all hover:scale-105",
                            customActive && customHex.toLowerCase() === color.hex.toLowerCase()
                              ? "border-[var(--text-primary)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-surface)]"
                              : "border-black/10",
                          )}
                          style={{ background: color.hex }}
                        >
                          <span className="absolute inset-x-0 -bottom-4 hidden text-[9px] text-[var(--text-muted)] group-hover:block">
                            {Math.round(color.weight * 100)}%
                          </span>
                        </button>
                      ))}
                      <span className="ml-1 text-[11px] text-[var(--text-muted)]">
                        {readingLogo ? "lendo a logo…" : "cores encontradas na sua logo"}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-[var(--text-muted)]">
                      Clique numa cor para aplicar no sistema inteiro. A imagem é analisada aqui no seu navegador — nada é enviado.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {readingLogo ? (
                      <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Lendo as cores da logo…</span>
                    ) : branding.logoUrl ? (
                      <button type="button" className="inline-flex items-center gap-1.5 text-[var(--accent-strong)] hover:underline" onClick={() => void readLogoColors(branding.logoUrl)}>
                        <Pipette className="h-3 w-3" /> Ler as cores da logo
                      </button>
                    ) : (
                      "Envie uma logo para o sistema sugerir as cores dela automaticamente."
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="label">Ou escolha uma cor</p>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENTS.map((accent) => (
                    <button
                      key={accent.value}
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        setBranding({ ...branding, accentColor: accent.value });
                        setCustomActive(false);
                        document.documentElement.removeAttribute("data-accent-hex");
                        document.documentElement.setAttribute("data-accent", accent.value);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all",
                        !customActive && branding.accentColor === accent.value
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border-default)] hover:bg-[var(--bg-muted)]",
                      )}
                    >
                      <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: accent.swatch }} />
                      {accent.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/60 p-3">
                <label className="space-y-1">
                  <span className="label block">Cor livre (hex)</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Escolher cor"
                      disabled={readOnly}
                      value={customHex}
                      onChange={(e) => previewAccent(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--border-default)] bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={customHex}
                      disabled={readOnly}
                      onChange={(e) => {
                        const value = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                        setCustomHex(value);
                        if (/^#[0-9a-f]{6}$/i.test(value)) previewAccent(value);
                      }}
                      className="input h-9 w-28 font-[family-name:var(--font-mono,monospace)] text-[12px] uppercase"
                      placeholder="#C9A227"
                    />
                  </span>
                </label>
                <div className="flex-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {customActive ? (
                    <>
                      Cor personalizada ativa — o sistema calcula o texto legível e o tom escuro automaticamente.
                    </>
                  ) : (
                    <>
                      Escolha a cor exata da sua marca. Vale para menu, botões, gráficos e cupons.
                    </>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-[var(--text-muted)]">
                A cor é aplicada em toda a interface para todos os usuários da loja. O tema claro/escuro continua sendo escolha
                individual em cada dispositivo.
              </p>
            </div>
          </div>
          {permissions.canManage && (
            <div className="flex justify-end">
              <Button size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />} onClick={() => void saveBranding()}>
                Salvar aparência
              </Button>
            </div>
          )}
        </Card>
      )}

      {tab === "FISCAL" && (
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-[var(--accent-strong)]" />
                <h2 className="text-sm font-semibold">Parâmetros fiscais</h2>
              </div>
              <Badge tone={fiscal.fiscalEnvironment === "PRODUCTION" ? "danger" : "warning"}>
                {fiscal.fiscalEnvironment === "PRODUCTION" ? "Produção" : "Homologação"}
              </Badge>
            </div>
            <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-3 text-[11px] text-[var(--text-secondary)]">
              <strong className="text-[var(--warning)]">Importante:</strong> o PASSARELA ERP não emite documentos fiscais
              por conta própria. Estes campos preparam a integração com um provedor (Focus NFe, eNotas, Tecnospeed
              etc.). Enquanto não houver provedor configurado e certificado válido, nenhum documento é transmitido à
              SEFAZ — o sistema nunca simula autorização.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provedor de emissão" hint="Nome do serviço contratado">
                <Input value={fiscal.fiscalProvider} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalProvider: e.target.value })} placeholder="Ex.: Focus NFe" />
              </Field>
              <Field label="Ambiente">
                <Select value={fiscal.fiscalEnvironment} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalEnvironment: e.target.value as never })}>
                  <option value="HOMOLOGATION">Homologação (testes)</option>
                  <option value="PRODUCTION">Produção</option>
                </Select>
              </Field>
              <Field label="Série NFC-e">
                <Input type="number" min={1} value={fiscal.fiscalSeriesNfce} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalSeriesNfce: Number(e.target.value) })} />
              </Field>
              <Field label="Próximo número NFC-e">
                <Input type="number" min={1} value={fiscal.fiscalNextNumberNfce} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalNextNumberNfce: Number(e.target.value) })} />
              </Field>
              <Field label="Série NF-e">
                <Input type="number" min={1} value={fiscal.fiscalSeriesNfe} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalSeriesNfe: Number(e.target.value) })} />
              </Field>
              <Field label="Próximo número NF-e">
                <Input type="number" min={1} value={fiscal.fiscalNextNumberNfe} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalNextNumberNfe: Number(e.target.value) })} />
              </Field>
              <Field label="CSC ID (NFC-e)">
                <Input value={fiscal.fiscalCscId} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalCscId: e.target.value })} />
              </Field>
              <Field label="CSC Token" hint="Armazenado no servidor. Nunca é exibido após salvar.">
                <Input type="password" value={fiscal.fiscalCscToken} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalCscToken: e.target.value })} placeholder="••••••" />
              </Field>
              <Field label="Certificado digital" hint="Nome do arquivo do certificado A1 (upload seguro fora do sistema)">
                <Input value={fiscal.fiscalCertificateName} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalCertificateName: e.target.value })} />
              </Field>
              <Field label="CFOP padrão">
                <Input value={fiscal.fiscalDefaultCfop} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalDefaultCfop: e.target.value })} />
              </Field>
              <Field label="NCM padrão">
                <Input value={fiscal.fiscalDefaultNcm} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalDefaultNcm: e.target.value })} />
              </Field>
              <Field label="CSOSN padrão">
                <Input value={fiscal.fiscalDefaultCsosn} disabled={readOnly} onChange={(e) => setFiscal({ ...fiscal, fiscalDefaultCsosn: e.target.value })} />
              </Field>
            </div>
            {permissions.canManage && (
              <div className="flex justify-end">
                <Button size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />} onClick={() => void saveFiscal()}>
                  Salvar parâmetros
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "SECURITY" && (
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--accent-strong)]" />
              <h2 className="text-sm font-semibold">LGPD e privacidade</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contato do encarregado de dados" hint="E-mail ou telefone divulgado ao cliente">
                <Input value={security.lgpdPrivacyContact} disabled={readOnly} onChange={(e) => setSecurity({ ...security, lgpdPrivacyContact: e.target.value })} />
              </Field>
              <Field label="Retenção de dados (meses)" hint="Dados financeiros e fiscais seguem prazos legais">
                <Input type="number" min={12} max={240} value={security.lgpdRetentionMonths} disabled={readOnly} onChange={(e) => setSecurity({ ...security, lgpdRetentionMonths: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              <p className="mb-1 font-semibold text-[var(--text-primary)]">Direitos do titular</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li>Exportação dos dados do cliente em Clientes → ficha → LGPD (JSON).</li>
                <li>Anonimização disponível apenas quando não há dívida em aberto nem venda no período de retenção.</li>
                <li>Consentimento de WhatsApp/e-mail registrado com data e origem.</li>
                <li>Senhas usadas com hash scrypt; sessões revogáveis em Usuários → Sessões.</li>
              </ul>
            </div>
            {permissions.canManage && (
              <div className="flex justify-end">
                <Button size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />} onClick={() => void saveSecurity()}>
                  Salvar
                </Button>
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--accent-strong)]" />
              <h2 className="text-sm font-semibold">Backup e restauração</h2>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              O backup gera um dump completo do PostgreSQL (estrutura e dados) na pasta <code>backups/</code> do
              servidor. A restauração substitui os dados e deve ser executada por um administrador, de preferência fora
              do horário de funcionamento.
            </p>
            <div className="rounded-lg bg-[var(--bg-muted)] p-2.5 font-mono text-[10.5px] text-[var(--text-secondary)]">
              npm run backup &nbsp;·&nbsp; npm run restore -- backups/arquivo.sql.gz
            </div>
            {permissions.canBackup ? (
              <Button variant="outline" size="sm" onClick={() => setBackupOpen(true)}>
                Ver procedimento de backup
              </Button>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">Seu perfil não permite executar backup.</p>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        title="Backup e restauração"
        size="md"
        footer={<Button variant="outline" size="sm" onClick={() => setBackupOpen(false)}>Fechar</Button>}
      >
        <div className="space-y-3 text-[12px] text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">Gerar backup agora</p>
          <pre className="overflow-x-auto rounded-lg bg-[var(--bg-muted)] p-2.5 text-[10.5px]">npm run backup</pre>
          <p>O arquivo é salvo em <code>backups/passarela-AAAA-MM-DDTHH-mm.sql.gz</code>, com verificação de integridade.</p>
          <p className="font-semibold text-[var(--text-primary)]">Restaurar</p>
          <pre className="overflow-x-auto rounded-lg bg-[var(--bg-muted)] p-2.5 text-[10.5px]">npm run restore -- backups/arquivo.sql.gz</pre>
          <p>
            A restauração exige confirmação explícita (<code>--yes</code>) e cria um backup automático do estado atual
            antes de sobrescrever os dados.
          </p>
          <p className="font-semibold text-[var(--text-primary)]">Agendamento recomendado</p>
          <p>
            Diário fora do horário comercial, retenção mínima de 30 dias, com cópia externa (nuvem/HD) em ambiente
            separado do servidor da loja.
          </p>
          {permissions.isDemo && (
            <p className="rounded-lg bg-[var(--warning-soft)] p-2 text-[11px] text-[var(--warning)]">
              Este ambiente está em modo demonstração com dados fictícios identificados por [DEMO].
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
