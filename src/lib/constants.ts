export const PAYMENT_METHODS = [
  { value: "CASH", label: "Dinheiro" },
  { value: "PIX", label: "Pix" },
  { value: "DEBIT", label: "Cartão de Débito" },
  { value: "CREDIT", label: "Cartão de Crédito" },
  { value: "STORE_CREDIT", label: "Crediário" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "OTHER", label: "Outro" },
] as const;

export const RECEIVABLE_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Pendente", tone: "warning" },
  PARTIAL: { label: "Parcial", tone: "info" },
  PAID: { label: "Pago", tone: "success" },
  OVERDUE: { label: "Vencido", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
  RENEGOTIATED: { label: "Renegociado", tone: "neutral" },
};

export const PAYABLE_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Pendente", tone: "warning" },
  PARTIAL: { label: "Parcial", tone: "info" },
  PAID: { label: "Pago", tone: "success" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};

export const SALE_STATUS: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Em aberto", tone: "warning" },
  COMPLETED: { label: "Finalizada", tone: "success" },
  CANCELED: { label: "Cancelada", tone: "danger" },
};

export const QUOTE_STATUS: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Aberto", tone: "info" },
  CONVERTED: { label: "Convertido", tone: "success" },
  EXPIRED: { label: "Expirado", tone: "neutral" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};

export const PURCHASE_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  QUOTATION: { label: "Cotação", tone: "info" },
  ORDERED: { label: "Pedido", tone: "warning" },
  PARTIAL: { label: "Parcial", tone: "info" },
  RECEIVED: { label: "Recebido", tone: "success" },
  CANCELED: { label: "Cancelado", tone: "danger" },
};

export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  OPENING: "Saldo inicial",
  PURCHASE: "Entrada por compra",
  SALE: "Venda",
  RETURN: "Devolução",
  EXCHANGE_IN: "Troca (entrada)",
  EXCHANGE_OUT: "Troca (saída)",
  ADJUSTMENT: "Ajuste",
  INVENTORY: "Inventário",
  LOSS: "Perda",
  DAMAGE: "Avaria",
  TRANSFER_IN: "Transferência (entrada)",
  TRANSFER_OUT: "Transferência (saída)",
  RESERVATION: "Reserva",
  RESERVATION_RELEASE: "Liberação de reserva",
  CANCEL_SALE: "Cancelamento de venda",
};

export const PERIOD_PRESETS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "thisMonth", label: "Este mês" },
  { value: "lastMonth", label: "Mês anterior" },
  { value: "custom", label: "Personalizado" },
] as const;

export const RETURN_REASONS = [
  "Produto com defeito",
  "Tamanho inadequado",
  "Cor diferente do esperado",
  "Desistência da compra",
  "Produto não serviu",
  "Troca por outro modelo",
  "Outro",
] as const;

export const CASH_BREAKDOWN_LABELS: Record<string, string> = {
  "200": "R$ 200,00",
  "100": "R$ 100,00",
  "50": "R$ 50,00",
  "20": "R$ 20,00",
  "10": "R$ 10,00",
  "5": "R$ 5,00",
  "2": "R$ 2,00",
  "1": "R$ 1,00",
  "0.5": "R$ 0,50",
  "0.25": "R$ 0,25",
  "0.1": "R$ 0,10",
};
