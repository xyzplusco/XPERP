import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getAssignablePeople, getProjectOptions, getTaskCounts, getTasks } from "@/lib/queries";
import { formatDate, label } from "@/lib/labels";
import { shortId } from "@/lib/ids";

export const dynamic = "force-dynamic";

const SCOPES = [
  { key: "unsorted", label: "미분류" },
  { key: "open", label: "진행 중" },
  { key: "all", label: "전체" },
];

const STATUS_OPTIONS: [string, string][] = [
  ["backlog", "대기"],
  ["in_progress", "진행 중"],
  ["waiting", "회신 대기"],
  ["blocked", "보류"],
  ["done", "완료"],
  ["dropped", "중단"],
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { scope = "unsorted", saved, trashed, error } = await searchParams;

  const [tickets, assignables, projects, counts, user] = await Promise.all([
    getTasks({ scope }),
    getAssignablePeople(),
    getProjectOptions(),
    getTaskCounts(),
    getSessionUser(),
  ]);

  const returnPath = `/tasks?scope=${scope}`;
  const assigneeOptions: [string, string][] = assignables.map((person) => [person.id, person.name_ko]);
  const projectOptions: [string, string][] = projects.map((project) => [
    project.id,
    project.company ? `${project.name} · ${project.company}` : project.name,
  ]);

  const columns: ColumnDef[] = [
    { key: "code", header: "과제", width: 110, kind: "readonly" },
    { key: "title", header: "내용", width: 340, kind: "text" },
    { key: "assignee_person_id", header: "담당자", width: 110, kind: "select", options: assigneeOptions },
    { key: "project_id", header: "프로젝트", width: 220, kind: "select", options: projectOptions },
    { key: "status", header: "상태", width: 100, kind: "select", options: STATUS_OPTIONS },
    { key: "due_date", header: "기한", width: 110, kind: "date" },
    { key: "created_at", header: "등록", width: 100, kind: "readonly" },
  ];

  const rows: BulkRow[] = tickets.map((task) => ({
    id: task.id,
    href: `/tasks/${task.id}`,
    linkKey: "code",
    display: {
      code: shortId("T", task.id),
      title: task.title,
      assignee_person_id: task.assignee?.name_ko ?? "",
      project_id: task.project?.name ?? "",
      status: label(task.status),
      due_date: task.due_date ? formatDate(task.due_date) : "",
      created_at: formatDate(task.created_at),
    },
    raw: {
      title: task.title,
      assignee_person_id: task.assignee?.id ?? "",
      project_id: task.project?.id ?? "",
      status: task.status,
      due_date: task.due_date ?? "",
    },
  }));

  return (
    <>
      <div className="pageHeader">
        <h1>과제</h1>
        <div className="pageHeaderMeta">{tickets.length}건</div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="tabRow">
        {SCOPES.map((item) => (
          <Link
            key={item.key}
            href={`/tasks?scope=${item.key}`}
            className={scope === item.key ? "tab tabOn" : "tab"}
          >
            {item.label}
            <span className="tabCount">
              {item.key === "unsorted" ? counts.unsorted : item.key === "open" ? counts.open : counts.total}
            </span>
          </Link>
        ))}
      </div>

      <div className="panel">
        <BulkTable
          entity="tasks"
          storageKey="tasks"
          columns={columns}
          rows={rows}
          returnPath={returnPath}
          bulkActions={[
            { field: "assignee_person_id", label: "담당자 지정", options: assigneeOptions },
            { field: "status", label: "상태 변경", options: STATUS_OPTIONS },
            { field: "project_id", label: "프로젝트 이동", options: projectOptions },
          ]}
          emptyText="과제이 없습니다."
        />
      </div>
    </>
  );
}
