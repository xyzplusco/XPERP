import Link from "next/link";

type CustomerRow = {
  id: string;
  customerId: string;
  customer: string;
  industry: string;
  projects: string;
  contracts: string;
  docs: string;
  tasks: string;
  status: string;
  next: string;
};

export function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>고객사 ID</th>
            <th>고객사</th>
            <th>산업</th>
            <th>딜</th>
            <th>계약성</th>
            <th>문서</th>
            <th>액션</th>
            <th>상태</th>
            <th>다음 액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9}>표시할 고객사가 없습니다.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.customerId}</td>
                <td>
                  <Link className="tableLink" href={`/customers/${row.id}`}>
                    {row.customer}
                  </Link>
                </td>
                <td>{row.industry}</td>
                <td>{row.projects}</td>
                <td>{row.contracts}</td>
                <td>{row.docs}</td>
                <td>{row.tasks}</td>
                <td>{row.status}</td>
                <td>{row.next}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
