# Theme Audit

Phase 1 inventory captured before theme implementation on branch `feature/terminal-dark-mode`. Scope: every `src/**/*.{js,jsx,css,mjs,cjs,ts,tsx}` file. Counts are lexical and intentionally broad so Phase 3 can resweep rather than miss a risky color usage.

## Summary Counts

| Category | Count |
| --- | --- |
| Hex colors | 1101 |
| Functional colors (`rgb`/`rgba`/`hsl`/`color-mix`) | 1527 |
| CSS variable color usages | 2870 |
| Named color words / values | 1145 |
| Tailwind-style color classes | 2212 |
| Inline style color keys | 3804 |
| Chart color prop candidates | 63 |
| Status semantic terms | 2657 |
| Left-border accent candidates | 46 |

## By Surface

| Surface | Files | Color hits | Status hits | Left-border hits |
| --- | --- | --- | --- | --- |
| styles.css | 1 | 6648 | 268 | 31 |
| components/(root) | 43 | 1705 | 675 | 0 |
| styles | 3 | 1367 | 110 | 4 |
| AgentTools.css | 1 | 1141 | 20 | 9 |
| SEPLookupTool.css | 1 | 885 | 11 | 2 |
| flows | 13 | 516 | 165 | 0 |
| data | 16 | 154 | 351 | 0 |
| components/sep | 6 | 142 | 17 | 0 |
| App.jsx | 1 | 88 | 35 | 0 |
| components/leftRail | 4 | 15 | 23 | 0 |
| lib | 16 | 14 | 190 | 0 |
| compliance | 15 | 11 | 149 | 0 |
| components/medsup | 3 | 9 | 25 | 0 |
| main.jsx | 1 | 8 | 2 | 0 |
| context | 9 | 7 | 100 | 0 |
| components/copilot | 3 | 5 | 16 | 0 |
| components/ancillary | 5 | 3 | 66 | 0 |
| hooks | 18 | 3 | 401 | 0 |
| components/aca | 1 | 1 | 0 | 0 |
| services | 2 | 0 | 22 | 0 |
| stores | 1 | 0 | 6 | 0 |
| workers | 1 | 0 | 5 | 0 |

## Per-File Color Inventory

| File | Total | Hex | Functional | Vars | Named | Tailwind | Inline style keys | Chart props | Left-border |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| src/styles.css | 6648 | 446 | 901 | 1476 | 667 | 1240 | 1918 | 0 | 31 |
| src/styles/v3-overrides.css | 1197 | 4 | 24 | 453 | 103 | 257 | 356 | 0 | 4 |
| src/AgentTools.css | 1141 | 77 | 71 | 299 | 85 | 283 | 326 | 0 | 9 |
| src/SEPLookupTool.css | 885 | 31 | 137 | 205 | 36 | 217 | 259 | 0 | 2 |
| src/components/LandingPage.css | 376 | 15 | 46 | 105 | 35 | 77 | 98 | 0 | 0 |
| src/components/CarrierRef.jsx | 276 | 47 | 48 | 52 | 2 | 0 | 120 | 7 | 0 |
| src/flows/ancillary/AncillaryFlow.jsx | 194 | 18 | 34 | 35 | 20 | 8 | 76 | 3 | 0 |
| src/components/SEPGuide2026.jsx | 144 | 37 | 37 | 14 | 1 | 0 | 52 | 3 | 0 |
| src/styles/design-tokens.css | 144 | 30 | 0 | 40 | 40 | 33 | 1 | 0 | 0 |
| src/components/ComplianceDashboard.jsx | 140 | 49 | 18 | 9 | 4 | 1 | 49 | 10 | 0 |
| src/components/ScriptEditor.css | 140 | 2 | 0 | 60 | 5 | 30 | 43 | 0 | 0 |
| src/flows/aca/ACAFlow.jsx | 138 | 31 | 35 | 4 | 7 | 0 | 61 | 0 | 0 |
| src/components/ACAIntelligence.jsx | 113 | 36 | 17 | 10 | 0 | 1 | 45 | 4 | 0 |
| src/App.jsx | 88 | 28 | 5 | 5 | 8 | 0 | 38 | 4 | 0 |
| src/components/MedSupFlow.jsx | 80 | 15 | 26 | 3 | 6 | 0 | 30 | 0 | 0 |
| src/flows/aca/StateACAFlow.jsx | 78 | 15 | 25 | 3 | 0 | 0 | 35 | 0 | 0 |
| src/components/FplCalculatorPanel.jsx | 75 | 21 | 15 | 5 | 0 | 1 | 33 | 0 | 0 |
| src/flows/u65/U65Flow.jsx | 68 | 13 | 22 | 3 | 0 | 0 | 30 | 0 | 0 |
| src/components/SEPResultsModal.css | 57 | 6 | 12 | 7 | 3 | 9 | 20 | 0 | 0 |
| src/components/AgentTools.jsx | 47 | 20 | 0 | 0 | 0 | 1 | 12 | 14 | 0 |
| src/components/sep/SEPCard.jsx | 46 | 6 | 0 | 11 | 1 | 12 | 12 | 4 | 0 |
| src/components/ComplianceMini.jsx | 43 | 19 | 5 | 1 | 0 | 0 | 17 | 1 | 0 |
| src/components/SessionSummary.jsx | 43 | 1 | 0 | 0 | 40 | 0 | 2 | 0 | 0 |
| src/components/CallHistory.jsx | 42 | 16 | 7 | 7 | 0 | 0 | 12 | 0 | 0 |
| src/components/OperationsTab.jsx | 37 | 8 | 0 | 2 | 18 | 0 | 4 | 5 | 0 |
| src/components/sep/StateMap.jsx | 34 | 6 | 10 | 2 | 0 | 0 | 12 | 4 | 0 |
| src/data/complianceKnowledge.js | 29 | 5 | 10 | 0 | 4 | 0 | 10 | 0 | 0 |
| src/flows/aca/ACAScript.jsx | 28 | 3 | 2 | 7 | 0 | 1 | 15 | 0 | 0 |
| src/components/sep/PlanTable.jsx | 26 | 1 | 0 | 7 | 1 | 10 | 7 | 0 | 0 |
| src/styles/public-shell.css | 26 | 0 | 0 | 13 | 0 | 4 | 9 | 0 | 0 |
| src/components/MiniLiveTranscript.jsx | 23 | 9 | 3 | 3 | 4 | 0 | 3 | 1 | 0 |
| src/data/sepCarriers.js | 22 | 11 | 0 | 0 | 0 | 0 | 11 | 0 | 0 |
| src/data/acaComplianceKnowledge.js | 21 | 5 | 5 | 0 | 1 | 0 | 10 | 0 | 0 |
| src/data/medSupComplianceKnowledge.js | 20 | 5 | 5 | 0 | 0 | 0 | 10 | 0 | 0 |
| src/data/u65ComplianceKnowledge.js | 20 | 5 | 5 | 0 | 0 | 0 | 10 | 0 | 0 |
| src/components/CollapsibleWidget.jsx | 19 | 0 | 0 | 8 | 1 | 4 | 6 | 0 | 0 |
| src/components/sep/FemaFeed.jsx | 19 | 17 | 0 | 0 | 0 | 0 | 2 | 0 | 0 |
| src/components/sep/StatsBar.jsx | 17 | 0 | 0 | 7 | 4 | 3 | 3 | 0 | 0 |
| src/data/sepQualifierData.js | 17 | 7 | 0 | 0 | 0 | 3 | 7 | 0 | 0 |
| src/components/SEPLookup.jsx | 15 | 0 | 0 | 4 | 1 | 4 | 6 | 0 | 0 |
| src/data/stateCarrierData.js | 12 | 6 | 0 | 0 | 0 | 0 | 6 | 0 | 0 |
| src/components/CompactCopilotRail.jsx | 9 | 2 | 0 | 5 | 0 | 0 | 2 | 0 | 0 |
| src/data/stateSepData.js | 8 | 4 | 0 | 0 | 0 | 0 | 4 | 0 | 0 |
| src/main.jsx | 8 | 3 | 0 | 2 | 0 | 0 | 3 | 0 | 0 |
| src/components/medsup/MedSupSalesForumPanel.jsx | 7 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 0 |
| src/components/ScriptFlow.jsx | 7 | 4 | 0 | 2 | 0 | 0 | 1 | 0 | 0 |
| src/components/AgentAvailabilityToggle.jsx | 6 | 3 | 0 | 0 | 0 | 0 | 3 | 0 | 0 |
| src/context/TranscriptAnalyzer.js | 6 | 0 | 0 | 0 | 5 | 1 | 0 | 0 | 0 |
| src/lib/snpRouting.js | 6 | 3 | 0 | 0 | 0 | 0 | 3 | 0 | 0 |
| src/components/DailyVerse.jsx | 5 | 1 | 0 | 0 | 1 | 1 | 1 | 1 | 0 |
| src/components/leftRail/LeftRailManager.jsx | 5 | 1 | 0 | 0 | 1 | 0 | 1 | 2 | 0 |
| src/data/bibleReference.js | 5 | 0 | 0 | 0 | 2 | 3 | 0 | 0 | 0 |
| src/flows/ancillary/ancillaryConstants.js | 5 | 1 | 2 | 0 | 0 | 0 | 2 | 0 | 0 |
| src/compliance/intents/call-recording.js | 4 | 0 | 0 | 0 | 3 | 1 | 0 | 0 | 0 |
| src/components/ComplianceIntentAccordion.jsx | 4 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 |
| src/components/copilot/Waveform.jsx | 4 | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| src/components/leftRail/SEPQualifier.jsx | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| src/compliance/intents/impact-coverage.js | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| src/components/leftRail/ClientInfoCard.jsx | 3 | 0 | 0 | 0 | 1 | 0 | 2 | 0 | 0 |
| src/components/leftRail/PlanContextCard.jsx | 3 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 |
| src/components/ProgressDots.jsx | 3 | 0 | 0 | 0 | 1 | 0 | 2 | 0 | 0 |
| src/flows/ancillary/ancillarySteps.js | 3 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| src/lib/transcriptIngestion.js | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| src/components/ancillary/MOHRiderBundle.jsx | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| src/flows/u65/U65Script.jsx | 2 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| src/lib/acaBenchmarkLookup.js | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| src/compliance/engine/IntentClassifier.js | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/compliance/intents/annuity.js | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| src/compliance/intents/call-opening.js | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| src/compliance/intents/sales-conduct.js | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/components/aca/AcaClientSidebar.jsx | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/components/ancillary/AncillaryClientSidebar.jsx | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/components/copilot/CrossSellTrigger.jsx | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/components/medsup/HDPGComboAnalysis.jsx | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/components/medsup/RateComparisonPanel.jsx | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/components/ShellTextures.jsx | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/context/ComplianceScorer.js | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/hooks/useCopilotEngine.js | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/hooks/useKnowledge.js | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| src/hooks/useSubscription.js | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| src/lib/embeddings.js | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| src/lib/sepCms.js | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| src/lib/sepGeo.js | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |

## Status Semantic Inventory

Files below contain state language that must be mapped to the terminal semantic colors in Phase 3: green for live/active/connected/compliant/passing/available/positive, red for offline/disconnected/failed/auto-fail/unavailable/error/negative, amber for pending/in-progress/warning/awaiting action. Status UI must include a dot or badge plus text, not color alone.

| File | Status term hits |
| --- | --- |
| src/styles.css | 268 |
| src/data/stateCarrierData.js | 185 |
| src/components/OperationsTab.jsx | 108 |
| src/styles/v3-overrides.css | 103 |
| src/hooks/useCopilotEngine.js | 65 |
| src/components/AgentToolsProductQuiz.jsx | 59 |
| src/hooks/useU65CopilotEngine.js | 53 |
| src/lib/sepCms.js | 46 |
| src/data/u65ComplianceKnowledge.js | 44 |
| src/hooks/useMedSupCopilotEngine.js | 42 |
| src/components/TenantSettings.jsx | 41 |
| src/hooks/useAcaCopilotEngine.js | 41 |
| src/components/DailyVerse.jsx | 39 |
| src/lib/snpRouting.js | 39 |
| src/components/ancillary/carrierReferencePopupData.jsx | 37 |
| src/App.jsx | 35 |
| src/compliance/engine/ScorecardGenerator.js | 34 |
| src/flows/ancillary/AncillaryFlow.jsx | 33 |
| src/components/BillingSettings.jsx | 28 |
| src/components/ScriptFlow.jsx | 28 |
| src/context/TranscriptAnalyzer.js | 28 |
| src/hooks/useCustomerAudio.js | 28 |
| src/components/LandingPage.css | 27 |
| src/context/ComplianceScorer.js | 26 |
| src/data/medSupComplianceKnowledge.js | 26 |
| src/components/ComplianceMini.jsx | 25 |
| src/flows/aca/ACAData.js | 25 |
| src/flows/aca/StateACAFlow.jsx | 25 |
| src/hooks/useSessionTracker.js | 25 |
| src/data/complianceKnowledge.js | 24 |
| src/flows/aca/ACAFlow.jsx | 23 |
| src/hooks/useSEPLookup.js | 23 |
| src/lib/postCallPipeline.js | 23 |
| src/components/AgentAvailabilityToggle.jsx | 22 |
| src/components/TranscriptUpload.jsx | 22 |
| src/compliance/intents/call-opening.js | 21 |
| src/AgentTools.css | 20 |
| src/components/ACAIntelligence.jsx | 20 |
| src/components/ScriptEditor.jsx | 20 |
| src/context/CopilotCmsKnowledge.js | 20 |
| src/components/SessionSummary.jsx | 19 |
| src/hooks/useFollowUps.js | 18 |
| src/components/medsup/MedSupSalesForumPanel.jsx | 17 |
| src/components/MedSupFlow.jsx | 17 |
| src/data/privatePlans.js | 17 |
| src/flows/u65/U65Data.js | 17 |
| src/hooks/useTenantConfig.js | 17 |
| src/compliance/intents/eligibility.js | 16 |
| src/components/Onboarding.jsx | 16 |
| src/components/SectionWrapUp.jsx | 16 |
| src/components/SharedUI.jsx | 16 |
| src/flows/u65/U65Flow.jsx | 16 |
| src/hooks/useSubscription.js | 16 |
| src/components/CarrierRef.jsx | 15 |
| src/components/SEPFinder.jsx | 15 |
| src/components/ComplianceDashboard.jsx | 14 |
| src/components/leftRail/SEPQualifier.jsx | 14 |
| src/hooks/useCallInsights.js | 14 |
| src/components/sep/FemaFeed.jsx | 13 |
| src/hooks/useCopilotEngineCore.js | 13 |
| src/hooks/useKnowledge.js | 13 |
| src/hooks/useScriptTemplate.js | 13 |
| src/lib/transcriptSearch.js | 13 |
| src/compliance/engine/ScoringEngine.js | 12 |
| src/compliance/intents/sales-conduct.js | 12 |
| src/components/AgentTools.jsx | 12 |
| src/data/acaComplianceKnowledge.js | 12 |
| src/services/salesForumReferenceService.js | 12 |
| src/compliance/intents/needs-assessment.js | 11 |
| src/components/ancillary/ancillaryPopupData.js | 11 |
| src/components/ancillary/MOHRiderBundle.jsx | 11 |
| src/components/SEPGuide2026.jsx | 11 |
| src/components/SEPResultsPanel.jsx | 11 |
| src/components/UnderwritingChecker.jsx | 11 |
| src/flows/ancillary/ancillarySteps.js | 11 |
| src/hooks/useAgentCoaching.js | 11 |
| src/SEPLookupTool.css | 11 |
| src/compliance/intents/plan-presentation.js | 10 |
| src/components/ComplianceIntentAccordion.jsx | 10 |
| src/components/SEPLookup.jsx | 10 |
| src/context/MedSupScript.js | 10 |
| src/data/defaultScriptTemplates.js | 10 |
| src/lib/sepEngine.js | 10 |
| src/services/rateQuoteService.js | 10 |
| src/compliance/intents/call-recording.js | 9 |
| src/components/copilot/CrossSellTrigger.jsx | 9 |
| src/lib/sepBulletins.js | 9 |
| src/lib/transcriptIngestion.js | 9 |
| src/components/CallHistory.jsx | 8 |
| src/components/MiniLiveTranscript.jsx | 8 |
| src/context/SEPScript.js | 8 |
| src/data/stateSepData.js | 8 |
| src/lib/acaBenchmarkLookup.js | 8 |
| src/lib/acaPlanLookup.js | 8 |
| src/compliance/intents/impact-coverage.js | 7 |
| src/components/ancillary/AncillaryPopupManager.jsx | 7 |
| src/components/leftRail/PlanContextCard.jsx | 7 |
| src/components/medsup/RateComparisonPanel.jsx | 7 |
| src/styles/design-tokens.css | 7 |
| src/data/bibleReference.js | 6 |
| src/flows/aca/ACAScript.jsx | 6 |
| src/flows/aca/StateACAData.js | 6 |
| src/hooks/useSpeechRecognition.js | 6 |
| src/lib/sessionTrackingDiagnostic.js | 6 |
| src/stores/callStore.js | 6 |
| src/compliance/engine/IntentClassifier.js | 5 |
| src/compliance/prompts/intent-classification.js | 5 |
| src/components/CenterTimerBar.jsx | 5 |
| src/components/copilot/Waveform.jsx | 5 |
| src/data/sepCarriers.js | 5 |
| src/data/sepQualifierData.js | 5 |
| src/lib/embeddings.js | 5 |
| src/lib/sepFema.js | 5 |
| src/workers/compliance.worker.js | 5 |
| src/components/ProgressDots.jsx | 4 |
| src/components/SEPResultsModal.jsx | 4 |
| src/lib/sepLiveNews.js | 4 |
| src/components/PanelIdleSpinner.jsx | 3 |
| src/context/CopilotTranscriptLog.jsx | 3 |
| src/data/sepFemaDb.js | 3 |
| src/lib/bibliaApi.js | 3 |
| src/compliance/intents/annuity.js | 2 |
| src/compliance/intents/enrollment-closing.js | 2 |
| src/compliance/intents/pecl.js | 2 |
| src/components/copilot/CallTimer.jsx | 2 |
| src/components/PrivatePlanPanel.jsx | 2 |
| src/components/ScriptEditor.css | 2 |
| src/components/ScriptPrompter.jsx | 2 |
| src/components/ScriptSection.jsx | 2 |
| src/components/sep/SEPCard.jsx | 2 |
| src/context/MedSupContext.jsx | 2 |
| src/context/ScriptContext.jsx | 2 |
| src/data/carrierReference.js | 2 |
| src/data/snpRoutingData.js | 2 |
| src/hooks/useComplianceScoringWorker.js | 2 |
| src/lib/supabase.js | 2 |
| src/main.jsx | 2 |
| src/compliance/intents/soa-verification.js | 1 |
| src/components/CarrierQuickRef.jsx | 1 |
| src/components/CompactCopilotRail.jsx | 1 |
| src/components/leftRail/ClientInfoCard.jsx | 1 |
| src/components/leftRail/LeftRailManager.jsx | 1 |
| src/components/medsup/HDPGComboAnalysis.jsx | 1 |
| src/components/SectionSNP.jsx | 1 |
| src/components/sep/CountyGrid.jsx | 1 |
| src/components/sep/StatsBar.jsx | 1 |
| src/context/LiveCallContext.jsx | 1 |
| src/data/sepPlanDb.js | 1 |
| src/data/verseThemes.js | 1 |
| src/flows/aca/ACAContext.jsx | 1 |
| src/flows/ancillary/ancillaryConstants.js | 1 |
| src/flows/u65/U65Context.jsx | 1 |
| src/hooks/useMergedTranscript.js | 1 |

## Most Frequent Color Tokens / Values

| Token / value | Count |
| --- | --- |
| color: | 1933 |
| background: | 1155 |
| border: | 637 |
| border-radius | 460 |
| text-transform | 300 |
| border-color | 281 |
| transparent | 231 |
| var(--font-body) | 231 |
| var(--font-mono) | 188 |
| red | 161 |
| green | 151 |
| amber | 149 |
| white | 134 |
| var(--eg-surface-1) | 122 |
| border-bottom | 119 |
| text-muted | 116 |
| var(--text-muted) | 115 |
| var(--eg-border) | 106 |
| text-primary | 102 |
| var(--text-primary) | 101 |
| cyan | 95 |
| var(--eg-font-mono) | 85 |
| text-align | 84 |
| yellow | 78 |
| var(--eg-surface-2) | 77 |
| border-subtle | 72 |
| var(--border-subtle) | 71 |
| var(--font-display) | 70 |
| border-top | 61 |
| var(--ops-border) | 60 |
| var(--eg-text) | 55 |
| var(--eg-surface-3) | 54 |
| blue | 51 |
| border-right | 51 |
| text-secondary | 51 |
| var(--text-secondary) | 50 |
| rgba(255, 255, 255, 0.06) | 49 |
| text-faint | 47 |
| border-left | 46 |
| #E8002D | 45 |
| rgba(255, 255, 255, 0.08) | 45 |
| var(--eg-text-faint) | 44 |
| var(--eg-transition-fast) | 41 |
| text-mid | 40 |
| text-dim | 39 |
| var(--eg-text-mid) | 39 |
| var(--eg-font-body) | 38 |
| var(--eg-radius-md) | 38 |
| var(--eg-text-dim) | 38 |
| rgba(255, 255, 255, 0.03) | 36 |
| shadow-btn | 35 |
| #f4b24d | 33 |
| #ffffff | 33 |
| var(--ops-bg) | 32 |
| var(--ops-yellow) | 32 |
| #34d399 | 30 |
| rgba(255, 255, 255, 0.02) | 30 |
| var(--eg-base) | 30 |
| var(--ops-cyan) | 30 |
| bg-soft | 28 |
| stroke: | 28 |
| text-overflow | 28 |
| var(--eg-green) | 28 |
| gold | 27 |
| #d98b45 | 26 |
| rgba(255, 255, 255, 0.04) | 26 |
| text-shadow | 26 |
| var(--eg-accent) | 26 |
| var(--ops-amber) | 26 |
| var(--ops-white) | 26 |
| var(--rail-term-border) | 26 |
| border-box | 25 |
| color= | 24 |
| #f0f6fc | 23 |
| border-bright | 22 |
| var(--top-bar-height) | 22 |
| #33cc66 | 21 |
| #4a5568 | 21 |
| purple | 21 |
| var(--eg-radius-card) | 21 |

## Required Phase 3 Resweep Notes

- `src/styles/design-tokens.css` is the current single source of truth for the light design. Light token values must remain identical unless they are aliases to newly named semantic tokens.
- `src/styles.css`, `src/AgentTools.css`, `src/SEPLookupTool.css`, and `src/styles/v3-overrides.css` contain the highest concentration of hard-coded colors and legacy terminal-like selectors. They require the broadest resweep.
- `src/App.jsx`, `src/main.jsx`, and inline-heavy components such as `src/components/CarrierRef.jsx`, `src/components/CallHistory.jsx`, `src/components/ACAIntelligence.jsx`, and `src/components/DailyVerse.jsx` contain inline style colors that need token replacement or mode-aware helpers.
- Existing colored left-border accent candidates are inventoried above and must be removed or converted to non-left-border treatments during Phase 3.
- No Tailwind configuration file was present in this checkout during audit; Phase 2 must add/wire semantic Tailwind tokens only if Tailwind is introduced or configured locally.
- Ambiguous business/domain color strings from broad named-color scans, such as carrier names containing color words, should be left as content and not themed.

## Phase 5 QA Resweep

### Raw Color Resweep

- `src/**/*.{js,jsx,ts,tsx}`: no remaining raw color literals or Tailwind color utility matches after resweep.
- `index.html`: retains two pre-React `theme-color` literals (`#171411`, `#000000`) so the FOUC prevention script can set the browser chrome before CSS and React are available.
- CSS raw color counts after resweep:
  - `src/styles.css`: 1421
  - `src/styles/design-tokens.css`: 169
  - `src/styles/v3-overrides.css`: 28
  - `src/AgentTools.css`: 150
  - `src/SEPLookupTool.css`: 176
  - `src/components/LandingPage.css`: 64
- The CSS counts above are intentionally not zero. `styles.css`, `AgentTools.css`, `SEPLookupTool.css`, and `LandingPage.css` preserve legacy/light-mode source styling so the current light design remains unchanged. Terminal dark mode is applied through semantic tokens and `html.dark` override layers.
- `src/styles/design-tokens.css` necessarily retains raw values because it defines the light and terminal token maps.
- `src/styles/v3-overrides.css` retains a small number of literals for legacy compatibility selectors and mode-specific generated backdrop/override behavior.

### Ambiguous Or Risky Color Roles

- Legacy CSS with dense historical terminal styling was not mechanically rewritten in place because doing so would risk changing light-mode pixels. Dark mode coverage is enforced through layered terminal overrides.
- Carrier/product content that contains color words remains treated as business content, not theme color usage.
- User-provided docs assets `docs/SL-072622-51930-14.jpg` and `docs/amberenrollgenlogo.png` were not included after follow-up direction changed to a generated grayscale grid and original logo.

### Status Semantics Checked

- Live, active, connected, available, compliant, passing, positive, and healthy states map to green token semantics with text labels/dots or badges.
- Offline, disconnected, failed, unavailable, auto-fail, negative, and error states map to red token semantics with text labels/dots or badges.
- Pending, in-progress, warning, awaiting action, incomplete, and review states map to amber token semantics with text labels/dots or badges.
- Color-only status treatments were replaced or covered by dot/badge plus visible label patterns in the active UI surfaces.

### Screen And Component Checklist

- App shell, top nav, sidebars, theme toggle, Clerk-mounted auth surfaces: checked in light and terminal dark token paths.
- Co-Pilot panel, compact rail, live transcript, customer/agent audio waveforms, script prompter, and center timer bar: checked in light and terminal dark token paths.
- MA, Med Sup, ACA, U65, and ancillary script flows: checked in light and terminal dark token paths.
- SEP Finder, SEP Qualifier, SNP routing, county/state cards, and SEP result panels: checked in light and terminal dark token paths.
- Agent Tools panel, carrier references, popups, quick notes, and modal overlays: checked in light and terminal dark token paths.
- Operations/Calls tab, call history, session summary, post-call pipeline, transcription panes, and upload flows: checked in light and terminal dark token paths.
- Compliance dashboard, 152-intent accordion/scoring UI, tenant settings, badges, tables, forms, empty states, loading states, tooltips, dropdowns, toasts, and scrollbars: checked in light and terminal dark token paths.
- Charts and numeric/data-heavy surfaces use terminal token colors, dark grid/axis/tooltip styling, and tabular/monospace numeric treatment where already supported by the surface.

### Verification

- `npm run build` passed after terminal dark-mode work and again after the live audio waveform update.
- Light-mode token values were kept as aliases to the existing warm brown/earth design values.
- No colored left-border accent bars were introduced; terminal dark overrides remove the known left-accent treatments on covered surfaces.
