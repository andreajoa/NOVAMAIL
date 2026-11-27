import { lang } from "../i18n";
import { navigate } from "../nav";

type Doc = { title: string; sections: [string, string][] };

const UPDATED = "26/11/2026";

const PT: Record<"terms" | "aup" | "privacy", Doc> = {
  terms: {
    title: "Termos de Uso",
    sections: [
      ["1. O serviço", "O NovaMail oferece campanhas, listas de contatos e uma API para envio de e-mails transacionais e de marketing, verificação de domínios e relatórios de entrega. Ao criar uma conta você aceita estes Termos e a Política de Uso Aceitável."],
      ["2. Conta", "Você é responsável pelas chaves de API e por tudo que for enviado com elas. Avise-nos imediatamente se suspeitar de uso indevido."],
      ["3. Planos e cobrança", "Não há plano grátis. Criar a conta não custa nada, e o envio exige um plano pago. Os planos são cobrados mensal ou anualmente pelo Stripe, renovam automaticamente e podem ser cancelados a qualquer momento pelo portal de assinatura; o acesso pago vale até o fim do período já pago. Não há reembolso proporcional, salvo exigência legal."],
      ["4. Limites e suspensão", "Para proteger a reputação de envio de todos os clientes, contas com taxa de devolução acima de 5% ou de reclamações de spam acima de 0,3% são suspensas automaticamente. Também podemos suspender contas que violem a Política de Uso Aceitável, sem aviso prévio quando houver risco à plataforma."],
      ["5. Disponibilidade", "Buscamos alta disponibilidade, mas o serviço é fornecido \"como está\". A entrega final depende dos provedores de destino (Gmail, Outlook etc.), que não controlamos."],
      ["6. Responsabilidade", "Nossa responsabilidade total fica limitada ao valor pago por você nos 3 meses anteriores ao evento. Não respondemos por lucros cessantes ou danos indiretos."],
      ["7. Encerramento", "Você pode encerrar a conta quando quiser. Podemos encerrar contas sem plano ativo e sem acesso há mais de 12 meses, com aviso por e-mail."],
      ["8. Lei aplicável", "Estes Termos seguem a legislação brasileira, incluindo o Código de Defesa do Consumidor quando aplicável."],
    ],
  },
  aup: {
    title: "Política de Uso Aceitável (antispam)",
    sections: [
      ["Permitido", "E-mails transacionais (pedidos, senhas, recibos, avisos de conta) e marketing para pessoas que deram consentimento claro (opt-in) e podem sair a qualquer momento."],
      ["Proibido", "Listas compradas, alugadas, raspadas de sites ou geradas; e-mail frio em massa sem relação prévia; phishing, malware, golpes, pirâmides, conteúdo ilegal; falsificar remetente ou cabeçalhos; esconder o descadastro; enviar de domínios que você não controla."],
      ["Obrigatório", "Domínio verificado com SPF, DKIM e DMARC; link de descadastro funcional em todo e-mail de marketing (o NovaMail adiciona o descadastro em 1 clique nas campanhas); atender pedidos de descadastro na hora; manter a taxa de reclamação abaixo de 0,1%."],
      ["Fiscalização", "Monitoramos devoluções, reclamações e listas de bloqueio. Violações levam a suspensão imediata e podem levar ao encerramento da conta sem reembolso."],
      ["Denúncias", "Para denunciar abuso, escreva para novamail@nexaclouds.online com o e-mail recebido (de preferência com os cabeçalhos)."],
    ],
  },
  privacy: {
    title: "Política de Privacidade (LGPD)",
    sections: [
      ["Quem somos", "O NovaMail é o controlador dos dados da sua conta (e-mail de login, dados de cobrança, uso). Para os e-mails que você envia e as listas de contatos, você é o controlador e o NovaMail atua como operador, tratando esses dados só para executar o envio."],
      ["O que coletamos", "E-mail de login, registros de acesso, chaves (guardadas apenas como hash), metadados de envio (remetente, destinatários, assunto, status, eventos de entrega/abertura/clique) e dados de pagamento processados pelo Stripe (não armazenamos número de cartão)."],
      ["Para quê", "Prestar o serviço, cobrar, prevenir abuso e spam, cumprir obrigações legais e melhorar a entrega. Base legal: execução de contrato, legítimo interesse (segurança e antiabuso) e obrigação legal."],
      ["Por quanto tempo", "Metadados de envio por até 90 dias; o corpo dos e-mails enviados pela API não é guardado depois do envio (o conteúdo de campanhas e modelos fica na sua conta até você apagar); listas de supressão enquanto a conta existir (para respeitar descadastros); dados da conta até o encerramento, mais o prazo legal."],
      ["Com quem", "Cloudflare (hospedagem da API e do painel), Amazon Web Services (entrega dos e-mails pelo Amazon SES), Stripe (pagamentos). Não vendemos dados."],
      ["Seus direitos", "Acesso, correção, portabilidade, eliminação e revogação de consentimento (art. 18 da LGPD). Peça por novamail@nexaclouds.online; respondemos em até 15 dias."],
      ["Segurança", "TLS em todas as conexões, chaves de API guardadas só como hash SHA-256, credenciais de servidor cifradas (AES-GCM), sessões HttpOnly e proteção CSRF."],
    ],
  },
};

const EN: typeof PT = {
  terms: {
    title: "Terms of Service",
    sections: [
      ["1. Service", "NovaMail provides campaigns, contact lists and an API for transactional and marketing email, domain verification and delivery reporting. By creating an account you accept these Terms and the Acceptable Use Policy."],
      ["2. Account", "You are responsible for your API keys and everything sent with them. Tell us immediately if you suspect misuse."],
      ["3. Plans and billing", "There is no free plan. Creating an account costs nothing, and sending requires a paid plan. Plans are billed monthly or yearly through Stripe, renew automatically and can be cancelled anytime from the billing portal; paid access lasts until the end of the paid period. No prorated refunds unless required by law."],
      ["4. Limits and suspension", "To protect every customer's sending reputation, accounts above 5% bounce rate or 0.3% spam-complaint rate are suspended automatically. We may also suspend accounts that violate the Acceptable Use Policy, without notice when the platform is at risk."],
      ["5. Availability", "We aim for high availability, but the service is provided \"as is\". Final delivery depends on receiving providers (Gmail, Outlook, etc.) we do not control."],
      ["6. Liability", "Our total liability is limited to the amount you paid in the 3 months before the event. We are not liable for lost profits or indirect damages."],
      ["7. Termination", "You may close your account anytime. We may close accounts with no active plan and no sign-in for more than 12 months, with email notice."],
      ["8. Governing law", "These Terms are governed by the laws of Brazil."],
    ],
  },
  aup: {
    title: "Acceptable Use Policy (anti-spam)",
    sections: [
      ["Allowed", "Transactional email (orders, passwords, receipts, account notices) and marketing to people who clearly opted in and can leave anytime."],
      ["Forbidden", "Purchased, rented, scraped or generated lists; bulk cold email without a prior relationship; phishing, malware, scams, pyramid schemes, illegal content; forged senders or headers; hidden unsubscribe; sending from domains you do not control."],
      ["Required", "Verified domain with SPF, DKIM and DMARC; a working unsubscribe link in every marketing email (NovaMail adds one-click unsubscribe to broadcasts); honour unsubscribes immediately; keep complaints below 0.1%."],
      ["Enforcement", "We monitor bounces, complaints and blocklists. Violations lead to immediate suspension and may lead to termination without refund."],
      ["Reporting", "To report abuse, write to novamail@nexaclouds.online with the email you received (headers included if possible)."],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["Who we are", "NovaMail is the controller of your account data (login email, billing, usage). For the emails you send and your contact lists, you are the controller and NovaMail is a processor that handles that data only to deliver your mail."],
      ["What we collect", "Login email, access logs, keys (stored only as hashes), sending metadata (sender, recipients, subject, status, delivery/open/click events) and payment data processed by Stripe (we never store card numbers)."],
      ["Why", "To provide the service, bill, prevent abuse and spam, meet legal obligations and improve deliverability. Legal bases: contract, legitimate interest (security and anti-abuse) and legal obligation."],
      ["Retention", "Sending metadata up to 90 days; bodies of API-sent emails are not kept after sending (campaign and template content stays in your account until you delete it); suppression lists while the account exists (to honour unsubscribes); account data until closure plus legal retention."],
      ["Sub-processors", "Cloudflare (API and dashboard hosting), Amazon Web Services (email delivery through Amazon SES), Stripe (payments). We do not sell data."],
      ["Your rights", "Access, correction, portability, deletion and withdrawal of consent (LGPD art. 18 / GDPR). Write to novamail@nexaclouds.online; we reply within 15 days."],
      ["Security", "TLS everywhere, API keys stored only as SHA-256 hashes, server credentials encrypted (AES-GCM), HttpOnly sessions and CSRF protection."],
    ],
  },
};

export function Legal({ doc }: { doc: "terms" | "aup" | "privacy" }) {
  const d = (lang === "pt" ? PT : EN)[doc];
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <a href="/" onClick={(e) => (e.preventDefault(), navigate("/"))} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← NovaMail</a>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{d.title}</h1>
      <p className="mt-2 text-sm text-zinc-500">{lang === "pt" ? "Atualizado em" : "Updated"} {UPDATED}</p>
      <div className="mt-8 space-y-6">
        {d.sections.map(([h, p]) => (
          <section key={h}>
            <h2 className="font-semibold">{h}</h2>
            <p className="mt-1 leading-relaxed text-zinc-600 dark:text-zinc-400">{p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
