import { ANCILLARY_PRODUCT_META, SUB_PRODUCT } from "./ancillaryConstants";
import { getAncillarySteps } from "./ancillarySteps";

export default function HIPFlow({ FlowRenderer, ...flowProps }) {
  return (
    <FlowRenderer
      {...flowProps}
      product={SUB_PRODUCT.HIP}
      productMeta={ANCILLARY_PRODUCT_META[SUB_PRODUCT.HIP]}
      steps={getAncillarySteps(SUB_PRODUCT.HIP)}
    />
  );
}
