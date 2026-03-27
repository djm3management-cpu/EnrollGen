import { memo, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

const ANCILLARY_PRODUCTS = [
  {
    id: "hospital-indemnity",
    title: "Hospital Indemnity",
    buttonLabel: "Hospital Indemnity",
    consentScript:
      '"Before we end the call, I want to be very clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare. Your Medicare Advantage enrollment is complete and will not change. This is a separate, optional insurance product that provides cash benefits directly to you. Would it be okay if I briefly explain how it works?"',
    detailScript: `"This is called hospital indemnity insurance.
It does not replace Medicare and it does not pay doctors or hospitals.
If you are admitted to the hospital for a covered stay, it pays a fixed cash benefit directly to you.
That money can be used however you choose, such as deductibles, copays, prescriptions, rent, or household expenses.
Coverage, benefit amounts, and eligibility depend on the policy terms."`,
    discussedLabel: "Hospital indemnity explained (non-Medicare)",
  },
  {
    id: "dental-vision",
    title: "Dental & Vision",
    buttonLabel: "Dental & Vision",
    consentScript: `"Before we finish, I want to be clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare.
Your Medicare Advantage enrollment is complete and will not change.
This is a separate, optional dental and vision insurance product.
Would it be okay if I briefly explain how it works?"`,
    detailScript: `"This dental and vision coverage is separate from Medicare.
It may help with routine dental and vision expenses such as exams, cleanings, fillings, glasses, or contacts, depending on the plan selected. Coverage details, limitations, and waiting periods depend on the policy terms."`,
    discussedLabel: "Dental & vision explained (non-Medicare)",
  },
  {
    id: "final-expense",
    title: "Final Expense",
    buttonLabel: "Final Expense",
    consentScript: `"Before we finish, I want to be very clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare. Your Medicare Advantage enrollment is complete and will not change.
This is a separate, optional life insurance product often referred to as final expense coverage.
Would it be okay if I briefly explain how it works?"`,
    detailScript: `"Final expense insurance is a form of life insurance.
It is designed to provide a cash benefit to a beneficiary when you pass away.
That money can be used for funeral costs, medical bills, or other end-of-life expenses.
Coverage amounts, premiums, and underwriting requirements depend on the policy selected."`,
    discussedLabel: "Final expense explained (non-Medicare)",
  },
];

const AncillaryFlowWidget = memo(function AncillaryFlowWidget() {
  const [activeProductId, setActiveProductId] = useState(null);
  const [consentOk, setConsentOk] = useState(false);
  const [discussedOk, setDiscussedOk] = useState(false);

  const activeProduct = useMemo(
    () =>
      ANCILLARY_PRODUCTS.find((product) => product.id === activeProductId) ||
      null,
    [activeProductId]
  );

  const handleSelectProduct = (productId) => {
    setActiveProductId(productId);
    setConsentOk(false);
    setDiscussedOk(false);
  };

  const handleReset = () => {
    setActiveProductId(null);
    setConsentOk(false);
    setDiscussedOk(false);
  };

  const currentStep = discussedOk ? 3 : consentOk ? 2 : 1;
  const widgetStyle = activeProduct ? { height: "324px", minHeight: "324px" } : undefined;

  return (
    <div
      className={`ancillary-widget ${
        activeProduct ? "ancillary-widget--active" : "ancillary-widget--picker"
      }`}
      style={widgetStyle}
    >
      {!activeProduct ? (
        <>
          <p className="ancillary-helper">
            Choose one optional ancillary product and run through the flow one
            at a time.
          </p>
          <div className="ancillary-product-list">
            {ANCILLARY_PRODUCTS.map((product) => (
              <button
                key={product.id}
                type="button"
                className="ancillary-product-btn"
                onClick={() => handleSelectProduct(product.id)}
              >
                {product.buttonLabel}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="ancillary-flow-header">
            <button
              type="button"
              className="ancillary-refresh-btn"
              onClick={handleReset}
              title="Refresh ancillary flow"
              aria-label="Refresh ancillary flow"
            >
              <RotateCcw size={11} />
            </button>
          </div>

          <div className="ancillary-step">
            {currentStep === 1 ? (
              <>
                <div className="ancillary-script-card">
                  {activeProduct.consentScript}
                </div>
                <label className="ancillary-check ancillary-check--progress">
                  <input
                    type="checkbox"
                    aria-label="Go to next ancillary step"
                    checked={consentOk}
                    onChange={(e) => {
                      const nextValue = e.target.checked;
                      setConsentOk(nextValue);
                      if (!nextValue) {
                        setDiscussedOk(false);
                      }
                    }}
                  />
                </label>
              </>
            ) : null}

            {currentStep === 2 ? (
              <>
                <div className="ancillary-script-card">
                  {activeProduct.detailScript}
                </div>
                <label className="ancillary-check">
                  <input
                    type="checkbox"
                    aria-label={`Mark ${activeProduct.title} as explained`}
                    checked={discussedOk}
                    onChange={(e) => setDiscussedOk(e.target.checked)}
                  />
                </label>
              </>
            ) : null}

            {currentStep === 3 ? (
              <div className="ancillary-status">
                Flow complete. Hit refresh to reset it for the next product.
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
});

export default AncillaryFlowWidget;
