const pt = {
  tagline: "E-mail transacional, SMTP e domínios — sem limites de fornecedor.",
  email: "E-mail", sendCode: "Enviar código", code: "Código de 6 dígitos", enter: "Entrar", back: "Voltar",
  codeSent: "Enviamos um código para", wrongEmail: "Trocar e-mail", logout: "Sair",
  overview: "Visão geral", emails: "E-mails", domains: "Domínios", apiKeys: "Chaves de API", webhooks: "Webhooks",
  suppressions: "Supressões", plan: "Plano",
  today: "Hoje", thisMonth: "Este mês", of: "de", last30: "Últimos 30 dias", sent: "Enviados", bounced: "Devolvidos",
  quickstart: "Comece em 1 minuto", quickstartHint: "Qualquer SDK do Resend funciona trocando a URL base.",
  noEmails: "Nenhum e-mail ainda.", subject: "Assunto", to: "Para", status: "Status", date: "Data",
  addDomain: "Adicionar domínio", domainName: "ex.: mail.sualoja.com", verify: "Verificar DNS", remove: "Remover",
  dnsHint: "Publique estes registros no DNS do domínio e clique em Verificar.", type: "Tipo", name: "Nome", value: "Valor",
  required: "obrigatório", optional: "recomendado", copy: "Copiar", copied: "Copiado",
  createKey: "Criar chave", keyName: "Nome da chave", fullAccess: "Acesso total", sendingAccess: "Só envio",
  revoke: "Revogar", lastUsed: "Último uso", never: "nunca", created: "Criada",
  showOnce: "Copie agora — por segurança não mostramos de novo.", done: "Pronto",
  addWebhook: "Adicionar endpoint", endpoint: "URL HTTPS", events: "Eventos", allEvents: "Todos", signingSecret: "Segredo de assinatura",
  address: "Endereço", reason: "Motivo", add: "Adicionar", noItems: "Nada por aqui.",
  welcome: "Conta criada", welcomeHint: "Guarde sua chave de API e a senha SMTP. Elas aparecem só agora.",
  smtpPassword: "Senha SMTP", host: "Servidor", port: "Porta", user: "Usuário",
  limits: "Limites", perDay: "por dia", perMonth: "por mês", domainsAllowed: "domínios", upgradeSoon: "Planos pagos em breve — fale com a gente para aumentar os limites.",
  suspended: "Conta suspensa", loading: "Carregando…", error: "Algo deu errado", lang: "pt" as string,
};
type Dict = typeof pt;
const en: Dict = {
  tagline: "Transactional email, SMTP and domains — without vendor limits.",
  email: "Email", sendCode: "Send code", code: "6-digit code", enter: "Sign in", back: "Back",
  codeSent: "We sent a code to", wrongEmail: "Use another email", logout: "Sign out",
  overview: "Overview", emails: "Emails", domains: "Domains", apiKeys: "API keys", webhooks: "Webhooks",
  suppressions: "Suppressions", plan: "Plan",
  today: "Today", thisMonth: "This month", of: "of", last30: "Last 30 days", sent: "Sent", bounced: "Bounced",
  quickstart: "Start in one minute", quickstartHint: "Any Resend SDK works by changing the base URL.",
  noEmails: "No emails yet.", subject: "Subject", to: "To", status: "Status", date: "Date",
  addDomain: "Add domain", domainName: "e.g. mail.yourstore.com", verify: "Verify DNS", remove: "Remove",
  dnsHint: "Publish these records at your DNS provider, then click Verify.", type: "Type", name: "Name", value: "Value",
  required: "required", optional: "recommended", copy: "Copy", copied: "Copied",
  createKey: "Create key", keyName: "Key name", fullAccess: "Full access", sendingAccess: "Sending only",
  revoke: "Revoke", lastUsed: "Last used", never: "never", created: "Created",
  showOnce: "Copy it now — for security we won't show it again.", done: "Done",
  addWebhook: "Add endpoint", endpoint: "HTTPS URL", events: "Events", allEvents: "All", signingSecret: "Signing secret",
  address: "Address", reason: "Reason", add: "Add", noItems: "Nothing here.",
  welcome: "Account created", welcomeHint: "Save your API key and SMTP password. They are shown only once.",
  smtpPassword: "SMTP password", host: "Host", port: "Port", user: "Username",
  limits: "Limits", perDay: "per day", perMonth: "per month", domainsAllowed: "domains", upgradeSoon: "Paid plans coming soon — contact us to raise your limits.",
  suspended: "Account suspended", loading: "Loading…", error: "Something went wrong", lang: "en",
};
export const lang = (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
export const t: Dict = lang === "pt" ? pt : en;
document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";

const fmtDate = new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
const fmtNum = new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US");
export const date = (iso: string | number) => fmtDate.format(new Date(iso));
export const num = (n: number) => fmtNum.format(n);
