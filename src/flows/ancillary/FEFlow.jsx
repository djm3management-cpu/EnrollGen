import { ANCILLARY_PRODUCT_META, SUB_PRODUCT } from "./ancillaryConstants";
import { getAncillarySteps } from "./ancillarySteps";

export default function FEFlow({ FlowRenderer, ...flowProps }) {
  return (
    <FlowRenderer
      {...flowProps}
      product={SUB_PRODUCT.FE}
      productMeta={ANCILLARY_PRODUCT_META[SUB_PRODUCT.FE]}
      steps={getAncillarySteps(SUB_PRODUCT.FE)}
    />
  );
}
