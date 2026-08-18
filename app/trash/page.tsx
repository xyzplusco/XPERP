import { SaveNotice } from "@/components/SaveNotice";
import { emptyTrashAction, purgeAction, restoreAction } from "@/lib/actions";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getTrash } from "@/lib/queries";
import { formatDateTime, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const [user, groups] = await Promise.all([getSessionUser(), getTrash()]);
  const admin = isAdmin(user);
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <>
      <div className="pageHeader">
        <h1>휴지통</h1>
        <div className="pageHeaderMeta">{total}건</div>
      </div>

      <SaveNotice saved={saved} error={error} />

      {total === 0 ? (
        <div className="panel">
          <div className="panelBody">
            <span className="faintText">휴지통이 비어 있습니다.</span>
          </div>
        </div>
      ) : null}

      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <div className="panel" key={group.entity}>
            <div className="panelHeader">
              <div className="panelTitle">
                {group.label} <span className="mutedText">{group.rows.length}건</span>
              </div>
              {admin ? (
                <form action={emptyTrashAction.bind(null, group.entity)}>
                  <button className="smallButton" type="submit">
                    이 목록 영구삭제
                  </button>
                </form>
              ) : null}
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th style={{ width: "18%" }}>상세</th>
                    <th style={{ width: "16%" }}>삭제 시각</th>
                    <th style={{ width: "16%" }} />
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name || <span className="faintText">(이름 없음)</span>}</td>
                      <td className="mutedText">{label(row.detail) || "–"}</td>
                      <td className="mutedText">{formatDateTime(row.deleted_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <form action={restoreAction.bind(null, group.entity, row.id)}>
                            <button className="smallButton" type="submit">
                              복구
                            </button>
                          </form>
                          {admin ? (
                            <form action={purgeAction.bind(null, group.entity, row.id)}>
                              <button className="smallButton" type="submit">
                                영구삭제
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </>
  );
}
