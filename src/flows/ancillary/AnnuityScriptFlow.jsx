import { ANCILLARY_PRODUCT_META, SUB_PRODUCT } from "./ancillaryConstants";
import { getAncillarySteps } from "./ancillarySteps";

export default function AnnuityScriptFlow({ FlowRenderer, ...flowProps }) {
  return (
    <FlowRenderer
      {...flowProps}
      product={SUB_PRODUCT.ANNUITY}
      productMeta={ANCILLARY_PRODUCT_META[SUB_PRODUCT.ANNUITY]}
      steps={getAncillarySteps(SUB_PRODUCT.ANNUITY)}
    />
  );
}
