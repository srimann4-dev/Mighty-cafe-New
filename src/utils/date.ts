export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function createRangeLabel(startDate: string, endDate: string): string {
  return `${startDate} to ${endDate}`;
}

export function offsetDateByDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
