import Link from "next/link";
import { getPartners } from "@/lib/queries";
import { partnerClass } from "@/lib/labels";

export const dynamic = "force-dynamic";

const CLASS_FILTERS = ["임원", "직원", "파트너", "파트너 후보", "협력사", "외부 전문가", "미분류"];

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: classFilter } = await searchParams;
  const partners = await getPartners();

  const withClass = partners.map((person) => ({
    ...person,
    className: partnerClass(person.profile?.partner_status, person.profile?.network_segment),
  }));

  const filtered = classFilter ? withClass.filter((p) => p.className === classFilter) : withClass;

  const docsSummary = (person: (typeof withClass)[number]) => {
    const profile = person.profile;
    if (!profile) return "미확인";
    const missing: string[] = [];
    const isMissing = (value: string | null) => !value || value === "Unknown" || value === "X";
    if (isMissing(profile.nda_status)) missing.push("NDA");
    if (isMissing(profile.profile_status)) missing.push("프로필");
    if (isMissing(profile.appointment_status)) missing.push("위촉");
    return missing.length === 0 ? "완비" : `${missing.join(" · ")} 미비`;
  };

  return (
    <>
      <div className="pageHeader">
        <h1>파트너</h1>
        <div className="pageHeaderMeta">
          {classFilter ? `${classFilter} ${filtered.length}명 / 전체 ${withClass.length}명` : `${withClass.length}명`}
        </div>
      </div>

      <div className="filterBar">
        <Link className={classFilter ? "smallButton" : "smallButton navItemActive"} href="/partners">
          전체
        </Link>
        {CLASS_FILTERS.map((option) => (
          <Link
            key={option}
            className={classFilter === option ? "smallButton navItemActive" : "smallButton"}
            href={`/partners?class=${encodeURIComponent(option)}`}
          >
            {option}
          </Link>
        ))}
      </div>

      <div className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>구분</th>
                <th>소속</th>
                <th>직함</th>
                <th>이메일</th>
                <th>연락처</th>
                <th>문서</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="emptyCell">
                    표시할 파트너가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <Link className="tableLink" href={`/partners/${person.id}`}>
                        {person.name_ko}
                      </Link>
                    </td>
                    <td>{person.className}</td>
                    <td>
                      {person.company ? (
                        <Link className="tableLink" href={`/customers/${person.company.id}`}>
                          {person.company.name_ko}
                        </Link>
                      ) : (
                        <span className="faintText">–</span>
                      )}
                    </td>
                    <td>{person.title ?? person.profile?.xp_role ?? "–"}</td>
                    <td className="mutedText">{person.email ?? "–"}</td>
                    <td className="mutedText">{person.phone ?? "–"}</td>
                    <td className="mutedText">{docsSummary(person)}</td>
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
