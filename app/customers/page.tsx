import Link from "next/link";
import { getCustomers } from "@/lib/queries";
import { label, truncate } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <>
      <div className="pageHeader">
        <h1>고객사</h1>
        <div className="pageHeaderMeta">{customers.length}개사</div>
      </div>

      <div className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>고객사</th>
                <th>산업</th>
                <th className="numeric">프로젝트</th>
                <th className="numeric">진행 중</th>
                <th className="numeric">문서 미비</th>
                <th className="numeric">액션</th>
                <th>상태</th>
                <th>다음 액션</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="emptyCell">
                    표시할 고객사가 없습니다.
                  </td>
                </tr>
              ) : (
                customers.map((row) => (
                  <tr key={row.id}>
                    <td className="mutedText">{row.customer_id}</td>
                    <td>
                      <Link className="tableLink" href={`/customers/${row.id}`}>
                        {row.customer}
                      </Link>
                    </td>
                    <td>{row.industry}</td>
                    <td className="numeric">{row.project_count}</td>
                    <td className="numeric">{row.active_project_count}</td>
                    <td className="numeric">{row.document_gap_count}</td>
                    <td className="numeric">{row.task_count}</td>
                    <td>{label(row.latest_status)}</td>
                    <td className="mutedText">{truncate(row.next_action, 40)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
