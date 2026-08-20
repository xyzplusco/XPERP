import { SaveNotice } from "@/components/SaveNotice";
import {
  changePasswordAction,
  createAccountAction,
  deleteAccountAction,
  resetPasswordAction,
  updateUserAction,
} from "@/lib/actions";
import { getSessionUser, isOwner, ROLE_LABEL, type Role } from "@/lib/auth";
import { isAccountAdminReady } from "@/lib/supabase/admin";
import { getPeopleNames, getUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ASSIGNABLE_ROLES: Role[] = ["staff", "member", "viewer"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string; error?: string; reason?: string; created?: string; password?: string; reset?: string;
  }>;
}) {
  const { saved, error, reason, created, password, reset } = await searchParams;
  const user = await getSessionUser();
  const owner = isOwner(user);
  const keyReady = isAccountAdminReady();

  const [users, peopleNames] = owner
    ? await Promise.all([getUsers(), getPeopleNames()])
    : [[], []];

  return (
    <>
      <div className="pageHeader">
        <h1>설정</h1>
        <div className="pageHeaderMeta">{owner ? `계정 ${users.length}개` : ""}</div>
      </div>

      <SaveNotice saved={saved} error={error} reason={reason} />

      {created && password ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">{reset ? "비밀번호 재설정" : "계정 생성"}</div>
            <div className="panelMeta">지금만 표시됨</div>
          </div>
          <div className="panelBody">
            <div className="kvGrid">
              <div className="kvItem">
                <div className="kvLabel">이메일</div>
                <div className="kvValue">{created}</div>
              </div>
              <div className="kvItem">
                <div className="kvLabel">임시 비밀번호</div>
                <div className="kvValue" style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 700 }}>
                  {password}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
              <div className="kvLabel">역할</div>
              <div className="kvValue">{user ? ROLE_LABEL[user.role] : ""}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">연결된 파트너</div>
              <div className="kvValue">{user?.personName ?? "연결 안 됨"}</div>
            </div>
          </div>
          <form action={changePasswordAction} className="formGrid">
            <div className="field">
              <label>새 비밀번호</label>
              <input name="password" type="password" minLength={8} required autoComplete="new-password" />
            </div>
            <div className="field">
              <label>새 비밀번호 확인</label>
              <input name="password_confirm" type="password" minLength={8} required autoComplete="new-password" />
            </div>
            <div className="formActions full">
              <button className="primaryButton" type="submit">
                비밀번호 변경
              </button>
            </div>
          </form>
        </div>
      </div>

      {!owner ? null : !keyReady ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">계정 관리</div>
          </div>
          <div className="panelBody">
            <p className="notice noticeError">
              서버 환경변수 <code>SUPABASE_SERVICE_ROLE_KEY</code> 없음
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">계정 추가</div>
            </div>
            <div className="panelBody">
              <form action={createAccountAction} className="formGrid">
                <div className="field">
                  <label>이메일</label>
                  <input name="email" type="email" required placeholder="ksm@xyzplus.co" />
                </div>
                <div className="field">
                  <label>연결 파트너</label>
                  <input name="person_name" list="people-names" placeholder="김수민" />
                </div>
                <div className="field">
                  <label>역할</label>
                  <select name="global_role" defaultValue="member">
                    {ASSIGNABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>초기 비밀번호</label>
                  <input name="password" placeholder="비우면 자동 생성" />
                </div>
                <div className="formActions full">
                  <button className="primaryButton" type="submit">
                    계정 만들기
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">계정 목록</div>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>이메일</th>
                    <th style={{ width: "13%" }}>역할</th>
                    <th style={{ width: "12%" }}>연결 파트너</th>
                    <th style={{ width: "9%" }}>상태</th>
                    <th style={{ width: "34%" }}>변경</th>
                    <th style={{ width: "14%" }} />
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => {
                    const isSelf = row.id === user?.appUserId;
                    const rowIsOwner = row.global_role === "owner";
                    return (
                      <tr key={row.id}>
                        <td>{row.email}</td>
                        <td>{ROLE_LABEL[row.global_role as Role] ?? row.global_role}</td>
                        <td>{row.person?.name_ko ?? <span className="faintText">–</span>}</td>
                        <td>{row.status === "active" ? "활성" : row.status === "disabled" ? "비활성" : "초대됨"}</td>
                        <td>
                          {rowIsOwner ? (
                            <span className="faintText">–</span>
                          ) : (
                            <form action={updateUserAction.bind(null, row.id)} className="inlineForm">
                              <div className="field">
                                <select name="global_role" defaultValue={row.global_role}>
                                  {ASSIGNABLE_ROLES.map((role) => (
                                    <option key={role} value={role}>
                                      {ROLE_LABEL[role]}
                                    </option>
                                  ))}
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
                                  placeholder="파트너 연결"
                                  defaultValue={row.person?.name_ko ?? ""}
                                  list="people-names"
                                />
                              </div>
                              <button className="smallButton" type="submit">
                                저장
                              </button>
                            </form>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <form action={resetPasswordAction.bind(null, row.id)}>
                              <button className="smallButton" type="submit">
                                비밀번호 재설정
                              </button>
                            </form>
                            {!rowIsOwner && !isSelf ? (
                              <form action={deleteAccountAction.bind(null, row.id)}>
                                <button className="smallButton" type="submit">
                                  삭제
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="people-names">
              {peopleNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

        </>
      )}
    </>
  );
}
