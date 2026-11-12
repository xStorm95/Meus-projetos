import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@/config/brand";
import { OrionWordmark } from "@/components/brand/orion-mark";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: `Como o ${BRAND.fullName} trata dados pessoais, conforme a LGPD (Lei 13.709/2018).`,
};

/**
 * Política de privacidade escrita a partir do que o sistema REALMENTE faz:
 * guarda e-mail, nome, telefone e foto do usuário; dados de clientes da loja;
 * registra auditoria; não usa rastreadores de terceiros e não vende dados.
 * Se um dia entrar analytics/cookie de terceiros, esta página tem de mudar.
 */
export default function PrivacidadePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>

      <div className="mt-6">
        <OrionWordmark size="sm" />
      </div>

      <h1 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        Política de privacidade
      </h1>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Conforme a LGPD (Lei 13.709/2018) · Atualizada em{" "}
        {new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Quais dados tratamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-[var(--text-primary)]">Conta do usuário:</strong> nome,
              e-mail, senha (guardada apenas como hash), telefone opcional, foto de perfil
              opcional e loja à qual pertence.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Operação da loja:</strong> os
              dados que a loja cadastra — produtos, vendas, clientes (nome, documento,
              telefone, data de nascimento), pagamentos e financeiro.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Registro de acesso:</strong>{" "}
              data/hora de login, endereço IP e navegador, para segurança e auditoria.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Para que usamos</h2>
          <p className="mt-2">
            Exclusivamente para operar o sistema: autenticar quem entra, mostrar os dados
            da própria loja, emitir comprovantes e cumprir obrigações legais. Não usamos os
            dados para publicidade e não vendemos nem cedemos a terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Quem é o controlador</h2>
          <p className="mt-2">
            Sobre os dados dos seus clientes, o <strong className="text-[var(--text-primary)]">dono da loja
            é o controlador</strong> e o {BRAND.fullName} atua como operador, tratando esses
            dados apenas conforme a instrução da loja. Sobre os dados de cadastro do
            usuário (conta e acesso), o controlador é o responsável pelo serviço.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Isolamento e segurança</h2>
          <p className="mt-2">
            Cada loja tem um espaço isolado no banco de dados: nenhuma loja enxerga dados de
            outra, e esse filtro é aplicado na camada de acesso aos dados — não depende de
            cada tela “lembrar” de filtrar. Senhas usam hash, a sessão usa token opaco
            revogável em cookie inacessível ao JavaScript, e ações sensíveis ficam
            registradas na auditoria.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Por quanto tempo</h2>
          <p className="mt-2">
            Os dados ficam enquanto a conta existir. Ao pedir a exclusão, os dados
            operacionais são apagados; registros que a legislação manda guardar (por
            exemplo, fiscais) são mantidos pelo prazo exigido e depois eliminados.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Seus direitos</h2>
          <p className="mt-2">
            Você pode pedir confirmação de tratamento, acesso, correção, portabilidade,
            anonimização ou exclusão dos dados, e revogar consentimento. A maior parte
            disso já está no próprio sistema (exportação e edição). Para o resto, escreva
            para {BRAND.contact.email}: respondemos em até 15 dias.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Cookies</h2>
          <p className="mt-2">
            Usamos apenas cookies necessários: um de sessão (login) e a preferência de
            tema/aparência, guardada no seu navegador. Não há rastreadores de publicidade
            nem cookies de terceiros na landing.
          </p>
        </section>
      </div>

      <p className="mt-10 text-xs text-[var(--text-muted)]">
        Veja também os{" "}
        <Link href="/termos" className="text-[var(--accent)] hover:underline">
          termos de uso
        </Link>
        .
      </p>
    </div>
  );
}
