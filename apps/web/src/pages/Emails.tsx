import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { date, t } from "../i18n";
import { Badge, Card, Empty, PageTitle, Table, Td } from "../ui";

export function Emails() {
  const q = useQuery({ queryKey: ["emails"], queryFn: () => api("/emails?limit=100"), refetchInterval: 10_000 });
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle>{t.emails}</PageTitle>
      <Card>
        {rows.length === 0 ? (
          <Empty>{q.isLoading ? t.loading : t.noEmails}</Empty>
        ) : (
          <Table head={[t.to, t.subject, t.status, t.date]}>
            {rows.map((e) => (
              <tr key={e.id}>
                <Td className="max-w-[200px] truncate">{e.to.join(", ")}</Td>
                <Td className="max-w-[280px] truncate text-zinc-600 dark:text-zinc-400">{e.subject}</Td>
                <Td><Badge value={e.last_event} /></Td>
                <Td className="whitespace-nowrap text-zinc-500">{date(e.created_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
