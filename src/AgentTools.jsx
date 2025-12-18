export default function AgentTools() {
  return (
    <div className="agent-tools">
      <h3>🛠️ Agent Tools</h3>

      {/* CORE ENROLLMENT PERIODS */}
      <section>
        <h4>🗓️ Core Medicare Enrollment Periods</h4>
        <ul>
          <li>
            <strong>AEP</strong> (Oct 15 – Dec 7): Change, drop, or enroll in
            Medicare Advantage
          </li>
          <li>
            <strong>OEP</strong> (Jan 1 – Mar 31): One MA plan change or drop to
            Original Medicare
          </li>
          <li>
            <strong>IEP</strong>: 7-month window around 65th birthday for
            first-time enrollment
          </li>
        </ul>
      </section>

      {/* SPECIAL ENROLLMENT PERIODS */}
      <section>
        <h4>🔁 Medicare Advantage Special Enrollment Periods (SEPs)</h4>

        <h5>Moving / Location</h5>
        <ul>
          <li>Permanent Move: New MA plan options available</li>
          <li>Plan Not Offered in Area: Switch to available plan</li>
        </ul>

        <h5>Plan / Coverage Issues</h5>
        <ul>
          <li>Plan Terminated: Enroll in a new MA plan</li>
          <li>CMS Sanction SEP: Leave poor-performing plan</li>
          <li>Plan Contract Violation: Change due to carrier error</li>
        </ul>

        <h5>Medicaid / Extra Help</h5>
        <ul>
          <li>Gain Medicaid: Switch MA anytime</li>
          <li>Lose Medicaid: 3-month SEP</li>
          <li>Gain Extra Help (LIS): One change per quarter (Q1–Q3)</li>
          <li>Lose Extra Help: 3-month SEP</li>
        </ul>

        <h5>Institutional</h5>
        <ul>
          <li>Enter Nursing Home / LTC: Change MA anytime</li>
          <li>Leave Facility: 2-month SEP after discharge</li>
        </ul>

        <h5>Life Events</h5>
        <ul>
          <li>Marriage: SEP if coverage impacted</li>
          <li>Divorce: SEP if coverage lost</li>
          <li>Death of Household Member: SEP if coverage affected</li>
        </ul>

        <h5>Employer Coverage</h5>
        <ul>
          <li>Lose Employer Coverage: 2-month SEP</li>
          <li>Employer Plan Ends: Enroll in MA</li>
        </ul>

        <h5>5-Star SEP</h5>
        <ul>
          <li>5-Star Plan Available: One switch per year (Dec–Nov)</li>
        </ul>

        <h5>Dual / Chronic Eligibility</h5>
        <ul>
          <li>Eligible for C-SNP: Enroll if condition qualifies</li>
          <li>Eligible for D-SNP: Enroll with Medicaid status</li>
        </ul>

        <h5>Administrative / Misc</h5>
        <ul>
          <li>Medicare Error or Misinformation: CMS-granted SEP</li>
          <li>Return from Incarceration: SEP upon release</li>
          <li>FEMA Disaster SEP: Extended enrollment window</li>
        </ul>
      </section>

      {/* DISASTER SEP TRACKER */}
      <section>
        <h4>🌪️ Disaster SEP Tracker</h4>

        <p>
          <strong>National Disaster References</strong>
        </p>
        <ul>
          <li>
            FEMA Disaster Declarations:{" "}
            <a
              href="https://www.fema.gov/disaster/declarations"
              target="_blank"
              rel="noreferrer"
            >
              https://www.fema.gov/disaster/declarations
            </a>
          </li>
          <li>
            DST Disaster SEP Tracker:{" "}
            <a
              href="https://dst.bobbybrockinsurance.com/"
              target="_blank"
              rel="noreferrer"
            >
              https://dst.bobbybrockinsurance.com/
            </a>
          </li>
        </ul>

        <p>
          <strong>How to Find Disaster / Weather SEP Lists by Carrier</strong>
        </p>

        <h5>Aetna</h5>
        <ul>
          <li>Log in to Producer World</li>
          <li>
            Scroll down and click Individual Medicare under the News heading
          </li>
          <li>On Producer News page, click the Individual Medicare tab</li>
          <li>Click SEP Announcements</li>
          <li>Select month and state from the menu</li>
        </ul>

        <h5>Anthem</h5>
        <ul>
          <li>Log in to Producer Toolbox</li>
          <li>Scroll to Medicare Quick Links (right side)</li>
          <li>Click Broker Connect</li>
          <li>Click Communications in the top toolbar</li>
          <li>Scroll to Updated SEP Disaster Declaration List</li>
          <li>Click Learn More to download the Excel file</li>
        </ul>

        <h5>Cigna</h5>
        <ul>
          <li>Log in to Cigna for Brokers</li>
          <li>Scroll to Tools and click Medicare Producers University</li>
          <li>Click Resource Center</li>
          <li>Select Agent Communications</li>
          <li>Open Ongoing SEPs, Disaster, and Emergency Declarations</li>
          <li>Click Ongoing SEP Tracker to download the Excel file</li>
        </ul>

        <h5>Devoted</h5>
        <ul>
          <li>Log in to Devoted Agent Portal</li>
          <li>Scroll to Sales Tools on the home page</li>
          <li>Click View Active SEP List</li>
          <li>A PDF will open with current SEPs</li>
        </ul>

        <h5>Humana</h5>
        <ul>
          <li>Log in to Vantage</li>
          <li>Scroll to Additional Resources (right side)</li>
          <li>Click SEP for Individuals Affected by a Disaster or Emergency</li>
          <li>A PDF will open showing SEPs by state</li>
        </ul>

        <h5>WellCare (Centene)</h5>
        <ul>
          <li>Log in to the Broker Portal</li>
          <li>Click Centene Workbench</li>
          <li>Under Quick Links, click Broker Quick Links</li>
          <li>Scroll to Application & Enrollment Resources</li>
          <li>Under Special Election Periods, click Active SEPs</li>
          <li>A new window will open with current SEPs</li>
        </ul>

        <h5>UnitedHealthcare (UHC)</h5>
        <ul>
          <li>Log in to Jarvis</li>
          <li>Type SEP into the search bar</li>
          <li>Select State SEP Information</li>
          <li>An Excel file will download with available SEPs</li>
        </ul>

        <p>
          <em></em>
        </p>
      </section>

      {/* QUICK LINKS */}
      <section>
        <h4>🔗 Quick Agent References</h4>
        <ul>
          <section>
            <h4>Medicaid Income Limits by State</h4>

            <p>
              Useful national references:
              <br />•{" "}
              <a
                href="https://www.medicaidplanningassistance.org/medicaid-eligibility-income-chart/"
                target="_blank"
                rel="noreferrer"
              >
                Medicaid Eligibility Income Chart
              </a>
              <br />•{" "}
              <a
                href="https://www.kff.org/affordable-care-act/state-indicator/medicaid-income-eligibility-limits-for-adults-as-a-percent-of-the-federal-poverty-level/?currentTimeframe=0&sortModel=%7B%22colId%22:%22Location%22,%22sort%22:%22asc%22%7D"
                target="_blank"
                rel="noreferrer"
              >
                KFF Medicaid Income Eligibility (FPL %)
              </a>
            </p>

            <div style={{ overflowX: "auto" }}>
              <table border="1" cellPadding="8" cellSpacing="0" width="100%">
                {/* …your table head & rows here… */}
              </table>
            </div>
          </section>

          <li>D-SNP Eligibility Rules</li>
          <section>
            <h4>D-SNP Core Requirements</h4>

            <ul>
              <li>
                <strong>Medicare Enrollment:</strong> You must be enrolled in
                both Medicare Part A (Hospital Insurance) and Part B (Medical
                Insurance).
              </li>

              <li>
                <strong>Medicaid Eligibility:</strong> You must qualify for your
                state’s Medicaid program. This may be full Medicaid or partial
                assistance through a Medicare Savings Program (QMB, SLMB, QI, or
                other MSP).
              </li>

              <li>
                <strong>Location:</strong> You must live in the service area
                where the specific D-SNP plan is offered.
              </li>
            </ul>
          </section>
        </ul>
      </section>
    </div>
  );
}
