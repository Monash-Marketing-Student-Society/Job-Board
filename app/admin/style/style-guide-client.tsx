'use client'

import type { BorderUsageReport, RawPaletteReport, VariantUsageReport } from './lib/scan'
import { ColorSection } from './components/color-section'
import { RawPaletteSection } from './components/raw-palette-section'
import { TypeSection } from './components/type-section'
import { RadiusSection } from './components/radius-section'
import { ShadowSection } from './components/shadow-section'
import { ComponentsSection } from './components/components-section'
import { DropdownMenuSection } from './components/dropdown-menu-section'
import { BorderSection } from './components/border-section'
import { Panel } from './components/shell'

export function StyleGuideClient({
  rawPalette,
  generatedAt,
  variantReports,
  borderUsage,
}: {
  rawPalette: RawPaletteReport
  generatedAt: string
  variantReports: VariantUsageReport[]
  borderUsage: BorderUsageReport
}) {
  return (
    <div className="space-y-5">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Reference</h1>
        <p className="text-[13px] text-slate-500">
          What each token resolves to right now, read live from the rendered DOM.
        </p>
      </header>

      <Panel title="Colour"><ColorSection /></Panel>
      <Panel title="Raw palette" description="Every place the token layer is bypassed.">
        <RawPaletteSection report={rawPalette} generatedAt={generatedAt} />
      </Panel>
      <Panel title="Type"><TypeSection /></Panel>
      <Panel title="Radius"><RadiusSection /></Panel>
      <Panel title="Shadow"><ShadowSection /></Panel>
      <Panel title="Components"><ComponentsSection variantReports={variantReports} /></Panel>
      <Panel title="Dropdown menu"><DropdownMenuSection /></Panel>
      <Panel title="Borders" description="No single border rule exists yet.">
        <BorderSection report={borderUsage} />
      </Panel>
    </div>
  )
}
