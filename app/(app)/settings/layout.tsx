/**
 * Each settings page renders its own PageHeader, whose section tabs move
 * between them, so this layout adds no navigation of its own: pages lay their
 * content out across the full width.
 */
export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="w-full">{children}</div>;
}
