/**
 * Settings sections are listed under Settings in the sidebar, so this layout adds
 * no navigation of its own: each page renders its own heading and lays its
 * cards out across the full width.
 */
export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="w-full">{children}</div>;
}
