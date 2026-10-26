export function outcomeMark(value: number | null): "gap" | "zero" | "bar" {
  if (value == null) return "gap";
  if (value === 0) return "zero";
  return "bar";
}
