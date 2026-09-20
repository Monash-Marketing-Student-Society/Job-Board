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
import { TokenControls } from './components/token-controls'
import { NotesExport } from './components/note'

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
    <div className="mx-auto max-w-3xl space-y-16 pb-24">
      <header className="space-y-3 border-b border-border pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-semibold text-foreground">Style reference</h1>
          <NotesExport />
        </div>
        <p className="text-sm text-muted-foreground">
          What each token resolves to right now, read live from the rendered DOM via the real
          components. Counts come from a committed audit snapshot. This documents current state,
          not an intended one — broken things render broken.{' '}
          <a href="/admin/style/preview" className="underline underline-offset-2 hover:text-foreground">
            Preview
          </a>{' '}
          shows them composed.
        </p>
        <TokenControls />
      </header>

      <ColorSection />
      <RawPaletteSection report={rawPalette} generatedAt={generatedAt} />
      <TypeSection />
      <RadiusSection />
      <ShadowSection />
      <ComponentsSection variantReports={variantReports} />
      <DropdownMenuSection />
      <BorderSection report={borderUsage} />
    </div>
  )
}
