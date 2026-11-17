import type { Design } from "./index";

export interface TemplatePreset {
  id: string;
  name: { en: string; pt: string };
  description: { en: string; pt: string };
  subject: string;
  design: Design;
}

const IMG = "https://app.novamail.nexaclouds.online/tpl";
const FOOT = { id: "f", type: "footer" as const, html: "Your Company · 123 Main Street, City · You received this email because you subscribed.", unsubscribe: true };

export const TEMPLATES: TemplatePreset[] = [
  {
    id: "newsletter",
    name: { en: "Newsletter", pt: "Newsletter" },
    description: { en: "Hero image, story and a call to action.", pt: "Imagem de destaque, história e chamada para ação." },
    subject: "Hi {{first_name}}, here is what is new this month",
    design: {
      version: 1,
      preheader: "Our latest news, tips and a little something for you.",
      theme: { background: "#f4f4f5", content: "#ffffff", text: "#18181b", muted: "#71717a", accent: "#18181b", font: "System", width: 600, radius: 12 },
      blocks: [
        { id: "logo", type: "image", src: `${IMG}/logo.png`, alt: "Your logo", width: 30, align: "left", radius: 0 },
        { id: "hero", type: "image", src: `${IMG}/hero.png`, alt: "Hero image", width: 100, radius: 10 },
        { id: "h", type: "heading", text: "Hi {{first_name}}, here's what's new", size: 28 },
        { id: "t", type: "text", html: "We've been busy this month. Here are the updates we think you'll love — plus a few tips to get more out of your purchase." },
        { id: "it1", type: "image_text", src: `${IMG}/product.png`, alt: "Feature", html: "<strong>New arrival</strong><br>Tell your customers about a new product, feature or service in two lines.", imageSide: "left" },
        { id: "b", type: "button", text: "Read more", href: "https://example.com", align: "left" },
        { id: "d", type: "divider" },
        FOOT,
      ],
    },
  },
  {
    id: "promotion",
    name: { en: "Sale / promotion", pt: "Promoção" },
    description: { en: "Big offer, coupon code and a bold button.", pt: "Oferta grande, cupom e botão chamativo." },
    subject: "{{first_name}}, 20% off ends tonight",
    design: {
      version: 1,
      preheader: "Use code SAVE20 at checkout — today only.",
      theme: { background: "#111827", content: "#ffffff", text: "#111827", muted: "#6b7280", accent: "#dc2626", font: "Helvetica", width: 600, radius: 14 },
      blocks: [
        { id: "hero", type: "image", src: `${IMG}/sale.png`, alt: "Sale", width: 100, radius: 0 },
        { id: "h", type: "heading", text: "20% off everything", size: 36, align: "center" },
        { id: "t", type: "text", html: "Our biggest sale of the season is here. Use the code below at checkout.", align: "center" },
        { id: "code", type: "heading", text: "SAVE20", size: 30, align: "center", color: "#dc2626" },
        { id: "b", type: "button", text: "Shop the sale", href: "https://example.com", align: "center", full: false, radius: 999 },
        { id: "s", type: "spacer", height: 16 },
        FOOT,
      ],
    },
  },
  {
    id: "launch",
    name: { en: "Product launch", pt: "Lançamento" },
    description: { en: "Announce something new with an animated GIF or video.", pt: "Anuncie algo novo com GIF ou vídeo animado." },
    subject: "It's here: meet our newest product",
    design: {
      version: 1,
      preheader: "Designed with you in mind. Available now.",
      theme: { background: "#f5f5f4", content: "#ffffff", text: "#1c1917", muted: "#78716c", accent: "#1c1917", font: "Georgia", width: 600, radius: 0 },
      blocks: [
        { id: "h", type: "heading", text: "Meet the new collection", size: 34, align: "center" },
        { id: "t", type: "text", html: "Made to last, designed to be loved. Take a look:", align: "center" },
        { id: "v", type: "video", gif: `${IMG}/launch.gif`, href: "https://example.com", alt: "Watch the launch video" },
        { id: "b", type: "button", text: "Discover it", href: "https://example.com", align: "center" },
        FOOT,
      ],
    },
  },
  {
    id: "welcome",
    name: { en: "Welcome", pt: "Boas-vindas" },
    description: { en: "First email after someone signs up.", pt: "Primeiro e-mail após o cadastro." },
    subject: "Welcome, {{first_name}}!",
    design: {
      version: 1,
      preheader: "Thanks for joining — here's how to get started.",
      theme: { background: "#eff6ff", content: "#ffffff", text: "#0f172a", muted: "#64748b", accent: "#2563eb", font: "System", width: 600, radius: 16 },
      blocks: [
        { id: "logo", type: "image", src: `${IMG}/logo.png`, alt: "Your logo", width: 30, align: "left", radius: 0 },
        { id: "h", type: "heading", text: "Welcome aboard, {{first_name}} 👋", size: 30 },
        { id: "t", type: "text", html: "We're so glad you're here. In the next few days we'll send you our best tips. To start right now:<ul><li>Complete your profile</li><li>Explore our best sellers</li><li>Reply to this email with any question</li></ul>" },
        { id: "b", type: "button", text: "Get started", href: "https://example.com" },
        FOOT,
      ],
    },
  },
  {
    id: "event",
    name: { en: "Event invitation", pt: "Convite para evento" },
    description: { en: "Date, place and an RSVP button.", pt: "Data, local e botão de confirmação." },
    subject: "You're invited, {{first_name}}",
    design: {
      version: 1,
      preheader: "Save the date — seats are limited.",
      theme: { background: "#fdf4ff", content: "#ffffff", text: "#3b0764", muted: "#86198f", accent: "#a21caf", font: "Trebuchet", width: 600, radius: 16 },
      blocks: [
        { id: "hero", type: "image", src: `${IMG}/event.png`, alt: "Event", width: 100, radius: 12 },
        { id: "h", type: "heading", text: "Join us on Saturday, 7 PM", size: 30, align: "center" },
        { id: "t", type: "text", html: "<strong>Where:</strong> 123 Main Street<br><strong>When:</strong> Saturday, 7:00 PM<br>Bring a friend — drinks are on us.", align: "center" },
        { id: "b", type: "button", text: "Confirm my seat", href: "https://example.com", align: "center" },
        FOOT,
      ],
    },
  },
  {
    id: "abandoned-cart",
    name: { en: "Abandoned cart", pt: "Carrinho abandonado" },
    description: { en: "Bring shoppers back to finish their order.", pt: "Traga o cliente de volta para finalizar a compra." },
    subject: "You left something behind, {{first_name}}",
    design: {
      version: 1,
      preheader: "Your cart is saved — complete your order in one click.",
      theme: { background: "#f4f4f5", content: "#ffffff", text: "#18181b", muted: "#71717a", accent: "#16a34a", font: "System", width: 600, radius: 12 },
      blocks: [
        { id: "h", type: "heading", text: "Still thinking it over?", size: 28 },
        { id: "it", type: "image_text", src: `${IMG}/product.png`, alt: "Product", html: "<strong>Your item</strong><br>It's still in your cart, but we can't hold it forever.", imageSide: "left" },
        { id: "b", type: "button", text: "Complete my order", href: "https://example.com" },
        FOOT,
      ],
    },
  },
  {
    id: "plain",
    name: { en: "Simple text", pt: "Texto simples" },
    description: { en: "Personal-looking email, great for deliverability.", pt: "Parece um e-mail pessoal — ótimo para entregabilidade." },
    subject: "Quick question, {{first_name}}",
    design: {
      version: 1,
      preheader: "",
      theme: { background: "#ffffff", content: "#ffffff", text: "#18181b", muted: "#71717a", accent: "#2563eb", font: "System", width: 600, radius: 0 },
      blocks: [
        { id: "t", type: "text", html: "Hi {{first_name}},<br><br>Write to your customers the way you'd write to a friend. Short, personal emails often get the best replies.<br><br>Talk soon,<br>Your name" },
        FOOT,
      ],
    },
  },
  {
    id: "receipt",
    name: { en: "Order confirmation", pt: "Confirmação de pedido" },
    description: { en: "Transactional receipt for your store.", pt: "Recibo transacional da sua loja." },
    subject: "Order confirmed — thank you!",
    design: {
      version: 1,
      preheader: "We're getting your order ready.",
      theme: { background: "#f4f4f5", content: "#ffffff", text: "#18181b", muted: "#71717a", accent: "#18181b", font: "System", width: 600, radius: 12 },
      blocks: [
        { id: "h", type: "heading", text: "Thanks for your order!", size: 28 },
        { id: "t", type: "text", html: "Hi {{first_name}}, we've received your order and we're getting it ready. You'll get another email when it ships." },
        { id: "d", type: "divider" },
        { id: "s", type: "text", html: "<strong>Order #1042</strong><br>1 × Product name — $49.00<br>Shipping — $5.00<br><strong>Total — $54.00</strong>" },
        { id: "b", type: "button", text: "View my order", href: "https://example.com" },
        { id: "f", type: "footer", html: "Your Company · 123 Main Street, City", unsubscribe: false },
      ],
    },
  },
];
