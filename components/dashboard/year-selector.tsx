type YearSelectorProps = { value: number; onChange: (year: number) => void; disabled?: boolean };

export function YearSelector({ value, onChange, disabled = false }: YearSelectorProps) {
  const currentYear = new Date().getUTCFullYear();
  const years = Array.from({ length: currentYear - 2008 + 1 }, (_, index) => currentYear - index);
  return <label className="flex items-center gap-2 text-sm text-muted-foreground"><span className="sr-only">Contribution year</span><select value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70">{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>;
}
