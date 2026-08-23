export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-parchment/60">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-parchment/20 border-t-coral" />
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
}
