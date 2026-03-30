interface Props { errors: string[] }

export default function ErrorBanner({ errors }: Props) {
  if (!errors.length) return null
  return (
    <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 text-sm text-red-700">
      <p className="font-bold mb-1">Please fix the following:</p>
      <ul className="list-disc list-inside space-y-0.5">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  )
}
