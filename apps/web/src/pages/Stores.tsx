import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ShoppingBag, Store as StoreIcon, Code2, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { lang, num } from "../i18n";
import { Button, Card, Empty, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Lojas", lead: "Conecte sua loja para recuperar carrinhos abandonados, mostrar produtos nos e-mails e ver quanto cada campanha e funil vendeu.", connect: "Conectar", name: "Nome da loja", url: "https://sualoja.com", key: "Chave de assinatura dos webhooks do Shopify", orders: "pedidos", revenue: "receita atribuída", products: "produtos", abandoned: "carrinhos abandonados", recovered: "recuperados", setup: "Como conectar", secret: "Segredo (mostrado uma vez — copie agora)", delay: "Considerar abandonado após (minutos)", consent: "Só enviar recuperação para quem aceitou marketing", copy: "Copiar", copied: "Copiado", tags: "Etiquetas automáticas: cart-abandoned (carrinho largado) e purchased + customer (compra). Use-as como gatilho de funis — a receita \"Carrinho abandonado\" já vem pronta." }
  : { title: "Stores", lead: "Connect your store to recover abandoned carts, show products in emails and see how much every campaign and funnel sold.", connect: "Connect", name: "Store name", url: "https://yourstore.com", key: "Shopify webhook signing key", orders: "orders", revenue: "attributed revenue", products: "products", abandoned: "abandoned carts", recovered: "recovered", setup: "How to connect", secret: "Secret (shown once — copy it now)", delay: "Mark as abandoned after (minutes)", consent: "Only send recovery emails to people who accepted marketing", copy: "Copy", copied: "Copied", tags: "Automatic tags: cart-abandoned (cart left behind) and purchased + customer (order). Use them as funnel triggers — the \"Abandoned cart\" recipe is ready to go." };

const STEPS: Record<string, string[]> = pt
  ? {
      shopify: ["No Shopify: Configurações → Notificações → Webhooks → Criar webhook.", "Formato JSON, URL abaixo. Crie um para cada evento: Criação de pedido, Criação de checkout, Atualização de checkout, Criação de produto, Atualização de produto.", "Copie a chave que aparece em \"Seus webhooks serão assinados com…\" e cole aqui."],
      woocommerce: ["No WordPress: WooCommerce → Configurações → Avançado → Webhooks → Adicionar.", "Entrega para a URL abaixo, segredo abaixo, API v3. Crie para: Pedido criado, Pedido atualizado, Produto criado, Produto atualizado.", "Carrinhos abandonados no WooCommerce: envie pela API POST /commerce/carts (ou plugin/Zapier)."],
      custom: ["Use sua chave de API com POST /commerce/orders, /commerce/carts e /commerce/products.", "Inclua store_id abaixo em cada chamada. Valores em centavos (total_cents)."],
    }
  : {
      shopify: ["In Shopify: Settings → Notifications → Webhooks → Create webhook.", "Format JSON, URL below. Create one per event: Order creation, Checkout creation, Checkout update, Product creation, Product update.", "Copy the key shown under \"Your webhooks will be signed with…\" and paste it here."],
      woocommerce: ["In WordPress: WooCommerce → Settings → Advanced → Webhooks → Add webhook.", "Delivery URL and secret below, API v3. Create for: Order created, Order updated, Product created, Product updated.", "Abandoned carts on WooCommerce: send them with POST /commerce/carts (or a plugin/Zapier)."],
      custom: ["Use your API key with POST /commerce/orders, /commerce/carts and /commerce/products.", "Pass the store_id below on every call. Amounts in cents (total_cents)."],
    };

function CopyLine({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
      <span className="flex-1 truncate">{value}</span>
      <button onClick={() => (navigator.clipboard.writeText(value), setOk(true), setTimeout(() => setOk(false), 1500))} className="flex items-center gap-1 text-zinc-300">{ok ? <Check size={13} /> : <Copy size={13} />}{ok ? L.copied : L.copy}</button>
    </div>
  );
}

export function Stores() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stores"], queryFn: () => api("/stores") });
  const [platform, setPlatform] = useState<"shopify" | "woocommerce" | "custom">("shopify");
  const [f, setF] = useState({ name: "", url: "", key: "" });
  const [secret, setSecret] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["stores"] });
  const add = useMutation({
    mutationFn: () => api("/stores", { body: { platform, name: f.name, ...(f.url ? { url: f.url } : {}), ...(platform === "shopify" && f.key ? { signing_secret: f.key } : {}) } }),
    onSuccess: (r) => (setSecret(r.secret ?? null), setF({ name: "", url: "", key: "" }), refresh()),
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`/stores/${id}`, { method: "PATCH", body }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => api(`/stores/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const rows: any[] = q.data?.data ?? [];
  const money = (c: number, cur = "USD") => new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(c / 100);
  const icon = (p: string) => (p === "shopify" ? <ShoppingBag size={16} /> : p === "woocommerce" ? <StoreIcon size={16} /> : <Code2 size={16} />);
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{L.lead}</p>
      <Card className="mb-6">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          {(["shopify", "woocommerce", "custom"] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${platform === p ? "bg-white shadow-sm dark:bg-zinc-950" : "text-zinc-500"}`}>{icon(p)}{p === "shopify" ? "Shopify" : p === "woocommerce" ? "WooCommerce" : "API"}</button>
          ))}
        </div>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">{STEPS[platform]!.map((s) => <li key={s}>{s}</li>)}</ol>
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
          <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={L.name} />
          <Input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder={L.url} />
          <Button disabled={add.isPending}>{L.connect}</Button>
          {platform === "shopify" && <Input required value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder={L.key} className="sm:col-span-3" />}
        </form>
        <ErrorText error={add.error} />
        {secret && <div className="mt-3"><div className="mb-1 text-xs font-medium">{L.secret}</div><CopyLine value={secret} /></div>}
      </Card>
      {rows.length === 0 ? <Card><Empty /></Card> : (
        <div className="space-y-3">
          {rows.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">{icon(s.platform)}</div>
                <div className="min-w-0 flex-1"><div className="font-medium">{s.name}</div><div className="truncate text-xs text-zinc-500">{s.url ?? s.platform} · store_id {s.id}</div></div>
                <button className="p-1 text-zinc-400 hover:text-red-600" onClick={() => confirm(`${s.name}?`) && del.mutate(s.id)}><Trash2 size={15} /></button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
                {[[money(s.attributed_cents, s.currency), L.revenue], [num(s.orders), L.orders], [num(s.products), L.products], [num(s.abandoned), L.abandoned], [num(s.recovered), L.recovered]].map(([v, l]) => (
                  <div key={l} className="rounded-xl border border-zinc-200 py-3 dark:border-zinc-800"><div className="text-lg font-semibold tabular-nums">{v}</div><div className="text-[11px] text-zinc-500">{l}</div></div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <CopyLine value={s.webhook_url} />
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">{L.delay}<input type="number" min={15} defaultValue={s.settings.abandon_minutes ?? 60} onBlur={(e) => patch.mutate({ id: s.id, body: { settings: { abandon_minutes: Number(e.target.value) } } })} className="h-8 w-20 rounded-lg border border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-900" /></label>
                  <label className="flex items-center gap-2"><input type="checkbox" defaultChecked={s.settings.require_consent ?? s.platform === "shopify"} onChange={(e) => patch.mutate({ id: s.id, body: { settings: { require_consent: e.target.checked } } })} />{L.consent}</label>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-zinc-500">{L.tags}</p>
      <ErrorText error={patch.error ?? del.error} />
    </>
  );
}
