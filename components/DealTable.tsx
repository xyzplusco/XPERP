import Link from "next/link";
import { label, formatDateTime, truncate } from "@/lib/labels";
import type { DealRow } from "@/lib/queries";

export function DealTable({
  rows,
  roleColumn,
  emptyText = "표시할 프로젝트가 없습니다.",
}: {
  rows: (DealRow & { roles?: string })[];
  roleColumn?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>고객사</th>
            <th>프로젝트</th>
            <th>구간</th>
            <th>상태</th>
            <th>서비스섹터</th>
            {roleColumn ? <th>역할</th> : null}
            <th>PL</th>
            <th>PM</th>
            <th>최근 내용</th>
            <th>업데이트</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={roleColumn ? 10 : 9} className="emptyCell">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.company ? (
                    <Link className="tableLink" href={`/customers/${row.company.id}`}>
                      {row.company.name_ko}
                    </Link>
                  ) : (
                    <span className="faintText">–</span>
                  )}
                </td>
                <td>
                  <Link className="tableLink" href={`/projects/${row.id}`}>
                    {row.name}
                  </Link>
                </td>
                <td>{row.pipeline_stage}</td>
                <td>{row.deal_status}</td>
                <td>{row.service_sector}</td>
                {roleColumn ? <td>{row.roles ?? ""}</td> : null}
                <td>
                  {row.pl ? (
                    <Link className="tableLink" href={`/partners/${row.pl.id}`}>
                      {row.pl.name_ko}
                    </Link>
                  ) : (
                    <span className="faintText">미지정</span>
                  )}
                </td>
                <td>
                  {row.pm ? (
                    <Link className="tableLink" href={`/partners/${row.pm.id}`}>
                      {row.pm.name_ko}
                    </Link>
                  ) : (
                    <span className="faintText">미지정</span>
                  )}
                </td>
                <td className="mutedText">{truncate(row.next_action ?? row.latest_update, 48) || "–"}</td>
                <td className="mutedText">{formatDateTime(row.updated_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
