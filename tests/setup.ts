/**
 * Preparação dos testes de integração.
 *
 * Deixa a loja de testes pronta ANTES de qualquer `beforeAll` dos arquivos e
 * publica o id em `VITEST_TEST_COMPANY_ID`, para as consultas rodarem dentro
 * dela (o mesmo caminho isolado que a produção usa).
 */
import { beforeAll } from "vitest";
import { ensureTestCompanyReady } from "./helpers";

beforeAll(async () => {
  await ensureTestCompanyReady();
}, 120_000);
