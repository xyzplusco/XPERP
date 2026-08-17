import { SectionHeader } from "@/components/SectionHeader";

const settingsRows = [
  { key: "백엔드", value: "Supabase" },
  { key: "데모 접근", value: "로그인 없이 바로 대시보드 진입" },
  { key: "문서 민감도", value: "internal / confidential / restricted" },
  { key: "파트너 태그", value: "bod, employee, partner, partner_candidate, advisor" },
  { key: "가져오기 방식", value: "검토 큐를 포함한 재실행 가능 import" },
  { key: "다음 DB 작업", value: "프로젝트 상세, 이벤트 참석자, 문서 Storage, 권한 모델" },
];

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <SectionHeader
        eyebrow="설정"
        title="운영 규칙"
        description="데모에서는 로그인 없이 열고, 이후 사용자, 역할, 태그, 원본 가져오기, 문서 민감도를 순서대로 고도화합니다."
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">구현 기준</div>
            <div className="panelMeta">관리자가 변경하기 전 기본값</div>
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>설정</th>
                <th>현재 방향</th>
              </tr>
            </thead>
            <tbody>
              {settingsRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
