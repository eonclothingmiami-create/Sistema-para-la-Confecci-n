export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { id: T; label: string }[]
}) {
  return (
    <div className="flex w-full max-w-full rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 sm:inline-flex sm:w-auto">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition sm:flex-none sm:px-3 sm:text-sm ${
              active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <span className="block truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
