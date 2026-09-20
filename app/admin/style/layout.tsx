import { StyleShell } from './components/shell'

/**
 * Both style tabs share one chrome: a dark control rail beside the canvas.
 * The rail carries navigation and the token controls, so neither page has
 * to open with a wall of tools before its first specimen.
 */
export default function StyleLayout({ children }: { children: React.ReactNode }) {
  return <StyleShell>{children}</StyleShell>
}
