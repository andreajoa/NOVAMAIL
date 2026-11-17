import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_THEME, FONTS, renderBlockDocument, renderDesign, sanitizeInline, type Block, type Design, type Theme } from "@novamail/email";
import {
  ArrowDown, ArrowLeft, ArrowUp, Code2, Copy, Film, GripVertical, Heading, Image as ImageIcon, LayoutPanelLeft, Minus, Monitor,
  Bold, Italic, Link2, MousePointerClick, MoveVertical, Send, Smartphone, Text, Trash2, Upload, Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { lang } from "../i18n";
import { upload, videoToGif } from "../media";
import { navigate } from "../nav";
import { Button, ErrorText, Input } from "../ui";
import { Preflight } from "../Preflight";

const pt = lang === "pt";
const L = pt
  ? { back: "Modelos", save: "Salvar", saved: "Salvo", subject: "Assunto", name: "Nome do modelo", preview: "Prévia", edit: "Editar", desktop: "Computador", mobile: "Celular", test: "Enviar teste", testFrom: "Remetente (domínio verificado)", testSent: "Teste enviado para", blocks: "Blocos", dragHint: "Arraste para o e-mail ou clique para adicionar", theme: "Aparência", select: "Clique no texto do e-mail para escrever direto nele. Arraste uma imagem por cima de outra para trocar.", drop: "Solte aqui", upload: "Enviar arquivo", replace: "Trocar", dropFile: "ou arraste um arquivo aqui", converting: "Convertendo vídeo em GIF…", uploading: "Enviando…", bg: "Fundo", content: "Conteúdo", text: "Texto", muted: "Rodapé", accent: "Destaque", font: "Fonte", width: "Largura", radius: "Cantos", preheader: "Pré-cabeçalho (texto de prévia na caixa de entrada)", link: "Link", alt: "Texto alternativo", size: "Tamanho", align: "Alinhamento", color: "Cor", btnText: "Texto do botão", full: "Largura total", height: "Altura", html: "HTML", unsubscribe: "Mostrar link de descadastro", side: "Imagem à", left: "esquerda", right: "direita", videoHint: "Envie um vídeo (MP4/MOV): ele vira um GIF que roda sozinho, em loop e sem som, em todos os e-mails. O GIF leva para o link do vídeo.", gifHint: "GIFs animados rodam em loop em todos os leitores de e-mail.", tokens: "Personalize com {{first_name}}, {{last_name}}, {{email}}", rawHint: "Cole o HTML completo do seu e-mail. Scripts e formulários são removidos automaticamente." }
  : { back: "Templates", save: "Save", saved: "Saved", subject: "Subject", name: "Template name", preview: "Preview", edit: "Edit", desktop: "Desktop", mobile: "Mobile", test: "Send test", testFrom: "From (verified domain)", testSent: "Test sent to", blocks: "Blocks", dragHint: "Drag into the email or click to add", theme: "Style", select: "Click any text in the email to type directly. Drag an image onto another to replace it.", drop: "Drop here", upload: "Upload file", replace: "Replace", dropFile: "or drag a file here", converting: "Converting video to GIF…", uploading: "Uploading…", bg: "Background", content: "Content", text: "Text", muted: "Footer", accent: "Accent", font: "Font", width: "Width", radius: "Corners", preheader: "Preheader (inbox preview text)", link: "Link", alt: "Alt text", size: "Size", align: "Alignment", color: "Color", btnText: "Button text", full: "Full width", height: "Height", html: "HTML", unsubscribe: "Show unsubscribe link", side: "Image on the", left: "left", right: "right", videoHint: "Upload a video (MP4/MOV): it becomes a GIF that plays by itself, looped and silent, in every inbox. The GIF links to the video.", gifHint: "Animated GIFs loop in every email client.", tokens: "Personalise with {{first_name}}, {{last_name}}, {{email}}", rawHint: "Paste your email's full HTML. Scripts and forms are removed automatically." };

const PALETTE: { type: Block["type"]; label: string; icon: ReactNode }[] = [
  { type: "heading", label: pt ? "Título" : "Heading", icon: <Heading size={16} /> },
  { type: "text", label: pt ? "Texto" : "Text", icon: <Text size={16} /> },
  { type: "image", label: pt ? "Imagem / GIF" : "Image / GIF", icon: <ImageIcon size={16} /> },
  { type: "video", label: pt ? "Vídeo (GIF)" : "Video (GIF)", icon: <Film size={16} /> },
  { type: "button", label: pt ? "Botão" : "Button", icon: <MousePointerClick size={16} /> },
  { type: "image_text", label: pt ? "Imagem + texto" : "Image + text", icon: <LayoutPanelLeft size={16} /> },
  { type: "divider", label: pt ? "Divisor" : "Divider", icon: <Minus size={16} /> },
  { type: "spacer", label: pt ? "Espaço" : "Spacer", icon: <MoveVertical size={16} /> },
  { type: "html", label: "HTML", icon: <Code2 size={16} /> },
  { type: "footer", label: pt ? "Rodapé" : "Footer", icon: <Wand2 size={16} /> },
];

const IMG = "https://app.novamail.nexaclouds.online/tpl";
const uid = () => Math.random().toString(36).slice(2, 9);
function newBlock(type: Block["type"]): Block {
  const id = uid();
  switch (type) {
    case "heading": return { id, type, text: pt ? "Seu título aqui" : "Your heading here", size: 28 };
    case "text": return { id, type, html: pt ? "Escreva sua mensagem. Use <strong>negrito</strong> e links." : "Write your message. Use <strong>bold</strong> and links." };
    case "image": return { id, type, src: `${IMG}/hero.png`, alt: "", width: 100, radius: 8 };
    case "video": return { id, type, gif: `${IMG}/launch.gif`, href: "https://example.com", alt: "Video" };
    case "button": return { id, type, text: pt ? "Comprar agora" : "Shop now", href: "https://example.com" };
    case "image_text": return { id, type, src: `${IMG}/product.png`, html: pt ? "<strong>Destaque</strong><br>Descreva em duas linhas." : "<strong>Highlight</strong><br>Describe it in two lines.", imageSide: "left" };
    case "divider": return { id, type };
    case "spacer": return { id, type, height: 24 };
    case "html": return { id, type, html: "<p style=\"text-align:center\">Custom HTML</p>" };
    case "footer": return { id, type, html: pt ? "Sua Empresa · Rua Exemplo, 123 · Cidade" : "Your Company · 123 Main Street, City", unsubscribe: true };
  }
}

/** A block rendered exactly as in the email, inside a script-less sandboxed iframe. */
function BlockFrame({ block, theme }: { block: Block; theme: Theme }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(40);
  const doc = useMemo(() => renderBlockDocument(block, theme), [block, theme]);
  const measure = () => {
    const d = ref.current?.contentDocument;
    if (d?.body) setH(Math.max(8, d.documentElement.scrollHeight));
  };
  return <iframe ref={ref} title="block" sandbox="allow-same-origin" srcDoc={doc} onLoad={measure} style={{ height: h }} className="pointer-events-none block w-full border-0" />;
}

/** WYSIWYG in-place editing for text-like blocks: click, delete, type. */
function InlineEdit({ block, theme, onChange }: { block: Block; theme: Theme; onChange: (b: Block) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const font = FONTS[theme.font];
  // Only seed the DOM once per block so the caret never jumps while typing.
  useEffect(() => {
    if (!ref.current) return;
    if (block.type === "heading" || block.type === "button") ref.current.textContent = block.text;
    else if (block.type === "text" || block.type === "footer") ref.current.innerHTML = block.html;
    ref.current.focus();
    const r = document.createRange();
    r.selectNodeContents(ref.current);
    r.collapse(false);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);
  const commit = () => {
    const el = ref.current;
    if (!el) return;
    if (block.type === "heading" || block.type === "button") onChange({ ...block, text: (el.textContent ?? "").replace(/\s+/g, " ").trim() } as Block);
    else onChange({ ...block, html: sanitizeInline(el.innerHTML) } as Block);
  };
  const cmd = (c: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (c === "link") {
      const url = prompt("https://");
      if (url && /^https?:\/\//.test(url)) document.execCommand("createLink", false, url);
    } else document.execCommand(c);
    commit();
  };
  const rich = block.type === "text" || block.type === "footer";
  const style: React.CSSProperties =
    block.type === "heading"
      ? { fontFamily: font, fontSize: block.size ?? 28, fontWeight: 700, lineHeight: 1.2, color: block.color ?? theme.text, textAlign: block.align ?? "left", padding: "20px 32px 8px" }
      : block.type === "button"
        ? { fontFamily: font, fontSize: 16, fontWeight: 600, color: block.color ?? "#fff", background: block.bg ?? theme.accent, borderRadius: block.radius ?? 8, padding: "13px 24px", display: block.full ? "block" : "inline-block", textAlign: "center" }
        : block.type === "footer"
          ? { fontFamily: font, fontSize: 12, lineHeight: 1.6, color: theme.muted, textAlign: "center", padding: "24px 32px 32px" }
          : { fontFamily: font, fontSize: (block as { size?: number }).size ?? 16, lineHeight: 1.6, color: (block as { color?: string }).color ?? theme.text, textAlign: (block as { align?: "left" }).align ?? "left", padding: "12px 32px" };
  const editable = (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={commit}
      onBlur={commit}
      onKeyDown={(e) => !rich && e.key === "Enter" && e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      style={style}
      className="cursor-text outline-none"
    />
  );
  return (
    <div className="relative">
      {rich && (
        <div className="absolute -top-9 left-2 z-10 flex gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <button onMouseDown={cmd("bold")} className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Bold"><Bold size={14} /></button>
          <button onMouseDown={cmd("italic")} className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Italic"><Italic size={14} /></button>
          <button onMouseDown={cmd("link")} className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Link"><Link2 size={14} /></button>
        </div>
      )}
      {block.type === "button" ? <div style={{ padding: "16px 32px", textAlign: block.align ?? "left" }}>{editable}</div> : editable}
    </div>
  );
}

/** Click-to-replace overlay for image blocks (same as dropping a file on them). */
function ReplaceImage({ onFile }: { onFile: (f: File) => void }) {
  return (
    <label onClick={(e) => e.stopPropagation()} className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-2 rounded-full bg-zinc-900/85 px-4 py-2 text-sm font-medium text-white shadow-lg">
      <Upload size={15} /> {pt ? "Trocar imagem" : "Replace image"}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
const Area = (p: { value: string; onChange: (v: string) => void; rows?: number; mono?: boolean }) => (
  <textarea value={p.value} rows={p.rows ?? 4} onChange={(e) => p.onChange(e.target.value)} className={`w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950 ${p.mono ? "font-mono text-xs" : ""}`} />
);
const ColorInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-zinc-200 bg-transparent dark:border-zinc-800" />
    <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
  </div>
);
const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-800">
    {options.map(([v, l]) => (
      <button key={v} type="button" onClick={() => onChange(v)} className={`rounded-md px-2.5 py-1 ${value === v ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : ""}`}>{l}</button>
    ))}
  </div>
);
const Range = ({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) => (
  <div className="flex items-center gap-2"><input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" /><span className="w-10 text-right text-xs tabular-nums text-zinc-500">{value}</span></div>
);

function UploadField({ label, accept, video, onDone }: { label: string; accept: string; video?: boolean; onDone: (u: { url: string; mp4?: string }) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  async function handle(f: File) {
    setErr(null);
    try {
      if (video && f.type.startsWith("video/")) {
        setBusy(`${L.converting} 0%`);
        const gif = await videoToGif(f, { onProgress: (p) => setBusy(`${L.converting} ${Math.round(p * 100)}%`) });
        setBusy(L.uploading);
        const g = await upload(gif, "video.gif");
        let mp4: string | undefined;
        if (f.type === "video/mp4" && f.size <= 20e6) mp4 = (await upload(f, f.name)).url;
        onDone({ url: g.url, mp4 });
      } else {
        setBusy(L.uploading);
        onDone({ url: (await upload(f, f.name)).url });
      }
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) handle(f);
      }}
      className="rounded-lg border border-dashed border-zinc-300 p-3 text-center dark:border-zinc-700"
    >
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Upload size={15} /> {busy ?? label}
        <input type="file" accept={accept} className="hidden" disabled={!!busy} onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
      </label>
      <p className="mt-1 text-xs text-zinc-500">{L.dropFile}</p>
      <ErrorText error={err} />
    </div>
  );
}

function Inspector({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);
  const align = (v: string | undefined) => <Seg value={(v ?? "left") as "left"} options={[["left", "←"], ["center", "↔"], ["right", "→"]]} onChange={(a) => set({ align: a } as Partial<Block>)} />;
  switch (block.type) {
    case "heading":
      return (<>
        <Field label={L.text}><Input value={block.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <Field label={L.size}><Range value={block.size ?? 28} min={18} max={44} onChange={(v) => set({ size: v })} /></Field>
        <Field label={L.align}>{align(block.align)}</Field>
        <Field label={L.color}><ColorInput value={block.color ?? "#18181b"} onChange={(v) => set({ color: v })} /></Field>
      </>);
    case "text":
      return (<>
        <Field label={L.text}><Area value={block.html} onChange={(v) => set({ html: v })} rows={7} /></Field>
        <p className="text-xs text-zinc-500">{L.tokens}</p>
        <Field label={L.size}><Range value={block.size ?? 16} min={13} max={22} onChange={(v) => set({ size: v })} /></Field>
        <Field label={L.align}>{align(block.align)}</Field>
      </>);
    case "image":
      return (<>
        <img src={block.src} alt="" className="max-h-40 w-full rounded-md object-contain" />
        <UploadField label={L.replace} accept="image/png,image/jpeg,image/webp,image/gif" onDone={(u) => set({ src: u.url })} />
        <p className="text-xs text-zinc-500">{L.gifHint}</p>
        <Field label={L.link}><Input value={block.href ?? ""} onChange={(e) => set({ href: e.target.value })} placeholder="https://" /></Field>
        <Field label={L.alt}><Input value={block.alt ?? ""} onChange={(e) => set({ alt: e.target.value })} /></Field>
        <Field label={L.width}><Range value={block.width ?? 100} min={10} max={100} onChange={(v) => set({ width: v })} /></Field>
        <Field label={L.radius}><Range value={block.radius ?? 8} min={0} max={32} onChange={(v) => set({ radius: v })} /></Field>
        <Field label={L.align}>{align(block.align)}</Field>
      </>);
    case "video":
      return (<>
        <img src={block.gif} alt="" className="max-h-40 w-full rounded-md object-contain" />
        <UploadField label={L.upload} accept="video/mp4,video/quicktime,video/webm,image/gif" video onDone={(u) => set({ gif: u.url, ...(u.mp4 ? { mp4: u.mp4, href: block.href && !block.href.includes("example.com") ? block.href : u.mp4 } : {}) })} />
        <p className="text-xs text-zinc-500">{L.videoHint}</p>
        <Field label={L.link}><Input value={block.href} onChange={(e) => set({ href: e.target.value })} placeholder="https://youtube.com/…" /></Field>
        <Field label={L.width}><Range value={block.width ?? 100} min={30} max={100} onChange={(v) => set({ width: v })} /></Field>
      </>);
    case "button":
      return (<>
        <Field label={L.btnText}><Input value={block.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <Field label={L.link}><Input value={block.href} onChange={(e) => set({ href: e.target.value })} placeholder="https://" /></Field>
        <Field label={L.accent}><ColorInput value={block.bg ?? "#18181b"} onChange={(v) => set({ bg: v })} /></Field>
        <Field label={L.color}><ColorInput value={block.color ?? "#ffffff"} onChange={(v) => set({ color: v })} /></Field>
        <Field label={L.radius}><Range value={block.radius ?? 8} min={0} max={40} onChange={(v) => set({ radius: v })} /></Field>
        <Field label={L.align}>{align(block.align)}</Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!block.full} onChange={(e) => set({ full: e.target.checked })} /> {L.full}</label>
      </>);
    case "image_text":
      return (<>
        <img src={block.src} alt="" className="max-h-32 w-full rounded-md object-contain" />
        <UploadField label={L.replace} accept="image/png,image/jpeg,image/webp,image/gif" onDone={(u) => set({ src: u.url })} />
        <Field label={L.text}><Area value={block.html} onChange={(v) => set({ html: v })} /></Field>
        <Field label={L.link}><Input value={block.href ?? ""} onChange={(e) => set({ href: e.target.value })} placeholder="https://" /></Field>
        <Field label={L.side}><Seg value={block.imageSide ?? "left"} options={[["left", L.left], ["right", L.right]]} onChange={(v) => set({ imageSide: v })} /></Field>
      </>);
    case "divider":
      return <Field label={L.color}><ColorInput value={block.color ?? "#e4e4e7"} onChange={(v) => set({ color: v })} /></Field>;
    case "spacer":
      return <Field label={L.height}><Range value={block.height ?? 24} min={4} max={120} onChange={(v) => set({ height: v })} /></Field>;
    case "html":
      return <Field label={L.html}><Area value={block.html} onChange={(v) => set({ html: v })} rows={14} mono /></Field>;
    case "footer":
      return (<>
        <Field label={L.text}><Area value={block.html} onChange={(v) => set({ html: v })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block.unsubscribe !== false} onChange={(e) => set({ unsubscribe: e.target.checked })} /> {L.unsubscribe}</label>
      </>);
  }
}

const AI_L = lang === "pt"
  ? { open: "Escrever com IA", brief: "Sobre o que é o e-mail? Ex.: lançamento da coleção de linho, 3 peças, frete grátis acima de US$80", tone: "Tom", cta: "Link do botão (opcional)", go: "Gerar e-mail", busy: "Escrevendo…", rewrite: "Reescrever com IA", acts: { shorter: "Mais curto", friendlier: "Mais amigável", more_professional: "Mais profissional", more_urgent: "Mais urgente", fix_grammar: "Corrigir", translate: "Traduzir" } as Record<string, string>, to: "para", tones: { friendly: "Amigável", professional: "Profissional", playful: "Divertido", urgent: "Urgente", luxury: "Luxo" } as Record<string, string> }
  : { open: "Write with AI", brief: "What's the email about? e.g. launch of the linen collection, 3 pieces, free shipping over $80", tone: "Tone", cta: "Button link (optional)", go: "Generate email", busy: "Writing…", rewrite: "Rewrite with AI", acts: { shorter: "Shorter", friendlier: "Friendlier", more_professional: "More professional", more_urgent: "More urgent", fix_grammar: "Fix grammar", translate: "Translate" } as Record<string, string>, to: "to", tones: { friendly: "Friendly", professional: "Professional", playful: "Playful", urgent: "Urgent", luxury: "Luxury" } as Record<string, string> };

/** Drafts a full email from a brief and inserts it above the footer. */
function AiPanel({ onDraft, onClose }: { onDraft: (d: { subject: string; preheader: string; blocks: Block[] }) => void; onClose: () => void }) {
  const [f, setF] = useState({ brief: "", tone: "friendly", cta_url: "" });
  const go = useMutation({ mutationFn: () => api("/ai/write", { body: { brief: f.brief, tone: f.tone, ...(f.cta_url ? { cta_url: f.cta_url } : {}) } }), onSuccess: (r) => (onDraft(r), onClose()) });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <form className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()} onSubmit={(e) => (e.preventDefault(), go.mutate())}>
        <div className="flex items-center gap-2 font-semibold"><Wand2 size={16} /> {AI_L.open}</div>
        <textarea required minLength={5} rows={4} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} placeholder={AI_L.brief} className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950" />
        <div className="flex flex-wrap gap-1.5">{Object.entries(AI_L.tones).map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, tone: k })} className={`rounded-full border px-3 py-1 text-xs font-medium ${f.tone === k ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900" : "border-zinc-200 dark:border-zinc-700"}`}>{l}</button>)}</div>
        <Input type="url" value={f.cta_url} onChange={(e) => setF({ ...f, cta_url: e.target.value })} placeholder={AI_L.cta} />
        <Button className="w-full" disabled={go.isPending}>{go.isPending ? AI_L.busy : AI_L.go}</Button>
        <ErrorText error={go.error} />
      </form>
    </div>
  );
}

/** One-click rewrites for the selected heading/text block. */
function RewriteBar({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const [lng, setLng] = useState("English");
  const rw = useMutation({
    mutationFn: (action: string) => api("/ai/rewrite", { body: { text: block.type === "heading" ? block.text : (block as { html: string }).html, action, ...(action === "translate" ? { language: lng } : {}) } }),
    onSuccess: (r) => onChange(block.type === "heading" ? { ...block, text: r.text } : ({ ...block, html: r.html } as Block)),
  });
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Wand2 size={13} /> {rw.isPending ? AI_L.busy : AI_L.rewrite}</div>
      <div className="flex flex-wrap gap-1">
        {Object.entries(AI_L.acts).filter(([k]) => k !== "translate").map(([k, l]) => <button key={k} disabled={rw.isPending} onClick={() => rw.mutate(k)} className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] hover:border-zinc-900 dark:border-zinc-700 dark:hover:border-white">{l}</button>)}
      </div>
      <div className="mt-2 flex gap-1">
        <select value={lng} onChange={(e) => setLng(e.target.value)} className="h-7 flex-1 rounded-md border border-zinc-200 bg-white px-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900">{["English", "Spanish", "Portuguese (Brazil)", "French", "German", "Italian"].map((x) => <option key={x}>{x}</option>)}</select>
        <button disabled={rw.isPending} onClick={() => rw.mutate("translate")} className="rounded-md border border-zinc-200 px-2 text-[11px] dark:border-zinc-700">{AI_L.acts.translate}</button>
      </div>
      <ErrorText error={rw.error} />
    </div>
  );
}

function ThemePanel({ design, setDesign }: { design: Design; setDesign: (d: Design) => void }) {
  const t = design.theme;
  const set = (p: Partial<Theme>) => setDesign({ ...design, theme: { ...t, ...p } });
  return (
    <div className="space-y-3">
      <Field label={L.preheader}><Input value={design.preheader ?? ""} onChange={(e) => setDesign({ ...design, preheader: e.target.value })} /></Field>
      <Field label={L.bg}><ColorInput value={t.background} onChange={(v) => set({ background: v })} /></Field>
      <Field label={L.content}><ColorInput value={t.content} onChange={(v) => set({ content: v })} /></Field>
      <Field label={L.text}><ColorInput value={t.text} onChange={(v) => set({ text: v })} /></Field>
      <Field label={L.accent}><ColorInput value={t.accent} onChange={(v) => set({ accent: v })} /></Field>
      <Field label={L.muted}><ColorInput value={t.muted} onChange={(v) => set({ muted: v })} /></Field>
      <Field label={L.font}>
        <select value={t.font} onChange={(e) => set({ font: e.target.value })} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {Object.keys(FONTS).map((f) => <option key={f}>{f}</option>)}
        </select>
      </Field>
      <Field label={L.width}><Range value={t.width} min={480} max={720} onChange={(v) => set({ width: v })} /></Field>
      <Field label={L.radius}><Range value={t.radius} min={0} max={24} onChange={(v) => set({ radius: v })} /></Field>
    </div>
  );
}

export function Editor({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["template", id], queryFn: () => api(`/templates/${id}`) });
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api("/domains") });
  const [design, setDesign] = useState<Design | null>(null);
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "desktop" | "mobile" | "dark" | "check">("edit");
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [from, setFrom] = useState("");

  useEffect(() => {
    if (!q.data || design || rawHtml !== null) return;
    setName(q.data.name);
    setSubject(q.data.subject ?? "");
    if (q.data.design) setDesign({ ...q.data.design, theme: { ...DEFAULT_THEME, ...q.data.design.theme } });
    else setRawHtml(q.data.html);
  }, [q.data, design, rawHtml]);

  useEffect(() => {
    const v = domains.data?.data?.find((d: any) => d.status === "verified");
    if (v && !from) setFrom(`hello@${v.name}`);
  }, [domains.data, from]);

  const update = (d: Design) => (setDesign(d), setDirty(true));
  const save = useMutation({
    mutationFn: () => api(`/templates/${id}`, { method: "PATCH", body: { name, subject, ...(design ? { design } : { html: rawHtml ?? "" }) } }),
    onSuccess: () => (setDirty(false), qc.invalidateQueries({ queryKey: ["templates"] })),
  });
  const test = useMutation({ mutationFn: async () => (dirty && (await save.mutateAsync()), api(`/templates/${id}/test`, { body: { from } })) });

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") (e.preventDefault(), save.mutate());
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [save]);

  if (!design && rawHtml === null) return <p className="p-8 text-sm text-zinc-500">…</p>;

  const blocks = design?.blocks ?? [];
  const selected = blocks.find((b) => b.id === sel) ?? null;
  const [aiOpen, setAiOpen] = useState(false);
  const applyDraft = (d: { subject: string; preheader: string; blocks: Block[] }) => {
    if (!design) return;
    const fi = blocks.findIndex((b) => b.type === "footer");
    const at = fi < 0 ? blocks.length : fi;
    update({ ...design, preheader: d.preheader || design.preheader, blocks: [...blocks.slice(0, at), ...d.blocks, ...blocks.slice(at)] });
    if (d.subject) (setSubject(d.subject), setDirty(true));
  };
  const insertAt = (i: number, b: Block) => design && (update({ ...design, blocks: [...blocks.slice(0, i), b, ...blocks.slice(i)] }), setSel(b.id));
  const move = (from: number, to: number) => {
    if (!design || from === to) return;
    const arr = [...blocks];
    const [b] = arr.splice(from, 1);
    arr.splice(to > from ? to - 1 : to, 0, b!);
    update({ ...design, blocks: arr });
  };
  const onDrop = (i: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const nw = e.dataTransfer.getData("nm/new");
    const mv = e.dataTransfer.getData("nm/move");
    if (nw) insertAt(i, newBlock(nw as Block["type"]));
    else if (mv) move(Number(mv), i);
  };
  const Zone = ({ i }: { i: number }) => (
    <div onDragOver={(e) => (e.preventDefault(), setDragOver(i))} onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(i, e)} className={`transition-all ${dragOver === i ? "h-10 rounded-md border-2 border-dashed border-zinc-900 bg-zinc-50 dark:border-white dark:bg-zinc-900" : "h-2"}`}>
      {dragOver === i && <p className="py-2 text-center text-xs text-zinc-700 dark:text-zinc-300">{L.drop}</p>}
    </div>
  );
  const fullHtml = design ? renderDesign(design) : rawHtml ?? "";

  return (
    <div className="flex h-screen flex-col">
      {aiOpen && <AiPanel onDraft={applyDraft} onClose={() => setAiOpen(false)} />}
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <button onClick={() => navigate("/templates")} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft size={15} /> {L.back}</button>
        <Input value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} placeholder={L.name} className="!w-48" />
        <Input value={subject} onChange={(e) => (setSubject(e.target.value), setDirty(true))} placeholder={L.subject} className="!w-72 flex-1" />
        <Seg value={mode} options={[["edit", L.edit], ["desktop", L.desktop], ["mobile", L.mobile], ["dark", lang === "pt" ? "Escuro" : "Dark"], ["check", lang === "pt" ? "Checar" : "Check"]]} onChange={setMode} />
        <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder={L.testFrom} className="!w-56" />
        {design && <Button variant="ghost" onClick={() => setAiOpen(true)}><Wand2 size={14} /> {AI_L.open}</Button>}
        <Button variant="ghost" onClick={() => test.mutate()} disabled={test.isPending || !from}><Send size={14} /> {L.test}</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{dirty ? L.save : L.saved}</Button>
      </header>
      {(save.error || test.error || test.data) && (
        <div className="border-b border-zinc-200 bg-white px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <ErrorText error={save.error ?? test.error} />
          {test.data && <span className="text-emerald-700 dark:text-emerald-400">{L.testSent} {test.data.to}</span>}
        </div>
      )}

      {mode === "check" ? (
        <div className="flex-1 overflow-auto bg-zinc-50 p-6 dark:bg-zinc-950">
          <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><Preflight subject={subject} preheader={design?.preheader} html={fullHtml} from={from} /></div>
        </div>
      ) : mode !== "edit" ? (
        <div className="flex-1 overflow-auto bg-zinc-100 p-6 dark:bg-zinc-950">
          {mode === "dark" && <p className="mx-auto mb-3 max-w-[900px] text-xs text-zinc-500">{lang === "pt" ? "Simulação do modo escuro do Gmail/Outlook (cores invertidas, imagens preservadas)." : "Simulates Gmail/Outlook dark mode (colors inverted, images kept)."}</p>}
          <iframe title="preview" sandbox="allow-same-origin" srcDoc={mode === "dark" ? fullHtml.replace("</head>", "<style>html{filter:invert(1) hue-rotate(180deg);background:#fff}img,video,[style*='background-image']{filter:invert(1) hue-rotate(180deg)}</style></head>") : fullHtml} className="mx-auto block h-full min-h-[80vh] rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800" style={{ width: mode === "mobile" ? 390 : "100%", maxWidth: 900 }} />
        </div>
      ) : rawHtml !== null ? (
        <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-2">
          <div className="flex flex-col border-r border-zinc-200 p-4 dark:border-zinc-800">
            <p className="mb-2 text-xs text-zinc-500">{L.rawHint}</p>
            <textarea value={rawHtml} onChange={(e) => (setRawHtml(e.target.value), setDirty(true))} className="flex-1 rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950" />
          </div>
          <iframe title="preview" sandbox="allow-same-origin" srcDoc={rawHtml} className="h-full w-full bg-white" />
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
          {/* Mobile: palette as a horizontal strip */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 bg-white p-2 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
            {PALETTE.map((p) => (
              <button key={p.type} onClick={() => insertAt(selected ? blocks.indexOf(selected) + 1 : blocks.length, newBlock(p.type))} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs dark:border-zinc-800">
                {p.icon} {p.label}
              </button>
            ))}
          </div>
          <aside className="hidden w-52 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-3 md:block dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{L.blocks}</h3>
            <p className="mb-3 text-[11px] text-zinc-400">{L.dragHint}</p>
            <div className="grid gap-1.5">
              {PALETTE.map((p) => (
                <button
                  key={p.type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("nm/new", p.type)}
                  onClick={() => insertAt(selected ? blocks.indexOf(selected) + 1 : blocks.length, newBlock(p.type))}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-left text-sm hover:border-zinc-400 active:cursor-grabbing dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto p-6" style={{ background: design!.theme.background }} onClick={() => setSel(null)}>
            <div className="mx-auto overflow-hidden shadow-sm" style={{ maxWidth: design!.theme.width, background: design!.theme.content, borderRadius: design!.theme.radius }}>
              <Zone i={0} />
              {blocks.map((b, i) => (
                <div key={b.id}>
                  <div
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("nm/move", String(i))}
                    onClick={(e) => (e.stopPropagation(), setSel(b.id))}
                    onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
                    onDrop={async (e) => {
                      const f = e.dataTransfer.files[0];
                      if (!f || !["image", "image_text", "video"].includes(b.type)) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (b.type === "video" && f.type.startsWith("video/")) {
                        const gif = await upload(await videoToGif(f), "video.gif");
                        update({ ...design!, blocks: blocks.map((x) => (x.id === b.id ? { ...x, gif: gif.url } as Block : x)) });
                      } else {
                        const u = await upload(f, f.name);
                        update({ ...design!, blocks: blocks.map((x) => (x.id === b.id ? ({ ...x, [b.type === "video" ? "gif" : "src"]: u.url } as Block) : x)) });
                      }
                    }}
                    className={`group relative cursor-pointer outline-offset-[-2px] ${sel === b.id ? "outline outline-2 outline-zinc-900 dark:outline-white" : "hover:outline hover:outline-1 hover:outline-zinc-400"}`}
                  >
                    {sel === b.id && ["heading", "text", "footer", "button"].includes(b.type) ? (
                      <InlineEdit block={b} theme={design!.theme} onChange={(nb) => update({ ...design!, blocks: blocks.map((x) => (x.id === nb.id ? nb : x)) })} />
                    ) : (
                      <BlockFrame block={b} theme={design!.theme} />
                    )}
                    {sel === b.id && (b.type === "image" || b.type === "image_text") && (
                      <ReplaceImage onFile={async (f) => { const u = await upload(f, f.name); update({ ...design!, blocks: blocks.map((x) => (x.id === b.id ? ({ ...x, src: u.url } as Block) : x)) }); }} />
                    )}
                    <div className={`absolute right-1 top-1 flex gap-0.5 rounded-md bg-zinc-900/85 p-0.5 text-white ${sel === b.id ? "flex" : "hidden group-hover:flex"}`}>
                      <span className="cursor-grab p-1" title="Drag"><GripVertical size={14} /></span>
                      <button className="p-1" title="Up" onClick={(e) => (e.stopPropagation(), move(i, Math.max(0, i - 1)))}><ArrowUp size={14} /></button>
                      <button className="p-1" title="Down" onClick={(e) => (e.stopPropagation(), move(i, Math.min(blocks.length, i + 2)))}><ArrowDown size={14} /></button>
                      <button className="p-1" title="Duplicate" onClick={(e) => (e.stopPropagation(), insertAt(i + 1, { ...b, id: uid() } as Block))}><Copy size={14} /></button>
                      <button className="p-1" title="Delete" onClick={(e) => (e.stopPropagation(), update({ ...design!, blocks: blocks.filter((x) => x.id !== b.id) }), setSel(null))}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <Zone i={i + 1} />
                </div>
              ))}
            </div>
          </main>

          <aside className={`${selected ? "fixed inset-x-0 bottom-0 z-20 max-h-[60vh] rounded-t-2xl shadow-2xl" : "hidden"} space-y-3 overflow-y-auto border-l border-zinc-200 bg-white p-4 md:static md:block md:max-h-none md:w-72 md:shrink-0 md:rounded-none md:shadow-none dark:border-zinc-800 dark:bg-zinc-900`}>
            {selected && <button className="mb-1 w-full text-center text-xs text-zinc-500 md:hidden" onClick={() => setSel(null)}>▾</button>}
            {selected ? (
              <>
                <Inspector block={selected} onChange={(nb) => update({ ...design!, blocks: blocks.map((x) => (x.id === nb.id ? nb : x)) })} />
                {(selected.type === "heading" || selected.type === "text") && <RewriteBar block={selected} onChange={(nb) => update({ ...design!, blocks: blocks.map((x) => (x.id === nb.id ? nb : x)) })} />}
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{L.theme}</h3>
                <p className="flex items-center gap-1.5 text-xs text-zinc-400"><Monitor size={12} /><Smartphone size={12} /> {L.select}</p>
                <ThemePanel design={design!} setDesign={update} />
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
