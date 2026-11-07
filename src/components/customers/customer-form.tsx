"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { isValidCPF, maskDocument, maskPhone, maskZip } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Alert } from "@/components/ui/primitives";
import { Field, Input, MoneyInput, Select, Textarea, Switch, Checkbox } from "@/components/ui/form";

export type CustomerFormInitial = {
  id?: string;
  name?: string;
  document?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  sizePreference?: string | null;
  creditLimit?: string;
  isActive?: boolean;
  acceptsWhatsapp?: boolean;
  acceptsEmail?: boolean;
};

export function CustomerForm({
  mode,
  initial,
  canSetCreditLimit,
}: {
  mode: "create" | "edit";
  initial?: CustomerFormInitial;
  canSetCreditLimit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [documentError, setDocumentError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: initial?.name ?? "",
    document: initial?.document ? maskDocument(initial.document) : "",
    birthDate: initial?.birthDate ?? "",
    phone: initial?.phone ? maskPhone(initial.phone) : "",
    whatsapp: initial?.whatsapp ? maskPhone(initial.whatsapp) : "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    addressNumber: initial?.addressNumber ?? "",
    district: initial?.district ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    zip: initial?.zip ? maskZip(initial.zip) : "",
    notes: initial?.notes ?? "",
    sizePreference: initial?.sizePreference ?? "",
    creditLimit: Number(initial?.creditLimit ?? 0),
    isActive: initial?.isActive ?? true,
    acceptsWhatsapp: initial?.acceptsWhatsapp ?? false,
    acceptsEmail: initial?.acceptsEmail ?? false,
    lgpdConsent: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    const digits = form.document.replace(/\D/g, "");
    if (digits.length === 11 && !isValidCPF(digits)) {
      setDocumentError("CPF inválido. Confira os dígitos.");
      toast.error("CPF inválido.");
      return;
    }
    setDocumentError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        document: digits || null,
        birthDate: form.birthDate || null,
        email: form.email || null,
      };
      if (mode === "create") {
        const res = await api.post<{ customer: { id: string } }>("/api/customers", payload);
        toast.success("Cliente cadastrado com sucesso.");
        router.push(`/clientes/${res.customer.id}`);
      } else {
        await api.put(`/api/customers/${initial!.id}`, payload);
        toast.success("Cliente atualizado.");
        router.push(`/clientes/${initial!.id}`);
      }
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {mode === "create" ? "Novo cliente" : "Editar cliente"}
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Dados pessoais protegidos conforme a LGPD
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={mode === "edit" && initial?.id ? `/clientes/${initial.id}` : "/clientes"}>
            <Button type="button" variant="outline" size="sm">Cancelar</Button>
          </Link>
          <Button type="submit" size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />}>
            {mode === "create" ? "Cadastrar cliente" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-[var(--accent)]" /> Dados pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome completo" required className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Maria Aparecida da Silva"
              required
              autoFocus
            />
          </Field>
          <Field label="CPF / CNPJ" error={documentError ?? undefined}>
            <Input
              value={form.document}
              onChange={(e) => {
                setForm({ ...form, document: maskDocument(e.target.value) });
                setDocumentError(null);
              }}
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label="Data de nascimento" hint="Usada para ações de aniversário">
            <Input
              type="date"
              value={form.birthDate ?? ""}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
              placeholder="(00) 0000-0000"
            />
          </Field>
          <Field label="Celular / WhatsApp">
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })}
              placeholder="(00) 00000-0000"
            />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="cliente@email.com"
            />
          </Field>
          <Field label="Preferência de tamanho">
            <Select
              value={form.sizePreference}
              onChange={(e) => setForm({ ...form, sizePreference: e.target.value })}
            >
              <option value="">Não informado</option>
              {["PP", "P", "M", "G", "GG", "XG", "36", "38", "40", "42", "44", "46", "48"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="CEP">
            <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: maskZip(e.target.value) })} placeholder="00000-000" />
          </Field>
          <Field label="Endereço" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua das Flores" />
          </Field>
          <Field label="Número">
            <Input value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} placeholder="123" />
          </Field>
          <Field label="Bairro">
            <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="UF">
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
              placeholder="SP"
              maxLength={2}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" /> Crédito e privacidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Limite de crediário"
              hint={canSetCreditLimit ? "Valor máximo a prazo para este cliente" : "Sem permissão para alterar"}
            >
              <MoneyInput
                value={form.creditLimit}
                onChange={(v) => setForm({ ...form, creditLimit: v })}
                disabled={!canSetCreditLimit}
              />
            </Field>
            <div className="space-y-2 pt-1">
              <Switch
                checked={form.isActive}
                onChange={(v) => setForm({ ...form, isActive: v })}
                label="Cliente ativo"
                description="Inativos não aparecem na busca do PDV"
              />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-default)] p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Consentimento LGPD
            </p>
            <div className="space-y-2">
              <Checkbox
                checked={form.acceptsWhatsapp}
                onChange={(v) => setForm({ ...form, acceptsWhatsapp: v })}
                label="Aceita receber mensagens por WhatsApp"
                description="Necessário para ações de CRM via WhatsApp Business API"
              />
              <Checkbox
                checked={form.acceptsEmail}
                onChange={(v) => setForm({ ...form, acceptsEmail: v })}
                label="Aceita receber e-mails promocionais"
              />
              {mode === "create" && (
                <Checkbox
                  checked={form.lgpdConsent}
                  onChange={(v) => setForm({ ...form, lgpdConsent: v })}
                  label="Titular autorizou o tratamento dos dados"
                  description="Registra data e origem do consentimento"
                />
              )}
            </div>
          </div>
          <Field label="Observações internas">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Preferências, histórico de atendimento, informações relevantes..."
            />
          </Field>
          <Alert tone="info">
            Os dados pessoais são usados apenas para atendimento, crédito e relacionamento. O titular
            pode solicitar a exclusão a qualquer momento — o histórico financeiro é preservado de
            forma anonimizada, conforme obrigações legais.
          </Alert>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href={mode === "edit" && initial?.id ? `/clientes/${initial.id}` : "/clientes"}>
          <Button type="button" variant="outline" size="sm">Cancelar</Button>
        </Link>
        <Button type="submit" size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />}>
          {mode === "create" ? "Cadastrar cliente" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
