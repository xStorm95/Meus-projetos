"use client";

/**
 * Meu perfil — o menu do usuário (avatar no topo) aponta para cá.
 * Antes desta página o clique no avatar caía em 404.
 *
 * Aqui o usuário troca foto, nome, telefone, data de nascimento e senha.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, KeyRound, Loader2, Mail, ShieldCheck, Trash2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";

type Perfil = {
  name: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  roleLabel: string;
};

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Redimensiona e comprime no navegador para caber no limite do servidor. */
function comprimir(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida."));
      img.onload = () => {
        const lado = 320;
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Navegador não suporta o recorte da foto."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = leitor.result as string;
    };
    leitor.readAsDataURL(file);
  });
}

export function ProfileView({ initial }: { initial: Perfil }) {
  const router = useRouter();
  const [perfil, setPerfil] = React.useState<Perfil>(initial);
  const [nome, setNome] = React.useState(initial.name);
  const [telefone, setTelefone] = React.useState(initial.phone);
  const [salvando, setSalvando] = React.useState(false);
  const [enviandoFoto, setEnviandoFoto] = React.useState(false);

  const [senhaAtual, setSenhaAtual] = React.useState("");
  const [novaSenha, setNovaSenha] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const [trocandoSenha, setTrocandoSenha] = React.useState(false);

  async function enviarFoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    setEnviandoFoto(true);
    try {
      const dataUrl = await comprimir(file);
      await api.post("/api/profile/avatar", { dataUrl });
      setPerfil((p) => ({ ...p, avatarUrl: dataUrl }));
      toast.success("Foto de perfil atualizada.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto() {
    setEnviandoFoto(true);
    try {
      await api.delete("/api/profile/avatar");
      setPerfil((p) => ({ ...p, avatarUrl: null }));
      toast.success("Foto removida.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.patch("/api/profile", { name: nome, phone: telefone });
      setPerfil((p) => ({ ...p, name: nome, phone: telefone }));
      toast.success("Dados atualizados.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha !== confirmar) {
      toast.error("As senhas novas não coincidem.");
      return;
    }
    setTrocandoSenha(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword: senhaAtual, newPassword: novaSenha });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
      toast.success("Senha alterada.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTrocandoSenha(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Meu perfil</h1>
        <p className="text-xs text-[var(--text-muted)]">
          Sua foto, seus dados e sua senha. Só você vê esta tela.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCircle2 className="h-4 w-4 text-[var(--accent)]" /> Foto de perfil
            </CardTitle>
            <CardDescription>Aparece no topo do sistema, ao lado do seu nome.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-muted)]">
              {perfil.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={perfil.avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--accent)]">
                  {iniciais(perfil.name) || "?"}
                </span>
              )}
              {enviandoFoto && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs font-medium hover:bg-[var(--bg-muted)]">
                <Camera className="h-3.5 w-3.5" /> Escolher foto
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={enviandoFoto}
                  onChange={(e) => void enviarFoto(e.target.files?.[0] ?? null)}
                />
              </label>
              {perfil.avatarUrl && (
                <Button variant="ghost" size="sm" onClick={() => void removerFoto()} disabled={enviandoFoto}>
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              )}
              <span className="text-[10px] text-[var(--text-muted)]">
                A imagem é reduzida automaticamente (320 px, até 300 KB).
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Meus dados</CardTitle>
            <CardDescription>Nome e telefone usados nos comprovantes e no atendimento.</CardDescription>
          </div>
          <Badge tone="gold">{perfil.roleLabel}</Badge>
        </CardHeader>
        <CardContent>
          <form onSubmit={salvarDados} className="space-y-3">
            <Field label="Nome">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Telefone" hint="Opcional">
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </Field>
            <Field label="E-mail" hint="Para trocar o e-mail, fale com o administrador da loja">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
                <Mail className="h-3.5 w-3.5" /> {perfil.email}
              </div>
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={salvando}>
                Salvar dados
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[var(--accent)]" /> Trocar senha
            </CardTitle>
            <CardDescription>Mínimo de 8 caracteres, com letras e números.</CardDescription>
          </div>
          <ShieldCheck className="h-4 w-4 text-[var(--text-muted)]" />
        </CardHeader>
        <CardContent>
          <form onSubmit={trocarSenha} className="space-y-3">
            <Field label="Senha atual">
              <Input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="Nova senha">
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirmar nova senha">
              <Input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={trocandoSenha}>
                Alterar senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
