"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Truck, Pencil, Wallet, Package, FileText, Phone, Mail, MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { brl, cn, dateBR, maskDocument, maskPhone, maskZip, num } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState, Modal, Alert } from "@/components/ui/primitives";
import { Field, Input, Select, SearchInput, Textarea, Switch } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/ui/data-table";

type Supplier = {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string | null;
  stateRegistration: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  addressNumber: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  productsCount: number;
  openPayables: string;
  purchasesCount: number;
  lastPurchase: string | null;
};

const EMPTY = {
  legalName: "",
  tradeName: "",
  document: "",
  stateRegistration: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  addressNumber: "",
  district: "",
  city: "",
  state: "",
  zip: "",
  paymentTerms: "",
  notes: "",
  isActive: true,
};

export function SuppliersView({
  data,
  filters,
  permissions,
}: {
  data: { items: Supplier[]; total: number; page: number; pageSize: number };
  filters: { search: string; status: string };
  permissions: { canManage: boolean; canViewPayables: boolean };
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState(filters.search);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [form, setForm] = React.useState({ ...EMPTY });
  const [saving, setSaving] = React.useState(false);
  const [detail, setDetail] = React.useState<Supplier | null>(null);

  function navigate(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "ALL") continue;
      next.set(k, String(v));
    }
    router.push(`/fornecedores?${next.toString()}`);
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) navigate({ search, page: undefined });
    }, 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY });
    setFormOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      legalName: supplier.legalName,
      tradeName: supplier.tradeName ?? "",
      document: supplier.document ? maskDocument(supplier.document) : "",
      stateRegistration: supplier.stateRegistration ?? "",
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      addressNumber: supplier.addressNumber ?? "",
      district: supplier.district ?? "",
      city: supplier.city ?? "",
      state: supplier.state ?? "",
      zip: supplier.zip ?? "",
      paymentTerms: supplier.paymentTerms ?? "",
      notes: supplier.notes ?? "",
      isActive: supplier.isActive,
    });
    setFormOpen(true);
  }

  async function save() {
    if (form.legalName.trim().length < 3) return toast.error("Informe a razão social.");
    setSaving(true);
    try {
      const payload = {
        ...form,
        document: form.document.replace(/\D/g, "") || null,
        email: form.email || null,
      };
      if (editing) {
        await api.patch(`/api/suppliers/${editing.id}`, payload);
        toast.success("Fornecedor atualizado.");
      } else {
        await api.post("/api/suppliers", payload);
        toast.success("Fornecedor cadastrado.");
      }
      setFormOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Fornecedor",
      sortable: true,
      sortValue: (s) => s.legalName,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{s.legalName}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {s.tradeName ?? s.document ? `${s.tradeName ?? ""}${s.tradeName && s.document ? " · " : ""}${s.document ? maskDocument(s.document) : ""}` : "Sem documento"}
          </p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contato",
      hiddenOnMobile: true,
      cell: (s) => (
        <div className="text-[11px]">
          <p>{s.contactName ?? "—"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{s.phone ? maskPhone(s.phone) : ""}</p>
        </div>
      ),
    },
    {
      key: "products",
      header: "Produtos",
      align: "right",
      sortable: true,
      sortValue: (s) => s.productsCount,
      hiddenOnMobile: true,
      cell: (s) => <span className="text-[11px] tabular-nums">{s.productsCount}</span>,
    },
    {
      key: "payables",
      header: "Em aberto",
      align: "right",
      sortable: true,
      sortValue: (s) => Number(s.openPayables),
      cell: (s) => (
        <span className={cn("text-[11px] font-semibold tabular-nums", Number(s.openPayables) > 0 ? "text-[var(--warning)]" : "text-[var(--text-muted)]")}>
          {brl(s.openPayables)}
        </span>
      ),
    },
    {
      key: "purchases",
      header: "Compras",
      align: "right",
      hiddenOnMobile: true,
      cell: (s) => (
        <div className="text-[11px]">
          <p className="tabular-nums">{num(s.purchasesCount)}</p>
          {s.lastPurchase && <p className="text-[9px] text-[var(--text-muted)]">últ. {dateBR(s.lastPurchase)}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (s) => <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Ativo" : "Inativo"}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (s) => (
        <div className="flex justify-end gap-0.5">
          <Button variant="ghost" size="icon-sm" title="Detalhes" onClick={() => setDetail(s)}>
            <Search className="h-3.5 w-3.5" />
          </Button>
          {permissions.canManage && (
            <Button variant="ghost" size="icon-sm" title="Editar" onClick={() => openEdit(s)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Fornecedores</h1>
          <p className="text-xs text-[var(--text-muted)]">{num(data.total)} fornecedor(es) cadastrado(s)</p>
        </div>
        {permissions.canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Novo fornecedor
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Buscar" className="min-w-[220px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Razão social, nome fantasia ou CNPJ..." />
          </Field>
          <Field label="Situação" className="w-40">
            <Select value={filters.status} onChange={(e) => navigate({ status: e.target.value, page: undefined })}>
              <option value="ALL">Todas</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
            </Select>
          </Field>
        </div>
      </Card>

      <DataTable
        data={data.items}
        columns={columns}
        keyExtractor={(s) => s.id}
        pagination={{
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onPageChange: (page) => navigate({ page }),
        }}
        emptyState={
          <EmptyState
            icon={<Truck className="h-6 w-6" />}
            title="Nenhum fornecedor cadastrado"
            description="Cadastre fornecedores para lançar pedidos de compra e contas a pagar."
            action={permissions.canManage ? <Button size="sm" onClick={openCreate}>Novo fornecedor</Button> : undefined}
          />
        }
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar fornecedor" : "Novo fornecedor"}
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} leftIcon={<Save className="h-4 w-4" />} onClick={() => void save()}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Razão social" required className="sm:col-span-2">
            <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} autoFocus />
          </Field>
          <Field label="Nome fantasia">
            <Input value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
          </Field>
          <Field label="CNPJ / CPF">
            <Input value={form.document} onChange={(e) => setForm({ ...form, document: maskDocument(e.target.value) })} />
          </Field>
          <Field label="Contato / responsável">
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Inscrição estadual">
            <Input value={form.stateRegistration} onChange={(e) => setForm({ ...form, stateRegistration: e.target.value })} />
          </Field>
          <Field label="Endereço">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Número">
            <Input value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} />
          </Field>
          <Field label="Bairro">
            <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          </Field>
          <Field label="CEP">
            <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: maskZip(e.target.value) })} />
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="UF">
            <Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Prazo de pagamento">
            <Input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="Ex.: 30/60/90 dias" />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Switch
              checked={form.isActive}
              onChange={(v) => setForm({ ...form, isActive: v })}
              label="Fornecedor ativo"
              description="Fornecedores inativos ficam disponíveis apenas no histórico."
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.legalName}
        description={detail?.tradeName ?? undefined}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Fechar</Button>
            {permissions.canManage && detail && (
              <Button size="sm" onClick={() => { setDetail(null); openEdit(detail); }}>Editar</Button>
            )}
          </>
        }
      >
        {detail && (
          <div className="space-y-3 text-[12px]">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">Contas a pagar</p>
                <p className="text-sm font-bold tabular-nums">{brl(detail.openPayables)}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">Produtos vinculados</p>
                <p className="text-sm font-bold tabular-nums">{detail.productsCount}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-muted)] p-2.5">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">Pedidos de compra</p>
                <p className="text-sm font-bold tabular-nums">{detail.purchasesCount}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {detail.document && (
                <p className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" /> {maskDocument(detail.document)}</p>
              )}
              {detail.phone && (
                <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" /> {maskPhone(detail.phone)}</p>
              )}
              {detail.email && (
                <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" /> {detail.email}</p>
              )}
              {(detail.address || detail.city) && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>
                    {detail.address}
                    {detail.addressNumber ? `, ${detail.addressNumber}` : ""}
                    {detail.district ? ` — ${detail.district}` : ""}
                    {detail.city ? ` · ${detail.city}` : ""}
                    {detail.state ? `/${detail.state}` : ""}
                  </span>
                </p>
              )}
              {detail.paymentTerms && <p>Prazo: {detail.paymentTerms}</p>}
              {detail.notes && <p className="text-[var(--text-secondary)]">{detail.notes}</p>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {permissions.canViewPayables && (
                <Link href={`/financeiro/contas-a-pagar?search=${encodeURIComponent(detail.legalName)}`}>
                  <Button variant="outline" size="sm" leftIcon={<Wallet className="h-3.5 w-3.5" />}>Contas a pagar</Button>
                </Link>
              )}
              <Link href={`/produtos?supplierId=${detail.id}`}>
                <Button variant="outline" size="sm" leftIcon={<Package className="h-3.5 w-3.5" />}>Produtos</Button>
              </Link>
              <Link href={`/compras?supplierId=${detail.id}`}>
                <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />}>Compras</Button>
              </Link>
            </div>
            <Alert tone="info">
              Os indicadores acima são calculados a partir dos pedidos de compra e contas a pagar vinculados a este
              fornecedor.
            </Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}
