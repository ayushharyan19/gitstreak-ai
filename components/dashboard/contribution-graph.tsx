import type { ContributionDay } from "@/types/github";

type ContributionGraphProps = { days: ContributionDay[]; totalContributions: number; year: number };
const levelClasses = { NONE: "bg-muted", FIRST_QUARTILE: "bg-primary/25", SECOND_QUARTILE: "bg-primary/45", THIRD_QUARTILE: "bg-primary/70", FOURTH_QUARTILE: "bg-primary" } as const;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function weekdayOffset(date: string) { return new Date(`${date}T00:00:00.000Z`).getUTCDay(); }
function formatDay(day: ContributionDay) { return `${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"} on ${day.date}`; }

export function ContributionGraph({ days, totalContributions, year }: ContributionGraphProps) {
  const leadingDays = days.length ? weekdayOffset(days[0].date) : 0;
  const cells = [...Array.from({ length: leadingDays }, () => null), ...days];
  const weekCount = Math.ceil(cells.length / 7);
  const monthLabels = cells.reduce<Array<{ label: string; week: number }>>((labels, day, index) => { if (!day || !day.date.endsWith("-01")) return labels; labels.push({ label: monthNames[Number(day.date.slice(5, 7)) - 1], week: Math.floor(index / 7) }); return labels; }, []);

  return <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"><div><h2 className="font-semibold">Contribution activity</h2><p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">{totalContributions.toLocaleString()} contributions</span> in {year}</p></div><div className="mt-6 overflow-x-auto pb-2"><div className="min-w-[680px]"><div className="ml-9 grid h-5 gap-1" style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))` }}>{monthLabels.map(({ label, week }) => <span key={`${label}-${week}`} className="text-[10px] text-muted-foreground" style={{ gridColumnStart: week + 1 }}>{label}</span>)}</div><div className="mt-1 flex gap-2"><div className="grid grid-rows-7 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div><div className="grid grid-flow-col grid-rows-7 gap-1">{cells.map((day, index) => day ? <span key={day.date} role="img" aria-label={formatDay(day)} title={formatDay(day)} className={`size-3.5 rounded-[3px] outline-offset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${levelClasses[day.contributionLevel]}`} tabIndex={0} /> : <span key={`blank-${index}`} className="size-3.5" aria-hidden="true" />)}</div></div></div></div><div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground"><span>Less</span>{Object.values(levelClasses).map((level) => <span key={level} className={`size-3 rounded-[2px] ${level}`} />)}<span>More</span></div></section>;
}
