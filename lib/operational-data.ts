import seed from "@/data/processed/operational_seed_preview.json";

type Seed = typeof seed;
type NetworkRecord = Seed["network"][number];
type ProjectRecord = Seed["projects"][number];
type TaskRecord = Seed["tasks"][number];
type DocumentRequirement = Seed["documentRequirements"][number];

const preferredSegments = new Set([
  "XP internal",
  "Partner network",
  "Vendor advisor",
  "LP / investor",
  "External expert",
]);

function clip(value: string | undefined, fallback = "Review") {
  if (!value) return fallback;
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

export function getSourceStats() {
  return [
    { label: "People", value: String(seed.summary.people), detail: "Merged network records" },
    { label: "Projects", value: String(seed.summary.projects), detail: "Deal list project rows" },
    { label: "Actions", value: String(seed.summary.tasks), detail: "To Go operational rows" },
    { label: "Doc gaps", value: String(seed.summary.documentRequirements), detail: "Requirements needing review" },
  ];
}

export function getNetworkRows(limit = 12) {
  return seed.network
    .filter((row: NetworkRecord) => preferredSegments.has(row.segment))
    .slice(0, limit)
    .map((row: NetworkRecord) => ({
      name: row.name,
      segment: row.segment,
      company: row.company || "Unassigned",
      role: row.role || row.category || "Review",
      docs: documentState(row),
    }));
}

export function getProjectRows(limit = 12) {
  return seed.projects
    .filter((row: ProjectRecord) => row.company && row.projectType !== "Review")
    .slice(0, limit)
    .map((row: ProjectRecord) => ({
      company: row.company,
      type: row.projectType,
      pl: row.pl || "Review",
      pm: row.pm || "Review",
      next: clip(row.nextAction || row.latestUpdate || row.xpRequest),
    }));
}

export function getEventRows(limit = 12) {
  return seed.tasks
    .filter((row: TaskRecord) => row.linkedArea === "Events")
    .slice(0, limit)
    .map((row: TaskRecord) => ({
      event: row.title,
      owner: row.owner || "Unassigned",
      invitees: clip(row.body, "Review invitees"),
      state: row.status,
      next: row.classification === "heading" ? "Review" : clip(row.body),
    }));
}

export function getDocumentRequirementRows(limit = 16) {
  return seed.documentRequirements
    .slice(0, limit)
    .map((row: DocumentRequirement) => ({
      subject: row.subject,
      type: row.type,
      owner: row.owner || "Operations",
      status: row.status,
      due: row.due || "Review",
    }));
}

export function getTaskRows(limit = 16) {
  return seed.tasks
    .filter((row: TaskRecord) => row.classification !== "heading")
    .slice(0, limit)
    .map((row: TaskRecord) => ({
      title: row.title,
      owner: row.owner || "Unassigned",
      link: row.linkedArea,
      status: row.status,
    }));
}

export function getSearchRows(limit = 16) {
  return getTaskRows(limit);
}

export function getSegmentSummary() {
  return Object.entries(seed.summary.networkSegments).map(([segment, count]) => ({
    segment,
    count: String(count),
  }));
}

export function getProjectTypeSummary() {
  return Object.entries(seed.summary.projectTypes).map(([type, count]) => ({
    type,
    count: String(count),
  }));
}

function documentState(row: NetworkRecord) {
  const missing = [
    row.ndaStatus === "Unknown" || row.ndaStatus === "X" ? "NDA" : "",
    row.profileStatus === "Unknown" || row.profileStatus === "X" ? "Profile" : "",
    row.appointmentStatus === "Unknown" || row.appointmentStatus === "X" ? "Appointment" : "",
  ].filter(Boolean);
  return missing.length ? `${missing.join(" / ")} review` : "On file";
}

