import { styleAudit } from './lib/scan'
import { StyleGuideClient } from './style-guide-client'

export const metadata = {
  title: 'Style reference | Admin',
}

export default function StyleGuidePage() {
  return (
    <StyleGuideClient
      rawPalette={styleAudit.rawPalette}
      generatedAt={styleAudit.generatedAt}
      variantReports={styleAudit.variantUsage}
      borderUsage={styleAudit.borderUsage}
    />
  )
}
