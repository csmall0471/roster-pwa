export default function PreviewBanner({ phone, name }: { phone: string; name?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-4 py-3">
      <span className="text-amber-500 text-lg leading-none mt-0.5">👁</span>
      <p className="text-sm text-amber-700 dark:text-amber-400">
        <span className="font-semibold text-amber-800 dark:text-amber-300">Preview mode — </span>
        {name ? <>viewing as <strong>{name}</strong> ({phone})</> : <>phone {phone}</>}
      </p>
    </div>
  );
}
