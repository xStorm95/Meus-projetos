"use client";

import { Modal } from "@/components/ui/primitives";

const SHORTCUTS: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: "Navegação",
    items: [
      ["⌘ K / Ctrl K", "Busca global"],
      ["F2", "Nova venda (PDV)"],
      ["?", "Exibir atalhos"],
      ["Esc", "Fechar janelas"],
    ],
  },
  {
    group: "PDV",
    items: [
      ["F1", "Focar campo de busca/código de barras"],
      ["F4", "Selecionar cliente"],
      ["F6", "Abrir pagamento"],
      ["F9", "Finalizar venda"],
      ["F8", "Salvar venda em aberto"],
      ["Delete", "Remover item selecionado"],
    ],
  },
  {
    group: "Formulários",
    items: [
      ["Enter", "Confirmar / avançar"],
      ["Tab", "Próximo campo"],
      ["Ctrl + Enter", "Salvar formulário"],
    ],
  },
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos de teclado" description="Ganhe velocidade nas operações do dia a dia." size="md">
      <div className="grid gap-6 sm:grid-cols-2">
        {SHORTCUTS.map((group) => (
          <div key={group.group}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {group.group}
            </p>
            <ul className="space-y-1.5">
              {group.items.map(([key, desc]) => (
                <li key={key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--text-secondary)]">{desc}</span>
                  <span className="kbd whitespace-nowrap">{key}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
