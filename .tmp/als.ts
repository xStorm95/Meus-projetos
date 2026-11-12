import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage<{ c: string }>();

async function enter(c: string) { storage.enterWith({ c }); }

async function service() {
  await new Promise((r) => setTimeout(r, 5));
  return storage.getStore()?.c ?? null;
}

async function page() {
  await enter("loja");
  return await service();
}
page().then((v) => console.log("enterWith + await depois:", v));
