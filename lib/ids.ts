// 화면에 보여주는 짧은 식별자. P-XXXXXXXX / C-XXXXXXXX / T-XXXXXXXX
export function shortId(prefix: string, uuid: string) {
  return `${prefix}-${uuid.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
