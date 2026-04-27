import { ANCILLARY_PRODUCT_META, SUB_PRODUCT } from "./ancillaryConstants";
import { getAncillarySteps } from "./ancillarySteps";

export default function DVHFlow({ FlowRenderer, ...flowProps }) {
  return (
    <FlowRenderer
      {...flowProps}
      product={SUB_PRODUCT.DVH}
      productMeta={ANCILLARY_PRODUCT_META[SUB_PRODUCT.DVH]}
      steps={getAncillarySteps(SUB_PRODUCT.DVH)}
    />
  );
}
