// Platform DNS records for a NovaMail sending node. Pure function so CI can
// print a dry-run diff and tests can pin the exact shape.
export function platformRecords({ mailDomain, ip, dkimPublicKeyPem }) {
  const host = `postal.${mailDomain}`;
  const dkim = dkimPublicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return [
    { type: "A", name: host, content: ip, comment: "Postal web/API/SMTP" },
    { type: "A", name: `mx.${mailDomain}`, content: ip, comment: "Inbound MX host" },
    { type: "TXT", name: `spf.${mailDomain}`, content: `v=spf1 ip4:${ip} ~all`, comment: "Customers include this" },
    { type: "MX", name: `rp.${mailDomain}`, content: host, priority: 10, comment: "Bounce processing" },
    { type: "TXT", name: `rp.${mailDomain}`, content: `v=spf1 a mx include:spf.${mailDomain} ~all` },
    { type: "TXT", name: `nm._domainkey.rp.${mailDomain}`, content: `v=DKIM1; t=s; h=sha256; p=${dkim};`, comment: "Return-path DKIM" },
    { type: "MX", name: `routes.${mailDomain}`, content: host, priority: 10, comment: "Inbound routes" },
    { type: "CNAME", name: `track.${mailDomain}`, content: host, comment: "Open/click tracking" },
    { type: "TXT", name: `_dmarc.${mailDomain}`, content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${mailDomain}; adkim=r; aspf=r;` },
    { type: "TXT", name: `_smtp._tls.${mailDomain}`, content: `v=TLSRPTv1; rua=mailto:tlsrpt@${mailDomain}` },
  ];
}
