interface Props {
  errors: string[]
  /** Labels of fields the server reported as invalid — shown as pills under
   *  the bulleted errors so the user sees at a glance which inputs need
   *  attention (and so we can confirm the server actually sent them). */
  fieldLabels?: string[]
}

export default function ErrorBanner({ errors, fieldLabels }: Props) {
  if (!errors.length && !fieldLabels?.length) return null
  return (
    <div role="alert" className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 text-sm text-red-700">
      {errors.length > 0 && (
        <>
          <p className="font-bold mb-1">Please fix the following:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </>
      )}
      {fieldLabels && fieldLabels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fieldLabels.map(l => (
            <span key={l} className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-700 text-xs font-medium">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
