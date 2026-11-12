import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@/config/brand";
import { OrionWordmark } from "@/components/brand/orion-mark";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: `Condições de uso do ${BRAND.fullName}.`,
};

/**
 * Termos de uso — texto base, sem promessa que o produto não cumpre.
 * Os campos que dependem do responsável (razão social, CNPJ, endereço) são
 * marcados para preenchimento; nada aqui inventa dado da empresa.
 */
export default function TermosPage() {
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
        Termos de uso
      </h1>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Regras de uso, privacidade e tratamento de dados conforme a LGPD (Lei
        13.709/2018) · atualizado em{" "}
        {new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
      </p>

      <div className="prose-orion mt-8 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">1. O que é o serviço</h2>
          <p className="mt-2">
            O {BRAND.fullName} é um sistema de gestão (ERP) para lojas de varejo de moda,
            acessado pelo navegador. Ele organiza vendas, estoque, caixa, crediário e
            financeiro da loja contratante.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">2. Conta e responsabilidade</h2>
          <p className="mt-2">
            Cada cadastro cria uma loja independente. Quem cria a conta é o administrador
            dessa loja e responde pelos usuários que convidar, pelas permissões que
            conceder e pelas informações que cadastrar.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">3. Uso adequado</h2>
          <p className="mt-2">Não é permitido:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>usar o sistema para atividade ilícita ou para armazenar dados obtidos ilegalmente;</li>
            <li>tentar acessar dados de outras lojas ou contornar o isolamento entre contas;</li>
            <li>sobrecarregar a infraestrutura de forma intencional (varredura, automação abusiva).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">4. Dados da loja</h2>
          <p className="mt-2">
            Os dados cadastrados pertencem à loja. É possível exportá-los e solicitar a
            exclusão da conta a qualquer momento pelo e-mail {BRAND.contact.email}. A
            exclusão remove os dados operacionais; registros exigidos por obrigação legal
            ou fiscal podem ser mantidos pelo prazo aplicável.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">5. Disponibilidade</h2>
          <p className="mt-2">
            Trabalhamos para manter o serviço disponível, mas ele pode passar por
            manutenções programadas. O sistema não substitui obrigações fiscais ou
            contábeis da loja: a emissão de documentos fiscais depende de integração
            contratada à parte.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">6. Contratação e valores</h2>
          <p className="mt-2">
            O cadastro é gratuito e não há cobrança nesta página. Planos pagos, quando
            contratados, são combinados diretamente com o responsável pelo serviço.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">7. Contato</h2>
          <p className="mt-2">
            Dúvidas sobre estes termos: {BRAND.contact.email}.
            {BRAND.contact.city ? ` ${BRAND.contact.city}.` : ""}
          </p>
        </section>
      </div>

      <p className="mt-10 text-xs text-[var(--text-muted)]">
        Veja também a{" "}
        <Link href="/privacidade" className="text-[var(--accent)] hover:underline">
          política de privacidade
        </Link>
        .
      </p>
    </div>
  );
}
