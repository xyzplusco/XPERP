import { SaveNotice } from "@/components/SaveNotice";
import { updateUserAction } from "@/lib/actions";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getPeopleNames, getUsers } from "@/lib/queries";
import { label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const user = await getSessionUser();
  const admin = isAdmin(user);
  const [users, peopleNames] = admin ? await Promise.all([getUsers(), getPeopleNames()]) : [[], []];

  return (
    <>
      <div className="pageHeader">
        <h1>설정</h1>
      </div>

      <SaveNotice saved={saved} error={error} />

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">내 계정</div>
        </div>
        <div className="panelBody">
          <div className="kvGrid">
            <div className="kvItem">
              <div className="kvLabel">이메일</div>
              <div className="kvValue">{user?.email}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">권한</div>
              <div className="kvValue">{label(user?.role)}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">연결된 파트너</div>
              <div className="kvValue">{user?.personName ?? "연결 안 됨"}</div>
            </div>
          </div>
        </div>
      </div>

      {admin ? (
        <>
          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">계정 관리</div>
              <div className="panelMeta">{users.length}개 계정</div>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>이메일</th>
                    <th>권한</th>
                    <th>상태</th>
                    <th>연결 파트너</th>
                    <th>변경</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id}>
                      <td>{row.email}</td>
                      <td>{label(row.global_role)}</td>
                      <td>{row.status === "active" ? "활성" : row.status === "disabled" ? "비활성" : "초대됨"}</td>
                      <td>{row.person?.name_ko ?? <span className="faintText">–</span>}</td>
                      <td>
                        <form action={updateUserAction.bind(null, row.id)} className="inlineForm">
                          <div className="field">
                            <select name="global_role" defaultValue={row.global_role}>
                              <option value="admin">관리자</option>
                              <option value="partner">파트너</option>
                              <option value="member">구성원</option>
                            </select>
                          </div>
                          <div className="field">
                            <select name="status" defaultValue={row.status}>
                              <option value="active">활성</option>
                              <option value="disabled">비활성</option>
                            </select>
                          </div>
                          <div className="field">
                            <input
                              name="person_name"
                              placeholder="파트너 이름 연결"
                              defaultValue={row.person?.name_ko ?? ""}
                              list="people-names"
                            />
                          </div>
                          <button className="smallButton" type="submit">
                            저장
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <datalist id="people-names">
              {peopleNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">계정 추가 방법</div>
            </div>
            <div className="panelBody">
              <p style={{ margin: 0, fontSize: 13 }}>
                새 PL/PM 계정은 터미널에서 생성합니다. 프로젝트 폴더에서 아래 명령을 실행하세요.
              </p>
              <pre
                style={{
                  background: "var(--surface-soft)",
                  border: "1px solid var(--line)",
                  padding: "10px 14px",
                  fontSize: 12.5,
                  overflowX: "auto",
                }}
              >
                {`node scripts/create_user.mjs --email pm@example.com --password '비밀번호' --role member --person "이름"`}
              </pre>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                --person 에 파트너 이름을 지정하면 해당 파트너가 PL/PM으로 지정된 프로젝트의 수정 권한이 부여됩니다.
                권한과 파트너 연결은 위 계정 관리에서 변경할 수 있습니다.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
