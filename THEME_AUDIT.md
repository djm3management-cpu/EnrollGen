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

# Visual refresh audit — 2026-10-30

Formula1 is the geometric display face. No Adobe kit is present in index.html; production Mac/Windows font availability is unverified. Terminal defaults and preference persistence already exist. This inventory includes excluded surfaces; matches are candidates, not authorization to alter protected content.

## Raw colors
```text
src/AgentTools.css:75: border-color: rgba(255, 179, 0, 0.35);
src/AgentTools.css:76: box-shadow: inset 0 0 6px rgba(255, 179, 0, 0.08);
src/AgentTools.css:156: box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
src/AgentTools.css:239: background: rgba(0, 0, 0, 0.72);
src/AgentTools.css:252: linear-gradient(180deg, rgba(22, 22, 22, 0.98) 0%, rgba(13, 13, 13, 0.99) 100%);
src/AgentTools.css:254: 0 24px 60px rgba(0, 0, 0, 0.48),
src/AgentTools.css:255: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/AgentTools.css:437: color: #c78dff;
src/AgentTools.css:472: border-color: rgba(255, 179, 0, 0.35);
src/AgentTools.css:473: box-shadow: inset 0 0 6px rgba(255, 179, 0, 0.08);
src/AgentTools.css:482: border: 1px solid rgba(0, 209, 102, 0.18);
src/AgentTools.css:483: background: rgba(0, 209, 102, 0.04);
src/AgentTools.css:509: color: #cfd5df;
src/AgentTools.css:515: background: rgba(255, 255, 255, 0.03);
src/AgentTools.css:537: background: rgba(255, 255, 255, 0.02);
src/AgentTools.css:575: background: rgba(255, 255, 255, 0.02);
src/AgentTools.css:635: color: #cfd5df;
src/AgentTools.css:657: background: rgba(255, 255, 255, 0.02);
src/AgentTools.css:676: border: 1px solid rgba(255, 179, 0, 0.2);
src/AgentTools.css:677: background: rgba(255, 179, 0, 0.06);
src/AgentTools.css:684: color: #cfd5df;
src/AgentTools.css:695: border-bottom: 1px solid rgba(232, 55, 44, 0.1);
src/AgentTools.css:696: background: rgba(232, 55, 44, 0.04);
src/AgentTools.css:737: color: #cfd5df;
src/AgentTools.css:760: background: rgba(255, 255, 255, 0.025);
src/AgentTools.css:855: border-color: rgba(232, 0, 45, 0.3);
src/AgentTools.css:856: background: rgba(232, 0, 45, 0.06);
src/AgentTools.css:901: color: #cfd5df;
src/AgentTools.css:973: background: rgba(13, 13, 13, 0.85);
src/AgentTools.css:987: background: rgba(232, 0, 45, 0.14);
src/AgentTools.css:1034: color: #cfd5df;
src/AgentTools.css:1044: background: rgba(255, 255, 255, 0.02);
src/AgentTools.css:1045: color: #cfd5df;
src/AgentTools.css:1050: border-color: rgba(255, 68, 85, 0.16);
src/AgentTools.css:1095: border-color: rgba(232, 0, 45, 0.3);
src/AgentTools.css:1096: background: rgba(232, 0, 45, 0.06);
src/AgentTools.css:1108: background: rgba(232, 0, 45, 0.12);
src/AgentTools.css:1119: box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
src/AgentTools.css:1217: color: #cdd3dc;
src/AgentTools.css:1244: color: #dce1e7;
src/AgentTools.css:1256: background: rgba(255, 255, 255, 0.02);
src/AgentTools.css:1261: background: rgba(232, 0, 45, 0.04);
src/AgentTools.css:1266: background: rgba(255, 215, 0, 0.04);
src/AgentTools.css:1271: background: rgba(255, 68, 85, 0.04);
src/AgentTools.css:1295: color: #d7dde5;
src/AgentTools.css:1342: color: #d7dde5;
src/AgentTools.css:1373: background: rgba(255, 255, 255, 0.03);
src/AgentTools.css:1383: color: #d3d9e1;
src/AgentTools.css:1395: background: rgba(255, 215, 0, 0.14);
src/AgentTools.css:1396: color: #fff3db;
src/AgentTools.css:1421: background: linear-gradient(180deg, var(--bg-card) 0%, rgba(17, 17, 17, 0.92) 100%);
src/AgentTools.css:1567: color: rgba(240, 246, 252, 0.4);
src/AgentTools.css:1575: border: 1px solid rgba(255, 255, 255, 0.08);
src/AgentTools.css:1577: background: rgba(255, 255, 255, 0.03);
src/AgentTools.css:1578: color: #f0f6fc;
src/AgentTools.css:1587: color: rgba(240, 246, 252, 0.3);
src/AgentTools.css:1591: border-color: rgba(255, 255, 255, 0.18);
src/AgentTools.css:1592: box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
src/AgentTools.css:1607: border: 1px solid rgba(255, 255, 255, 0.08);
src/AgentTools.css:1609: background: rgba(255, 255, 255, 0.04);
src/AgentTools.css:1610: color: rgba(240, 246, 252, 0.72);
src/AgentTools.css:1621: background: rgba(255, 255, 255, 0.08);
src/AgentTools.css:1622: color: #f0f6fc;
src/AgentTools.css:1626: border-color: rgba(96, 165, 250, 0.5);
src/AgentTools.css:1627: background: rgba(96, 165, 250, 0.14);
src/AgentTools.css:1628: color: #93c5fd;
src/AgentTools.css:1634: border: 1px dashed rgba(255, 255, 255, 0.08);
src/AgentTools.css:1635: background: rgba(255, 255, 255, 0.02);
src/AgentTools.css:1636: color: rgba(240, 246, 252, 0.6);
src/AgentTools.css:1653: border: 1px solid rgba(255, 255, 255, 0.06);
src/AgentTools.css:1656: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/AgentTools.css:1657: box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
src/AgentTools.css:1668: color: #f0f6fc;
src/AgentTools.css:1688: background: rgba(96, 165, 250, 0.16);
src/AgentTools.css:1689: color: #93c5fd;
src/AgentTools.css:1704: color: rgba(240, 246, 252, 0.45);
src/AgentTools.css:1713: color: #c9d1d9;
src/AgentTools.css:1731: background: rgba(255, 255, 255, 0.03);
src/AgentTools.css:1757: color: #f0f6fc;
src/AgentTools.css:1769: background: rgba(255, 255, 255, 0.06);
src/AgentTools.css:1770: color: rgba(240, 246, 252, 0.78);
src/AgentTools.css:1779: color: rgba(240, 246, 252, 0.45);
src/AgentTools.css:1791: color: #c9d1d9;
src/AgentTools.css:1807: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/AgentTools.css:1822: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/AgentTools.css:1830: border: 1px solid rgba(255, 255, 255, 0.08);
src/AgentTools.css:1832: background: rgba(255, 255, 255, 0.04);
src/AgentTools.css:1833: color: rgba(240, 246, 252, 0.78);
src/AgentTools.css:1844: border-color: rgba(96, 165, 250, 0.5);
src/AgentTools.css:1845: color: #93c5fd;
src/AgentTools.css:1846: background: rgba(96, 165, 250, 0.1);
src/AgentTools.css:1869: border-bottom: 1px solid #4d2d00 !important;
src/AgentTools.css:1886: border-left: 1px solid #4d2d00 !important;
src/AgentTools.css:1897: background: #d98b45 !important;
src/AgentTools.css:1985: background: rgba(0, 0, 0, 0.86) !important;
src/AgentTools.css:1994: color: var(--rail-term-amber, #d98b45);
src/AgentTools.css:2005: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2012: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2019: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2027: border: 1px solid var(--rail-term-border-bright, #2a2a2a) !important;
src/AgentTools.css:2029: color: var(--rail-term-yellow, #f4b24d) !important;
src/AgentTools.css:2034: background: var(--rail-term-hover, #0b376f) !important;
src/AgentTools.css:2035: color: var(--rail-term-white, #ffffff) !important;
src/AgentTools.css:2067: color: var(--rail-term-amber, #d98b45);
src/AgentTools.css:2074: background: var(--rail-term-hover, #0b376f);
src/AgentTools.css:2085: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2097: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2107: color: var(--rail-term-amber-bright, #f2a35b);
src/AgentTools.css:2125: border: 1px solid var(--rail-term-border-bright, #2a2a2a);
src/AgentTools.css:2127: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2135: border-color: var(--rail-term-blue-bright, #2f86c7);
src/AgentTools.css:2136: background: var(--rail-term-hover, #0b376f);
src/AgentTools.css:2137: color: var(--rail-term-white, #ffffff);
src/AgentTools.css:2144: color: var(--rail-term-amber, #d98b45);
src/AgentTools.css:2171: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2181: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2196: background: var(--rail-term-green, #33cc66);
src/AgentTools.css:2216: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2236: color: var(--rail-term-amber, #d98b45);
src/AgentTools.css:2245: border-color: var(--rail-term-blue-bright, #2f86c7);
src/AgentTools.css:2246: background: var(--rail-term-hover, #0b376f);
src/AgentTools.css:2247: color: var(--rail-term-white, #ffffff);
src/AgentTools.css:2261: border: 1px solid var(--rail-term-border-bright, #2a2a2a);
src/AgentTools.css:2263: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2270: color: var(--rail-term-muted, #555555);
src/AgentTools.css:2275: border-color: var(--rail-term-green, #33cc66);
src/AgentTools.css:2276: background: rgba(51, 204, 102, 0.08);
src/AgentTools.css:2277: color: var(--rail-term-green, #33cc66);
src/AgentTools.css:2281: border-color: var(--rail-term-red, #ff3838);
src/AgentTools.css:2282: background: rgba(255, 56, 56, 0.08);
src/AgentTools.css:2283: color: var(--rail-term-red, #ff3838);
src/AgentTools.css:2294: border-color: var(--rail-term-green, #33cc66);
src/AgentTools.css:2298: border-color: var(--rail-term-red, #ff3838);
src/AgentTools.css:2316: color: var(--rail-term-green, #33cc66);
src/AgentTools.css:2321: color: var(--rail-term-red, #ff3838);
src/AgentTools.css:2326: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2334: color: var(--rail-term-amber, #d98b45);
src/AgentTools.css:2348: border: 1px solid var(--rail-term-border-bright, #2a2a2a);
src/AgentTools.css:2350: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2362: border-color: var(--rail-term-blue-bright, #2f86c7);
src/AgentTools.css:2363: background: var(--rail-term-hover, #0b376f);
src/AgentTools.css:2364: color: var(--rail-term-white, #ffffff);
src/AgentTools.css:2382: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2388: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2400: color: var(--rail-term-cyan, #69a7c8);
src/AgentTools.css:2427: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2446: color: var(--rail-term-yellow, #f4b24d);
src/AgentTools.css:2460: color: var(--rail-term-green, #33cc66);
src/SEPLookupTool.css:29: border: 1px solid rgba(173, 173, 173, 0.14);
src/SEPLookupTool.css:58: border: 1px solid rgba(173, 173, 173, 0.18) !important;
src/SEPLookupTool.css:59: border-top: 1px solid rgba(173, 173, 173, 0.18) !important;
src/SEPLookupTool.css:60: color: #e4e7ec !important;
src/SEPLookupTool.css:67: border: 1px solid rgba(173, 173, 173, 0.22) !important;
src/SEPLookupTool.css:68: border-top: 1px solid rgba(173, 173, 173, 0.22) !important;
src/SEPLookupTool.css:69: color: #ffffff !important;
src/SEPLookupTool.css:106: color: #E8002D;
src/SEPLookupTool.css:107: border-color: rgba(232, 0, 45, 0.3);
src/SEPLookupTool.css:127: background: linear-gradient(180deg, rgba(24, 24, 24, 0.28) 0%, var(--eg-surface-2) 100%);
src/SEPLookupTool.css:145: rgba(255, 255, 255, 0.03) 0%,
src/SEPLookupTool.css:152: border-color: rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:155: rgba(248, 113, 113, 0.04) 0%,
src/SEPLookupTool.css:189: border: 1px solid rgba(255, 255, 255, 0.05) !important;
src/SEPLookupTool.css:190: border-top-color: rgba(255, 255, 255, 0.08) !important;
src/SEPLookupTool.css:215: color: #e7edf5;
src/SEPLookupTool.css:224: border: 1px solid rgba(255, 255, 255, 0.05) !important;
src/SEPLookupTool.css:225: border-top-color: rgba(255, 255, 255, 0.08) !important;
src/SEPLookupTool.css:293: background: rgba(173, 173, 173, 0.06);
src/SEPLookupTool.css:294: border: 1px solid rgba(173, 173, 173, 0.15);
src/SEPLookupTool.css:309: background: linear-gradient(180deg, rgba(18, 18, 18, 0.9) 0%, rgba(12, 12, 12, 0.9) 100%);
src/SEPLookupTool.css:312: border: 1px solid rgba(255, 255, 255, 0.05);
src/SEPLookupTool.css:346: color: #E8002D;
src/SEPLookupTool.css:347: background: rgba(232, 0, 45, 0.08);
src/SEPLookupTool.css:348: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:359: background: rgba(251, 191, 36, 0.1);
src/SEPLookupTool.css:360: border: 1px solid rgba(251, 191, 36, 0.15);
src/SEPLookupTool.css:377: color: #E8002D;
src/SEPLookupTool.css:378: background: rgba(232, 0, 45, 0.10);
src/SEPLookupTool.css:379: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:382: color: #ADADAD;
src/SEPLookupTool.css:383: background: rgba(173, 173, 173, 0.10);
src/SEPLookupTool.css:384: border: 1px solid rgba(173, 173, 173, 0.2);
src/SEPLookupTool.css:388: background: rgba(251, 191, 36, 0.12);
src/SEPLookupTool.css:389: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:393: background: rgba(248, 113, 113, 0.12);
src/SEPLookupTool.css:394: border: 1px solid rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:398: background: rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:399: border: 1px solid rgba(232, 0, 45, 0.25);
src/SEPLookupTool.css:403: background: rgba(173, 173, 173, 0.15);
src/SEPLookupTool.css:404: border: 1px solid rgba(173, 173, 173, 0.25);
src/SEPLookupTool.css:408: background: rgba(251, 191, 36, 0.15);
src/SEPLookupTool.css:409: border: 1px solid rgba(251, 191, 36, 0.25);
src/SEPLookupTool.css:415: background: linear-gradient(180deg, rgba(24, 24, 24, 0.28) 0%, var(--eg-surface-2) 40%, var(--eg-surface-1) 100%);
src/SEPLookupTool.css:434: rgba(255, 255, 255, 0.03) 0%,
src/SEPLookupTool.css:446: border-color: rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:450: border-color: rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:466: background: rgba(232, 0, 45, 0.02);
src/SEPLookupTool.css:498: background: rgba(248, 113, 113, 0.08);
src/SEPLookupTool.css:500: border: 1px solid rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:503: background: rgba(251, 191, 36, 0.08);
src/SEPLookupTool.css:505: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:508: background: rgba(52, 211, 153, 0.08);
src/SEPLookupTool.css:510: border: 1px solid rgba(52, 211, 153, 0.2);
src/SEPLookupTool.css:513: background: rgba(232, 0, 45, 0.06);
src/SEPLookupTool.css:515: border: 1px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:530: background: rgba(248, 113, 113, 0.06);
src/SEPLookupTool.css:532: border: 1px solid rgba(248, 113, 113, 0.15);
src/SEPLookupTool.css:535: background: rgba(232, 0, 45, 0.06);
src/SEPLookupTool.css:537: border: 1px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:551: background: rgba(248, 113, 113, 0.1);
src/SEPLookupTool.css:553: border: 1px solid rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:556: background: rgba(251, 191, 36, 0.1);
src/SEPLookupTool.css:558: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:561: background: rgba(232, 0, 45, 0.06);
src/SEPLookupTool.css:610: border-color: rgba(248, 113, 113, 0.3) !important;
src/SEPLookupTool.css:613: rgba(248, 113, 113, 0.06) 0%,
src/SEPLookupTool.css:633: background: linear-gradient(180deg, rgba(24, 24, 24, 0.28) 0%, var(--eg-surface-2) 100%);
src/SEPLookupTool.css:648: background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
src/SEPLookupTool.css:691: background: rgba(232, 0, 45, 0.03);
src/SEPLookupTool.css:720: color: #00D166;
src/SEPLookupTool.css:721: background: rgba(0, 209, 102, 0.10);
src/SEPLookupTool.css:722: border: 1px solid rgba(0, 209, 102, 0.2);
src/SEPLookupTool.css:726: color: #fbbf24;
src/SEPLookupTool.css:727: background: rgba(251, 191, 36, 0.12);
src/SEPLookupTool.css:728: border: 1px solid rgba(251, 191, 36, 0.22);
src/SEPLookupTool.css:740: border: 3px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:741: border-top-color: #E8002D;
src/SEPLookupTool.css:751: border: 2.5px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:752: border-top-color: #E8002D;
src/SEPLookupTool.css:770: background: linear-gradient(180deg, rgba(24, 24, 24, 0.28) 0%, var(--eg-surface-2) 100%);
src/SEPLookupTool.css:822: color: #E8002D;
src/SEPLookupTool.css:823: background: rgba(232, 0, 45, 0.1);
src/SEPLookupTool.css:824: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:850: color: #E8002D;
src/SEPLookupTool.css:851: border-color: rgba(232, 0, 45, 0.3);
src/SEPLookupTool.css:867: border: 1px solid rgba(255, 255, 255, 0.06);
src/SEPLookupTool.css:869: background: linear-gradient(145deg, rgba(36, 36, 40, 0.96) 0%, rgba(16, 16, 18, 0.98) 100%);
src/SEPLookupTool.css:871: 14px 14px 28px rgba(0, 0, 0, 0.42),
src/SEPLookupTool.css:872: -10px -10px 22px rgba(255, 255, 255, 0.03),
src/SEPLookupTool.css:873: inset 1px 1px 0 rgba(255, 255, 255, 0.06),
src/SEPLookupTool.css:874: inset -1px -1px 0 rgba(0, 0, 0, 0.55);
src/SEPLookupTool.css:882: color: #8f949e;
src/SEPLookupTool.css:894: color: #d7dbe3;
src/SEPLookupTool.css:898: color: #f5f7fb;
src/SEPLookupTool.css:900: border: 1px solid rgba(255, 255, 255, 0.06);
src/SEPLookupTool.css:902: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0) 28%),
src/SEPLookupTool.css:903: linear-gradient(145deg, rgba(24, 24, 29, 0.99) 0%, rgba(32, 32, 37, 0.98) 52%, rgba(44, 44, 50, 0.96) 100%);
src/SEPLookupTool.css:905: inset 8px 8px 16px rgba(0, 0, 0, 0.40),
src/SEPLookupTool.css:906: inset -5px -5px 12px rgba(255, 255, 255, 0.028),
src/SEPLookupTool.css:907: inset 1px 1px 0 rgba(255, 255, 255, 0.035),
src/SEPLookupTool.css:908: 0 1px 0 rgba(255, 255, 255, 0.02);
src/SEPLookupTool.css:918: border: 1px dashed rgba(251, 191, 36, 0.25);
src/SEPLookupTool.css:919: background: rgba(251, 191, 36, 0.03);
src/SEPLookupTool.css:945: background: linear-gradient(180deg, rgba(24, 24, 24, 0.28) 0%, var(--eg-surface-2) 100%);
src/SEPLookupTool.css:973: background: rgba(232, 0, 45, 0.08);
src/SEPLookupTool.css:974: border: 1px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:1020: background: rgba(255, 255, 255, 0.08);
src/SEPLookupTool.css:1042: background: rgba(232, 0, 45, 0.06);
src/SEPLookupTool.css:1043: border-color: rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1049: background: rgba(232, 0, 45, 0.12);
src/SEPLookupTool.css:1050: border-color: rgba(232, 0, 45, 0.35);
src/SEPLookupTool.css:1051: color: #fff;
src/SEPLookupTool.css:1052: box-shadow: 0 0 12px rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:1068: color: rgba(232, 0, 45, 0.8);
src/SEPLookupTool.css:1115: background: rgba(232, 0, 45, 0.03);
src/SEPLookupTool.css:1149: background: linear-gradient(180deg, rgba(24, 24, 24, 0.28) 0%, var(--eg-surface-2) 100%);
src/SEPLookupTool.css:1199: background: rgba(255, 255, 255, 0.015);
src/SEPLookupTool.css:1200: border-bottom: 1px solid rgba(255, 255, 255, 0.03);
src/SEPLookupTool.css:1215: color: rgba(255, 255, 255, 0.3);
src/SEPLookupTool.css:1216: background: linear-gradient(145deg, rgba(30, 30, 34, 0.6) 0%, rgba(20, 20, 24, 0.8) 100%);
src/SEPLookupTool.css:1221: 3px 3px 6px rgba(0, 0, 0, 0.35),
src/SEPLookupTool.css:1222: -2px -2px 4px rgba(255, 255, 255, 0.025),
src/SEPLookupTool.css:1223: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/SEPLookupTool.css:1228: color: rgba(255, 255, 255, 0.5);
src/SEPLookupTool.css:1229: background: linear-gradient(145deg, rgba(35, 35, 40, 0.7) 0%, rgba(22, 22, 26, 0.85) 100%);
src/SEPLookupTool.css:1233: color: #fff;
src/SEPLookupTool.css:1234: background: linear-gradient(145deg, rgba(249, 115, 22, 0.25) 0%, rgba(249, 115, 22, 0.12) 100%);
src/SEPLookupTool.css:1236: inset 2px 2px 5px rgba(0, 0, 0, 0.3),
src/SEPLookupTool.css:1237: inset -1px -1px 3px rgba(249, 115, 22, 0.06),
src/SEPLookupTool.css:1238: 0 0 8px rgba(249, 115, 22, 0.1),
src/SEPLookupTool.css:1239: 0 1px 0 rgba(255, 255, 255, 0.03);
src/SEPLookupTool.css:1261: background: rgba(255, 255, 255, 0.08);
src/SEPLookupTool.css:1290: border: 2.5px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1291: border-top-color: #E8002D;
src/SEPLookupTool.css:1334: color: #E8002D;
src/SEPLookupTool.css:1362: background: #00D166;
src/SEPLookupTool.css:1363: box-shadow: 0 0 6px rgba(0, 209, 102, 0.4);
src/SEPLookupTool.css:1367: background: #fbbf24;
src/SEPLookupTool.css:1368: box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
src/SEPLookupTool.css:1389: color: #E8002D;
src/SEPLookupTool.css:1390: background: rgba(232, 0, 45, 0.1);
src/SEPLookupTool.css:1391: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1411: border-color: rgba(173, 173, 173, 0.2);
src/SEPLookupTool.css:1415: border-left: 2px solid rgba(232, 0, 45, 0.5);
src/SEPLookupTool.css:1419: border-left: 2px solid rgba(251, 191, 36, 0.4);
src/SEPLookupTool.css:1437: background: rgba(232, 0, 45, 0.02);
src/SEPLookupTool.css:1460: color: #E8002D;
src/SEPLookupTool.css:1461: background: rgba(232, 0, 45, 0.1);
src/SEPLookupTool.css:1462: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1467: background: rgba(251, 191, 36, 0.1);
src/SEPLookupTool.css:1468: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:1522: color: #E8002D;
src/SEPLookupTool.css:1523: background: rgba(232, 0, 45, 0.1);
src/SEPLookupTool.css:1524: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1534: color: #E8002D;
src/SEPLookupTool.css:1571: color: #E8002D;
src/SEPLookupTool.css:1572: background: rgba(232, 0, 45, 0.1);
src/SEPLookupTool.css:1573: border-color: rgba(232, 0, 45, 0.22);
src/SEPLookupTool.css:1577: color: #cbd5e1;
src/SEPLookupTool.css:1578: background: rgba(148, 163, 184, 0.08);
src/SEPLookupTool.css:1579: border-color: rgba(148, 163, 184, 0.18);
src/SEPLookupTool.css:1583: color: #fbbf24;
src/SEPLookupTool.css:1584: background: rgba(251, 191, 36, 0.08);
src/SEPLookupTool.css:1585: border-color: rgba(251, 191, 36, 0.18);
src/SEPLookupTool.css:1607: color: #E8002D;
src/SEPLookupTool.css:1633: color: #E8002D;
src/SEPLookupTool.css:1634: border-color: rgba(232, 0, 45, 0.3);
src/components/AgentDashboard.jsx:51: enrolled: '#22c55e',
src/components/AgentDashboard.jsx:52: partial_enrollment: '#16a34a',
src/components/AgentDashboard.jsx:53: callback_scheduled: '#38bdf8',
src/components/AgentDashboard.jsx:54: interested_needs_info: '#60a5fa',
src/components/AgentDashboard.jsx:55: spouse_poa_callback: '#818cf8',
src/components/AgentDashboard.jsx:56: transferred: '#06b6d4',
src/components/AgentDashboard.jsx:57: application_in_progress: '#0ea5e9',
src/components/AgentDashboard.jsx:58: not_interested: '#ef4444',
src/components/AgentDashboard.jsx:59: not_qualified: '#dc2626',
src/components/AgentDashboard.jsx:60: already_enrolled_elsewhere: '#f87171',
src/components/AgentDashboard.jsx:61: customer_hung_up: '#b91c1c',
src/components/AgentDashboard.jsx:62: do_not_call: '#991b1b',
src/components/AgentDashboard.jsx:63: requested_removal: '#fb7185',
src/components/AgentDashboard.jsx:64: no_answer: '#f97316',
src/components/AgentDashboard.jsx:65: voicemail_left: '#3b82f6',
src/components/AgentDashboard.jsx:66: wrong_number: '#64748b',
src/components/AgentDashboard.jsx:67: bad_lead_data: '#78716c',
src/components/AgentDashboard.jsx:68: language_barrier: '#a78bfa',
src/components/AgentDashboard.jsx:69: mentally_unfit: '#c084fc',
src/components/AgentDashboard.jsx:70: possible_cognitive_impairment: '#a855f7',
src/components/AgentDashboard.jsx:71: third_party_needed: '#8b5cf6',
src/components/AgentDashboard.jsx:72: hostile_caller: '#e11d48',
src/components/AgentDashboard.jsx:73: suspected_fraud: '#7c3aed',
src/components/AgentDashboard.jsx:74: dropped_call: '#f59e0b',
src/components/AgentDashboard.jsx:75: test_call: '#94a3b8',
src/components/AgentDashboard.jsx:76: duplicate_lead: '#a3a3a3',
src/components/AgentDashboard.jsx:77: not_enrolled: '#fb923c',
src/components/AgentDashboard.jsx:78: incomplete: '#d97706',
src/components/AgentDashboard.jsx:80: connected: '#e879f9',
src/components/AgentDashboard.jsx:81: voicemail: '#3b82f6',
src/components/AgentDashboard.jsx:82: missed: '#ef4444',
src/components/AgentDashboard.jsx:83: declined: '#f87171',
src/components/AgentDashboard.jsx:84: unknown: '#737373',
src/components/LandingPage.css:14: linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
src/components/LandingPage.css:15: linear-gradient(90deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px),
src/components/LandingPage.css:38: linear-gradient(180deg, rgba(17, 17, 17, 0.96), rgba(5, 5, 5, 0.96));
src/components/LandingPage.css:39: border-bottom: 1px solid rgba(255, 255, 255, 0.12);
src/components/LandingPage.css:40: box-shadow: inset 0 -1px 0 rgba(232, 0, 45, 0.18);
src/components/LandingPage.css:74: color: #ffffff;
src/components/LandingPage.css:117: color: #ffffff;
src/components/LandingPage.css:118: background: linear-gradient(180deg, #ff2448 0%, #e8002d 48%, #8f001b 100%);
src/components/LandingPage.css:119: border: 1px solid rgba(255, 255, 255, 0.16);
src/components/LandingPage.css:160: background: rgba(0, 0, 0, 0.4);
src/components/LandingPage.css:183: color: rgba(255, 255, 255, 0.88);
src/components/LandingPage.css:185: linear-gradient(180deg, rgba(18, 18, 18, 0.88), rgba(4, 4, 4, 0.88));
src/components/LandingPage.css:186: border: 1px solid rgba(245, 158, 11, 0.6);
src/components/LandingPage.css:199: background: rgba(245, 158, 11, 0.82);
src/components/LandingPage.css:200: box-shadow: 0 0 14px rgba(245, 158, 11, 0.38);
src/components/LandingPage.css:226: color: #ffffff;
src/components/LandingPage.css:256: background: rgba(8, 8, 8, 0.84);
src/components/LandingPage.css:257: border: 1px solid rgba(255, 255, 255, 0.12);
src/components/LandingPage.css:263: border-color: rgba(255, 255, 255, 0.24);
src/components/LandingPage.css:272: background: rgba(10, 10, 10, 0.85);
src/components/LandingPage.css:273: border: 1px solid rgba(245, 158, 11, 0.3);
src/components/LandingPage.css:287: border-bottom: 1px solid rgba(245, 158, 11, 0.18);
src/components/LandingPage.css:297: color: rgba(255, 255, 255, 0.68);
src/components/LandingPage.css:304: color: rgba(0, 255, 157, 0.6);
src/components/LandingPage.css:312: background: rgba(0, 255, 157, 0.6);
src/components/LandingPage.css:313: box-shadow: 0 0 12px rgba(0, 255, 157, 0.36);
src/components/LandingPage.css:334: border-bottom: 1px solid rgba(255, 255, 255, 0.11);
src/components/LandingPage.css:342: color: #f3f4f6;
src/components/LandingPage.css:366: color: #d1d5db;
src/components/LandingPage.css:367: background: rgba(0, 0, 0, 0.22);
src/components/LandingPage.css:368: border: 1px solid rgba(255, 255, 255, 0.09);
src/components/LandingPage.css:377: color: #ffffff;
src/components/LandingPage.css:391: background: rgba(0, 255, 157, 0.6);
src/components/LandingPage.css:392: box-shadow: 0 0 12px rgba(0, 255, 157, 0.38);
src/components/LandingPage.css:396: background: rgba(234, 179, 8, 0.78);
src/components/LandingPage.css:397: box-shadow: 0 0 12px rgba(234, 179, 8, 0.36);
src/components/LandingPage.css:402: color: #d1d5db;
src/components/LandingPage.css:418: color: #d1d5db;
src/components/LandingPage.css:428: background: rgba(255, 255, 255, 0.08);
src/components/LandingPage.css:442: --progress-color: rgba(0, 255, 157, 0.6);
src/components/LandingPage.css:446: color: rgba(0, 255, 157, 0.6);
src/components/LandingPage.css:451: --progress-color: rgba(234, 179, 8, 0.78);
src/components/LandingPage.css:455: color: rgba(234, 179, 8, 0.9);
src/components/LandingPage.css:460: --progress-color: rgba(156, 163, 175, 0.42);
src/components/LandingPage.css:465: color: #6b7280;
src/components/LandingPage.css:481: background: rgba(10, 10, 10, 0.92);
src/components/LandingPage.css:482: border: 1px solid rgba(245, 158, 11, 0.3);
src/components/LandingPage.css:488: color: rgba(245, 158, 11, 0.9);
src/components/LandingPage.css:498: color: #ffffff;
src/components/LandingPage.css:513: border-top: 1px solid rgba(255, 255, 255, 0.08);
src/components/LandingPage.css:519: color: #ffffff;
src/components/LandingPage.css:594: background: rgba(30, 26, 22, 0.93) !important;
src/components/LandingPage.css:624: color: #fff !important;
src/components/LandingPage.css:941: background: linear-gradient(180deg, rgba(10, 8, 7, 0.86), rgba(10, 8, 7, 0)) !important;
src/components/LandingPage.css:988: rgba(218, 167, 109, 0.12) 0%,
src/components/LandingPage.css:989: rgba(20, 14, 9, 0.2) 38%,
src/components/LandingPage.css:990: rgba(5, 4, 3, 0.78) 100%
src/components/LandingPage.css:992: rgba(0, 0, 0, 0.34) !important;
src/components/LandingPage.css:1004: color: rgba(246, 238, 226, 0.9) !important;
src/components/opportunities/OpportunityDrawer.jsx:9: return <span className="contacts-chip opps-stage-badge" style={{ '--stage-color': stage?.color || '#a78bfa' }}>{name || stage?.name || 'Unknown stage'}</span>;
src/components/opportunities/PipelineSettings.jsx:23: const [stages, setStages] = useState(() => pipeline ? data.stages.filter((row) => row.pipeline_id === pipeline.id).map((row) => ({ ...row })) : [{ id: crypto.randomUUID(), name: 'New Lead', color: '#a78bfa', is_won: false, is_lost: false }]);
src/components/opportunities/PipelineSettings.jsx:61: <button type="button" className="contacts-mini-btn" onClick={() => setStages((rows) => [...rows, { id: crypto.randomUUID(), name: 'New Stage', color: '#a78bfa', is_won: false, is_lost: false }])}>+ ADD STAGE</button>
src/lib/opportunities.js:94: color: item[`${direction}_stage_color`] || current?.color || '#a78bfa' };
src/styles/design-tokens.css:9: --eg-base: #171411;
src/styles/design-tokens.css:10: --eg-surface-1: #1e1a16;
src/styles/design-tokens.css:11: --eg-surface-2: #262119;
src/styles/design-tokens.css:12: --eg-surface-3: #2e2820;
src/styles/design-tokens.css:13: --eg-surface-4: #382f25;
src/styles/design-tokens.css:16: --eg-border: #3d352b;
src/styles/design-tokens.css:17: --eg-border-hover: #564a3c;
src/styles/design-tokens.css:18: --eg-border-active: #7a6a56;
src/styles/design-tokens.css:21: --eg-text: #e4dace;
src/styles/design-tokens.css:22: --eg-text-mid: #b5a898;
src/styles/design-tokens.css:23: --eg-text-dim: #7d7060;
src/styles/design-tokens.css:24: --eg-text-faint: #524838;
src/styles/design-tokens.css:27: --eg-accent: #c08b55;
src/styles/design-tokens.css:28: --eg-accent-bright: #daa76d;
src/styles/design-tokens.css:29: --eg-accent-dim: #8a6338;
src/styles/design-tokens.css:32: --eg-green: #6aab7d;
src/styles/design-tokens.css:33: --eg-green-dim: #2d4a35;
src/styles/design-tokens.css:34: --eg-green-text: #a0d4ac;
src/styles/design-tokens.css:37: --eg-red: #b85c5c;
src/styles/design-tokens.css:38: --eg-red-dim: #4a2828;
src/styles/design-tokens.css:39: --eg-red-text: #e09898;
src/styles/design-tokens.css:42: --eg-blue: #5c88b8;
src/styles/design-tokens.css:43: --eg-blue-dim: #283a4a;
src/styles/design-tokens.css:44: --eg-blue-text: #98bce0;
src/styles/design-tokens.css:47: --eg-amber: #c49940;
src/styles/design-tokens.css:48: --eg-amber-dim: #4a3818;
src/styles/design-tokens.css:49: --eg-amber-text: #e0c080;
src/styles/design-tokens.css:52: --eg-purple: #8b6eb8;
src/styles/design-tokens.css:53: --eg-purple-dim: #352a4a;
src/styles/design-tokens.css:54: --eg-purple-text: #bca8e0;
src/styles/design-tokens.css:83: --status-live-bg: rgba(106, 171, 125, 0.08);
src/styles/design-tokens.css:84: --status-live-border: rgba(106, 171, 125, 0.27);
src/styles/design-tokens.css:86: --status-offline-bg: rgba(184, 92, 92, 0.08);
src/styles/design-tokens.css:87: --status-offline-border: rgba(184, 92, 92, 0.34);
src/styles/design-tokens.css:89: --status-pending-bg: rgba(196, 153, 64, 0.08);
src/styles/design-tokens.css:90: --status-pending-border: rgba(196, 153, 64, 0.32);
src/styles/design-tokens.css:97: --info-bg: rgba(92, 136, 184, 0.08);
src/styles/design-tokens.css:98: --info-border: rgba(92, 136, 184, 0.32);
src/styles/design-tokens.css:100: --selection-text: #171411;
src/styles/design-tokens.css:101: --button-primary-text: #ffffff;
src/styles/design-tokens.css:102: --overlay-backdrop: rgba(0, 0, 0, 0.72);
src/styles/design-tokens.css:103: --focus-glow: rgba(192, 139, 85, 0.16);
src/styles/design-tokens.css:104: --chart-track: rgba(255, 255, 255, 0.06);
src/styles/design-tokens.css:114: --score-a: #00D166;
src/styles/design-tokens.css:115: --score-b: #00B050;
src/styles/design-tokens.css:116: --score-c: #FFD700;
src/styles/design-tokens.css:117: --score-d: #FF8C00;
src/styles/design-tokens.css:118: --score-f: #E8002D;
src/styles/design-tokens.css:119: --score-a-bg: rgba(0, 209, 102, 0.16);
src/styles/design-tokens.css:120: --score-b-bg: rgba(0, 176, 80, 0.14);
src/styles/design-tokens.css:121: --score-c-bg: rgba(255, 215, 0, 0.15);
src/styles/design-tokens.css:122: --score-d-bg: rgba(255, 140, 0, 0.15);
src/styles/design-tokens.css:123: --score-f-bg: rgba(232, 0, 45, 0.15);
src/styles/design-tokens.css:124: --score-a-border: rgba(0, 209, 102, 0.2);
src/styles/design-tokens.css:125: --score-b-border: rgba(0, 176, 80, 0.2);
src/styles/design-tokens.css:126: --score-c-border: rgba(255, 215, 0, 0.22);
src/styles/design-tokens.css:127: --score-d-border: rgba(255, 140, 0, 0.22);
src/styles/design-tokens.css:128: --score-f-border: rgba(232, 0, 45, 0.25);
src/styles/design-tokens.css:129: --score-a-glow: rgba(0, 209, 102, 0.38);
src/styles/design-tokens.css:130: --score-b-glow: rgba(0, 176, 80, 0.34);
src/styles/design-tokens.css:131: --score-c-glow: rgba(255, 215, 0, 0.34);
src/styles/design-tokens.css:132: --score-d-glow: rgba(255, 140, 0, 0.34);
src/styles/design-tokens.css:133: --score-f-glow: rgba(232, 0, 45, 0.36);
src/styles/design-tokens.css:134: --flow-ma-border: rgba(184, 92, 92, 0.42);
src/styles/design-tokens.css:135: --flow-ma-bg: rgba(184, 92, 92, 0.08);
src/styles/design-tokens.css:136: --flow-aca-border: rgba(92, 136, 184, 0.42);
src/styles/design-tokens.css:137: --flow-aca-bg: rgba(92, 136, 184, 0.08);
src/styles/design-tokens.css:138: --flow-medsup-border: rgba(106, 171, 125, 0.42);
src/styles/design-tokens.css:139: --flow-medsup-bg: rgba(106, 171, 125, 0.08);
src/styles/design-tokens.css:140: --flow-u65-border: rgba(139, 110, 184, 0.42);
src/styles/design-tokens.css:141: --flow-u65-bg: rgba(139, 110, 184, 0.08);
src/styles/design-tokens.css:142: --flow-ancillary-border: rgba(196, 153, 64, 0.42);
src/styles/design-tokens.css:143: --flow-ancillary-bg: rgba(196, 153, 64, 0.08);
src/styles/design-tokens.css:149: --clay-surface: #38383d;
src/styles/design-tokens.css:150: --clay-surface-soft: #414146;
src/styles/design-tokens.css:151: --clay-border: rgba(255, 255, 255, 0.07);
src/styles/design-tokens.css:152: --clay-shadow-dark: rgba(0, 0, 0, 0.45);
src/styles/design-tokens.css:153: --clay-shadow-light: rgba(255, 255, 255, 0.05);
src/styles/design-tokens.css:158: --bubble-agent-bg: #0a84ff;
src/styles/design-tokens.css:159: --bubble-agent-text: #ffffff;
src/styles/design-tokens.css:160: --bubble-customer-bg: #e5e5ea;
src/styles/design-tokens.css:161: --bubble-customer-text: #1c1c1e;
src/styles/design-tokens.css:168: --phone-answer-bg: #22c55e;
src/styles/design-tokens.css:169: --phone-answer-bg-hover: #16a34a;
src/styles/design-tokens.css:170: --phone-decline-bg: #ef4444;
src/styles/design-tokens.css:171: --phone-decline-bg-hover: #dc2626;
src/styles/design-tokens.css:174: --phone-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
src/styles/design-tokens.css:263: --eg-base: #000000;
src/styles/design-tokens.css:264: --eg-surface-1: #0a0a0a;
src/styles/design-tokens.css:265: --eg-surface-2: #111111;
src/styles/design-tokens.css:266: --eg-surface-3: #151515;
src/styles/design-tokens.css:267: --eg-surface-4: #1c1c1c;
src/styles/design-tokens.css:270: --eg-border: #2a2a2a;
src/styles/design-tokens.css:271: --eg-border-hover: #333333;
src/styles/design-tokens.css:272: --eg-border-active: #ff9900;
src/styles/design-tokens.css:275: --eg-text: #e8e8e8;
src/styles/design-tokens.css:276: --eg-text-mid: #b8b8b8;
src/styles/design-tokens.css:277: --eg-text-dim: #8a8a8a;
src/styles/design-tokens.css:278: --eg-text-faint: #5c5c5c;
src/styles/design-tokens.css:281: --eg-accent: #ff9900;
src/styles/design-tokens.css:282: --eg-accent-bright: #ffb000;
src/styles/design-tokens.css:283: --eg-accent-dim: #4d2d00;
src/styles/design-tokens.css:286: --eg-green: #00d26a;
src/styles/design-tokens.css:287: --eg-green-dim: #003d20;
src/styles/design-tokens.css:288: --eg-green-text: #5cff9d;
src/styles/design-tokens.css:289: --eg-red: #ff3b30;
src/styles/design-tokens.css:290: --eg-red-dim: #4a0806;
src/styles/design-tokens.css:291: --eg-red-text: #ff8a82;
src/styles/design-tokens.css:292: --eg-blue: #3ec7ff;
src/styles/design-tokens.css:293: --eg-blue-dim: #062c3f;
src/styles/design-tokens.css:294: --eg-blue-text: #9be4ff;
src/styles/design-tokens.css:295: --eg-amber: #ff9900;
src/styles/design-tokens.css:296: --eg-amber-dim: #4d2d00;
src/styles/design-tokens.css:297: --eg-amber-text: #ffb84d;
src/styles/design-tokens.css:298: --eg-purple: #b889ff;
src/styles/design-tokens.css:299: --eg-purple-dim: #27124a;
src/styles/design-tokens.css:300: --eg-purple-text: #d7bdff;
src/styles/design-tokens.css:317: --bg-primary: #000000;
src/styles/design-tokens.css:318: --bg-surface: #0a0a0a;
src/styles/design-tokens.css:319: --bg-elevated: #111111;
src/styles/design-tokens.css:320: --text-primary: #e8e8e8;
src/styles/design-tokens.css:321: --text-secondary: #b8b8b8;
src/styles/design-tokens.css:322: --text-muted: #8a8a8a;
src/styles/design-tokens.css:323: --text-label: #ff9900;
src/styles/design-tokens.css:324: --border-default: #2a2a2a;
src/styles/design-tokens.css:325: --border-focus: #ff9900;
src/styles/design-tokens.css:326: --accent: #ff9900;
src/styles/design-tokens.css:327: --accent-hover: #ffb000;
src/styles/design-tokens.css:328: --status-live: #00d26a;
src/styles/design-tokens.css:329: --status-live-bg: rgba(0, 210, 106, 0.08);
src/styles/design-tokens.css:330: --status-live-border: rgba(0, 210, 106, 0.38);
src/styles/design-tokens.css:331: --status-offline: #ff3b30;
src/styles/design-tokens.css:332: --status-offline-bg: rgba(255, 59, 48, 0.08);
src/styles/design-tokens.css:333: --status-offline-border: rgba(255, 59, 48, 0.42);
src/styles/design-tokens.css:334: --status-pending: #ff9900;
src/styles/design-tokens.css:335: --status-pending-bg: rgba(255, 153, 0, 0.1);
src/styles/design-tokens.css:336: --status-pending-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:337: --success: #00d26a;
src/styles/design-tokens.css:338: --danger: #ff3b30;
src/styles/design-tokens.css:339: --warning: #ff9900;
src/styles/design-tokens.css:340: --info: #3ec7ff;
src/styles/design-tokens.css:343: --info-bg: rgba(62, 199, 255, 0.08);
src/styles/design-tokens.css:344: --info-border: rgba(62, 199, 255, 0.38);
src/styles/design-tokens.css:345: --selection-bg: #ff9900;
src/styles/design-tokens.css:346: --selection-text: #000000;
src/styles/design-tokens.css:347: --button-primary-text: #000000;
src/styles/design-tokens.css:348: --overlay-backdrop: rgba(0, 0, 0, 0.86);
src/styles/design-tokens.css:349: --focus-glow: rgba(255, 153, 0, 0.18);
src/styles/design-tokens.css:350: --chart-track: #222222;
src/styles/design-tokens.css:351: --chart-1: #ff9900;
src/styles/design-tokens.css:352: --chart-2: #e8e8e8;
src/styles/design-tokens.css:353: --chart-3: #3ec7ff;
src/styles/design-tokens.css:354: --chart-4: #b889ff;
src/styles/design-tokens.css:355: --chart-5: #00d26a;
src/styles/design-tokens.css:356: --chart-6: #ff3b30;
src/styles/design-tokens.css:357: --chart-grid: #222222;
src/styles/design-tokens.css:358: --chart-positive: #00d26a;
src/styles/design-tokens.css:359: --chart-negative: #ff3b30;
src/styles/design-tokens.css:360: --score-a: #00d26a;
src/styles/design-tokens.css:361: --score-b: #00d26a;
src/styles/design-tokens.css:362: --score-c: #ff9900;
src/styles/design-tokens.css:363: --score-d: #ff9900;
src/styles/design-tokens.css:364: --score-f: #ff3b30;
src/styles/design-tokens.css:365: --score-a-bg: rgba(0, 210, 106, 0.08);
src/styles/design-tokens.css:366: --score-b-bg: rgba(0, 210, 106, 0.08);
src/styles/design-tokens.css:367: --score-c-bg: rgba(255, 153, 0, 0.1);
src/styles/design-tokens.css:368: --score-d-bg: rgba(255, 153, 0, 0.1);
src/styles/design-tokens.css:369: --score-f-bg: rgba(255, 59, 48, 0.08);
src/styles/design-tokens.css:370: --score-a-border: rgba(0, 210, 106, 0.38);
src/styles/design-tokens.css:371: --score-b-border: rgba(0, 210, 106, 0.38);
src/styles/design-tokens.css:372: --score-c-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:373: --score-d-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:374: --score-f-border: rgba(255, 59, 48, 0.42);
src/styles/design-tokens.css:380: --flow-ma-border: rgba(255, 59, 48, 0.42);
src/styles/design-tokens.css:381: --flow-ma-bg: rgba(255, 59, 48, 0.08);
src/styles/design-tokens.css:382: --flow-aca-border: rgba(62, 199, 255, 0.42);
src/styles/design-tokens.css:383: --flow-aca-bg: rgba(62, 199, 255, 0.08);
src/styles/design-tokens.css:384: --flow-medsup-border: rgba(0, 210, 106, 0.42);
src/styles/design-tokens.css:385: --flow-medsup-bg: rgba(0, 210, 106, 0.08);
src/styles/design-tokens.css:386: --flow-u65-border: rgba(184, 137, 255, 0.42);
src/styles/design-tokens.css:387: --flow-u65-bg: rgba(184, 137, 255, 0.08);
src/styles/design-tokens.css:388: --flow-ancillary-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:389: --flow-ancillary-bg: rgba(255, 153, 0, 0.1);
src/styles/design-tokens.css:392: --clay-surface: #2b2b30;
src/styles/design-tokens.css:393: --clay-surface-soft: #323238;
src/styles/design-tokens.css:394: --clay-border: rgba(255, 255, 255, 0.055);
src/styles/design-tokens.css:395: --clay-shadow-dark: rgba(0, 0, 0, 0.55);
src/styles/design-tokens.css:396: --clay-shadow-light: rgba(255, 255, 255, 0.045);
src/styles/design-tokens.css:401: --bubble-agent-bg: #0a84ff;
src/styles/design-tokens.css:402: --bubble-agent-text: #ffffff;
src/styles/design-tokens.css:403: --bubble-customer-bg: #3a3a3d;
src/styles/design-tokens.css:404: --bubble-customer-text: #f2f2f7;
src/styles/design-tokens.css:407: --phone-panel-bg: #1a1a1a;
src/styles/design-tokens.css:408: --phone-border: #333333;
src/styles/design-tokens.css:410: --phone-body-text: #b8b8b8;
src/styles/design-tokens.css:411: --phone-answer-bg: #22c55e;
src/styles/design-tokens.css:412: --phone-answer-bg-hover: #16a34a;
src/styles/design-tokens.css:413: --phone-decline-bg: #ef4444;
src/styles/design-tokens.css:414: --phone-decline-bg-hover: #dc2626;
src/styles/design-tokens.css:417: --phone-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
src/styles/phone-dropdown.css:100: color: #ffffff;
src/styles/phone-dropdown.css:225: color: #ffffff;
src/styles/phone-dropdown.css:444: color: #ffffff;
src/styles/phone-dropdown.css:573: color: #ffffff;
src/styles/phone-dropdown.css:697: color: #ffffff;
src/styles/v3-overrides.css:34: background: rgba(30, 26, 22, 0.985) !important;
src/styles/v3-overrides.css:328: background: rgba(192, 139, 85, 0.07);
src/styles/v3-overrides.css:405: box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
src/styles/v3-overrides.css:588: color: #fff !important;
src/styles/v3-overrides.css:589: stroke: #fff !important;
src/styles/v3-overrides.css:625: border-color: rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:626: background: rgba(106, 171, 125, 0.08) !important;
src/styles/v3-overrides.css:631: border-color: rgba(184, 92, 92, 0.42) !important;
src/styles/v3-overrides.css:642: border-color: rgba(192, 139, 85, 0.42) !important;
src/styles/v3-overrides.css:1008: box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
src/styles/v3-overrides.css:1136: background: rgba(192, 139, 85, 0.08) !important;
src/styles/v3-overrides.css:1162: border: 1px solid rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:1163: background: rgba(106, 171, 125, 0.08) !important;
src/styles/v3-overrides.css:1380: border: 1px solid rgba(106, 171, 125, 0.42) !important;
src/styles/v3-overrides.css:1382: color: #fff !important;
src/styles/v3-overrides.css:1530: border: 1px solid rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:1531: background: rgba(106, 171, 125, 0.08) !important;
src/styles/v3-overrides.css:1689: background: rgba(192, 139, 85, 0.08);
src/styles/v3-overrides.css:1719: border-bottom: 1px solid rgba(61, 53, 43, 0.55);
src/styles/v3-overrides.css:1739: background: rgba(106, 171, 125, 0.15);
src/styles/v3-overrides.css:1842: border: 1px solid rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:1843: background: rgba(106, 171, 125, 0.08) !important;
src/styles/v3-overrides.css:1888: border-color: rgba(196, 153, 64, 0.42) !important;
src/styles/v3-overrides.css:1894: border-color: rgba(184, 92, 92, 0.42) !important;
src/styles/v3-overrides.css:2491: background: rgba(30, 26, 22, 0.27);
src/styles/v3-overrides.css:2532: box-shadow: 0 0 5px rgba(184, 92, 92, 0.42);
src/styles/v3-overrides.css:2538: box-shadow: 0 0 5px rgba(106, 171, 125, 0.46);
src/styles/v3-overrides.css:2561: box-shadow: 0 0 6px rgba(106, 171, 125, 0.55);
src/styles/v3-overrides.css:2604: color: #fff;
src/styles/v3-overrides.css:2798: background: rgba(255, 255, 255, 0.03);
src/styles/v3-overrides.css:3308: background: rgba(255, 153, 0, 0.09) !important;
src/styles/v3-overrides.css:3316: background: rgba(255, 153, 0, 0.09) !important;
src/styles/v3-overrides.css:3515: background: rgba(255, 153, 0, 0.09);
src/styles/v3-overrides.css:4192: background: var(--surface-raised, rgba(255, 153, 0, 0.06));
src/styles/v3-overrides.css:4223: box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
src/styles/v3-overrides.css:4727: background: var(--surface-raised, rgba(0, 0, 0, 0.85));
src/styles/v3-overrides.css:4835: background: var(--status-pending-bg, rgba(255, 153, 0, 0.12));
src/styles/v3-overrides.css:4869: background: var(--status-pending-bg, rgba(255, 153, 0, 0.18));
src/styles/v3-overrides.css:5007: background: var(--status-live-bg, rgba(0, 200, 83, 0.1));
src/styles/v3-overrides.css:5035: background: var(--status-live-bg, rgba(0, 200, 83, 0.1));
src/styles/v3-overrides.css:5383: background: var(--surface-raised, rgba(255, 153, 0, 0.05));
src/styles/v3-overrides.css:5520: background: var(--eg-bg, #000);
src/styles/v3-overrides.css:5523: box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
src/styles/v3-overrides.css:5529: background: var(--status-pending-bg, rgba(255, 153, 0, 0.12));
src/styles/v3-overrides.css:5603: background: rgba(0, 0, 0, 0.82);
src/styles/v3-overrides.css:5615: background: var(--surface-raised, #111);
src/styles/v3-overrides.css:5670: background: rgba(0, 0, 0, 0.82);
src/styles/v3-overrides.css:5682: background: var(--surface-raised, #111);
src/styles/v3-overrides.css:5945: background: rgba(255, 153, 0, 0.15);
src/styles/v3-overrides.css:6091: background: rgba(255, 255, 255, 0.025) !important;
src/styles/v3-overrides.css:6096: background: rgba(255, 153, 0, 0.08) !important;
src/styles/v3-overrides.css:6127: color: #fff !important;
src/styles/v3-overrides.css:6133: color: #fff !important;
src/styles/v3-overrides.css:6139: color: #000 !important;
src/styles/v3-overrides.css:6140: stroke: #000 !important;
src/styles.css:139: border-color: rgba(106, 171, 125, 0.27);
src/styles.css:140: background: rgba(106, 171, 125, 0.08);
src/styles.css:276: border-color: rgba(184, 92, 92, 0.34);
src/styles.css:286: border-color: rgba(106, 171, 125, 0.27);
src/styles.css:287: background: rgba(106, 171, 125, 0.08);
src/styles.css:292: border-color: rgba(196, 153, 64, 0.32);
src/styles.css:293: background: rgba(196, 153, 64, 0.08);
src/styles.css:348: border-color: rgba(106, 171, 125, 0.28);
src/styles.css:349: background: rgba(106, 171, 125, 0.06);
src/styles.css:594: rgba(255, 255, 255, 0.012) 0px,
src/styles.css:595: rgba(255, 255, 255, 0.012) 1px,
src/styles.css:601: rgba(255, 255, 255, 0.008) 0px,
src/styles.css:602: rgba(255, 255, 255, 0.008) 1px,
src/styles.css:607: linear-gradient(rgba(232, 0, 45, 0.07) 1px, transparent 1px),
src/styles.css:608: linear-gradient(90deg, rgba(232, 0, 45, 0.07) 1px, transparent 1px),
src/styles.css:610: radial-gradient(ellipse at 15% 20%, rgba(232, 0, 45, 0.12), transparent 40%),
src/styles.css:611: radial-gradient(ellipse at 85% 25%, rgba(180, 180, 180, 0.06), transparent 45%),
src/styles.css:612: radial-gradient(ellipse at 50% 75%, rgba(232, 0, 45, 0.05), transparent 50%),
src/styles.css:648: border-right: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:656: .app-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 10px; }
src/styles.css:664: border-bottom: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:686: color: #3d3d3d;
src/styles.css:699: color: #ffffff;
src/styles.css:705: color: #ff2244;
src/styles.css:713: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:787: border-bottom: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:789: inset 0 1px 0 rgba(255, 255, 255, 0.04),
src/styles.css:790: inset 0 -1px 0 rgba(0, 0, 0, 0.6);
src/styles.css:799: border-right: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:801: color: #3d3d3d;
src/styles.css:825: background: linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, transparent 65%);
src/styles.css:832: color: #7a7a7a;
src/styles.css:833: background: rgba(255, 255, 255, 0.03);
src/styles.css:834: border-top-color: rgba(255, 255, 255, 0.12);
src/styles.css:835: box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:844: color: #ff2244;
src/styles.css:847: rgba(232, 0, 45, 0.12) 0%,
src/styles.css:848: rgba(232, 0, 45, 0.05) 55%,
src/styles.css:851: border-top: 2px solid #E8002D;
src/styles.css:853: border-right-color: rgba(232, 0, 45, 0.1);
src/styles.css:855: inset 0 3px 14px rgba(232, 0, 45, 0.08),
src/styles.css:856: inset 0 1px 0 rgba(232, 0, 45, 0.25),
src/styles.css:857: 0 0 20px rgba(232, 0, 45, 0.04);
src/styles.css:859: 0 0 18px rgba(232, 0, 45, 0.7),
src/styles.css:860: 0 0 6px rgba(232, 0, 45, 0.4);
src/styles.css:904: border-left: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:1001: box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
src/styles.css:1002: color: #d98b45;
src/styles.css:1026: color: #555555;
src/styles.css:1032: color: #f4b24d;
src/styles.css:1050: background: #f4b24d;
src/styles.css:1062: color: #f4b24d;
src/styles.css:1084: color: #d98b45;
src/styles.css:1091: color: #f2a35b;
src/styles.css:1101: color: #ffffff;
src/styles.css:1110: color: #69a7c8;
src/styles.css:1140: color: #d98b45;
src/styles.css:1147: background: #0a5797;
src/styles.css:1148: border-color: #2f86c7;
src/styles.css:1149: color: #ffffff;
src/styles.css:1150: box-shadow: inset 0 0 0 1px rgba(47, 134, 199, 0.45);
src/styles.css:1174: color: #d98b45;
src/styles.css:1181: border-color: #2f86c7;
src/styles.css:1182: background: #0b376f;
src/styles.css:1183: color: #ffffff;
src/styles.css:1194: background: #f4b24d;
src/styles.css:1212: color: #f2a35b;
src/styles.css:1227: color: #f4b24d;
src/styles.css:1233: border: 1px solid #4d2d00;
src/styles.css:1236: background: #f4b24d;
src/styles.css:1247: background: #f2a35b;
src/styles.css:1248: border-color: #f4b24d;
src/styles.css:1260: border: 1px solid #f4b24d;
src/styles.css:1262: color: #f4b24d;
src/styles.css:1263: box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
src/styles.css:1313: color: #d98b45;
src/styles.css:1320: background: #0b376f;
src/styles.css:1321: color: #ffffff;
src/styles.css:1325: color: #f2a35b;
src/styles.css:1337: color: #f4b24d;
src/styles.css:1367: border: 1px solid #69a7c8;
src/styles.css:1368: color: #69a7c8;
src/styles.css:1374: border-color: #f2a35b;
src/styles.css:1375: color: #f2a35b;
src/styles.css:1384: color: #ffffff;
src/styles.css:1447: scrollbar-color: rgba(255,255,255,0.15) transparent;
src/styles.css:1462: background: rgba(255,255,255,0.12);
src/styles.css:1468: background: rgba(255,255,255,0.22);
src/styles.css:1481: color: #d98b45;
src/styles.css:1580: color: #d98b45;
src/styles.css:1593: background: var(--copilot-feed-accent, #94a3b8);
src/styles.css:1608: color: #d98b45;
src/styles.css:1621: color: #555555;
src/styles.css:1625: color: #d98b45;
src/styles.css:1629: color: #33cc66;
src/styles.css:1633: color: #f4b24d;
src/styles.css:1635: border-left: 3px solid #f4b24d;
src/styles.css:1639: color: #ff3838;
src/styles.css:1641: border-left: 3px solid #c41e1e;
src/styles.css:1646: color: #fff;
src/styles.css:1647: background: #8a1414;
src/styles.css:1648: border-left: 3px solid #ff3838;
src/styles.css:1654: 0%, 100% { background: rgba(255, 171, 0, 0.15); }
src/styles.css:1655: 50% { background: rgba(255, 171, 0, 0.3); }
src/styles.css:1659: 0%, 100% { background: rgba(255, 61, 0, 0.2); }
src/styles.css:1660: 50% { background: rgba(255, 61, 0, 0.4); }
src/styles.css:1664: 0%, 100% { background: rgba(255, 23, 68, 0.3); }
src/styles.css:1665: 50% { background: rgba(255, 23, 68, 0.5); }
src/styles.css:1679: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:1681: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:1682: box-shadow: 0 10px 24px rgba(0, 0, 0, 0.36);
src/styles.css:1698: border-color: rgba(234, 179, 8, 0.28);
src/styles.css:1727: background: var(--availability-color, #555e6e);
src/styles.css:1728: box-shadow: 0 0 12px color-mix(in srgb, var(--availability-color, #555e6e) 65%, transparent);
src/styles.css:1740: color: #f0f6fc;
src/styles.css:1748: color: #7b8493;
src/styles.css:1767: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:1768: background: rgba(255, 255, 255, 0.03);
src/styles.css:1769: color: #6f7786;
src/styles.css:1782: border-color: rgba(255, 255, 255, 0.16);
src/styles.css:1783: color: #c9d1d9;
src/styles.css:1787: color: var(--availability-color, #f0f6fc);
src/styles.css:1788: border-color: color-mix(in srgb, var(--availability-color, #f0f6fc) 42%, rgba(255, 255, 255, 0.08));
src/styles.css:1789: background: color-mix(in srgb, var(--availability-color, #f0f6fc) 12%, rgba(255, 255, 255, 0.02));
src/styles.css:1790: box-shadow: inset 0 0 16px color-mix(in srgb, var(--availability-color, #f0f6fc) 14%, transparent);
src/styles.css:1805: background: linear-gradient(180deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:1806: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:1815: box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
src/styles.css:1821: color: #34d399;
src/styles.css:1832: color: #64748b;
src/styles.css:1841: color: #64748b;
src/styles.css:1848: border: 1px solid var(--rail-term-border, var(--sep-term-border, rgba(255, 255, 255, 0.08)));
src/styles.css:1850: background: var(--rail-term-bg, var(--sep-term-bg, rgba(13, 17, 23, 0.94)));
src/styles.css:1851: color: var(--rail-term-yellow, var(--sep-term-yellow, #f4b24d));
src/styles.css:1863: border-color: var(--rail-term-blue-bright, var(--sep-term-blue-bright, rgba(255, 255, 255, 0.18)));
src/styles.css:1864: background: var(--rail-term-hover, var(--sep-term-hover, rgba(255, 255, 255, 0.06)));
src/styles.css:1865: color: var(--rail-term-white, var(--sep-term-white, #ffffff));
src/styles.css:1898: background: rgba(0, 0, 0, 0.4);
src/styles.css:1915: background: linear-gradient(180deg, rgba(10, 10, 12, 0.97) 0%, rgba(6, 6, 8, 0.99) 100%);
src/styles.css:1916: border-left: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:1941: --rail-term-hover: #0b376f;
src/styles.css:1943: --rail-term-border-bright: #2a2a2a;
src/styles.css:1944: --rail-term-amber: #d98b45;
src/styles.css:1945: --rail-term-amber-bright: #f2a35b;
src/styles.css:1946: --rail-term-yellow: #f4b24d;
src/styles.css:1947: --rail-term-cyan: #69a7c8;
src/styles.css:1948: --rail-term-cyan-bright: #9bc9e0;
src/styles.css:1949: --rail-term-blue: #0a5797;
src/styles.css:1950: --rail-term-blue-bright: #2f86c7;
src/styles.css:1951: --rail-term-red: #c41e1e;
src/styles.css:1952: --rail-term-red-dark: #8a1414;
src/styles.css:1953: --rail-term-red-bright: #ff3838;
src/styles.css:1954: --rail-term-green: #33cc66;
src/styles.css:1955: --rail-term-white: #ffffff;
src/styles.css:1956: --rail-term-muted: #555555;
src/styles.css:1985: scrollbar-color: var(--rail-term-border-bright, rgba(255,255,255,0.15)) transparent;
src/styles.css:1990: background: var(--rail-term-border-bright, #2a2a2a) !important;
src/styles.css:1995: background: var(--rail-term-amber, #d98b45) !important;
src/styles.css:2018: border-bottom: 1px solid #4d2d00 !important;
src/styles.css:2172: border: 1px solid #4d2d00 !important;
src/styles.css:2283: color: var(--copilot-alert-color, #d98b45);
src/styles.css:2290: scrollbar-color: #2a2a2a transparent;
src/styles.css:2298: background: #2a2a2a;
src/styles.css:2304: color: var(--copilot-alert-accent, #69a7c8);
src/styles.css:2317: color: var(--copilot-alert-accent, #69a7c8);
src/styles.css:2331: color: var(--copilot-alert-color, #d98b45);
src/styles.css:2552: background: linear-gradient(145deg, rgba(21, 21, 26, 0.95) 0%, rgba(10, 10, 12, 0.98) 100%);
src/styles.css:2553: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:2555: color: #94a3b8;
src/styles.css:2558: box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
src/styles.css:2567: background: rgba(0, 0, 0, 0.5);
src/styles.css:2651: box-shadow: 4px 0 20px rgba(0, 0, 0, 0.4);
src/styles.css:2713: rgba(24, 24, 24, 0.28) 0%,
src/styles.css:2714: rgba(14, 14, 14, 0.18) 52%,
src/styles.css:2715: rgba(8, 8, 8, 0.24) 100%
src/styles.css:2717: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:2718: border-top-color: rgba(255, 255, 255, 0.08);
src/styles.css:2722: inset 6px 6px 14px rgba(0, 0, 0, 0.45),
src/styles.css:2723: inset -4px -4px 10px rgba(255, 255, 255, 0.02),
src/styles.css:2724: 0 1px 3px rgba(0, 0, 0, 0.7),
src/styles.css:2725: 0 6px 16px rgba(0, 0, 0, 0.6),
src/styles.css:2726: 0 16px 40px rgba(0, 0, 0, 0.4);
src/styles.css:2740: inset 6px 6px 14px rgba(0, 0, 0, 0.45),
src/styles.css:2741: inset -4px -4px 10px rgba(255, 255, 255, 0.02),
src/styles.css:2742: 0 1px 3px rgba(0, 0, 0, 0.7),
src/styles.css:2743: 0 6px 16px rgba(0, 0, 0, 0.6),
src/styles.css:2744: 0 16px 40px rgba(0, 0, 0, 0.4);
src/styles.css:2751: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:2752: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:2754: box-shadow: 0 10px 24px rgba(0, 0, 0, 0.36);
src/styles.css:2761: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:2762: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:2763: box-shadow: 0 10px 24px rgba(0, 0, 0, 0.36);
src/styles.css:2861: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:2863: background: rgba(255, 255, 255, 0.025);
src/styles.css:2892: border-color: rgba(157, 0, 255, 0.18);
src/styles.css:2945: background: rgba(255, 255, 255, 0.04);
src/styles.css:2955: border-color: rgba(0, 209, 102, 0.38);
src/styles.css:2956: background: rgba(0, 209, 102, 0.09);
src/styles.css:2976: border: 1px solid #0f5c2b;
src/styles.css:2978: background: #053d17;
src/styles.css:2979: color: var(--script-term-green, #33cc66);
src/styles.css:2996: border-color: var(--script-term-green, #33cc66);
src/styles.css:2997: background: #075523;
src/styles.css:2998: color: #ffffff;
src/styles.css:3015: outline: 2px solid rgba(51, 204, 102, 0.55);
src/styles.css:3025: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:3026: background: rgba(255, 255, 255, 0.03);
src/styles.css:3033: border-color: rgba(0, 209, 102, 0.25);
src/styles.css:3034: background: rgba(0, 209, 102, 0.08);
src/styles.css:3035: color: #9ff5c8;
src/styles.css:3039: border-color: rgba(232, 0, 45, 0.35);
src/styles.css:3040: background: rgba(232, 0, 45, 0.1);
src/styles.css:3041: color: #ff9bad;
src/styles.css:3047: border: 1px solid rgba(232, 0, 45, 0.35);
src/styles.css:3048: background: rgba(232, 0, 45, 0.1);
src/styles.css:3049: color: #ff9bad;
src/styles.css:3097: --ops-surface-alt: #060606;
src/styles.css:3098: --ops-surface-hover: #0b376f;
src/styles.css:3100: --ops-border-bright: #2a2a2a;
src/styles.css:3102: --ops-text: #d98b45;
src/styles.css:3103: --ops-text-bright: #f0a25a;
src/styles.css:3104: --ops-amber: #d98b45;
src/styles.css:3105: --ops-amber-bright: #f2a35b;
src/styles.css:3106: --ops-yellow: #f4b24d;
src/styles.css:3108: --ops-cyan: #69a7c8;
src/styles.css:3109: --ops-cyan-bright: #9bc9e0;
src/styles.css:3110: --ops-blue: #0a5797;
src/styles.css:3111: --ops-blue-bright: #2f86c7;
src/styles.css:3113: --ops-red: #c41e1e;
src/styles.css:3114: --ops-red-dark: #8a1414;
src/styles.css:3115: --ops-red-bright: #ff3838;
src/styles.css:3117: --ops-green: #33cc66;
src/styles.css:3118: --ops-white: #ffffff;
src/styles.css:3119: --ops-muted: #555555;
src/styles.css:3120: --ops-label: #5a5a5a;
src/styles.css:3173: border-bottom: 1px solid #3a0505;
src/styles.css:3185: background: linear-gradient(180deg, #d91525 0%, #7d0710 100%);
src/styles.css:3188: border-left: 1px solid #4a0508;
src/styles.css:3191: background: linear-gradient(180deg, #78bce5 0%, var(--ops-blue) 100%);
src/styles.css:3192: color: #02070c;
src/styles.css:3194: border-left: 1px solid #092d52;
src/styles.css:3197: background: linear-gradient(180deg, #d91525 0%, #7d0710 100%);
src/styles.css:3321: border-bottom: 1px solid #4d2d00;
src/styles.css:3428: background: #1a0a00;
src/styles.css:3633: border: 1px solid #5a3400;
src/styles.css:3647: color: #5a3400;
src/styles.css:3715: background: rgba(255, 153, 0, 0.09);
src/styles.css:3828: border: 1px solid rgba(255, 255, 255, 0.18);
src/styles.css:3844: color: #8ff0a6;
src/styles.css:3851: color: #ff7474;
src/styles.css:3892: .operations-tab .ops-carrier-row .bar-wrap { height: 6px; background: #1a0a00; }
src/styles.css:4021: border-bottom: 1px solid #4d2d00;
src/styles.css:4180: .operations-tab .ops-utterance.sentiment-positive { background: rgba(51, 204, 102, 0.08); }
src/styles.css:4181: .operations-tab .ops-utterance.sentiment-negative { background: rgba(255, 56, 56, 0.08); }
src/styles.css:4266: background: rgba(51, 204, 102, 0.35);
src/styles.css:4497: background: rgba(255, 56, 56, 0.08);
src/styles.css:4775: text-shadow: 0 0 20px rgba(232, 0, 45, 0.5), 0 0 40px rgba(232, 0, 45, 0.2);
src/styles.css:4793: background: linear-gradient(145deg, rgba(18, 22, 30, 0.98) 0%, rgba(10, 14, 20, 0.99) 100%);
src/styles.css:4795: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:4803: inset 4px 4px 10px rgba(0, 0, 0, 0.42),
src/styles.css:4804: inset -3px -3px 8px rgba(255, 255, 255, 0.02);
src/styles.css:4810: border-color: rgba(232, 0, 45, 0.24);
src/styles.css:4812: inset 4px 4px 10px rgba(0, 0, 0, 0.42),
src/styles.css:4813: inset -3px -3px 8px rgba(255, 255, 255, 0.02),
src/styles.css:4814: 0 0 0 3px rgba(232, 0, 45, 0.05);
src/styles.css:4838: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:4839: background: linear-gradient(145deg, rgba(18, 22, 30, 0.98) 0%, rgba(10, 14, 20, 0.99) 100%);
src/styles.css:4845: inset 4px 4px 10px rgba(0, 0, 0, 0.42),
src/styles.css:4846: inset -3px -3px 8px rgba(255, 255, 255, 0.02);
src/styles.css:4850: border-color: rgba(232, 0, 45, 0.3);
src/styles.css:4900: color: #E8002D;
src/styles.css:4902: text-shadow: 0 0 8px rgba(232, 0, 45, 0.4);
src/styles.css:4945: background: rgba(232, 0, 45, 0.04);
src/styles.css:4951: accent-color: #E8002D;
src/styles.css:4965: background: linear-gradient(180deg, #1A0508 0%, #0F0203 100%);
src/styles.css:4966: color: #E8002D;
src/styles.css:4967: border: 1px solid rgba(232, 0, 45, 0.25);
src/styles.css:4968: border-top-color: rgba(232, 0, 45, 0.35);
src/styles.css:4993: rgba(232, 0, 45, 0.6),
src/styles.css:5009: rgba(255, 255, 255, 0.04) 0%,
src/styles.css:5018: border-color: rgba(232, 0, 45, 0.45);
src/styles.css:5019: color: #FF2040;
src/styles.css:5020: background: linear-gradient(180deg, #200608 0%, #140304 100%);
src/styles.css:5035: outline: 2px solid rgba(232, 0, 45, 0.6);
src/styles.css:5040: outline: 2px solid rgba(255, 215, 0, 0.6);
src/styles.css:5047: background: linear-gradient(145deg, rgba(42,42,50,0.95) 0%, rgba(26,26,32,0.98) 100%);
src/styles.css:5048: color: #94a3b8;
src/styles.css:5049: border: 1px solid rgba(255,255,255,0.07);
src/styles.css:5059: 3px 3px 6px rgba(0,0,0,0.35),
src/styles.css:5060: -2px -2px 4px rgba(255,255,255,0.025),
src/styles.css:5061: inset 0 1px 0 rgba(255,255,255,0.04);
src/styles.css:5067: color: #e2e8f0;
src/styles.css:5068: background: linear-gradient(145deg, rgba(50,50,58,0.95) 0%, rgba(32,32,38,0.98) 100%);
src/styles.css:5070: 3px 3px 6px rgba(0,0,0,0.4),
src/styles.css:5071: -2px -2px 4px rgba(255,255,255,0.03),
src/styles.css:5072: inset 0 1px 0 rgba(255,255,255,0.06);
src/styles.css:5079: inset 2px 2px 5px rgba(0,0,0,0.3),
src/styles.css:5080: inset -2px -2px 4px rgba(255,255,255,0.02);
src/styles.css:5091: background: linear-gradient(180deg, #141200 0%, #0C0B00 100%);
src/styles.css:5093: border: 1px solid rgba(255, 215, 0, 0.15);
src/styles.css:5094: border-top-color: rgba(255, 215, 0, 0.25);
src/styles.css:5118: rgba(255, 215, 0, 0.5),
src/styles.css:5133: rgba(255, 255, 255, 0.03) 0%,
src/styles.css:5142: border-color: rgba(255, 215, 0, 0.3);
src/styles.css:5164: background: linear-gradient(180deg, #052810 0%, #021a08 100%);
src/styles.css:5165: color: #00ff41;
src/styles.css:5166: border-color: rgba(0, 255, 65, 0.25);
src/styles.css:5167: border-top-color: rgba(0, 255, 65, 0.4);
src/styles.css:5174: rgba(0, 255, 65, 0.45),
src/styles.css:5180: background: linear-gradient(180deg, #073d17 0%, #03220a 100%);
src/styles.css:5181: border-color: rgba(0, 255, 65, 0.55);
src/styles.css:5183: 0 0 14px rgba(0, 255, 65, 0.2),
src/styles.css:5184: 0 4px 12px rgba(0, 0, 0, 0.5);
src/styles.css:5185: color: #39ff6e;
src/styles.css:5208: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:5209: background: linear-gradient(145deg, rgba(32, 32, 38, 0.92) 0%, rgba(12, 12, 14, 0.98) 100%);
src/styles.css:5210: box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:5222: color: #fbbf24;
src/styles.css:5266: background: rgba(251, 191, 36, 0.03);
src/styles.css:5267: border: 1px solid rgba(251, 191, 36, 0.08);
src/styles.css:5289: color: var(--script-term-amber, #d98b45);
src/styles.css:5307: border-color: var(--script-term-green, #33cc66);
src/styles.css:5308: background: #053d17;
src/styles.css:5309: color: var(--script-term-green, #33cc66);
src/styles.css:5318: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:5319: border-left: 2px solid rgba(232, 0, 45, 0.3);
src/styles.css:5330: color: #B8B8C8;
src/styles.css:5334: scrollbar-color: rgba(232, 0, 45, 0.2) transparent;
src/styles.css:5346: background: rgba(255, 255, 255, 0.08);
src/styles.css:5352: color: #ffffff !important;
src/styles.css:5353: border-color: rgba(255, 255, 255, 0.07);
src/styles.css:5354: border-left: 1px solid rgba(255, 255, 255, 0.07) !important;
src/styles.css:5363: color: #ffffff !important;
src/styles.css:5418: background: rgba(232, 0, 45, 0.22);
src/styles.css:5436: --script-term-hover: #0b376f;
src/styles.css:5438: --script-term-border-bright: #2a2a2a;
src/styles.css:5439: --script-term-amber: #d98b45;
src/styles.css:5440: --script-term-amber-bright: #f2a35b;
src/styles.css:5441: --script-term-yellow: #f4b24d;
src/styles.css:5442: --script-term-cyan: #69a7c8;
src/styles.css:5443: --script-term-cyan-bright: #9bc9e0;
src/styles.css:5444: --script-term-blue: #0a5797;
src/styles.css:5445: --script-term-green: #33cc66;
src/styles.css:5446: --script-term-red: #ff3838;
src/styles.css:5447: --script-term-muted: #555555;
src/styles.css:5493: box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
src/styles.css:5523: background: rgba(0, 0, 0, 0.65);
src/styles.css:5625: border-bottom: 1px solid #4d2d00;
src/styles.css:5661: border: 1px solid #4d2d00;
src/styles.css:5840: border-bottom: 1px solid #4d2d00 !important;
src/styles.css:5852: border-color: #4d2d00 !important;
src/styles.css:5918: color: #ffffff !important;
src/styles.css:6215: color: #ffffff;
src/styles.css:6268: border-right: 1px solid #4d2d00;
src/styles.css:6286: border: 1px solid #4d2d00 !important;
src/styles.css:6288: background: rgba(77, 45, 0, 0.08) !important;
src/styles.css:6300: background: rgba(77, 45, 0, 0.2) !important;
src/styles.css:6349: color: #ffffff;
src/styles.css:6355: background: rgba(105, 167, 200, 0.07);
src/styles.css:6433: border-color: rgba(244, 178, 77, 0.52) !important;
src/styles.css:6434: background: rgba(244, 178, 77, 0.06) !important;
src/styles.css:6442: border-color: rgba(255, 56, 56, 0.52) !important;
src/styles.css:6443: background: rgba(255, 56, 56, 0.07) !important;
src/styles.css:6505: color: #ffffff;
src/styles.css:6511: background: rgba(244, 178, 77, 0.08);
src/styles.css:6555: color: #ffffff;
src/styles.css:6590: border-color: rgba(255, 56, 56, 0.42);
src/styles.css:6591: background: rgba(255, 56, 56, 0.045);
src/styles.css:6595: border-color: rgba(51, 204, 102, 0.4);
src/styles.css:6596: background: rgba(51, 204, 102, 0.04);
src/styles.css:6629: color: #ffffff;
src/styles.css:6699: color: #ffffff;
src/styles.css:6783: border-color: #0f5c2b;
src/styles.css:6784: background: #053d17;
src/styles.css:6792: color: #ffffff;
src/styles.css:6816: background: rgba(0, 0, 0, 0.76);
src/styles.css:6827: box-shadow: 0 24px 70px rgba(0, 0, 0, 0.62);
src/styles.css:6874: color: #ffffff;
src/styles.css:6962: color: #ffffff;
src/styles.css:7025: border: 1px solid #0f5c2b !important;
src/styles.css:7027: background: #053d17 !important;
src/styles.css:7037: background: #075523 !important;
src/styles.css:7039: color: #ffffff !important;
src/styles.css:7132: border: 1px solid #0f5c2b !important;
src/styles.css:7134: background: #053d17 !important;
src/styles.css:7174: background: #075523 !important;
src/styles.css:7175: color: #ffffff !important;
src/styles.css:7205: scrollbar-color: rgba(251, 146, 60, 0.28) transparent;
src/styles.css:7217: background: rgba(251, 146, 60, 0.22);
src/styles.css:7223: color: #94a3b8;
src/styles.css:7254: rgba(42, 42, 50, 0.95) 0%,
src/styles.css:7255: rgba(26, 26, 32, 0.98) 100%
src/styles.css:7257: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:7259: color: #666;
src/styles.css:7265: box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.35),
src/styles.css:7266: -1px -1px 3px rgba(255, 255, 255, 0.02);
src/styles.css:7276: border: 1px solid rgba(251, 146, 60, 0.18);
src/styles.css:7277: border-top-color: rgba(251, 146, 60, 0.26);
src/styles.css:7281: rgba(40, 24, 15, 0.92) 0%,
src/styles.css:7282: rgba(13, 10, 10, 0.98) 100%
src/styles.css:7284: color: #ffd9bf;
src/styles.css:7294: border-color: rgba(255, 255, 255, 0.09);
src/styles.css:7295: color: #7a7a7a;
src/styles.css:7296: box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.35),
src/styles.css:7297: -1px -1px 3px rgba(255, 255, 255, 0.02);
src/styles.css:7302: border-color: rgba(251, 146, 60, 0.34);
src/styles.css:7303: color: #fff3e8;
src/styles.css:7304: box-shadow: var(--shadow-btn-hover), 0 0 14px rgba(251, 146, 60, 0.1);
src/styles.css:7331: color: #fb923c;
src/styles.css:7336: color: #fff2e8;
src/styles.css:7361: border: 1px solid rgba(251, 146, 60, 0.16);
src/styles.css:7364: rgba(37, 24, 16, 0.7) 0%,
src/styles.css:7365: rgba(12, 10, 11, 0.78) 100%
src/styles.css:7367: color: #f8fafc;
src/styles.css:7373: scrollbar-color: rgba(251, 146, 60, 0.32) transparent;
src/styles.css:7385: background: rgba(251, 146, 60, 0.24);
src/styles.css:7394: color: #e2e8f0;
src/styles.css:7404: accent-color: #7a7f8e;
src/styles.css:7409: color: #c8d0db;
src/styles.css:7417: border: 1px dashed rgba(251, 146, 60, 0.16);
src/styles.css:7418: background: rgba(255, 255, 255, 0.02);
src/styles.css:7419: color: #94a3b8;
src/styles.css:7423: border: 1px solid rgba(251, 146, 60, 0.16);
src/styles.css:7424: background: rgba(251, 146, 60, 0.08);
src/styles.css:7425: color: #ffe3cf;
src/styles.css:7431: color: #00D166;
src/styles.css:7446: background: linear-gradient(180deg, #12182350 0%, #0f141c 100%);
src/styles.css:7461: rgba(255, 255, 255, 0.02) 0%,
src/styles.css:7488: background: rgba(232, 0, 45, 0.03);
src/styles.css:7502: color: #E8002D;
src/styles.css:7515: background: linear-gradient(180deg, #0a0e15 0%, #090d13 100%);
src/styles.css:7585: color: #E8002D;
src/styles.css:7619: background: rgba(255, 255, 255, 0.025);
src/styles.css:7637: border: 1px solid rgba(251, 191, 36, 0.24);
src/styles.css:7638: background: rgba(251, 191, 36, 0.08);
src/styles.css:7651: background: rgba(255, 255, 255, 0.018);
src/styles.css:7666: background: rgba(255, 255, 255, 0.02);
src/styles.css:7672: border-bottom: 1px solid rgba(232, 0, 45, 0.12);
src/styles.css:7673: background: rgba(232, 0, 45, 0.04);
src/styles.css:7674: color: #E8002D;
src/styles.css:7692: background: rgba(255, 255, 255, 0.02);
src/styles.css:7693: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:7737: color: #E8002D;
src/styles.css:7739: border-bottom: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:7744: border-color: #E8002D;
src/styles.css:7755: background: linear-gradient(180deg, #080c12 0%, #0a0e15 100%);
src/styles.css:7776: background: linear-gradient(180deg, #080c12 0%, #0b0f16 100%);
src/styles.css:7784: background: #0b0f16;
src/styles.css:7785: color: #e7edf5;
src/styles.css:7819: background: rgba(255, 255, 255, 0.02);
src/styles.css:7837: background: rgba(255, 255, 255, 0.08);
src/styles.css:7843: background: linear-gradient(90deg, #E8002D, #FF4060);
src/styles.css:7845: box-shadow: 0 0 8px rgba(232, 0, 45, 0.4);
src/styles.css:7856: border: 1px solid rgba(248, 113, 113, 0.3);
src/styles.css:7857: background: rgba(248, 113, 113, 0.08);
src/styles.css:7858: color: #fecaca;
src/styles.css:7862: border: 1px solid rgba(52, 211, 153, 0.35);
src/styles.css:7863: background: rgba(52, 211, 153, 0.08);
src/styles.css:7864: color: #bbf7d0;
src/styles.css:7916: background: linear-gradient(180deg, #1A0508 0%, #0F0203 100%);
src/styles.css:7917: color: #E8002D;
src/styles.css:7918: border: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:8029: background: rgba(232, 0, 45, 0.25);
src/styles.css:8030: color: #FFFFFF;
src/styles.css:8048: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:8049: background: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:8080: background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
src/styles.css:8087: color: #00D166;
src/styles.css:8088: border-color: rgba(0, 209, 102, 0.2);
src/styles.css:8099: color: #00D166;
src/styles.css:8100: border-color: rgba(0, 209, 102, 0.22);
src/styles.css:8120: border: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:8122: background: rgba(255, 255, 255, 0.018);
src/styles.css:8124: inset 3px 3px 7px rgba(0, 0, 0, 0.38),
src/styles.css:8125: inset -2px -2px 5px rgba(255, 255, 255, 0.015);
src/styles.css:8147: background: #555;
src/styles.css:8152: background: rgba(200, 160, 255, 0.6);
src/styles.css:8157: background: rgba(0, 209, 102, 0.7);
src/styles.css:8165: color: #3e3e4a;
src/styles.css:8196: background: #FFD700;
src/styles.css:8226: border-bottom: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:8234: border: 1.5px solid rgba(232, 0, 45, 0.14);
src/styles.css:8235: border-top-color: #E8002D;
src/styles.css:8236: border-right-color: rgba(232, 0, 45, 0.5);
src/styles.css:8239: box-shadow: 0 0 6px rgba(232, 0, 45, 0.18);
src/styles.css:8248: color: rgba(232, 0, 45, 0.5);
src/styles.css:8259: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:8260: background: linear-gradient(145deg, rgba(32, 32, 38, 0.92) 0%, rgba(12, 12, 14, 0.98) 100%);
src/styles.css:8261: box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:8273: color: #fbbf24;
src/styles.css:8312: background: rgba(255, 255, 255, 0.07);
src/styles.css:8368: background: rgba(255, 255, 255, 0.15);
src/styles.css:8371: color: rgba(255, 255, 255, 0.18);
src/styles.css:8376: background: #E8002D;
src/styles.css:8377: box-shadow: 0 0 5px rgba(232, 0, 45, 0.5);
src/styles.css:8380: color: rgba(232, 0, 45, 0.65);
src/styles.css:8391: background: rgba(232, 0, 45, 0.08);
src/styles.css:8392: border-color: rgba(232, 0, 45, 0.35);
src/styles.css:8396: color: #E8002D;
src/styles.css:8399: box-shadow: 0 0 8px rgba(232, 0, 45, 0.7);
src/styles.css:8406: background: #00ff41;
src/styles.css:8407: box-shadow: 0 0 6px 2px rgba(0, 255, 65, 0.7), 0 0 18px rgba(0, 255, 65, 0.4);
src/styles.css:8410: color: #00ff41;
src/styles.css:8411: text-shadow: 0 0 8px rgba(0, 255, 65, 0.6);
src/styles.css:8415: background: linear-gradient(180deg, rgba(57, 255, 136, 0.6) 0%, rgba(255, 255, 255, 0.08) 100%);
src/styles.css:8449: background: linear-gradient(180deg, #100303 0%, #0A0202 100%);
src/styles.css:8450: border: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:8451: border-top-color: rgba(232, 0, 45, 0.35);
src/styles.css:8464: background: linear-gradient(90deg, transparent, rgba(232, 0, 45, 0.5), transparent);
src/styles.css:8471: color: #E8002D;
src/styles.css:8472: text-shadow: 0 0 10px rgba(232, 0, 45, 0.5);
src/styles.css:8477: color: rgba(232, 0, 45, 0.35);
src/styles.css:8482: color: rgba(232, 0, 45, 0.35);
src/styles.css:8488: color: #E8002D;
src/styles.css:8517: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:8519: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:8527: box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
src/styles.css:8541: background: linear-gradient(180deg, #1A0A0A 0%, #100505 100%);
src/styles.css:8542: border: 1px solid rgba(255, 68, 85, 0.18);
src/styles.css:8568: background: linear-gradient(180deg, rgba(255, 68, 85, 0.04), transparent);
src/styles.css:8575: border-color: rgba(255, 68, 85, 0.3);
src/styles.css:8587: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:8590: background: linear-gradient(145deg, rgba(36, 36, 40, 0.97) 0%, rgba(16, 16, 18, 0.99) 100%);
src/styles.css:8592: 14px 14px 28px rgba(0, 0, 0, 0.42),
src/styles.css:8593: -10px -10px 22px rgba(255, 255, 255, 0.03),
src/styles.css:8594: inset 1px 1px 0 rgba(255, 255, 255, 0.06),
src/styles.css:8595: inset -1px -1px 0 rgba(0, 0, 0, 0.55);
src/styles.css:8635: background: linear-gradient(180deg, #080c12 0%, #0a0e15 100%);
src/styles.css:8657: background: rgba(232, 0, 45, 0.06);
src/styles.css:8658: color: #FF6080;
src/styles.css:8660: border-left-color: #E8002D;
src/styles.css:8669: border: 1px solid rgba(255,255,255,0.05);
src/styles.css:8670: border-left: 1px solid rgba(173,173,173,0.45);
src/styles.css:8675: box-shadow: -2px 0 8px rgba(173,173,173,0.08), inset 0 1px 0 rgba(255,255,255,0.03);
src/styles.css:8683: color: #E8002D;
src/styles.css:8700: background: linear-gradient(90deg, rgba(232,0,45,0.04) 0%, var(--eg-surface-1) 55%);
src/styles.css:8701: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:8702: border-left: 1px solid rgba(232,0,45,0.6);
src/styles.css:8705: box-shadow: -2px 0 12px rgba(232,0,45,0.14), inset 0 1px 0 rgba(255,255,255,0.03);
src/styles.css:8711: color: #FF8090;
src/styles.css:8715: color: #E8002D;
src/styles.css:8733: scrollbar-color: rgba(232, 0, 45, 0.45) var(--eg-surface-2);
src/styles.css:8742: background: rgba(232, 0, 45, 0.45);
src/styles.css:8746: background: #e10600;
src/styles.css:8764: background: linear-gradient(180deg, rgba(157, 0, 255, 0.08) 0%, rgba(10, 10, 12, 0.72) 100%);
src/styles.css:8765: border: 1px solid rgba(157, 0, 255, 0.25);
src/styles.css:8766: border-top-color: rgba(157, 0, 255, 0.35);
src/styles.css:8767: color: #B84DFF;
src/styles.css:8790: background: linear-gradient(90deg, transparent, rgba(157, 0, 255, 0.5), transparent);
src/styles.css:8804: background: rgba(10, 10, 12, 0.95);
src/styles.css:8805: border: 1px solid rgba(157, 0, 255, 0.3);
src/styles.css:8806: color: #B84DFF;
src/styles.css:8823: box-shadow: var(--shadow-btn-hover), 0 0 12px rgba(157, 0, 255, 0.2);
src/styles.css:8825: border-color: rgba(157, 0, 255, 0.5);
src/styles.css:8826: color: #c77dff;
src/styles.css:8827: background: linear-gradient(180deg, rgba(157, 0, 255, 0.15) 0%, rgba(10, 10, 12, 0.72) 100%);
src/styles.css:8838: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:8854: rgba(232, 0, 45, 0.015) 2px,
src/styles.css:8855: rgba(232, 0, 45, 0.015) 4px
src/styles.css:8857: linear-gradient(180deg, #120103 0%, #0A0102 100%);
src/styles.css:8858: border: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:8859: border-top: 2px solid rgba(232, 0, 45, 0.5);
src/styles.css:8863: color: #E0E0E0;
src/styles.css:8885: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:8886: background: linear-gradient(180deg, rgba(20, 20, 20, 0.95) 0%, rgba(11, 11, 11, 0.98) 100%);
src/styles.css:8900: color: #7f93a8;
src/styles.css:8914: border-color: rgba(251, 191, 36, 0.18);
src/styles.css:8915: background: linear-gradient(180deg, rgba(39, 31, 12, 0.96) 0%, rgba(19, 15, 6, 0.98) 100%);
src/styles.css:8922: border-color: rgba(248, 113, 113, 0.18);
src/styles.css:8923: background: linear-gradient(180deg, rgba(39, 17, 17, 0.96) 0%, rgba(20, 8, 8, 0.98) 100%);
src/styles.css:8970: box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
src/styles.css:8974: background: rgba(251, 191, 36, 0.08);
src/styles.css:8975: border: 1px solid rgba(251, 191, 36, 0.2);
src/styles.css:8980: background: rgba(248, 113, 113, 0.08);
src/styles.css:8981: border: 1px solid rgba(248, 113, 113, 0.2);
src/styles.css:9005: background: linear-gradient(180deg, #1A0508 0%, #0F0203 100%) !important;
src/styles.css:9006: border: 1px solid rgba(232, 0, 45, 0.3) !important;
src/styles.css:9007: border-top: 2px solid rgba(232, 0, 45, 0.5) !important;
src/styles.css:9008: color: #E8002D !important;
src/styles.css:9014: box-shadow: var(--shadow-btn), 0 0 12px rgba(232, 0, 45, 0.08);
src/styles.css:9036: 0%, 100% { opacity: 1; box-shadow: 0 0 4px rgba(0,255,65,0.5); }
src/styles.css:9037: 50% { opacity: 0.5; box-shadow: 0 0 8px rgba(0,255,65,0.9); }
src/styles.css:9069: background: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:9070: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9074: 0 2px 20px rgba(0, 0, 0, 0.35),
src/styles.css:9075: 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
src/styles.css:9084: background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.25), transparent);
src/styles.css:9091: background: linear-gradient(180deg, rgba(212, 175, 55, 0.015), transparent);
src/styles.css:9113: color: rgba(212, 175, 55, 0.7);
src/styles.css:9130: background: rgba(255, 255, 255, 0.04);
src/styles.css:9131: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9142: background: rgba(255, 255, 255, 0.07);
src/styles.css:9143: border-color: rgba(212, 175, 55, 0.3);
src/styles.css:9144: color: rgba(212, 175, 55, 0.9);
src/styles.css:9154: background: rgba(16, 20, 30, 0.98);
src/styles.css:9155: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9160: box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
src/styles.css:9178: background: rgba(255, 255, 255, 0.05);
src/styles.css:9181: background: rgba(212, 175, 55, 0.1);
src/styles.css:9184: color: rgba(212, 175, 55, 0.95);
src/styles.css:9202: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9215: color: rgba(212, 175, 55, 0.9);
src/styles.css:9216: border-color: rgba(212, 175, 55, 0.25);
src/styles.css:9217: background: rgba(212, 175, 55, 0.06);
src/styles.css:9252: color: rgba(212, 175, 55, 0.08);
src/styles.css:9267: border-left: 2px solid rgba(212, 175, 55, 0.2);
src/styles.css:9273: color: rgba(212, 175, 55, 0.6);
src/styles.css:9279: color: #c6d2df;
src/styles.css:9288: text-shadow: 0 0 12px rgba(212, 175, 55, 0.08);
src/styles.css:9295: background: rgba(255, 255, 255, 0.025);
src/styles.css:9296: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9304: radial-gradient(ellipse at top left, rgba(255, 179, 0, 0.04) 0%, transparent 60%),
src/styles.css:9305: linear-gradient(145deg, rgba(36, 30, 22, 0.55) 0%, rgba(22, 20, 16, 0.6) 100%);
src/styles.css:9306: border: 1px solid rgba(212, 175, 55, 0.18);
src/styles.css:9308: inset 0 1px 0 rgba(255, 179, 0, 0.05),
src/styles.css:9309: 0 2px 14px rgba(0, 0, 0, 0.25);
src/styles.css:9323: color: rgba(212, 175, 55, 0.45);
src/styles.css:9330: color: rgba(212, 175, 55, 0.72);
src/styles.css:9347: background: rgba(212, 175, 55, 0.12);
src/styles.css:9348: color: rgba(255, 210, 120, 1);
src/styles.css:9352: text-decoration-color: rgba(212, 175, 55, 0.55);
src/styles.css:9361: color: rgba(198, 210, 223, 0.68);
src/styles.css:9366: color: rgba(255, 220, 150, 0.78);
src/styles.css:9388: color: rgba(212, 175, 55, 0.7);
src/styles.css:9397: background: rgba(212, 175, 55, 0.1);
src/styles.css:9398: color: rgba(212, 175, 55, 0.85);
src/styles.css:9435: background: rgba(212, 175, 55, 0.1);
src/styles.css:9436: color: rgba(212, 175, 55, 0.8);
src/styles.css:9443: background: rgba(248, 113, 113, 0.1);
src/styles.css:9444: border: 1px solid rgba(248, 113, 113, 0.2);
src/styles.css:9460: rgba(255, 255, 255, 0.04) 25%,
src/styles.css:9461: rgba(255, 255, 255, 0.09) 50%,
src/styles.css:9462: rgba(255, 255, 255, 0.04) 75%
src/styles.css:9480: background: rgba(255, 255, 255, 0.025);
src/styles.css:9481: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9495: background: rgba(212, 175, 55, 0.04);
src/styles.css:9496: border-color: rgba(212, 175, 55, 0.15);
src/styles.css:9497: color: rgba(212, 175, 55, 0.9);
src/styles.css:9500: background: rgba(212, 175, 55, 0.05);
src/styles.css:9501: border-color: rgba(212, 175, 55, 0.18);
src/styles.css:9502: color: rgba(212, 175, 55, 0.9);
src/styles.css:9510: background: rgba(255, 255, 255, 0.015);
src/styles.css:9511: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9529: border-bottom: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9537: background: rgba(255, 255, 255, 0.025);
src/styles.css:9538: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9547: color: rgba(212, 175, 55, 0.65);
src/styles.css:9559: border-bottom: 1px solid rgba(212, 175, 55, 0.08);
src/styles.css:9575: color: rgba(212, 175, 55, 0.7);
src/styles.css:9603: background: rgba(212, 175, 55, 0.08);
src/styles.css:9604: border: 1px solid rgba(212, 175, 55, 0.22);
src/styles.css:9605: color: rgba(212, 175, 55, 0.95);
src/styles.css:9617: background: rgba(255, 120, 40, 0.1);
src/styles.css:9618: border: 1px solid rgba(255, 120, 40, 0.25);
src/styles.css:9619: color: rgba(255, 180, 100, 0.95);
src/styles.css:9631: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9639: color: rgba(212, 175, 55, 0.9);
src/styles.css:9640: border-color: rgba(212, 175, 55, 0.25);
src/styles.css:9641: background: rgba(212, 175, 55, 0.06);
src/styles.css:9644: color: rgba(212, 175, 55, 0.95);
src/styles.css:9645: border-color: rgba(212, 175, 55, 0.35);
src/styles.css:9646: background: rgba(212, 175, 55, 0.1);
src/styles.css:9656: border-top: 1px solid rgba(212, 175, 55, 0.1);
src/styles.css:9665: background: rgba(255, 255, 255, 0.03);
src/styles.css:9666: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9677: background: rgba(212, 175, 55, 0.06);
src/styles.css:9678: border-color: rgba(212, 175, 55, 0.2);
src/styles.css:9679: color: rgba(212, 175, 55, 0.95);
src/styles.css:9682: background: rgba(212, 175, 55, 0.1);
src/styles.css:9683: border-color: rgba(212, 175, 55, 0.35);
src/styles.css:9684: color: rgba(212, 175, 55, 0.95);
src/styles.css:9687: background: rgba(0, 209, 102, 0.08);
src/styles.css:9688: border-color: rgba(0, 209, 102, 0.3);
src/styles.css:9689: color: rgba(0, 209, 102, 0.95);
src/styles.css:9697: background: rgba(255, 255, 255, 0.02);
src/styles.css:9698: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9715: color: rgba(212, 175, 55, 0.7);
src/styles.css:9741: color: rgba(212, 175, 55, 0.55);
src/styles.css:9749: background: rgba(255, 255, 255, 0.02);
src/styles.css:9750: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9777: color: rgba(212, 175, 55, 0.55);
src/styles.css:9783: background: rgba(212, 175, 55, 0.08);
src/styles.css:9788: color: rgba(212, 175, 55, 0.95);
src/styles.css:9802: background: rgba(255, 255, 255, 0.02);
src/styles.css:9803: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9818: color: rgba(212, 175, 55, 0.8);
src/styles.css:9827: background: rgba(255, 255, 255, 0.04);
src/styles.css:9859: border: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:9867: background: rgba(212, 175, 55, 0.05);
src/styles.css:9868: border-color: rgba(212, 175, 55, 0.18);
src/styles.css:9874: color: rgba(212, 175, 55, 0.9);
src/styles.css:9892: border: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:9901: border-color: rgba(232, 0, 45, 0.3);
src/styles.css:9902: background: rgba(232, 0, 45, 0.06);
src/styles.css:9917: background: rgba(255, 255, 255, 0.02);
src/styles.css:9918: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9937: background: rgba(212, 175, 55, 0.06);
src/styles.css:9938: border: 1px solid rgba(212, 175, 55, 0.2);
src/styles.css:9939: color: rgba(212, 175, 55, 0.9);
src/styles.css:9948: background: rgba(212, 175, 55, 0.14);
src/styles.css:9949: border-color: rgba(212, 175, 55, 0.4);
src/styles.css:9950: color: rgba(255, 210, 120, 1);
src/styles.css:9974: border-bottom: 1px solid rgba(255, 255, 255, 0.03);
src/styles.css:9995: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10006: color: rgba(212, 175, 55, 0.95);
src/styles.css:10007: border-color: rgba(212, 175, 55, 0.28);
src/styles.css:10008: background: rgba(212, 175, 55, 0.06);
src/styles.css:10012: border-color: rgba(232, 0, 45, 0.3);
src/styles.css:10013: background: rgba(232, 0, 45, 0.06);
src/styles.css:10021: background: rgba(255, 179, 0, 0.04);
src/styles.css:10022: border-left: 2px solid rgba(212, 175, 55, 0.35);
src/styles.css:10038: border: 1px solid rgba(212, 175, 55, 0.2);
src/styles.css:10039: background: rgba(0, 0, 0, 0.3);
src/styles.css:10048: border-color: rgba(212, 175, 55, 0.45);
src/styles.css:10049: box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.18);
src/styles.css:10062: background: rgba(255, 255, 255, 0.03);
src/styles.css:10063: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10074: color: rgba(212, 175, 55, 0.95);
src/styles.css:10075: border-color: rgba(212, 175, 55, 0.2);
src/styles.css:10078: background: rgba(212, 175, 55, 0.1);
src/styles.css:10079: border-color: rgba(212, 175, 55, 0.35);
src/styles.css:10080: color: rgba(212, 175, 55, 0.95);
src/styles.css:10083: background: rgba(212, 175, 55, 0.18);
src/styles.css:10190: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:10191: background: rgba(0, 0, 0, 0.28);
src/styles.css:10212: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:10213: background: rgba(0, 0, 0, 0.25);
src/styles.css:10236: background: rgba(0, 0, 0, 0.55);
src/styles.css:10237: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:10286: color: #E8002D;
src/styles.css:10320: rgba(28, 28, 32, 0.96) 0%,
src/styles.css:10321: rgba(16, 16, 19, 0.985) 55%,
src/styles.css:10322: rgba(9, 9, 11, 0.995) 100%
src/styles.css:10324: border: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:10325: border-top-color: rgba(255, 255, 255, 0.16);
src/styles.css:10327: inset 8px 8px 18px rgba(0, 0, 0, 0.5),
src/styles.css:10328: inset -4px -4px 10px rgba(255, 255, 255, 0.03),
src/styles.css:10329: 0 0 0 1px rgba(255, 255, 255, 0.035),
src/styles.css:10330: 0 14px 34px rgba(0, 0, 0, 0.44);
src/styles.css:10337: rgba(28, 4, 7, 0.95) 0%,
src/styles.css:10338: rgba(16, 2, 4, 0.9) 100%
src/styles.css:10347: rgba(18, 18, 21, 0.97) 0%,
src/styles.css:10348: rgba(10, 10, 12, 0.985) 100%
src/styles.css:10403: outline: 2px solid rgba(59, 130, 246, 0.65);
src/styles.css:10455: box-shadow: 0 10px 24px rgba(0, 0, 0, 0.34);
src/styles.css:10482: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10484: background: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:10486: 14px 14px 28px rgba(0, 0, 0, 0.42),
src/styles.css:10487: -10px -10px 22px rgba(255, 255, 255, 0.03),
src/styles.css:10488: inset 1px 1px 0 rgba(255, 255, 255, 0.06),
src/styles.css:10489: inset -1px -1px 0 rgba(0, 0, 0, 0.55);
src/styles.css:10498: color: #8f949e;
src/styles.css:10521: color: #d7dbe3;
src/styles.css:10528: color: #f5f7fb;
src/styles.css:10530: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10532: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0) 28%),
src/styles.css:10533: linear-gradient(145deg, rgba(24, 24, 29, 0.99) 0%, rgba(32, 32, 37, 0.98) 52%, rgba(44, 44, 50, 0.96) 100%);
src/styles.css:10536: inset 8px 8px 16px rgba(0, 0, 0, 0.40),
src/styles.css:10537: inset -5px -5px 12px rgba(255, 255, 255, 0.028),
src/styles.css:10538: inset 1px 1px 0 rgba(255, 255, 255, 0.035),
src/styles.css:10539: 0 1px 0 rgba(255, 255, 255, 0.02);
src/styles.css:10557: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10558: background: linear-gradient(145deg, rgba(34, 34, 38, 0.97) 0%, rgba(16, 16, 18, 0.99) 100%);
src/styles.css:10560: 14px 14px 28px rgba(0, 0, 0, 0.42),
src/styles.css:10561: -10px -10px 22px rgba(255, 255, 255, 0.03),
src/styles.css:10562: inset 1px 1px 0 rgba(255, 255, 255, 0.06),
src/styles.css:10563: inset -1px -1px 0 rgba(0, 0, 0, 0.55);
src/styles.css:10576: border-color: rgba(255, 215, 0, 0.2);
src/styles.css:10578: 14px 14px 28px rgba(0, 0, 0, 0.42),
src/styles.css:10579: -10px -10px 22px rgba(255, 255, 255, 0.03),
src/styles.css:10580: inset 1px 1px 0 rgba(255, 215, 0, 0.07),
src/styles.css:10581: inset -1px -1px 0 rgba(0, 0, 0, 0.55);
src/styles.css:10585: border-color: rgba(232, 0, 45, 0.22);
src/styles.css:10587: 14px 14px 28px rgba(0, 0, 0, 0.42),
src/styles.css:10588: -10px -10px 22px rgba(255, 255, 255, 0.03),
src/styles.css:10589: inset 1px 1px 0 rgba(232, 0, 45, 0.09),
src/styles.css:10590: inset -1px -1px 0 rgba(0, 0, 0, 0.55);
src/styles.css:10594: color: #4e5260;
src/styles.css:10611: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:10612: background: linear-gradient(145deg, rgba(21, 21, 24, 0.98) 0%, rgba(9, 9, 11, 1) 100%);
src/styles.css:10613: color: #f3f6fb;
src/styles.css:10621: inset 4px 4px 9px rgba(0, 0, 0, 0.42),
src/styles.css:10622: inset -3px -3px 8px rgba(255, 255, 255, 0.025);
src/styles.css:10698: linear-gradient(154deg, rgba(4, 6, 8, 0.46) 0%, rgba(5, 7, 10, 0.38) 32%, rgba(4, 5, 7, 0.42) 58%, rgba(3, 4, 6, 0.5) 100%),
src/styles.css:10699: radial-gradient(circle at 22% 18%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 18%, transparent 34%),
src/styles.css:10700: radial-gradient(circle at 78% 14%, rgba(255, 214, 153, 0.18) 0%, rgba(255, 214, 153, 0.04) 18%, transparent 34%),
src/styles.css:10701: linear-gradient(rgba(232, 0, 45, 0.035) 1px, transparent 1px),
src/styles.css:10702: linear-gradient(90deg, rgba(232, 0, 45, 0.035) 1px, transparent 1px);
src/styles.css:10712: radial-gradient(circle at 50% 50%, transparent 52%, rgba(0, 0, 0, 0.08) 100%),
src/styles.css:10713: linear-gradient(180deg, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0.12) 100%);
src/styles.css:10748: rgba(255, 255, 255, 0.012) 0px,
src/styles.css:10749: rgba(255, 255, 255, 0.012) 1px,
src/styles.css:10755: rgba(255, 255, 255, 0.008) 0px,
src/styles.css:10756: rgba(255, 255, 255, 0.008) 1px,
src/styles.css:10760: linear-gradient(rgba(232, 0, 45, 0.07) 1px, transparent 1px),
src/styles.css:10761: linear-gradient(90deg, rgba(232, 0, 45, 0.07) 1px, transparent 1px),
src/styles.css:10762: radial-gradient(ellipse at 15% 20%, rgba(232, 0, 45, 0.12), transparent 40%),
src/styles.css:10763: radial-gradient(ellipse at 85% 25%, rgba(180, 180, 180, 0.06), transparent 45%),
src/styles.css:10764: radial-gradient(ellipse at 50% 75%, rgba(232, 0, 45, 0.05), transparent 50%),
src/styles.css:10776: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:10789: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:10791: linear-gradient(180deg, rgba(18, 18, 20, 0.98) 0%, rgba(10, 10, 12, 0.98) 100%);
src/styles.css:10793: 0 8px 18px rgba(0, 0, 0, 0.26),
src/styles.css:10794: inset 1px 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:10811: background: rgba(255, 255, 255, 0.02);
src/styles.css:10818: background: rgba(255, 255, 255, 0.04);
src/styles.css:10824: 0 0 0 1px rgba(232, 55, 44, 0.42),
src/styles.css:10825: 0 0 0 3px rgba(232, 55, 44, 0.1);
src/styles.css:10841: color: #6e7989;
src/styles.css:10849: color: #d7dde7;
src/styles.css:10861: color: #7b8698;
src/styles.css:10867: color: #d7dde7;
src/styles.css:10891: color: #7f8ca1;
src/styles.css:10897: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:10898: background: linear-gradient(145deg, rgba(36, 38, 44, 0.98) 0%, rgba(16, 17, 21, 0.98) 100%);
src/styles.css:10900: 0 4px 10px rgba(0, 0, 0, 0.3),
src/styles.css:10901: inset 1px 1px 0 rgba(255, 255, 255, 0.08),
src/styles.css:10902: inset -1px -1px 0 rgba(0, 0, 0, 0.32);
src/styles.css:10917: color: #f5a623;
src/styles.css:10938: border-color: rgba(255, 255, 255, 0.22);
src/styles.css:10940: 0 6px 14px rgba(0, 0, 0, 0.35),
src/styles.css:10941: inset 1px 1px 0 rgba(255, 255, 255, 0.12),
src/styles.css:10942: inset -1px -1px 0 rgba(0, 0, 0, 0.36);
src/styles.css:10947: border-color: rgba(232, 55, 44, 0.56);
src/styles.css:10949: 0 6px 14px rgba(0, 0, 0, 0.35),
src/styles.css:10950: 0 0 0 2px rgba(232, 55, 44, 0.12),
src/styles.css:10951: 0 0 16px rgba(232, 55, 44, 0.14),
src/styles.css:10952: inset 1px 1px 0 rgba(255, 255, 255, 0.14),
src/styles.css:10953: inset -1px -1px 0 rgba(0, 0, 0, 0.36);
src/styles.css:11004: 0 0 0 0 rgba(0, 255, 65, 0),
src/styles.css:11005: inset 0 0 12px rgba(0, 255, 65, 0.06);
src/styles.css:11009: 0 0 20px 4px rgba(0, 255, 65, 0.08),
src/styles.css:11010: inset 0 0 18px rgba(0, 255, 65, 0.1);
src/styles.css:11032: box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5);
src/styles.css:11054: background: #f4b24d;
src/styles.css:11060: color: #f4b24d;
src/styles.css:11076: color: #f4b24d;
src/styles.css:11086: border: 2px solid rgba(0, 255, 65, 0.25);
src/styles.css:11088: radial-gradient(circle at 40% 36%, rgba(0, 255, 65, 0.06) 0%, transparent 50%),
src/styles.css:11089: linear-gradient(180deg, rgba(0, 40, 16, 0.98) 0%, rgba(0, 12, 5, 0.99) 100%);
src/styles.css:11090: color: #00ff41;
src/styles.css:11111: background: linear-gradient(90deg, transparent, rgba(0, 255, 65, 0.5), transparent);
src/styles.css:11121: border: 1px solid rgba(0, 255, 65, 0.08);
src/styles.css:11127: border-color: rgba(57, 255, 136, 0.45);
src/styles.css:11128: color: #39ff88;
src/styles.css:11136: outline: 2px solid rgba(0, 255, 65, 0.5);
src/styles.css:11165: background: rgba(13, 17, 23, 0.96);
src/styles.css:11166: border-bottom: 1px solid #30363d;
src/styles.css:11193: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:11194: border-bottom-color: rgba(0, 0, 0, 0.72);
src/styles.css:11197: linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(111, 116, 124, 0.42) 4%, rgba(56, 59, 64, 0.94) 48%, rgba(25, 27, 31, 0.98) 49%, rgba(8, 9, 11, 0.98) 100%);
src/styles.css:11199: inset 0 1px 0 rgba(255, 255, 255, 0.24),
src/styles.css:11200: inset 0 -1px 0 rgba(0, 0, 0, 0.78),
src/styles.css:11201: 0 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:11216: border-right-color: rgba(0, 0, 0, 0.46);
src/styles.css:11218: linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(118, 122, 128, 0.12) 42%, rgba(0, 0, 0, 0.18) 100%);
src/styles.css:11219: color: #c1c5ca;
src/styles.css:11230: text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.82);
src/styles.css:11231: box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.08);
src/styles.css:11248: color: #f0f2f5;
src/styles.css:11250: linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(137, 141, 148, 0.18) 44%, rgba(0, 0, 0, 0.15) 100%);
src/styles.css:11251: border-top-color: rgba(255, 255, 255, 0.16);
src/styles.css:11256: border-color: rgba(244, 178, 77, 0.88);
src/styles.css:11257: border-bottom-color: #5a3200;
src/styles.css:11259: linear-gradient(180deg, rgba(255, 242, 202, 0.92) 0%, rgba(244, 178, 77, 0.98) 42%, rgba(196, 112, 19, 0.98) 100%);
src/styles.css:11260: text-shadow: 0 1px 0 rgba(255, 232, 170, 0.42);
src/styles.css:11262: inset 0 1px 0 rgba(255, 255, 255, 0.74),
src/styles.css:11263: inset 0 -1px 0 rgba(88, 43, 0, 0.72),
src/styles.css:11264: 0 0 12px rgba(244, 178, 77, 0.18);
src/styles.css:11268: background: rgba(70, 36, 0, 0.72);
src/styles.css:11296: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11297: background: rgba(255, 255, 255, 0.02);
src/styles.css:11298: color: #c9d1d9;
src/styles.css:11316: border: 1px solid #30363d;
src/styles.css:11318: linear-gradient(180deg, rgba(22, 27, 34, 0.98) 0%, rgba(13, 17, 23, 0.98) 100%);
src/styles.css:11319: box-shadow: 0 24px 48px rgba(0, 0, 0, 0.38);
src/styles.css:11328: color: #8b949e;
src/styles.css:11342: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:11344: background: rgba(255, 255, 255, 0.03);
src/styles.css:11345: color: #f5a623;
src/styles.css:11361: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11362: background: rgba(255, 255, 255, 0.03);
src/styles.css:11367: border-color: rgba(229, 62, 62, 0.68);
src/styles.css:11368: box-shadow: 0 0 0 2px rgba(229, 62, 62, 0.16);
src/styles.css:11395: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11396: background: rgba(255, 255, 255, 0.02);
src/styles.css:11403: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11407: color: #c9d1d9;
src/styles.css:11422: color: #8b949e;
src/styles.css:11439: border: 1px solid rgba(245, 166, 35, 0.34);
src/styles.css:11442: linear-gradient(180deg, rgba(35, 31, 18, 0.98) 0%, rgba(17, 17, 13, 0.98) 100%);
src/styles.css:11443: box-shadow: 0 18px 34px rgba(0, 0, 0, 0.42);
src/styles.css:11444: color: #f6c86f;
src/styles.css:11454: border-color: rgba(56, 189, 248, 0.28);
src/styles.css:11456: linear-gradient(180deg, rgba(12, 29, 39, 0.98) 0%, rgba(9, 15, 19, 0.98) 100%);
src/styles.css:11457: color: #8bd7ff;
src/styles.css:11466: linear-gradient(rgba(255, 255, 255, 0.032) 1px, transparent 1px),
src/styles.css:11467: linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px),
src/styles.css:11478: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
src/styles.css:11479: linear-gradient(90deg, rgba(255, 255, 255, 0.024) 1px, transparent 1px),
src/styles.css:11487: border: 1px solid rgba(255, 255, 255, 0.14);
src/styles.css:11490: linear-gradient(rgba(255, 255, 255, 0.026) 1px, transparent 1px),
src/styles.css:11491: linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
src/styles.css:11492: linear-gradient(180deg, rgba(13, 13, 13, 0.98), rgba(3, 3, 3, 0.98));
src/styles.css:11495: 0 24px 70px rgba(0, 0, 0, 0.58),
src/styles.css:11496: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:11501: color: #ffffff;
src/styles.css:11513: color: #9ca3af;
src/styles.css:11524: color: #f0f6fc;
src/styles.css:11538: color: #f0f6fc;
src/styles.css:11549: color: #d1d5db;
src/styles.css:11564: border: 1px solid rgba(255, 255, 255, 0.13);
src/styles.css:11567: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(8, 8, 8, 0.98) 100%);
src/styles.css:11568: color: #d7dde6;
src/styles.css:11587: border-color: rgba(229, 62, 62, 0.58);
src/styles.css:11589: linear-gradient(180deg, #ff2448 0%, #e8002d 48%, #8f001b 100%);
src/styles.css:11590: color: #fff;
src/styles.css:11615: border: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:11618: linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
src/styles.css:11619: linear-gradient(90deg, rgba(255, 255, 255, 0.017) 1px, transparent 1px),
src/styles.css:11620: linear-gradient(180deg, rgba(13, 13, 13, 0.98), rgba(4, 4, 4, 0.98));
src/styles.css:11622: box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:11633: color: #9ca3af;
src/styles.css:11645: color: #f0f6fc;
src/styles.css:11656: color: #6b7280;
src/styles.css:11661: color: #33cc66;
src/styles.css:11665: color: #ef4444;
src/styles.css:11670: border: 1px solid rgba(56, 189, 248, 0.24);
src/styles.css:11672: background: rgba(12, 29, 39, 0.58);
src/styles.css:11673: color: #8bd7ff;
src/styles.css:11680: border-color: rgba(239, 68, 68, 0.34);
src/styles.css:11681: background: rgba(57, 17, 17, 0.62);
src/styles.css:11682: color: #fecaca;
src/styles.css:11686: border-color: rgba(51, 204, 102, 0.28);
src/styles.css:11687: background: rgba(12, 42, 24, 0.58);
src/styles.css:11688: color: #a7f3d0;
src/styles.css:11695: color: #8b949e;
src/styles.css:11706: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:11708: background: #090b0f;
src/styles.css:11709: color: #f0f6fc;
src/styles.css:11722: border-color: rgba(232, 0, 45, 0.42);
src/styles.css:11727: color: #f0f6fc;
src/styles.css:11736: color: #ff2448;
src/styles.css:11742: color: #9ca3af;
src/styles.css:11760: color: #8fa4bc;
src/styles.css:11761: background: rgba(255, 255, 255, 0.025);
src/styles.css:11762: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:11769: color: #f8fafc;
src/styles.css:11770: border-color: rgba(232, 0, 45, 0.32);
src/styles.css:11771: background: rgba(232, 0, 45, 0.1);
src/styles.css:11776: color: #dfe6f0;
src/styles.css:11800: color: #ffffff;
src/styles.css:11812: color: #9ca3af;
src/styles.css:11826: border: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:11829: linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
src/styles.css:11830: linear-gradient(90deg, rgba(255, 255, 255, 0.017) 1px, transparent 1px),
src/styles.css:11831: linear-gradient(180deg, rgba(13, 13, 13, 0.96), rgba(5, 5, 5, 0.96));
src/styles.css:11833: box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
src/styles.css:11844: color: #f8fafc;
src/styles.css:11853: color: #8fa4bc;
src/styles.css:11868: color: #d1d5db;
src/styles.css:11881: color: #dfe6f0;
src/styles.css:11882: background: rgba(0, 0, 0, 0.45);
src/styles.css:11883: border: 1px solid rgba(255, 255, 255, 0.13);
src/styles.css:11894: border-color: rgba(232, 0, 45, 0.36);
src/styles.css:11895: box-shadow: 0 0 0 1px rgba(232, 0, 45, 0.12);
src/styles.css:11911: color: #9ca3af;
src/styles.css:11912: background: rgba(255, 255, 255, 0.018);
src/styles.css:11913: border: 1px solid rgba(255, 255, 255, 0.09);
src/styles.css:11922: accent-color: #e8002d;
src/styles.css:11938: accent-color: #e8002d;
src/styles.css:11957: border: 1px solid rgba(255, 255, 255, 0.09);
src/styles.css:11959: background: rgba(255, 255, 255, 0.018);
src/styles.css:11965: color: #6b7a8d;
src/styles.css:11992: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:11994: background: rgba(255, 255, 255, 0.016);
src/styles.css:12001: color: #f8fafc;
src/styles.css:12007: color: #e8002d;
src/styles.css:12014: accent-color: #e8002d;
src/styles.css:12021: color: #8fa4bc;
src/styles.css:12030: color: #dfe6f0;
src/styles.css:12032: linear-gradient(rgba(255, 255, 255, 0.032) 1px, transparent 1px),
src/styles.css:12033: linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px),
src/styles.css:12041: border: 1px solid rgba(255, 255, 255, 0.14);
src/styles.css:12044: linear-gradient(rgba(255, 255, 255, 0.026) 1px, transparent 1px),
src/styles.css:12045: linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
src/styles.css:12046: linear-gradient(180deg, rgba(13, 13, 13, 0.98), rgba(3, 3, 3, 0.98));
src/styles.css:12048: box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
src/styles.css:12057: border-bottom: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:12061: color: #f3f4f6;
src/styles.css:12080: color: #6b7280;
src/styles.css:12081: border: 1px solid rgba(255, 255, 255, 0.09);
src/styles.css:12083: background: rgba(0, 0, 0, 0.28);
src/styles.css:12092: color: #ffffff;
src/styles.css:12093: border-color: rgba(232, 0, 45, 0.46);
src/styles.css:12095: linear-gradient(180deg, rgba(232, 0, 45, 0.28), rgba(72, 0, 14, 0.42));
src/styles.css:12108: border-top: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:12113: color: #9ca3af;
src/styles.css:12233: border: 1px solid #30363d;
src/styles.css:12235: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:12237: 0 28px 60px rgba(0, 0, 0, 0.42),
src/styles.css:12238: inset 0 1px 0 rgba(255, 255, 255, 0.04);
src/styles.css:12248: border-bottom: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:12253: color: #f0f6fc;
src/styles.css:12269: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:12271: background: rgba(255, 255, 255, 0.03);
src/styles.css:12272: color: #8b949e;
src/styles.css:12308: radial-gradient(circle at 50% 22%, rgba(255, 255, 255, 0.042) 0%, rgba(255, 255, 255, 0.012) 14%, transparent 31%),
src/styles.css:12309: radial-gradient(circle at 18% 15%, rgba(112, 121, 133, 0.088) 0%, rgba(112, 121, 133, 0.026) 17%, transparent 34%),
src/styles.css:12310: radial-gradient(circle at 82% 13%, rgba(126, 134, 146, 0.075) 0%, rgba(126, 134, 146, 0.024) 16%, transparent 33%),
src/styles.css:12311: radial-gradient(circle at 57% 80%, rgba(66, 73, 82, 0.13) 0%, rgba(66, 73, 82, 0.036) 20%, transparent 42%),
src/styles.css:12312: linear-gradient(150deg, #23282f 0%, #1b2026 18%, #15191f 38%, #101419 60%, #0b0d11 82%, #06080b 100%);
src/styles.css:12314: border-right: 1px solid #30363d;
src/styles.css:12351: linear-gradient(154deg, rgba(4, 6, 8, 0.46) 0%, rgba(5, 7, 10, 0.38) 32%, rgba(4, 5, 7, 0.42) 58%, rgba(3, 4, 6, 0.5) 100%),
src/styles.css:12352: radial-gradient(circle at 22% 18%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 18%, transparent 34%),
src/styles.css:12353: radial-gradient(circle at 78% 14%, rgba(255, 214, 153, 0.18) 0%, rgba(255, 214, 153, 0.04) 18%, transparent 34%),
src/styles.css:12354: linear-gradient(rgba(232, 0, 45, 0.035) 1px, transparent 1px),
src/styles.css:12355: linear-gradient(90deg, rgba(232, 0, 45, 0.035) 1px, transparent 1px);
src/styles.css:12363: radial-gradient(circle at 50% 50%, transparent 52%, rgba(0, 0, 0, 0.08) 100%),
src/styles.css:12364: linear-gradient(180deg, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0.12) 100%);
src/styles.css:12417: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:12420: background: rgba(13, 17, 23, 0.94);
src/styles.css:12421: color: #c9d1d9;
src/styles.css:12427: background: rgba(13, 17, 23, 0.94);
src/styles.css:12452: color: rgba(240, 246, 252, 0.72);
src/styles.css:12459: background: rgba(106, 171, 125, 0.18);
src/styles.css:12470: border-color: rgba(139, 110, 184, 0.42);
src/styles.css:12471: background: rgba(20, 17, 24, 0.97);
src/styles.css:12477: linear-gradient(rgba(139, 110, 184, 0.045) 1px, transparent 1px),
src/styles.css:12478: linear-gradient(90deg, rgba(139, 110, 184, 0.03) 1px, transparent 1px),
src/styles.css:12479: radial-gradient(ellipse at 30% 12%, rgba(139, 110, 184, 0.09) 0%, transparent 52%),
src/styles.css:12480: radial-gradient(ellipse at 80% 80%, rgba(192, 139, 85, 0.05) 0%, transparent 48%),
src/styles.css:12481: linear-gradient(160deg, #1e1914 0%, #19160f 28%, #141009 60%, #0e0b06 100%);
src/styles.css:12491: linear-gradient(rgba(106, 171, 125, 0.04) 1px, transparent 1px),
src/styles.css:12492: linear-gradient(90deg, rgba(106, 171, 125, 0.028) 1px, transparent 1px),
src/styles.css:12493: radial-gradient(ellipse at 26% 12%, rgba(106, 171, 125, 0.095) 0%, transparent 50%),
src/styles.css:12494: radial-gradient(ellipse at 82% 78%, rgba(192, 139, 85, 0.07) 0%, transparent 48%),
src/styles.css:12495: linear-gradient(160deg, #1f1b13 0%, #1a1711 30%, #141109 62%, #0d0b06 100%);
src/styles.css:12505: linear-gradient(rgba(234, 179, 8, 0.04) 1px, transparent 1px),
src/styles.css:12506: linear-gradient(90deg, rgba(234, 179, 8, 0.026) 1px, transparent 1px),
src/styles.css:12507: radial-gradient(ellipse at 24% 12%, rgba(234, 179, 8, 0.085) 0%, transparent 50%),
src/styles.css:12508: radial-gradient(ellipse at 82% 78%, rgba(192, 139, 85, 0.07) 0%, transparent 48%),
src/styles.css:12509: linear-gradient(160deg, #211a0c 0%, #1b160d 30%, #141009 62%, #0d0b06 100%);
src/styles.css:12519: linear-gradient(rgba(59, 130, 246, 0.035) 1px, transparent 1px),
src/styles.css:12520: linear-gradient(90deg, rgba(59, 130, 246, 0.024) 1px, transparent 1px),
src/styles.css:12521: radial-gradient(ellipse at 24% 12%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
src/styles.css:12522: radial-gradient(ellipse at 82% 78%, rgba(192, 139, 85, 0.065) 0%, transparent 48%),
src/styles.css:12523: linear-gradient(160deg, #181b20 0%, #151719 30%, #11100c 62%, #0b0906 100%);
src/styles.css:12745: color: #4d2d00;
src/styles.css:12852: border: 1px solid #0f5c2b;
src/styles.css:12854: background: #053d17;
src/styles.css:12869: background: #075523;
src/styles.css:12912: color: #93c5fd;
src/styles.css:12972: border: 1px solid rgba(59, 130, 246, 0.24);
src/styles.css:12974: background: rgba(255, 255, 255, 0.018);
src/styles.css:13004: border-color: rgba(139, 110, 184, 0.7);
src/styles.css:13012: --private-plan-border-strong: rgba(139, 110, 184, 0.46);
src/styles.css:13073: border: 1px solid rgba(139, 110, 184, 0.36);
src/styles.css:13075: background: rgba(139, 110, 184, 0.1);
src/styles.css:13148: border-color: rgba(139, 110, 184, 0.5);
src/styles.css:13149: background: rgba(139, 110, 184, 0.1);
src/styles.css:13195: border-color: rgba(139, 110, 184, 0.52);
src/styles.css:13196: background: rgba(139, 110, 184, 0.14);
src/styles.css:13237: border-color: rgba(139, 110, 184, 0.52);
src/styles.css:13238: background: rgba(139, 110, 184, 0.08);
src/styles.css:13271: color: rgba(240, 246, 252, 0.76);
src/styles.css:13289: background: rgba(0, 0, 0, 0.2);
src/styles.css:13346: border-color: rgba(139, 110, 184, 0.5);
src/styles.css:13366: border-color: rgba(139, 110, 184, 0.5);
src/styles.css:13367: background: rgba(139, 110, 184, 0.1);
src/styles.css:13378: border: 1px solid rgba(139, 110, 184, 0.3);
src/styles.css:13380: background: rgba(139, 110, 184, 0.07);
src/styles.css:13389: border-color: rgba(217, 139, 69, 0.32);
src/styles.css:13390: background: rgba(217, 139, 69, 0.08);
src/styles.css:13391: color: #f2a35b;
src/styles.css:13498: background: rgba(255,255,255,0.012);
src/styles.css:13506: border: 1px solid rgba(139, 110, 184, 0.28);
src/styles.css:13508: background: rgba(139, 110, 184, 0.055);
src/styles.css:13553: border-color: rgba(139, 110, 184, 0.52);
src/styles.css:13570: background: rgba(139, 110, 184, 0.18);
src/styles.css:13594: border-color: rgba(184, 92, 92, 0.28);
src/styles.css:13599: border-color: rgba(139, 110, 184, 0.24);
src/styles.css:13647: border-color: rgba(184, 92, 92, 0.5);
src/styles.css:13648: background: rgba(184, 92, 92, 0.18);
src/styles.css:13653: border-color: rgba(139, 110, 184, 0.46);
src/styles.css:13654: background: rgba(139, 110, 184, 0.12);
src/styles.css:13663: border: 1px solid rgba(139, 110, 184, 0.3);
src/styles.css:13665: background: rgba(139, 110, 184, 0.07);
src/styles.css:13685: border-color: rgba(106, 171, 125, 0.28);
src/styles.css:13694: border-color: rgba(217, 139, 69, 0.32);
src/styles.css:13699: color: #f2a35b;
src/styles.css:13703: border-color: rgba(184, 92, 92, 0.38);
src/styles.css:13713: border-color: rgba(255, 255, 255, 0.1);
src/styles.css:13714: background: rgba(255, 255, 255, 0.04);
src/styles.css:13715: color: rgba(240, 246, 252, 0.7);
src/styles.css:13751: background: rgba(0, 0, 0, 0.82);
src/styles.css:13762: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:13764: background: rgba(13, 17, 23, 0.96);
src/styles.css:13777: color: #f0f6fc;
src/styles.css:13790: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:13792: background: rgba(255, 255, 255, 0.045);
src/styles.css:13793: color: rgba(240, 246, 252, 0.8);
src/styles.css:13798: border-color: rgba(184, 92, 92, 0.45);
src/styles.css:13806: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:13808: background: #0d1117;
src/styles.css:13813: border-color: rgba(139, 110, 184, 0.3);
src/styles.css:13816: border-color: rgba(139, 110, 184, 0.72);
src/styles.css:13822: border-color: rgba(139, 110, 184, 0.34);
src/styles.css:13825: border-color: rgba(139, 110, 184, 0.74);
src/styles.css:13889: background: #e53e3e;
src/styles.css:13890: box-shadow: 0 0 16px rgba(229, 62, 62, 0.62);
src/styles.css:13894: color: #f0f6fc;
src/styles.css:13917: background: rgba(255, 255, 255, 0.025);
src/styles.css:13975: border: 1px solid rgba(0, 255, 65, 0.15);
src/styles.css:13977: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:13978: box-shadow: 0 10px 24px rgba(0, 0, 0, 0.36);
src/styles.css:14011: border-top: 1px solid rgba(0, 255, 65, 0.1);
src/styles.css:14012: background: rgba(0, 255, 65, 0.03);
src/styles.css:14013: color: rgba(0, 255, 65, 0.35);
src/styles.css:14021: background: rgba(0, 255, 65, 0.06);
src/styles.css:14022: color: rgba(0, 255, 65, 0.6);
src/styles.css:14039: linear-gradient(145deg, rgba(36, 36, 40, 0.97) 0%, rgba(16, 16, 18, 0.99) 100%);
src/styles.css:14040: box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
src/styles.css:14088: color: #c9d1d9;
src/styles.css:14101: border: 1px solid rgba(229, 62, 62, 0.42);
src/styles.css:14103: linear-gradient(180deg, rgba(93, 18, 26, 0.98) 0%, rgba(58, 12, 18, 0.99) 100%);
src/styles.css:14104: color: #fff2f2;
src/styles.css:14123: linear-gradient(180deg, rgba(0, 40, 16, 0.98) 0%, rgba(0, 20, 8, 0.99) 100%);
src/styles.css:14124: color: #00ff41;
src/styles.css:14138: rgba(0, 255, 65, 0.03) 3px,
src/styles.css:14139: rgba(0, 255, 65, 0.03) 4px
src/styles.css:14153: background: #00ff41;
src/styles.css:14154: box-shadow: 0 0 8px rgba(0, 255, 65, 0.5);
src/styles.css:14159: 0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(0, 255, 65, 0.4); }
src/styles.css:14160: 50% { opacity: 0.5; box-shadow: 0 0 12px rgba(0, 255, 65, 0.7); }
src/styles.css:14165: linear-gradient(180deg, rgba(0, 50, 20, 0.98) 0%, rgba(0, 28, 12, 0.99) 100%);
src/styles.css:14166: color: #39ff88;
src/styles.css:14167: box-shadow: inset 0 0 20px rgba(0, 255, 65, 0.06);
src/styles.css:14171: outline: 2px solid rgba(0, 255, 65, 0.6);
src/styles.css:14176: color: #f0f6fc;
src/styles.css:14184: border-color: rgba(229, 62, 62, 0.18);
src/styles.css:14188: border-color: rgba(57, 255, 136, 0.38);
src/styles.css:14192: color: #39ff88;
src/styles.css:14204: border-left: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:14215: --agent-notes-border-bright: #2a2a2a;
src/styles.css:14216: --agent-notes-amber: #d98b45;
src/styles.css:14218: --agent-notes-cyan: #69a7c8;
src/styles.css:14219: --agent-notes-muted: #555555;
src/styles.css:14239: border-bottom: 1px solid #4d2d00;
src/styles.css:14305: box-shadow: inset 0 0 0 1px rgba(217, 139, 69, 0.28);
src/styles.css:14350: background: rgba(255, 179, 0, 0.12);
src/styles.css:14351: border: 1px solid rgba(255, 179, 0, 0.28);
src/styles.css:14352: color: #ffb300;
src/styles.css:14356: background: rgba(0, 209, 102, 0.12);
src/styles.css:14357: border: 1px solid rgba(0, 209, 102, 0.28);
src/styles.css:14362: background: rgba(255, 68, 85, 0.12);
src/styles.css:14363: border: 1px solid rgba(255, 68, 85, 0.28);
src/styles.css:14368: color: #8b949e;
src/styles.css:14381: background: rgba(255, 255, 255, 0.06);
src/styles.css:14452: background: rgba(255, 255, 255, 0.12);
src/styles.css:14453: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:14461: box-shadow: 0 0 4px rgba(0, 209, 102, 0.4);
src/styles.css:14485: border-color: rgba(255, 179, 0, 0.35);
src/styles.css:14486: box-shadow: inset 0 0 6px rgba(255, 179, 0, 0.08);
src/styles.css:14490: border-color: rgba(255, 68, 85, 0.45);
src/styles.css:14491: box-shadow: inset 0 0 6px rgba(255, 68, 85, 0.12);
src/styles.css:14540: border-color: rgba(0, 209, 102, 0.34);
src/styles.css:14541: color: #00c853;
src/styles.css:14542: box-shadow: var(--shadow-btn-hover), 0 0 12px rgba(0, 200, 83, 0.08);
src/styles.css:14558: background: rgba(0, 0, 0, 0.72);
src/styles.css:14571: linear-gradient(145deg, rgba(26, 26, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:14573: 0 28px 70px rgba(0, 0, 0, 0.54),
src/styles.css:14574: inset 0 1px 0 rgba(255, 255, 255, 0.045);
src/styles.css:14588: border-bottom: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:14616: color: #c9d1d9;
src/styles.css:14642: background: rgba(255, 255, 255, 0.025);
src/styles.css:14643: color: #c9d1d9;
src/styles.css:14649: color: #ffb4b4;
src/styles.css:14650: background: rgba(255, 68, 85, 0.08);
src/styles.css:14655: color: #d5d9e0;
src/styles.css:14659: color: #00c853;
src/styles.css:14688: border-bottom: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:14698: background: rgba(255, 255, 255, 0.035);
src/styles.css:14748: background: rgba(0, 200, 83, 0.2);
src/styles.css:14749: color: #00c853;
src/styles.css:14753: background: rgba(138, 138, 138, 0.2);
src/styles.css:14754: color: #8a8a8a;
src/styles.css:14759: background: rgba(255, 255, 255, 0.018);
src/styles.css:14775: color: #f0f6fc;
src/styles.css:14791: border-top: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:14820: border-color: rgba(255, 255, 255, 0.16);
src/styles.css:14852: color: #c9d1d9;
src/styles.css:14863: border: 1px solid color-mix(in srgb, var(--snp-route-color) 38%, rgba(255, 255, 255, 0.08));
src/styles.css:14864: background: color-mix(in srgb, var(--snp-route-color) 10%, rgba(255, 255, 255, 0.02));
src/styles.css:14890: border: 1px solid color-mix(in srgb, var(--snp-route-color) 40%, rgba(255, 255, 255, 0.1));
src/styles.css:14891: color: #f0f6fc;
src/styles.css:14903: color: #f0f6fc;
src/styles.css:14909: color: #8b949e;
src/styles.css:14915: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:14926: border-color: rgba(210, 153, 34, 0.24);
src/styles.css:14927: background: rgba(210, 153, 34, 0.08);
src/styles.css:14928: color: #f3cd73;
src/styles.css:14932: border-color: rgba(229, 62, 62, 0.24);
src/styles.css:14933: background: rgba(229, 62, 62, 0.1);
src/styles.css:14934: color: #ffb0b0;
src/styles.css:14939: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:14940: background: rgba(255, 255, 255, 0.025);
src/styles.css:14952: color: #f0f6fc;
src/styles.css:14963: color: #8b949e;
src/styles.css:14978: color: #c9d1d9;
src/styles.css:15030: color: #c9d1d9;
src/styles.css:15092: color: #f5c866;
src/styles.css:15098: color: #ffb4b4;
src/styles.css:15103: color: #ffb4b4;
src/styles.css:15132: border-color: rgba(0, 209, 102, 0.4);
src/styles.css:15133: background: rgba(0, 209, 102, 0.1);
src/styles.css:15135: box-shadow: inset 0 0 6px rgba(0, 209, 102, 0.08);
src/styles.css:15140: border-color: rgba(255, 68, 85, 0.4);
src/styles.css:15141: background: rgba(255, 68, 85, 0.1);
src/styles.css:15143: box-shadow: inset 0 0 6px rgba(255, 68, 85, 0.08);
src/styles.css:15165: border-color: rgba(255, 179, 0, 0.35);
src/styles.css:15166: box-shadow: inset 0 0 6px rgba(255, 179, 0, 0.08);
src/styles.css:15182: linear-gradient(180deg, rgba(24, 24, 28, 0.98) 0%, rgba(14, 14, 16, 0.99) 100%);
src/styles.css:15183: box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
src/styles.css:15231: background: rgba(255, 255, 255, 0.03);
src/styles.css:15271: background: color-mix(in srgb, var(--sep-state-badge-color) 8%, rgba(255, 255, 255, 0.02));
src/styles.css:15283: border: 1px solid rgba(210, 153, 34, 0.24);
src/styles.css:15284: background: rgba(210, 153, 34, 0.06);
src/styles.css:15285: color: #f3cd73;
src/styles.css:15294: border-color: rgba(255, 68, 85, 0.28);
src/styles.css:15295: background: rgba(255, 68, 85, 0.08);
src/styles.css:15312: background: color-mix(in srgb, var(--sep-state-play-color) 6%, rgba(255, 255, 255, 0.02));
src/styles.css:15339: border: 1px solid rgba(210, 153, 34, 0.18);
src/styles.css:15340: background: rgba(210, 153, 34, 0.04);
src/styles.css:15359: color: #c9d1d9;
src/styles.css:15372: background: rgba(255, 255, 255, 0.02);
src/styles.css:15446: background: rgba(255, 255, 255, 0.02);
src/styles.css:15478: background: rgba(255, 255, 255, 0.03);
src/styles.css:15479: color: #c9d1d9;
src/styles.css:15563: background: rgba(255, 255, 255, 0.06);
src/styles.css:15618: border: 1px solid rgba(0, 209, 102, 0.18);
src/styles.css:15620: linear-gradient(180deg, rgba(10, 26, 14, 0.92) 0%, rgba(8, 14, 10, 0.98) 100%);
src/styles.css:15672: box-shadow: 18px 0 40px rgba(0, 0, 0, 0.42);
src/styles.css:15918: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:15920: background: rgba(255, 255, 255, 0.03);
src/styles.css:15933: color: rgba(255, 255, 255, 0.28);
src/styles.css:15939: border-color: rgba(255, 255, 255, 0.18);
src/styles.css:15940: box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
src/styles.css:15944: border-color: rgba(255, 68, 85, 0.45);
src/styles.css:15945: box-shadow: inset 0 0 6px rgba(255, 68, 85, 0.12);
src/styles.css:15964: color: rgba(240, 246, 252, 0.78);
src/styles.css:15980: background: rgba(255, 255, 255, 0.04);
src/styles.css:15986: border-left-color: rgba(255, 255, 255, 0.22);
src/styles.css:15987: background: rgba(255, 255, 255, 0.06);
src/styles.css:15993: border-left-color: rgba(255, 255, 255, 0.22);
src/styles.css:15994: background: rgba(255, 255, 255, 0.06);
src/styles.css:16000: border-left-color: rgba(255, 255, 255, 0.22);
src/styles.css:16001: background: rgba(255, 255, 255, 0.06);
src/styles.css:16014: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:16017: linear-gradient(145deg, rgba(21, 21, 26, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%);
src/styles.css:16018: box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
src/styles.css:16022: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:16026: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:16030: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:16042: background: rgba(255, 171, 0, 0.08);
src/styles.css:16043: color: #f3cd73;
src/styles.css:16056: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:16058: background: rgba(255, 255, 255, 0.02);
src/styles.css:16059: color: rgba(240, 246, 252, 0.6);
src/styles.css:16071: border-color: rgba(255, 255, 255, 0.16);
src/styles.css:16081: border: 1px solid rgba(255, 171, 0, 0.42);
src/styles.css:16084: linear-gradient(180deg, rgba(64, 42, 0, 0.95) 0%, rgba(40, 25, 0, 0.98) 100%);
src/styles.css:16085: color: #ffd07a;
src/styles.css:16096: border-color: rgba(255, 171, 0, 0.6);
src/styles.css:16097: color: #ffe0a0;
src/styles.css:16099: linear-gradient(180deg, rgba(78, 52, 0, 0.95) 0%, rgba(50, 32, 0, 0.98) 100%);
src/styles.css:16115: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:16118: linear-gradient(180deg, rgba(24, 24, 24, 0.82) 0%, rgba(14, 14, 14, 0.95) 100%);
src/styles.css:16125: background: rgba(255, 255, 255, 0.03);
src/styles.css:16126: color: #c9d1d9;
src/styles.css:16165: color: #c9d1d9;
src/styles.css:16177: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:16179: background: rgba(255, 255, 255, 0.03);
src/styles.css:16180: color: rgba(240, 246, 252, 0.68);
src/styles.css:16187: color: #00c853;
src/styles.css:16188: border-color: rgba(0, 200, 83, 0.3);
src/styles.css:16206: background: rgba(255, 255, 255, 0.025);
src/styles.css:16207: color: #c9d1d9;
src/styles.css:16216: background: rgba(255, 68, 85, 0.08);
src/styles.css:16217: color: #ffb4b4;
src/styles.css:16240: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:16242: background: rgba(255, 255, 255, 0.03);
src/styles.css:16274: background: rgba(138, 138, 138, 0.6);
src/styles.css:16279: background: #00c853;
src/styles.css:16280: box-shadow: 0 0 6px rgba(0, 200, 83, 0.45);
src/styles.css:16310: background: rgba(0, 200, 83, 0.2);
src/styles.css:16311: color: #00c853;
src/styles.css:16315: background: rgba(138, 138, 138, 0.15);
src/styles.css:16316: color: #555;
src/styles.css:16322: color: #8b949e;
src/styles.css:16329: color: #c9d1d9;
src/styles.css:16347: color: rgba(240, 246, 252, 0.78);
src/styles.css:16370: color: #8b949e;
src/styles.css:16384: background: rgba(255, 255, 255, 0.025);
src/styles.css:16394: color: #f0f6fc;
src/styles.css:16402: color: #8b949e;
src/styles.css:16445: background: rgba(255, 255, 255, 0.03);
src/styles.css:16446: color: #c9d1d9;
src/styles.css:16458: background: rgba(255, 255, 255, 0.025);
src/styles.css:16459: color: #c9d1d9;
src/styles.css:16468: background: rgba(255, 68, 85, 0.08);
src/styles.css:16469: color: #ffb4b4;
src/styles.css:16489: border: 1px solid rgba(0, 200, 83, 0.45);
src/styles.css:16492: linear-gradient(180deg, rgba(0, 70, 28, 0.5) 0%, rgba(0, 40, 18, 0.7) 100%);
src/styles.css:16493: color: #c8f7d6;
src/styles.css:16504: border-color: rgba(0, 200, 83, 0.7);
src/styles.css:16505: color: #e7ffec;
src/styles.css:16507: linear-gradient(180deg, rgba(0, 90, 36, 0.55) 0%, rgba(0, 55, 24, 0.78) 100%);
src/styles.css:16512: color: rgba(240, 246, 252, 0.55);
src/styles.css:16521: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:16523: background: rgba(255, 255, 255, 0.03);
src/styles.css:16524: color: rgba(240, 246, 252, 0.68);
src/styles.css:16530: color: #00c853;
src/styles.css:16531: border-color: rgba(0, 200, 83, 0.3);
src/styles.css:16557: --sep-term-hover: #0b376f;
src/styles.css:16559: --sep-term-border-bright: #2a2a2a;
src/styles.css:16560: --sep-term-amber: #d98b45;
src/styles.css:16561: --sep-term-amber-bright: #f2a35b;
src/styles.css:16562: --sep-term-yellow: #f4b24d;
src/styles.css:16563: --sep-term-cyan: #69a7c8;
src/styles.css:16564: --sep-term-cyan-bright: #9bc9e0;
src/styles.css:16565: --sep-term-blue: #0a5797;
src/styles.css:16566: --sep-term-blue-bright: #2f86c7;
src/styles.css:16567: --sep-term-red: #c41e1e;
src/styles.css:16568: --sep-term-red-dark: #8a1414;
src/styles.css:16569: --sep-term-red-bright: #ff3838;
src/styles.css:16570: --sep-term-green: #33cc66;
src/styles.css:16571: --sep-term-muted: #555555;
src/styles.css:16572: --sep-term-white: #ffffff;
src/styles.css:16895: border-color: #4d2d00;
src/styles.css:17052: border-color: #4d2d00;
src/styles.css:17312: background: #000;
src/styles.css:17351: background: #000;
src/styles.css:17441: .rts-status--active { border-color: var(--status-live); background: var(--status-live); color: #000; }
src/styles.css:17442: .rts-status--progress { border-color: var(--status-pending); background: var(--status-pending); color: #000; }
src/styles.css:17444: .rts-status--action { border-color: var(--status-offline); background: var(--status-offline); color: #000; }
src/styles.css:17455: background: #000;
src/styles.css:17520: background: rgba(0, 0, 0, 0.82);
src/styles.css:17534: box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
src/styles.css:17646: color: #000;
src/styles.css:17725: background: #000;
src/styles.css:18059: background: #000; color: var(--eg-amber); font-family: var(--eg-font-mono);
src/styles.css:18067: .agent-dash-scope select { max-width: 240px; border: 1px solid var(--eg-border); background: #000; color: var(--eg-amber); padding: 7px 10px; font: 11px var(--eg-font-mono); }
src/styles.css:18072: .agent-dashboard button { border: 1px solid var(--eg-border); background: #000; color: var(--eg-amber); padding: 8px 12px; font: inherit; font-size: 11px; cursor: pointer; }
src/styles.css:18109: .agent-dash-pie-slice { stroke: #000; stroke-width: 1.5; transition: opacity .15s; }
src/styles.css:18137: max-width: 100%; min-height: 34px; border: 1px solid var(--eg-border); background: #000;
src/styles.css:18144: .agent-status-log thead { position: sticky; top: 0; background: #000; }
src/styles.css:18164: .contact-toast { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; background: var(--eg-surface-2, #171717); color: var(--eg-text, #eee); border: 1px solid var(--eg-accent, #f97316); box-shadow: 0 8px 32px #0008; font-size: 13px; }
src/styles.css:18165: .contact-toast.is-error { border-color: #ef6464; }
src/styles.css:18167: .contacts-create-toolbar, .contacts-new-form, .contacts-merge-prompt { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px; border-bottom: 1px solid var(--eg-border, #333); }
src/styles.css:18169: .contacts-merge-prompt { color: var(--eg-accent, #f97316); }
src/styles.css:18172: .compose-picker-panel { position: absolute; bottom: calc(100% + 12px); right: 0; z-index: 100; width: min(340px, calc(100vw - 40px)); max-height: min(440px, 65vh); overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: var(--eg-surface-2, #171717); color: var(--eg-text, #eee); border: 1px solid var(--eg-accent, #f97316); box-shadow: 0 8px 30px #0009; }
src/styles.css:18175: .compose-picker-panel small, .compose-picker-panel a { font-size: 10px; color: var(--eg-text-dim, #aaa); }
src/styles.css:18177: .compose-picker-categories button { padding: 5px; background: transparent; border: 1px solid #444; color: inherit; cursor: pointer; font-size: 11px; }
src/styles.css:18178: .compose-picker-categories button.is-active { border-color: var(--eg-accent, #f97316); color: var(--eg-accent, #f97316); }
src/styles.css:18181: .compose-emoji-grid button:hover, .compose-emoji-grid button:focus-visible { background: #ffffff15; }
src/styles.css:18183: .compose-gif-grid button { border: 1px solid #444; padding: 0; background: #111; cursor: pointer; }
src/styles.css:18205: border: 1px solid var(--script-term-amber, #d98b45) !important;
src/styles.css:18207: background-color: #000000 !important;
src/styles.css:18209: color: var(--script-term-amber, #d98b45) !important;
src/styles.css:18221: outline: 2px solid var(--script-term-amber, #d98b45);
src/styles.css:18230: color: var(--script-term-amber, #d98b45);
src/styles.css:18267: color: var(--script-term-cyan, #69a7c8);
src/styles.css:18276: color: #e8002d;
src/styles.css:18293: color: #B8B8C8;
src/styles.css:18303: color: var(--script-term-amber, #d98b45);
src/styles.css:18321: outline: 2px solid var(--script-term-amber, #d98b45);
src/styles.css:18343: color: var(--script-term-amber, #d98b45);
src/styles.css:18350: border-color: var(--script-term-green, #33cc66);
src/styles.css:18351: background: #053d17;
src/styles.css:18352: color: var(--script-term-green, #33cc66);
src/styles.css:18361: .vendor-routing__config input, .vendor-routing select { color: inherit; background: var(--surface, #151c2b); border: 1px solid var(--border, #334155); border-radius: 7px; padding: 8px; }
src/styles.css:18364: .vendor-routing__age span { border: 1px solid var(--border, #334155); border-radius: 7px; padding: 8px; }
src/styles.css:18365: .vendor-routing__stale { color: #fbbf24; border-color: #b45309 !important; }
src/styles.css:18368: .vendor-routing__table th, .vendor-routing__table td { border-bottom: 1px solid var(--border, #334155); padding: 8px; text-align: left; white-space: nowrap; }
src/styles.css:18370: .phone-expanded__zip-gate { border: 1px solid #b45309; border-radius: 8px; padding: 12px; margin: 10px 0; background: rgba(180,83,9,.12); color: inherit; }
src/styles.css:18374: .phone-expanded__zip-block { margin-top: 10px; padding: 10px; border-radius: 6px; background: #7f1d1d; color: #fff; font-weight: 700; }
src/styles.css:18376: .paragon-callbacks__row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border, #334155); }
src/styles.css:18425: .opps-column-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0; padding: 15px 14px; min-height: 74px; box-sizing: border-box; color: var(--text-primary); background: color-mix(in srgb, var(--stage-color) 24%, #10121b); }
src/styles.css:18428: .opps-column-head span { font-size: 10px; color: rgba(255,255,255,.72); }
src/styles.css:18429: .opps-column-head > button { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 26px; height: 26px; border: 0; border-radius: 4px; color: rgba(255,255,255,.72); background: transparent; cursor: pointer; }
src/styles.css:18430: .opps-column-head > button:hover { color: #fff; background: rgba(255,255,255,.08); }
src/styles.css:18433: .opps-card { border: 0; border-radius: 8px; padding: 14px 12px 9px; background: color-mix(in srgb, var(--stage-color) 32%, #171b27); color: var(--text-primary); display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,.12); cursor: pointer; }
src/styles.css:18434: .opps-card:hover { box-shadow: 0 3px 9px rgba(0,0,0,.22); }
src/styles.css:18442: .opps-days { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 20px; padding: 3px 7px; color: rgba(255,255,255,.82); background: rgba(0,0,0,.2); font-size: 10px; line-height: 1.3; }
src/styles.css:18445: .opps-card-values dt { color: rgba(255,255,255,.63); }
src/styles.css:18448: .opps-card-action { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 28px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: rgba(255,255,255,.56); cursor: pointer; }
src/styles.css:18449: .opps-card-action:hover:not(:disabled) { color: #fff; background: rgba(255,255,255,.07); }
src/styles.css:18450: .opps-action-count { position: absolute; right: -5px; top: -3px; width: 16px; height: 16px; padding: 0; box-sizing: border-box; border-radius: 50%; background: #3b82f6; color: #fff; font-size: 8px; line-height: 16px; text-align: center; pointer-events: none; }
src/styles.css:18456: .opps-overlay { position: fixed; inset: 0; z-index: 12000; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 20px; }
src/styles.css:18458: .opps-dialog { width: min(800px, 100%); max-height: calc(100dvh - 40px); display: flex; flex-direction: column; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--clay-radius, 8px); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; box-shadow: 0 16px 60px rgba(0,0,0,.5); }
src/styles.css:18474: .opps-danger { color: var(--status-error, #f87171) !important; }
src/styles.css:18479: .opps-row-menu { position: fixed; z-index: 11000; width: 180px; box-sizing: border-box; padding: 6px; border: 1px solid var(--border-default); border-radius: 6px; background: var(--bg-surface); box-shadow: 0 8px 28px rgba(0,0,0,.45); }
src/styles.css:18489: .opps-tags-popover { position: fixed; z-index: 11000; width: 280px; box-sizing: border-box; padding: 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font: 12px var(--font-mono, ui-monospace, monospace); box-shadow: 0 8px 28px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 12px; max-height: calc(100dvh - 24px); overflow-y: auto; }
src/styles.css:18533: .call-status { color: #3ccf7a; }
src/styles.css:18535: .call-outcome.is-enrolled { color: #f5a524; font-weight: 700; }
src/styles.css:18536: .call-outcome.is-callback { color: #7fb8ff; }
src/styles.css:18537: .call-status-missed { color: #ff9b8f; }
src/styles.css:18542: .call-compliance-pill.compliance-low { color: #ff9b8f; background: rgba(255, 155, 143, .1); border-color: rgba(255, 155, 143, .2); }
src/styles.css:18543: .call-compliance-pill.compliance-high { color: #3ccf7a; background: rgba(60, 207, 122, .08); border-color: rgba(60, 207, 122, .2); }
src/styles.css:18574: .call-audio-bar input[type="range"] { flex: 1; min-width: 30px; width: 100%; padding: 0; accent-color: #f5a524; cursor: pointer; }
src/styles.css:18587: .call-transcript-line:hover:not(:disabled) { background: rgba(245, 165, 36, .04); }
src/styles.css:18588: .call-transcript-line.is-current { background: rgba(245, 165, 36, .08); border-left-color: #f5a524; }
src/styles.css:18591: .call-transcript-speaker.is-agent { color: #f5a524; }
src/styles.css:18592: .call-transcript-speaker.is-customer { color: #7fb8ff; }
src/styles.css:18636: .call-log-tab .call-log-toolbar-icon.is-active { color: var(--eg-accent); border-color: var(--eg-accent); background: rgba(245, 165, 36, .06); }
src/styles.css:18645: .call-date-days .call-date-day.is-in-range { background: rgba(245, 165, 36, .1); color: var(--eg-accent); }
```

## Borders
```text
src/AgentTools.css:24: border-bottom: 1px solid var(--border-subtle);
src/AgentTools.css:30: border: none;
src/AgentTools.css:58: border-radius: 999px;
src/AgentTools.css:68: border-radius: 6px;
src/AgentTools.css:69: border: 1px solid var(--border-subtle);
src/AgentTools.css:71: transition: border-color 0.15s ease, box-shadow 0.15s ease;
src/AgentTools.css:75: border-color: rgba(255, 179, 0, 0.35);
src/AgentTools.css:87: border: none;
src/AgentTools.css:94: outline: none;
src/AgentTools.css:108: border-radius: 999px;
src/AgentTools.css:109: border: 1px solid var(--border-subtle);
src/AgentTools.css:113: transition: border-color 0.15s ease, color 0.15s ease;
src/AgentTools.css:117: border-color: var(--border-default);
src/AgentTools.css:149: border-radius: 8px;
src/AgentTools.css:150: border: 1px solid var(--border-subtle);
src/AgentTools.css:155: transition: border-color 0.15s ease, background 0.15s ease;
src/AgentTools.css:160: border-color: var(--border-default);
src/AgentTools.css:194: border-radius: 8px;
src/AgentTools.css:223: border-radius: 8px;
src/AgentTools.css:224: border: 1px solid var(--border-subtle);
src/AgentTools.css:249: border-radius: 12px;
src/AgentTools.css:250: border: 1px solid var(--border-subtle);
src/AgentTools.css:265: border-bottom: 1px solid var(--border-subtle);
src/AgentTools.css:316: border-radius: 999px;
src/AgentTools.css:317: border: 1px solid var(--border-subtle);
src/AgentTools.css:321: transition: border-color 0.15s ease, color 0.15s ease;
src/AgentTools.css:325: border-color: var(--border-default);
src/AgentTools.css:349: border-radius: 8px;
src/AgentTools.css:350: border: 1px solid var(--border-subtle);
src/AgentTools.css:354: transition: border-color 0.15s ease, background 0.15s ease;
src/AgentTools.css:360: border-color: var(--border-default);
src/AgentTools.css:407: border-radius: 8px;
src/AgentTools.css:408: border: 1px solid var(--border-subtle);
src/AgentTools.css:460: border-radius: 6px;
src/AgentTools.css:461: border: 1px solid var(--border-subtle);
src/AgentTools.css:467: outline: none;
src/AgentTools.css:468: transition: border-color 0.15s ease, box-shadow 0.15s ease;
src/AgentTools.css:472: border-color: rgba(255, 179, 0, 0.35);
src/AgentTools.css:481: border-radius: 6px;
src/AgentTools.css:482: border: 1px solid rgba(0, 209, 102, 0.18);
src/AgentTools.css:508: border-radius: 6px;
src/AgentTools.css:535: border-radius: 6px;
src/AgentTools.css:536: border: 1px solid var(--border-subtle);
src/AgentTools.css:540: transition: border-color 0.15s ease;
src/AgentTools.css:544: border-color: var(--border-default);
src/AgentTools.css:573: border-radius: 6px;
src/AgentTools.css:574: border: 1px solid var(--border-subtle);
src/AgentTools.css:581: border-radius: 999px;
src/AgentTools.css:634: border-top: 1px solid var(--border-subtle);
src/AgentTools.css:655: border-radius: 8px;
src/AgentTools.css:656: border: 1px solid var(--border-subtle);
src/AgentTools.css:675: border-radius: 999px;
src/AgentTools.css:676: border: 1px solid rgba(255, 179, 0, 0.2);
src/AgentTools.css:695: border-bottom: 1px solid rgba(232, 55, 44, 0.1);
src/AgentTools.css:758: border-radius: 6px;
src/AgentTools.css:759: border: 1px solid var(--border-subtle);
src/AgentTools.css:768: transition: border-color 0.15s ease, color 0.15s ease;
src/AgentTools.css:777: border-color: var(--border-default);
src/AgentTools.css:836: border: 1px solid var(--border-subtle);
src/AgentTools.css:837: border-radius: 999px;
src/AgentTools.css:847: transition: border-color 0.15s ease, color 0.15s ease;
src/AgentTools.css:855: border-color: rgba(232, 0, 45, 0.3);
src/AgentTools.css:937: border-radius: 10px;
src/AgentTools.css:938: border: 1px solid var(--border-subtle);
src/AgentTools.css:972: border-radius: 999px;
src/AgentTools.css:974: border: 1px solid var(--border-subtle);
src/AgentTools.css:986: border-radius: 999px;
src/AgentTools.css:1042: border-radius: 8px;
src/AgentTools.css:1043: border: 1px solid var(--border-subtle);
src/AgentTools.css:1050: border-color: rgba(255, 68, 85, 0.16);
src/AgentTools.css:1076: border-radius: 999px;
src/AgentTools.css:1077: border: 1px solid var(--border-subtle);
src/AgentTools.css:1086: transition: border-color 0.15s ease, color 0.15s ease;
src/AgentTools.css:1091: border-color: var(--border-default);
src/AgentTools.css:1095: border-color: rgba(232, 0, 45, 0.3);
src/AgentTools.css:1107: border-radius: 999px;
src/AgentTools.css:1116: border-radius: 10px;
src/AgentTools.css:1117: border: 1px solid var(--border-subtle);
src/AgentTools.css:1163: border: none;
src/AgentTools.css:1196: border-top: 1px solid var(--border-subtle);
src/AgentTools.css:1254: border-radius: 8px;
src/AgentTools.css:1255: border-left: 3px solid transparent;
src/AgentTools.css:1260: border-left-color: var(--accent-cyan);
src/AgentTools.css:1265: border-left-color: var(--accent-gold);
src/AgentTools.css:1270: border-left-color: var(--accent-red);
src/AgentTools.css:1303: border-radius: 8px;
src/AgentTools.css:1304: border-left: 3px solid var(--accent-cyan);
src/AgentTools.css:1317: border-radius: 999px;
src/AgentTools.css:1318: border: 1px solid var(--border-subtle);
src/AgentTools.css:1322: transition: border-color 0.15s ease, color 0.15s ease;
src/AgentTools.css:1327: border-color: var(--border-default);
src/AgentTools.css:1353: border-radius: 8px;
src/AgentTools.css:1354: border: 1px solid var(--border-subtle);
src/AgentTools.css:1360: border-collapse: collapse;
src/AgentTools.css:1367: border-bottom: 1px solid var(--border-subtle);
src/AgentTools.css:1389: border-bottom: none;
src/AgentTools.css:1394: border-radius: 3px;
src/AgentTools.css:1575: border: 1px solid rgba(255, 255, 255, 0.08);
src/AgentTools.css:1576: border-radius: 8px;
src/AgentTools.css:1581: outline: none;
src/AgentTools.css:1582: transition: border-color 0.15s ease, box-shadow 0.15s ease;
src/AgentTools.css:1583: box-sizing: border-box;
src/AgentTools.css:1591: border-color: rgba(255, 255, 255, 0.18);
src/AgentTools.css:1607: border: 1px solid rgba(255, 255, 255, 0.08);
src/AgentTools.css:1608: border-radius: 999px;
src/AgentTools.css:1617: transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
src/AgentTools.css:1626: border-color: rgba(96, 165, 250, 0.5);
src/AgentTools.css:1633: border-radius: 10px;
src/AgentTools.css:1634: border: 1px dashed rgba(255, 255, 255, 0.08);
src/AgentTools.css:1653: border: 1px solid rgba(255, 255, 255, 0.06);
src/AgentTools.css:1654: border-radius: 12px;
src/AgentTools.css:1687: border-radius: 999px;
src/AgentTools.css:1730: border-radius: 10px;
src/AgentTools.css:1741: border: 0;
src/AgentTools.css:1768: border-radius: 999px;
src/AgentTools.css:1807: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/AgentTools.css:1822: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/AgentTools.css:1830: border: 1px solid rgba(255, 255, 255, 0.08);
src/AgentTools.css:1831: border-radius: 999px;
src/AgentTools.css:1840: transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
src/AgentTools.css:1844: border-color: rgba(96, 165, 250, 0.5);
src/AgentTools.css:1851: border: 1px solid var(--rail-term-border) !important;
src/AgentTools.css:1852: border-radius: 0 !important;
src/AgentTools.css:1863: border-radius: 0 !important;
src/AgentTools.css:1869: border-bottom: 1px solid #4d2d00 !important;
src/AgentTools.css:1885: border: 0 !important;
src/AgentTools.css:1886: border-left: 1px solid #4d2d00 !important;
src/AgentTools.css:1903: scrollbar-color: var(--rail-term-border-bright) transparent;
src/AgentTools.css:1916: border-top: 1px solid var(--rail-term-border);
src/AgentTools.css:1917: border-left: 1px solid var(--rail-term-border);
src/AgentTools.css:1924: border: 0;
src/AgentTools.css:1925: border-right: 1px solid var(--rail-term-border);
src/AgentTools.css:1926: border-bottom: 1px solid var(--rail-term-border);
src/AgentTools.css:1933: border-color: var(--rail-term-border);
src/AgentTools.css:1947: border: 1px solid var(--rail-term-border-bright);
src/AgentTools.css:1990: border: 1px solid var(--rail-term-border, var(--eg-surface-3)) !important;
src/AgentTools.css:1991: border-radius: 0 !important;
src/AgentTools.css:2000: border-bottom: 1px solid var(--rail-term-border, var(--eg-surface-3)) !important;
src/AgentTools.css:2027: border: 1px solid var(--rail-term-border-bright, #2a2a2a) !important;
src/AgentTools.css:2048: border-top: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2049: border-left: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2062: border: 0;
src/AgentTools.css:2063: border-right: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2064: border-bottom: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2073: border-color: var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2113: border: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2118: border-bottom: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2125: border: 1px solid var(--rail-term-border-bright, #2a2a2a);
src/AgentTools.css:2135: border-color: var(--rail-term-blue-bright, #2f86c7);
src/AgentTools.css:2152: border-top: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2153: border-left: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2162: border-right: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2163: border-bottom: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2188: border: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2205: border: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2234: border: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2245: border-color: var(--rail-term-blue-bright, #2f86c7);
src/AgentTools.css:2261: border: 1px solid var(--rail-term-border-bright, #2a2a2a);
src/AgentTools.css:2275: border-color: var(--rail-term-green, #33cc66);
src/AgentTools.css:2281: border-color: var(--rail-term-red, #ff3838);
src/AgentTools.css:2294: border-color: var(--rail-term-green, #33cc66);
src/AgentTools.css:2298: border-color: var(--rail-term-red, #ff3838);
src/AgentTools.css:2348: border: 1px solid var(--rail-term-border-bright, #2a2a2a);
src/AgentTools.css:2362: border-color: var(--rail-term-blue-bright, #2f86c7);
src/AgentTools.css:2441: border: 1px solid var(--rail-term-border, var(--eg-surface-3));
src/AgentTools.css:2487: --rail-term-border: var(--border-default);
src/AgentTools.css:2488: --rail-term-border-bright: var(--eg-border-hover);
src/AgentTools.css:2538: border-color: var(--border-default) !important;
src/AgentTools.css:2550: border-color: var(--accent) !important;
src/AgentTools.css:2605: border-color: var(--eg-border-hover) !important;
src/AgentTools.css:2613: border-color: var(--border-focus) !important;
src/AgentTools.css:2621: border-color: var(--status-offline-border) !important;
src/AgentTools.css:2629: border-color: var(--status-pending-border) !important;
src/AgentTools.css:2636: border-color: var(--status-live-border) !important;
src/AgentTools.css:2642: border-left: 0 !important;
src/AgentTools.css:2643: outline: 1px solid var(--border-default);
src/App.jsx:120: borderRadius: "5px",
src/App.jsx:130: border: "1px solid var(--border-default)",
src/App.jsx:131: borderRadius: "7px",
src/App.jsx:157: border: "1px solid var(--border-default)",
src/App.jsx:158: borderRadius: "5px",
src/App.jsx:166: backgroundColor: "var(--border-default)",
src/App.jsx:185: border: "1px solid var(--border-default)",
src/App.jsx:186: borderRadius: "5px",
src/App.jsx:194: border: "none",
src/App.jsx:195: borderRadius: "5px",
src/App.jsx:220: { id: "ma", label: "MA", title: "Medicare Advantage", color: "var(--eg-flow-ma)", border: "var(--flow-ma-border)", bg: "var(--flow-ma-bg)" },
src/App.jsx:221: { id: "aca", label: "ACA", title: "ACA On-Exchange", color: "var(--eg-flow-aca)", border: "var(--flow-aca-border)", bg: "var(--flow-aca-bg)" },
src/App.jsx:222: { id: "medsup", label: "MS", title: "Medicare Supplement", color: "var(--eg-flow-ms)", border: "var(--flow-medsup-border)", bg: "var(--flow-medsup-bg)" },
src/App.jsx:223: { id: "u65", label: "U65", title: "U65 Off-Exchange", color: "var(--eg-flow-u65)", border: "var(--flow-u65-border)", bg: "var(--flow-u65-bg)" },
src/App.jsx:224: { id: "ancillary", label: "ANC", title: "Ancillary", color: "var(--eg-amber)", border: "var(--flow-ancillary-border)", bg: "var(--flow-ancillary-bg)" },
src/App.jsx:253: "--flow-border": activeFlow.border,
src/App.jsx:288: "--flow-border": flow.border,
src/SEPLookupTool.css:14: border-radius: 22px;
src/SEPLookupTool.css:29: border: 1px solid rgba(173, 173, 173, 0.14);
src/SEPLookupTool.css:30: border-radius: 16px;
src/SEPLookupTool.css:39: border: none;
src/SEPLookupTool.css:45: outline: none;
src/SEPLookupTool.css:58: border: 1px solid rgba(173, 173, 173, 0.18) !important;
src/SEPLookupTool.css:59: border-top: 1px solid rgba(173, 173, 173, 0.18) !important;
src/SEPLookupTool.css:67: border: 1px solid rgba(173, 173, 173, 0.22) !important;
src/SEPLookupTool.css:68: border-top: 1px solid rgba(173, 173, 173, 0.22) !important;
src/SEPLookupTool.css:93: border-radius: 50px;
src/SEPLookupTool.css:94: border: 1px solid var(--border-default);
src/SEPLookupTool.css:107: border-color: rgba(232, 0, 45, 0.3);
src/SEPLookupTool.css:128: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:129: border-radius: var(--radius-md);
src/SEPLookupTool.css:142: border-radius: var(--radius-md) var(--radius-md) 0 0;
src/SEPLookupTool.css:152: border-color: rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:189: border: 1px solid rgba(255, 255, 255, 0.05) !important;
src/SEPLookupTool.css:190: border-top-color: rgba(255, 255, 255, 0.08) !important;
src/SEPLookupTool.css:208: border: 1px solid var(--border-default);
src/SEPLookupTool.css:224: border: 1px solid rgba(255, 255, 255, 0.05) !important;
src/SEPLookupTool.css:225: border-top-color: rgba(255, 255, 255, 0.08) !important;
src/SEPLookupTool.css:234: border-collapse: collapse;
src/SEPLookupTool.css:239: border-bottom: 1px solid var(--border-default);
src/SEPLookupTool.css:256: border-bottom: 1px solid var(--border-subtle);
src/SEPLookupTool.css:290: border-radius: 50px;
src/SEPLookupTool.css:294: border: 1px solid rgba(173, 173, 173, 0.15);
src/SEPLookupTool.css:310: border-radius: var(--radius-sm);
src/SEPLookupTool.css:312: border: 1px solid rgba(255, 255, 255, 0.05);
src/SEPLookupTool.css:340: border-radius: 3px;
src/SEPLookupTool.css:348: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:355: border-radius: 50px;
src/SEPLookupTool.css:360: border: 1px solid rgba(251, 191, 36, 0.15);
src/SEPLookupTool.css:367: border-radius: 50px;
src/SEPLookupTool.css:379: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:384: border: 1px solid rgba(173, 173, 173, 0.2);
src/SEPLookupTool.css:389: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:394: border: 1px solid rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:399: border: 1px solid rgba(232, 0, 45, 0.25);
src/SEPLookupTool.css:404: border: 1px solid rgba(173, 173, 173, 0.25);
src/SEPLookupTool.css:409: border: 1px solid rgba(251, 191, 36, 0.25);
src/SEPLookupTool.css:416: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:417: border-radius: var(--radius-lg);
src/SEPLookupTool.css:431: border-radius: var(--radius-lg) var(--radius-lg) 0 0;
src/SEPLookupTool.css:446: border-color: rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:450: border-color: rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:470: border-bottom: 1px solid var(--border-subtle);
src/SEPLookupTool.css:492: border-radius: 50px;
src/SEPLookupTool.css:500: border: 1px solid rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:505: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:510: border: 1px solid rgba(52, 211, 153, 0.2);
src/SEPLookupTool.css:515: border: 1px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:524: border-radius: 50px;
src/SEPLookupTool.css:532: border: 1px solid rgba(248, 113, 113, 0.15);
src/SEPLookupTool.css:537: border: 1px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:546: border-radius: 50px;
src/SEPLookupTool.css:553: border: 1px solid rgba(248, 113, 113, 0.2);
src/SEPLookupTool.css:558: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:563: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:576: border-radius: var(--radius-sm);
src/SEPLookupTool.css:578: border: 1px solid var(--border-default);
src/SEPLookupTool.css:610: border-color: rgba(248, 113, 113, 0.3) !important;
src/SEPLookupTool.css:634: border-radius: var(--radius-md);
src/SEPLookupTool.css:687: border-top: none;
src/SEPLookupTool.css:690: border-radius: var(--radius-md);
src/SEPLookupTool.css:692: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:711: border-radius: 999px;
src/SEPLookupTool.css:722: border: 1px solid rgba(0, 209, 102, 0.2);
src/SEPLookupTool.css:728: border: 1px solid rgba(251, 191, 36, 0.22);
src/SEPLookupTool.css:740: border: 3px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:741: border-top-color: #E8002D;
src/SEPLookupTool.css:742: border-radius: 50%;
src/SEPLookupTool.css:751: border: 2.5px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:752: border-top-color: #E8002D;
src/SEPLookupTool.css:753: border-radius: 50%;
src/SEPLookupTool.css:771: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:772: border-radius: var(--radius-lg);
src/SEPLookupTool.css:824: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:825: border-radius: 50px;
src/SEPLookupTool.css:836: border-radius: 50px;
src/SEPLookupTool.css:837: border: 1px solid var(--border-default);
src/SEPLookupTool.css:851: border-color: rgba(232, 0, 45, 0.3);
src/SEPLookupTool.css:867: border: 1px solid rgba(255, 255, 255, 0.06);
src/SEPLookupTool.css:868: border-radius: 22px;
src/SEPLookupTool.css:880: border: none;
src/SEPLookupTool.css:881: border-radius: 16px;
src/SEPLookupTool.css:900: border: 1px solid rgba(255, 255, 255, 0.06);
src/SEPLookupTool.css:917: border-radius: var(--radius-lg);
src/SEPLookupTool.css:918: border: 1px dashed rgba(251, 191, 36, 0.25);
src/SEPLookupTool.css:946: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:947: border-radius: var(--radius-lg);
src/SEPLookupTool.css:958: border-bottom: 1px solid var(--border-subtle);
src/SEPLookupTool.css:974: border: 1px solid rgba(232, 0, 45, 0.15);
src/SEPLookupTool.css:975: border-radius: 50px;
src/SEPLookupTool.css:984: border-bottom: 1px solid var(--border-subtle);
src/SEPLookupTool.css:991: border: none;
src/SEPLookupTool.css:992: outline: none;
src/SEPLookupTool.css:1021: border-radius: 10px;
src/SEPLookupTool.css:1029: border-radius: 50px;
src/SEPLookupTool.css:1030: border: 1px solid var(--border-default);
src/SEPLookupTool.css:1043: border-color: rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1050: border-color: rgba(232, 0, 45, 0.35);
src/SEPLookupTool.css:1092: border-collapse: collapse;
src/SEPLookupTool.css:1097: border-bottom: 1px solid var(--border-default);
src/SEPLookupTool.css:1111: border-bottom: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1150: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1151: border-radius: var(--radius-lg);
src/SEPLookupTool.css:1161: border-bottom: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1177: border-right: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1200: border-bottom: 1px solid rgba(255, 255, 255, 0.03);
src/SEPLookupTool.css:1217: border: none;
src/SEPLookupTool.css:1218: border-radius: 10px;
src/SEPLookupTool.css:1262: border-radius: 10px;
src/SEPLookupTool.css:1290: border: 2.5px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1291: border-top-color: #E8002D;
src/SEPLookupTool.css:1292: border-radius: 50%;
src/SEPLookupTool.css:1301: border-right: none;
src/SEPLookupTool.css:1302: border-bottom: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1358: border-radius: 50%;
src/SEPLookupTool.css:1391: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1392: border-radius: 50px;
src/SEPLookupTool.css:1402: border: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1403: border-radius: var(--radius-sm);
src/SEPLookupTool.css:1406: transition: border-color 0.15s;
src/SEPLookupTool.css:1411: border-color: rgba(173, 173, 173, 0.2);
src/SEPLookupTool.css:1415: border-left: 2px solid rgba(232, 0, 45, 0.5);
src/SEPLookupTool.css:1419: border-left: 2px solid rgba(251, 191, 36, 0.4);
src/SEPLookupTool.css:1429: border: none;
src/SEPLookupTool.css:1455: border-radius: 3px;
src/SEPLookupTool.css:1462: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1468: border: 1px solid rgba(251, 191, 36, 0.2);
src/SEPLookupTool.css:1496: border-top: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1524: border: 1px solid rgba(232, 0, 45, 0.2);
src/SEPLookupTool.css:1525: border-radius: 3px;
src/SEPLookupTool.css:1552: border-radius: 3px;
src/SEPLookupTool.css:1553: border: 1px solid;
src/SEPLookupTool.css:1565: border-radius: 3px;
src/SEPLookupTool.css:1566: border: 1px solid;
src/SEPLookupTool.css:1573: border-color: rgba(232, 0, 45, 0.22);
src/SEPLookupTool.css:1579: border-color: rgba(148, 163, 184, 0.18);
src/SEPLookupTool.css:1585: border-color: rgba(251, 191, 36, 0.18);
src/SEPLookupTool.css:1621: border-radius: var(--radius-sm);
src/SEPLookupTool.css:1622: border: 1px solid var(--border-default);
src/SEPLookupTool.css:1634: border-color: rgba(232, 0, 45, 0.3);
src/SEPLookupTool.css:1639: border-top: 1px solid var(--border-subtle);
src/SEPLookupTool.css:1737: border-color: var(--border-default) !important;
src/SEPLookupTool.css:1746: border-color: var(--eg-border-hover) !important;
src/SEPLookupTool.css:1754: border-color: var(--border-focus) !important;
src/SEPLookupTool.css:1762: border-color: var(--accent) !important;
src/SEPLookupTool.css:1773: border-color: var(--accent) !important;
src/SEPLookupTool.css:1782: border-color: var(--selection-bg) !important;
src/SEPLookupTool.css:1802: border-color: var(--border-default) !important;
src/SEPLookupTool.css:1820: border-color: var(--status-offline-border) !important;
src/SEPLookupTool.css:1828: border-color: var(--status-live-border) !important;
src/SEPLookupTool.css:1835: border-color: var(--status-pending-border) !important;
src/SEPLookupTool.css:1841: border-left: 0 !important;
src/SEPLookupTool.css:1842: outline: 1px solid var(--status-pending-border);
src/compliance/intents/pecl.js:372: 'You will be receiving a Summary of Benefits document that outlines everything we discussed today. I want to make sure you have that for your records.',
src/components/ACAIntelligence.jsx:58: borderRadius: "var(--eg-radius-card)",
src/components/ACAIntelligence.jsx:59: border: "1px solid var(--eg-border)",
src/components/ACAIntelligence.jsx:317: border: "1px solid var(--status-pending-border)",
src/components/ACAIntelligence.jsx:318: borderRadius: 999,
src/components/ACAIntelligence.jsx:339: background: "var(--status-pending-bg)", border: "1px solid var(--status-pending-border)",
src/components/ACAIntelligence.jsx:340: borderRadius: 999, padding: "7px 20px", cursor: loading ? "wait" : "pointer",
src/components/ACAIntelligence.jsx:354: <div style={{ ...card, borderColor: "var(--status-offline-border)", color: "var(--status-offline)", fontSize: "0.8rem" }}>{error}</div>
src/components/ACAIntelligence.jsx:367: borderRadius: 12,
src/components/ACAIntelligence.jsx:368: border: "1px solid var(--border-default)",
src/components/ACAIntelligence.jsx:395: <pre style={{ ...diffBoxStyle, borderColor: "var(--status-live-border)" }}>{preview.afterLines}</pre>
src/components/ACAIntelligence.jsx:413: borderColor: "var(--status-live-border)",
src/components/ACAIntelligence.jsx:441: <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
src/components/ACAIntelligence.jsx:443: <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
src/components/ACAIntelligence.jsx:453: <tr key={t.metal} style={{ borderBottom: "1px solid var(--border-default)" }}>
src/components/ACAIntelligence.jsx:455: <span style={{ width: 8, height: 8, borderRadius: "50%", background: METAL_COLORS[t.metal] || "var(--text-muted)", flexShrink: 0 }} />
src/components/ACAIntelligence.jsx:484: padding: "3px 10px", borderRadius: 999,
src/components/ACAIntelligence.jsx:485: background: "var(--status-pending-bg)", border: "1px solid var(--status-pending-border)",
src/components/ACAIntelligence.jsx:501: borderRadius: 3, background: "var(--status-pending-border)",
src/components/ACAIntelligence.jsx:541: borderRadius: 10,
src/components/ACAIntelligence.jsx:542: border: "1px solid var(--status-offline-border)",
src/components/ACAIntelligence.jsx:551: border: "1px solid var(--border-default)",
src/components/ACAIntelligence.jsx:552: background: "var(--border-default)",
src/components/ACAIntelligence.jsx:553: borderRadius: 999,
src/components/CallHistory.jsx:114: borderBottom: "1px solid var(--border-default)",
src/components/CallHistory.jsx:124: borderBottom: "1px solid var(--border-default)",
src/components/CallHistory.jsx:132: borderBottom: "1px solid var(--border-default)",
src/components/CallHistory.jsx:147: <table style={{ width: "100%", borderCollapse: "collapse" }}>
src/components/CallHistory.jsx:173: borderRadius: "50%",
src/components/CallHistory.jsx:197: borderRadius: 3,
src/components/CallHistory.jsx:201: border: s.completed
src/components/CallHistory.jsx:202: ? "1px solid var(--status-live-border)"
src/components/CallHistory.jsx:203: : "1px solid var(--status-pending-border)",
src/components/CarrierRef.jsx:23: border: "var(--border-default)",
src/components/CarrierRef.jsx:99: borderRadius: 14,
src/components/CarrierRef.jsx:100: border: `1px solid ${tint(color, open ? 25 : 10)}`,
src/components/CarrierRef.jsx:120: border: "none",
src/components/CarrierRef.jsx:128: width: 8, height: 8, borderRadius: "50%",
src/components/CarrierRef.jsx:184: borderRadius: 999,
src/components/CarrierRef.jsx:186: border: `1px solid ${tint(color, 20)}`,
src/components/CarrierRef.jsx:197: e.currentTarget.style.borderColor = tint(color, 40);
src/components/CarrierRef.jsx:202: e.currentTarget.style.borderColor = tint(color, 20);
src/components/CarrierRef.jsx:213: borderRadius: 999,
src/components/CarrierRef.jsx:215: border: `1px solid ${tint(color, 20)}`,
src/components/CarrierRef.jsx:242: borderRadius: 999,
src/components/CarrierRef.jsx:243: border: `1px solid ${tint(color, 25)}`,
src/components/CarrierRef.jsx:324: border: "1px solid var(--border-default)",
src/components/CarrierRef.jsx:325: borderRadius: 8,
src/components/CarrierRef.jsx:345: borderRadius: 10,
src/components/CarrierRef.jsx:347: border: `1px solid ${tint(seg.color, 15)}`,
src/components/CarrierRef.jsx:406: borderRadius: 14, border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
src/components/CarrierRef.jsx:419: padding: "2px 8px", borderRadius: 999,
src/components/CarrierRef.jsx:421: border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
src/components/CarrierRef.jsx:441: borderRadius: 999,
src/components/CarrierRef.jsx:442: border: "1px solid var(--border-default)",
src/components/CarrierRef.jsx:715: border:
src/components/CarrierRef.jsx:718: : "1px solid var(--border-default)",
src/components/CarrierRef.jsx:719: borderRadius: 999,
src/components/CarrierRef.jsx:736: borderRadius: "50%",
src/components/CarrierRef.jsx:891: border: "1px solid var(--border-default)",
src/components/CarrierRef.jsx:892: borderRadius: 12,
src/components/CarrierRef.jsx:929: borderRadius: "50%",
src/components/CarrierRef.jsx:974: border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
src/components/CarrierRef.jsx:975: borderRadius: 12,
src/components/CarrierRef.jsx:1028: borderRadius: 3,
src/components/CarrierRef.jsx:1030: border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
src/components/CarrierRef.jsx:1041: borderRadius: 3,
src/components/CarrierRef.jsx:1043: border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
src/components/CarrierRef.jsx:1054: borderRadius: 3,
src/components/CarrierRef.jsx:1056: border: "1px solid var(--border-default)",
src/components/CarrierRef.jsx:1118: background: "color-mix(in srgb, var(--text-primary) 5%, transparent)", border: "1px solid var(--border-default)",
src/components/CarrierRef.jsx:1119: borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer",
src/components/CarrierRef.jsx:1129: borderRadius: 10, padding: "12px 14px",
src/components/CarrierRef.jsx:1130: border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
src/components/CarrierRef.jsx:1150: borderRadius: 14,
src/components/CarrierRef.jsx:1151: border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
src/components/CarrierRef.jsx:1178: borderRadius: 999,
src/components/CarrierRef.jsx:1179: border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
src/components/CarrierRef.jsx:1197: borderRadius: 14, border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
src/components/CarrierRef.jsx:1213: padding: "3px 9px", borderRadius: 999,
src/components/CarrierRef.jsx:1215: border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
src/components/CarrierRef.jsx:1314: borderRadius: 999,
src/components/CarrierRef.jsx:1315: border: `1px solid ${tint(seg.color, 20)}`,
src/components/CarrierRef.jsx:1383: borderRadius: 10,
src/components/CarrierRef.jsx:1385: border: "1px solid var(--border-default)",
src/components/CollapsibleWidget.jsx:78: border: "1px solid var(--eg-border)",
src/components/CollapsibleWidget.jsx:79: borderRadius: "var(--eg-radius-card)",
src/components/CollapsibleWidget.jsx:98: borderBottom: collapsed ? "none" : "1px solid var(--eg-border)",
src/components/CollapsibleWidget.jsx:99: transition: "border-bottom 0.2s ease",
src/components/CompactCopilotRail.jsx:36: border: "1px solid var(--eg-border)",
src/components/CompactCopilotRail.jsx:37: borderRadius: "var(--eg-radius-card)",
src/components/ComplianceDashboard.jsx:58: return `var(--score-${scoreBand(s)}-border)`;
src/components/ComplianceDashboard.jsx:162: const border = getScoreBorder(cat.score);
src/components/ComplianceDashboard.jsx:173: borderRadius: 3,
src/components/ComplianceDashboard.jsx:176: outline: `1px solid ${isExpanded ? border : "transparent"}`,
src/components/ComplianceDashboard.jsx:211: border: `1px solid ${border}`,
src/components/ComplianceDashboard.jsx:212: borderRadius: 4,
src/components/ComplianceDashboard.jsx:265: borderRadius: 4,
src/components/ComplianceDashboard.jsx:266: outline: `1px solid ${isViolation ? "var(--status-offline-border)" : getScoreBorder(q.score)}`,
src/components/ComplianceDashboard.jsx:355: borderRadius: 2,
src/components/ComplianceDashboard.jsx:364: borderRadius: 2,
src/components/ComplianceDashboard.jsx:502: borderBottom: isExpanded ? "1px solid var(--border-default)" : "none",
src/components/ComplianceDashboard.jsx:503: borderRadius: isExpanded ? "5px 5px 0 0" : "5px",
src/components/ComplianceDashboard.jsx:540: borderRadius: 3,
src/components/ComplianceDashboard.jsx:541: border: "1px solid var(--status-live-border)",
src/components/ComplianceDashboard.jsx:568: borderRadius: 1,
src/components/ComplianceDashboard.jsx:602: border: `1px solid ${getScoreBorder(cat.score)}`,
src/components/ComplianceDashboard.jsx:603: borderRadius: 6,
src/components/ComplianceDashboard.jsx:680: border: "1px solid var(--border-default)",
src/components/ComplianceDashboard.jsx:681: borderRadius: 3,
src/components/ComplianceDashboard.jsx:791: border: "1px solid var(--status-offline-border)",
src/components/ComplianceDashboard.jsx:792: borderRadius: 6,
src/components/ComplianceDashboard.jsx:819: outline: "1px solid var(--status-offline-border)",
src/components/ComplianceDashboard.jsx:820: borderRadius: 3,
src/components/ComplianceDashboard.jsx:847: border: "1px solid var(--status-offline-border)",
src/components/ComplianceDashboard.jsx:848: borderRadius: 6,
src/components/ComplianceDashboard.jsx:875: outline: `1px solid ${
src/components/ComplianceDashboard.jsx:877: ? "var(--status-offline-border)"
src/components/ComplianceDashboard.jsx:879: ? "var(--status-pending-border)"
src/components/ComplianceDashboard.jsx:880: : "var(--status-pending-border)"
src/components/ComplianceDashboard.jsx:882: borderRadius: 3,
src/components/ComplianceMini.jsx:163: borderRadius: 3,
src/components/ComplianceMini.jsx:174: borderRadius: 3,
src/components/ComplianceMini.jsx:282: borderRadius: 2,
src/components/ComplianceMini.jsx:294: borderRadius: 2,
src/components/ComplianceMini.jsx:339: borderRadius: 4,
src/components/FplCalculatorPanel.jsx:11: borderRadius: 6,
src/components/FplCalculatorPanel.jsx:12: border: "1px solid var(--border-default)",
src/components/FplCalculatorPanel.jsx:17: outline: "none",
src/components/FplCalculatorPanel.jsx:18: boxSizing: "border-box",
src/components/FplCalculatorPanel.jsx:56: border: `1px solid color-mix(in srgb, ${accentColor} 15%, transparent)`,
src/components/FplCalculatorPanel.jsx:57: borderRadius: 8,
src/components/FplCalculatorPanel.jsx:159: borderRadius: 7,
src/components/FplCalculatorPanel.jsx:161: border: "1px solid var(--border-default)",
src/components/FplCalculatorPanel.jsx:189: borderRadius: 7,
src/components/FplCalculatorPanel.jsx:191: border: "1px solid var(--border-default)",
src/components/FplCalculatorPanel.jsx:229: borderRadius: 6,
src/components/FplCalculatorPanel.jsx:233: "linear-gradient(90deg, var(--status-live-bg) 0%, var(--status-live-border) 60%, var(--status-pending-border) 75%, var(--status-offline-border) 100%)",
src/components/FplCalculatorPanel.jsx:271: borderRadius: "50%",
src/components/FplCalculatorPanel.jsx:273: border: "2px solid var(--bg-primary)",
src/components/FplCalculatorPanel.jsx:284: borderRadius: 7,
src/components/FplCalculatorPanel.jsx:289: border: `1px solid ${
src/components/FplCalculatorPanel.jsx:291: ? "var(--status-offline-border)"
src/components/FplCalculatorPanel.jsx:292: : "var(--status-live-border)"
src/components/FplCalculatorPanel.jsx:329: borderRadius: 7,
src/components/FplCalculatorPanel.jsx:331: border: "1px solid var(--status-offline-border)",
src/components/LandingPage.css:39: border-bottom: 1px solid rgba(255, 255, 255, 0.12);
src/components/LandingPage.css:66: border-radius: 2px !important;
src/components/LandingPage.css:98: border-radius: 2px;
src/components/LandingPage.css:108: border-color var(--speed-normal) ease,
src/components/LandingPage.css:119: border: 1px solid rgba(255, 255, 255, 0.16);
src/components/LandingPage.css:186: border: 1px solid rgba(245, 158, 11, 0.6);
src/components/LandingPage.css:187: border-radius: 2px;
src/components/LandingPage.css:198: border-radius: 50%;
src/components/LandingPage.css:257: border: 1px solid rgba(255, 255, 255, 0.12);
src/components/LandingPage.css:263: border-color: rgba(255, 255, 255, 0.24);
src/components/LandingPage.css:273: border: 1px solid rgba(245, 158, 11, 0.3);
src/components/LandingPage.css:274: border-radius: 2px;
src/components/LandingPage.css:287: border-bottom: 1px solid rgba(245, 158, 11, 0.18);
src/components/LandingPage.css:311: border-radius: 50%;
src/components/LandingPage.css:334: border-bottom: 1px solid rgba(255, 255, 255, 0.11);
src/components/LandingPage.css:338: border-bottom: 0;
src/components/LandingPage.css:368: border: 1px solid rgba(255, 255, 255, 0.09);
src/components/LandingPage.css:369: border-radius: 2px;
src/components/LandingPage.css:387: border-radius: 50%;
src/components/LandingPage.css:429: border-radius: 999px;
src/components/LandingPage.css:482: border: 1px solid rgba(245, 158, 11, 0.3);
src/components/LandingPage.css:483: border-radius: 2px;
src/components/LandingPage.css:513: border-top: 1px solid rgba(255, 255, 255, 0.08);
src/components/LandingPage.css:595: border-bottom: 1px solid var(--eg-border) !important;
src/components/LandingPage.css:622: border-radius: var(--eg-radius-md) !important;
src/components/LandingPage.css:625: border: none !important;
src/components/LandingPage.css:663: border: 1px solid var(--eg-border);
src/components/LandingPage.css:664: border-radius: var(--eg-radius-md);
src/components/LandingPage.css:672: border-radius: 50%;
src/components/LandingPage.css:701: border: 1px solid var(--eg-border) !important;
src/components/LandingPage.css:702: border-radius: var(--eg-radius-card-lg) !important;
src/components/LandingPage.css:715: border-bottom: 1px solid var(--eg-border);
src/components/LandingPage.css:731: border-radius: 50%;
src/components/LandingPage.css:756: border-bottom: 1px solid var(--eg-border);
src/components/LandingPage.css:760: border-bottom: none;
src/components/LandingPage.css:775: border-radius: 50%;
src/components/LandingPage.css:788: border-radius: var(--eg-radius-md) !important;
src/components/LandingPage.css:802: border-radius: 50%;
src/components/LandingPage.css:811: border-bottom: 1px solid var(--eg-border);
src/components/LandingPage.css:815: border-bottom: none;
src/components/LandingPage.css:841: border-radius: 2px;
src/components/LandingPage.css:862: border: 1px solid var(--eg-border) !important;
src/components/LandingPage.css:863: border-radius: var(--eg-radius-card) !important;
src/components/LandingPage.css:886: border-top: 1px solid var(--eg-border) !important;
src/components/LandingPage.css:918: border: none !important;
src/components/LandingPage.css:942: border-bottom: 0 !important;
src/components/LandingPage.css:964: border-radius: var(--eg-radius-md);
src/components/MedSupFlow.jsx:39: outline: "1px solid var(--status-live-border)",
src/components/MedSupFlow.jsx:42: borderRadius: "0 6px 6px 0",
src/components/MedSupFlow.jsx:67: borderTop: "1px solid var(--border-default)",
src/components/MedSupFlow.jsx:85: border: `1px solid ${
src/components/MedSupFlow.jsx:86: done ? "var(--status-live-border)" : "var(--status-live-border)"
src/components/MedSupFlow.jsx:113: border: "1px solid var(--status-live-border)",
src/components/MedSupFlow.jsx:114: borderRadius: 10,
src/components/MedSupFlow.jsx:151: border: `1px solid ${
src/components/MedSupFlow.jsx:152: active ? "var(--status-live-border)" : "var(--border-default)"
src/components/MedSupFlow.jsx:154: borderRadius: 10,
src/components/MedSupFlow.jsx:177: border: `1px solid ${
src/components/MedSupFlow.jsx:179: ? "var(--status-offline-border)"
src/components/MedSupFlow.jsx:181: ? "var(--status-live-border)"
src/components/MedSupFlow.jsx:182: : "var(--border-default)"
src/components/MedSupFlow.jsx:184: borderRadius: 5,
src/components/MedSupFlow.jsx:201: border: "1px solid var(--status-offline-border)",
src/components/MedSupFlow.jsx:203: borderRadius: 4,
src/components/MedSupFlow.jsx:269: border: "1px solid var(--status-live-border)",
src/components/MedSupFlow.jsx:270: borderRadius: 10,
src/components/MedSupFlow.jsx:282: border: "1px solid var(--status-live-border)",
src/components/MedSupFlow.jsx:283: borderRadius: 6,
src/components/MedSupFlow.jsx:398: border: "1px solid var(--status-live-border)",
src/components/MedSupFlow.jsx:399: borderRadius: 10,
src/components/MedSupFlow.jsx:416: "linear-gradient(145deg, var(--status-live-border), var(--status-live-bg))",
src/components/MedSupFlow.jsx:417: border: "1px solid var(--status-live-border)",
src/components/MedSupFlow.jsx:419: borderRadius: 8,
src/components/MiniLiveTranscript.jsx:171: borderBottom: "1px solid var(--border-default)",
src/components/ProgressDots.jsx:27: style={{ border: "none", padding: 0, background: "transparent" }}
src/components/SEPGuide2026.jsx:17: DST:  { bg: "color-mix(in srgb, var(--text-muted) 15%, transparent)", border: "color-mix(in srgb, var(--text-muted) 30%, transparent)", text: "var(--text-muted)" },
src/components/SEPGuide2026.jsx:18: INT:  { bg: "var(--status-live-bg)",   border: "var(--status-live-border)",   text: "var(--status-live)" },
src/components/SEPGuide2026.jsx:19: PAP:  { bg: "var(--info-bg)",  border: "var(--info-border)",  text: "var(--info)" },
src/components/SEPGuide2026.jsx:20: CSNP: { bg: "color-mix(in srgb, var(--chart-4) 12%, transparent)",  border: "color-mix(in srgb, var(--chart-4) 30%, transparent)",  text: "var(--chart-4)" },
src/components/SEPGuide2026.jsx:137: borderRadius: 999,
src/components/SEPGuide2026.jsx:144: border: `1px solid ${colors.border}`,
src/components/SEPGuide2026.jsx:330: borderBottom: "1px dashed var(--info-border)",
src/components/SEPGuide2026.jsx:364: border: "1px solid var(--info-border)",
src/components/SEPGuide2026.jsx:365: borderRadius: 10,
src/components/SEPGuide2026.jsx:377: borderRadius: 4,
src/components/SEPGuide2026.jsx:421: border: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:422: borderRadius: 4,
src/components/SEPGuide2026.jsx:448: border: "1px solid var(--status-pending-border)",
src/components/SEPGuide2026.jsx:449: borderRadius: 8,
src/components/SEPGuide2026.jsx:490: border: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:491: borderRadius: 8,
src/components/SEPGuide2026.jsx:500: borderRadius: "50%",
src/components/SEPGuide2026.jsx:564: borderCollapse: "collapse",
src/components/SEPGuide2026.jsx:583: borderBottom: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:600: borderBottom: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:661: borderRadius: 999,
src/components/SEPGuide2026.jsx:662: background: "var(--border-default)",
src/components/SEPGuide2026.jsx:663: border: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:699: borderRadius: 4,
src/components/SEPGuide2026.jsx:700: background: "var(--border-default)",
src/components/SEPGuide2026.jsx:701: border: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:740: borderRadius: 8,
src/components/SEPGuide2026.jsx:741: border: active
src/components/SEPGuide2026.jsx:742: ? "1px solid var(--info-border)"
src/components/SEPGuide2026.jsx:743: : "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:798: border: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:799: borderRadius: 10,
src/components/SEPGuide2026.jsx:818: borderBottom: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:837: borderCollapse: "collapse",
src/components/SEPGuide2026.jsx:853: borderBottom: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:868: borderBottom: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:882: borderBottom: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:890: borderBottom: "1px solid var(--border-default)",
src/components/SEPGuide2026.jsx:898: borderBottom: "1px dashed var(--info-border)",
src/components/SEPLookup.jsx:205: <div key={c.key} className="sep-carrier-item" style={{ borderColor: `${c.color}30` }}>
src/components/SEPResultsModal.css:22: border: 1px solid var(--border-default);
src/components/SEPResultsModal.css:23: border-radius: 16px;
src/components/SEPResultsModal.css:26: 0 0 1px var(--border-default);
src/components/SEPResultsModal.css:47: border-bottom: 1px solid var(--border-default);
src/components/SEPResultsModal.css:62: border: 1px solid var(--border-default);
src/components/SEPResultsModal.css:63: border-radius: 8px;
src/components/SEPResultsModal.css:78: border-color: var(--border-focus);
src/components/SEPResultsModal.css:96: background: var(--border-default);
src/components/SEPResultsModal.css:97: border-radius: 10px;
src/components/SEPResultsModal.css:103: border-top: 1px solid var(--border-default);
src/components/SEPResultsModal.css:111: border: 1px solid var(--border-default);
src/components/SEPResultsModal.css:112: border-radius: 10px;
src/components/SEPResultsModal.css:126: border-color: var(--border-focus);
src/components/SEPResultsModal.css:132: border: none;
src/components/ScriptEditor.css:64: border: 1px solid var(--eg-border);
src/components/ScriptEditor.css:65: border-radius: var(--eg-radius-md);
src/components/ScriptEditor.css:76: border-color var(--eg-transition-fast),
src/components/ScriptEditor.css:84: border-color: var(--eg-border-hover);
src/components/ScriptEditor.css:97: border-color: var(--eg-accent-dim);
src/components/ScriptEditor.css:103: border-color: var(--eg-accent-bright);
src/components/ScriptEditor.css:118: border: 1px solid var(--eg-border);
src/components/ScriptEditor.css:119: border-radius: var(--eg-radius-card);
src/components/ScriptEditor.css:128: border-color: transparent;
src/components/ScriptEditor.css:133: border-color: var(--eg-border);
src/components/ScriptEditor.css:141: border: 1px solid var(--eg-border);
src/components/ScriptEditor.css:142: border-radius: var(--eg-radius-md);
src/components/ScriptEditor.css:152: border-color: var(--eg-amber-dim);
src/components/ScriptEditor.css:167: border: 1px solid var(--eg-border);
src/components/ScriptEditor.css:168: border-radius: var(--eg-radius-card);
src/components/ScriptEditor.css:194: border: 1px solid var(--eg-border);
src/components/ScriptEditor.css:195: border-radius: var(--eg-radius-md);
src/components/ScriptEditor.css:196: outline: none;
src/components/ScriptEditor.css:198: border-color var(--eg-transition-fast),
src/components/ScriptEditor.css:205: border-color: var(--eg-border-active);
src/components/SessionSummary.jsx:21: border:   [28, 28, 28],
src/components/SessionSummary.jsx:64: doc.setDrawColor(...PC.border);
src/components/SessionSummary.jsx:102: doc.setDrawColor(...PC.border);
src/components/SessionSummary.jsx:132: lineColor: PC.border,
src/components/SessionSummary.jsx:358: doc.setDrawColor(...PC.border);
src/components/SharedUI.jsx:180: /* Rendered as first child of .card, positions itself centered on the card's top border */
src/components/copilot/Waveform.jsx:136: style={{ width, height, borderRadius: 4, display: "block" }}
src/components/sep/CountyPenetration.jsx:42: stroke={active ? 'var(--text-primary)' : 'var(--border-default)'} strokeWidth={active ? 2.5 : 0.6}
src/components/sep/FemaFeed.jsx:101: borderColor: carrierColor(item.carrier),
src/components/sep/PlanTable.jsx:15: style={{ width: size, height: size, objectFit: "contain", borderRadius: 3, flexShrink: 0 }}
src/components/sep/PlanTable.jsx:24: width: 8, height: 8, borderRadius: "50%",
src/components/sep/SEPCard.jsx:34: style={{ width: size * 2.5, height: size * 2.5, objectFit: "contain", borderRadius: 2, flexShrink: 0 }}
src/components/sep/SEPCard.jsx:43: <span style={{ width: size, height: size, borderRadius: "50%", backgroundColor: c.color || "var(--text-muted)", flexShrink: 0, display: "inline-block" }} />
src/components/sep/StateMap.jsx:131: border: "1px solid var(--border-default)",
src/components/sep/StateMap.jsx:132: borderRadius: 10,
src/data/acaComplianceKnowledge.js:306: info:     { icon: "◈", color: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)" },
src/data/acaComplianceKnowledge.js:307: remind:   { icon: "◉", color: "var(--text-primary)", bg: "var(--bg-elevated)", border: "var(--border-default)" },
src/data/acaComplianceKnowledge.js:308: tip:      { icon: "◆", color: "var(--status-live)", bg: "var(--status-live-bg)", border: "var(--status-live-border)" },
src/data/acaComplianceKnowledge.js:309: warn:     { icon: "▲", color: "var(--status-pending)", bg: "var(--status-pending-bg)", border: "var(--status-pending-border)" },
src/data/acaComplianceKnowledge.js:310: critical: { icon: "✕", color: "var(--status-offline)", bg: "var(--status-offline-bg)", border: "var(--status-offline-border)" },
src/data/complianceKnowledge.js:647: border: "var(--info-border)",
src/data/complianceKnowledge.js:653: border: "var(--border-default)",
src/data/complianceKnowledge.js:659: border: "var(--status-live-border)",
src/data/complianceKnowledge.js:665: border: "var(--status-pending-border)",
src/data/complianceKnowledge.js:671: border: "var(--status-offline-border)",
src/data/medSupComplianceKnowledge.js:249: critical: { color: "var(--status-offline)", icon: "⛔", border: "var(--status-offline-border)" },
src/data/medSupComplianceKnowledge.js:250: warn: { color: "var(--status-pending)", icon: "⚠️", border: "var(--status-pending-border)" },
src/data/medSupComplianceKnowledge.js:251: remind: { color: "var(--info)", icon: "📋", border: "var(--info-border)" },
src/data/medSupComplianceKnowledge.js:252: tip: { color: "var(--status-live)", icon: "✓", border: "var(--status-live-border)" },
src/data/medSupComplianceKnowledge.js:253: info: { color: "var(--text-muted)", icon: "ℹ", border: "var(--border-default)" },
src/data/u65ComplianceKnowledge.js:67: critical: { color: "var(--status-offline)", icon: "⛔", border: "var(--status-offline-border)" },
src/data/u65ComplianceKnowledge.js:68: warn:     { color: "var(--status-pending)", icon: "⚠️", border: "var(--status-pending-border)" },
src/data/u65ComplianceKnowledge.js:69: remind:   { color: "var(--info)", icon: "📋", border: "var(--info-border)" },
src/data/u65ComplianceKnowledge.js:70: tip:      { color: "var(--status-live)", icon: "✓", border: "var(--status-live-border)" },
src/data/u65ComplianceKnowledge.js:71: info:     { color: "var(--text-muted)", icon: "ℹ", border: "var(--border-default)" },
src/flows/aca/ACAData.js:90: "subsidyCliffRisk → true if income is 380–420% FPL (border zone)",
src/flows/aca/ACAFlow.jsx:30: outline: "1px solid var(--status-pending-border)",
src/flows/aca/ACAFlow.jsx:33: borderRadius: "0 6px 6px 0",
src/flows/aca/ACAFlow.jsx:53: border: "1px solid var(--status-offline-border)",
src/flows/aca/ACAFlow.jsx:54: borderRadius: 6,
src/flows/aca/ACAFlow.jsx:75: border: "1px solid var(--status-pending-border)",
src/flows/aca/ACAFlow.jsx:77: borderRadius: 4,
src/flows/aca/ACAFlow.jsx:96: borderTop: "1px solid var(--border-default)",
src/flows/aca/ACAFlow.jsx:113: border: `1px solid ${done ? "var(--status-live-border)" : "var(--status-pending-border)"}`,
src/flows/aca/ACAFlow.jsx:135: border: "1px solid var(--status-live-border)",
src/flows/aca/ACAFlow.jsx:136: borderRadius: 10,
src/flows/aca/ACAFlow.jsx:178: border: `1px solid ${active ? "var(--status-pending-border)" : "var(--border-default)"}`,
src/flows/aca/ACAFlow.jsx:179: borderRadius: 10,
src/flows/aca/ACAFlow.jsx:195: border: `1px solid ${
src/flows/aca/ACAFlow.jsx:197: ? "var(--status-offline-border)"
src/flows/aca/ACAFlow.jsx:199: ? "var(--status-pending-border)"
src/flows/aca/ACAFlow.jsx:200: : "var(--border-default)"
src/flows/aca/ACAFlow.jsx:202: borderRadius: 5,
src/flows/aca/ACAFlow.jsx:217: border: "1px solid var(--status-offline-border)",
src/flows/aca/ACAFlow.jsx:219: borderRadius: 4,
src/flows/aca/ACAFlow.jsx:291: borderRadius: 6,
src/flows/aca/ACAFlow.jsx:292: border: `1px solid ${state.enrollmentPeriod === period ? "var(--status-pending-border)" : "var(--border-default)"}`,
src/flows/aca/ACAFlow.jsx:351: {SHOW_REFERENCE_DETAILS && <div style={{ fontSize: 11, color: ACCENT, background: "var(--status-pending-bg)", border: "1px solid var(--status-pending-border)", borderRadius: 6, padding: "6px 10px", marginBottom: 12 }}>
src/flows/aca/ACAFlow.jsx:362: <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
src/flows/aca/ACAFlow.jsx:366: <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border-default)", fontSize: 11 }}>
src/flows/aca/ACAFlow.jsx:374: <tr key={i} style={{ borderBottom: "1px solid color-mix(in srgb, var(--text-primary) 3%, transparent)" }}>
src/flows/aca/ACAFlow.jsx:419: <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
src/flows/aca/ACAFlow.jsx:423: <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border-default)", fontSize: 11 }}>
src/flows/aca/ACAFlow.jsx:432: <tr key={i} style={{ borderBottom: "1px solid color-mix(in srgb, var(--text-primary) 3%, transparent)" }}>
src/flows/aca/ACAFlow.jsx:480: <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", padding: "4px 10px", outline: "1px solid var(--status-pending-border)", marginBottom: 4, lineHeight: 1.5 }}>
src/flows/aca/ACAFlow.jsx:536: {SHOW_REFERENCE_DETAILS && <div style={{ fontSize: 11, background: "var(--status-pending-bg)", border: "1px solid var(--status-pending-border)", borderRadius: 6, padding: "6px 10px", marginBottom: 12, color: ACCENT }}>
src/flows/aca/ACAFlow.jsx:587: border: "1px solid var(--status-live-border)",
src/flows/aca/ACAFlow.jsx:588: borderRadius: 10,
src/flows/aca/ACAFlow.jsx:598: border: "1px solid var(--status-live-border)",
src/flows/aca/ACAFlow.jsx:599: borderRadius: 6,
src/flows/aca/ACAFlow.jsx:656: <section className="script-start-call-gate" style={{ background: `var(--status-pending-bg)`, border: `1px solid var(--status-pending-border)`, borderRadius: 10, padding: "28px 20px", textAlign: "center", marginBottom: 10 }}>
src/flows/aca/ACAFlow.jsx:659: background: `linear-gradient(145deg, var(--status-pending-border), var(--status-pending-bg))`, border: `1px solid var(--status-pending-border)`, color: ACCENT, borderRadius: 8, cursor: "pointer",
src/flows/aca/ACAScript.jsx:28: border: "var(--flow-aca-border)",
src/flows/aca/ACAScript.jsx:36: border: "var(--border-default)",
src/flows/aca/ACAScript.jsx:58: border: "1px solid var(--border-default)",
src/flows/aca/ACAScript.jsx:59: borderRadius: 8,
src/flows/aca/ACAScript.jsx:79: border: "none",
src/flows/aca/ACAScript.jsx:90: borderRadius: "50%",
src/flows/aca/ACAScript.jsx:92: border: `1px solid ${active ? flow.color : flow.border}`,
src/flows/aca/ACAScript.jsx:95: "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
src/flows/aca/StateACAFlow.jsx:33: outline: "1px solid var(--flow-aca-border)",
src/flows/aca/StateACAFlow.jsx:36: borderRadius: "0 6px 6px 0",
src/flows/aca/StateACAFlow.jsx:51: outline: "1px solid var(--flow-aca-border)",
src/flows/aca/StateACAFlow.jsx:54: borderRadius: "0 5px 5px 0",
src/flows/aca/StateACAFlow.jsx:79: border: "1px solid var(--status-offline-border)",
src/flows/aca/StateACAFlow.jsx:80: borderRadius: 6,
src/flows/aca/StateACAFlow.jsx:100: borderTop: "1px solid var(--border-default)",
src/flows/aca/StateACAFlow.jsx:117: border: `1px solid ${
src/flows/aca/StateACAFlow.jsx:118: done ? "var(--status-live-border)" : "var(--flow-aca-border)"
src/flows/aca/StateACAFlow.jsx:141: border: "1px solid var(--status-live-border)",
src/flows/aca/StateACAFlow.jsx:142: borderRadius: 10,
src/flows/aca/StateACAFlow.jsx:190: border: `1px solid ${
src/flows/aca/StateACAFlow.jsx:191: active ? "var(--flow-aca-border)" : "var(--border-default)"
src/flows/aca/StateACAFlow.jsx:193: borderRadius: 10,
src/flows/aca/StateACAFlow.jsx:207: border: `1px solid ${
src/flows/aca/StateACAFlow.jsx:208: active ? "var(--flow-aca-border)" : "var(--border-default)"
src/flows/aca/StateACAFlow.jsx:210: borderRadius: 5,
src/flows/aca/StateACAFlow.jsx:234: borderRadius: 7,
src/flows/aca/StateACAFlow.jsx:236: border: "1px solid var(--border-default)",
src/flows/aca/StateACAFlow.jsx:372: border: "1px solid var(--flow-aca-border)",
src/flows/aca/StateACAFlow.jsx:373: borderRadius: 10,
src/flows/aca/StateACAFlow.jsx:391: border: "1px solid var(--flow-aca-border)",
src/flows/aca/StateACAFlow.jsx:393: borderRadius: 8,
src/flows/aca/StateACAFlow.jsx:474: border: "1px solid var(--status-live-border)",
src/flows/aca/StateACAFlow.jsx:475: borderRadius: 10,
src/flows/aca/StateACAFlow.jsx:489: border: "1px solid var(--status-live-border)",
src/flows/aca/StateACAFlow.jsx:490: borderRadius: 6,
src/flows/ancillary/AncillaryFlow.jsx:692: border: "2px solid currentColor",
src/flows/ancillary/AncillaryFlow.jsx:693: borderRadius: "48% 48% 42% 42%",
src/flows/ancillary/AncillaryFlow.jsx:694: boxSizing: "border-box",
src/flows/ancillary/AncillaryFlow.jsx:704: borderInlineStart: "2px solid currentColor",
src/flows/ancillary/AncillaryFlow.jsx:705: borderRight: "2px solid currentColor",
src/flows/ancillary/AncillaryFlow.jsx:706: borderBottom: "2px solid currentColor",
src/flows/ancillary/AncillaryFlow.jsx:707: borderRadius: "0 0 6px 6px",
src/flows/ancillary/AncillaryFlow.jsx:727: border-color: var(--info-border);
src/flows/ancillary/AncillaryFlow.jsx:740: border: 0,
src/flows/ancillary/AncillaryFlow.jsx:783: border: "1px solid var(--script-term-border)",
src/flows/ancillary/AncillaryFlow.jsx:942: border: "1px solid var(--script-term-border)",
src/flows/ancillary/AncillaryFlow.jsx:943: borderRadius: 0,
src/flows/ancillary/AncillaryFlow.jsx:949: outline: "none",
src/flows/ancillary/AncillaryFlow.jsx:959: border: "1px solid var(--status-offline-border)",
src/flows/ancillary/AncillaryFlow.jsx:988: border: "1px solid var(--script-term-border)",
src/flows/ancillary/AncillaryFlow.jsx:1097: border: "1px solid var(--script-term-border)",
src/flows/ancillary/AncillaryFlow.jsx:1146: border: "1px solid var(--script-term-border)",
src/flows/ancillary/AncillaryFlow.jsx:1186: outline: "1px solid var(--info-border)",
src/flows/ancillary/AncillaryFlow.jsx:1189: borderRadius: "0 6px 6px 0",
src/flows/ancillary/AncillaryFlow.jsx:1219: outline: "1px solid var(--border-default)",
src/flows/ancillary/AncillaryFlow.jsx:1222: borderRadius: "0 6px 6px 0",
src/flows/ancillary/AncillaryFlow.jsx:1238: border: "1px solid var(--status-offline-border)",
src/flows/ancillary/AncillaryFlow.jsx:1239: borderRadius: 6,
src/flows/ancillary/AncillaryFlow.jsx:1258: outline: "1px solid var(--border-default)",
src/flows/ancillary/AncillaryFlow.jsx:1261: borderRadius: "0 6px 6px 0",
src/flows/ancillary/AncillaryFlow.jsx:1288: borderTop: "1px solid var(--border-default)",
src/flows/ancillary/AncillaryFlow.jsx:1306: border: `1px solid ${done ? "var(--status-live-border)" : "var(--info-border)"}`,
src/flows/ancillary/AncillaryFlow.jsx:1330: border: "1px solid var(--status-live-border)",
src/flows/ancillary/AncillaryFlow.jsx:1331: borderRadius: 10,
src/flows/ancillary/AncillaryFlow.jsx:1376: border: `1px solid ${active ? "var(--info-border)" : "var(--border-default)"}`,
src/flows/ancillary/AncillaryFlow.jsx:1377: borderRadius: 10,
src/flows/ancillary/AncillaryFlow.jsx:1389: border: `1px solid ${active ? "var(--info-border)" : "var(--border-default)"}`,
src/flows/ancillary/AncillaryFlow.jsx:1390: borderRadius: 5,
src/flows/ancillary/AncillaryFlow.jsx:1476: border: "1px solid var(--status-live-border)",
src/flows/ancillary/AncillaryFlow.jsx:1477: borderRadius: 10,
src/flows/ancillary/AncillaryFlow.jsx:1490: border: "1px solid var(--status-live-border)",
src/flows/ancillary/AncillaryFlow.jsx:1491: borderRadius: 6,
src/flows/ancillary/AncillaryFlow.jsx:1532: borderRadius: 8,
src/flows/ancillary/AncillaryFlow.jsx:1533: border: "1px solid var(--border-default)",
src/flows/ancillary/AncillaryFlow.jsx:1548: borderRadius: 8,
src/flows/ancillary/AncillaryFlow.jsx:1591: border: "1px solid var(--info-border)",
src/flows/ancillary/AncillaryFlow.jsx:1592: borderRadius: 10,
src/flows/ancillary/AncillaryFlow.jsx:1611: border: "1px solid var(--info-border)",
src/flows/ancillary/AncillaryFlow.jsx:1613: borderRadius: 8,
src/flows/ancillary/ancillaryConstants.js:19: border: "var(--info-border)",
src/flows/u65/U65Script.jsx:32: border: "var(--flow-u65-border)",
src/flows/u65/U65Script.jsx:40: border: "var(--flow-u65-border)",
src/flows/u65/U65Script.jsx:63: border: "1px solid var(--border-default)",
src/flows/u65/U65Script.jsx:64: borderRadius: 8,
src/flows/u65/U65Script.jsx:85: border: "none",
src/flows/u65/U65Script.jsx:96: borderRadius: "50%",
src/flows/u65/U65Script.jsx:98: border: `1px solid ${active ? flow.color : flow.border}`,
src/flows/u65/U65Script.jsx:101: "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
src/styles/design-tokens.css:16: --eg-border: #3d352b;
src/styles/design-tokens.css:17: --eg-border-hover: #564a3c;
src/styles/design-tokens.css:18: --eg-border-active: #7a6a56;
src/styles/design-tokens.css:78: --border-default: var(--eg-border);
src/styles/design-tokens.css:79: --border-focus: var(--eg-border-active);
src/styles/design-tokens.css:84: --status-live-border: rgba(106, 171, 125, 0.27);
src/styles/design-tokens.css:87: --status-offline-border: rgba(184, 92, 92, 0.34);
src/styles/design-tokens.css:90: --status-pending-border: rgba(196, 153, 64, 0.32);
src/styles/design-tokens.css:98: --info-border: rgba(92, 136, 184, 0.32);
src/styles/design-tokens.css:111: --chart-grid: var(--eg-border);
src/styles/design-tokens.css:124: --score-a-border: rgba(0, 209, 102, 0.2);
src/styles/design-tokens.css:125: --score-b-border: rgba(0, 176, 80, 0.2);
src/styles/design-tokens.css:126: --score-c-border: rgba(255, 215, 0, 0.22);
src/styles/design-tokens.css:127: --score-d-border: rgba(255, 140, 0, 0.22);
src/styles/design-tokens.css:128: --score-f-border: rgba(232, 0, 45, 0.25);
src/styles/design-tokens.css:134: --flow-ma-border: rgba(184, 92, 92, 0.42);
src/styles/design-tokens.css:136: --flow-aca-border: rgba(92, 136, 184, 0.42);
src/styles/design-tokens.css:138: --flow-medsup-border: rgba(106, 171, 125, 0.42);
src/styles/design-tokens.css:140: --flow-u65-border: rgba(139, 110, 184, 0.42);
src/styles/design-tokens.css:142: --flow-ancillary-border: rgba(196, 153, 64, 0.42);
src/styles/design-tokens.css:151: --clay-border: rgba(255, 255, 255, 0.07);
src/styles/design-tokens.css:165: --phone-border: var(--eg-border);
src/styles/design-tokens.css:212: --border-subtle: var(--eg-border);
src/styles/design-tokens.css:213: --border-default: var(--eg-border);
src/styles/design-tokens.css:214: --border-active: var(--eg-border-active);
src/styles/design-tokens.css:215: --border-accent: var(--eg-accent-dim);
src/styles/design-tokens.css:270: --eg-border: #2a2a2a;
src/styles/design-tokens.css:271: --eg-border-hover: #333333;
src/styles/design-tokens.css:272: --eg-border-active: #ff9900;
src/styles/design-tokens.css:324: --border-default: #2a2a2a;
src/styles/design-tokens.css:325: --border-focus: #ff9900;
src/styles/design-tokens.css:330: --status-live-border: rgba(0, 210, 106, 0.38);
src/styles/design-tokens.css:333: --status-offline-border: rgba(255, 59, 48, 0.42);
src/styles/design-tokens.css:336: --status-pending-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:344: --info-border: rgba(62, 199, 255, 0.38);
src/styles/design-tokens.css:370: --score-a-border: rgba(0, 210, 106, 0.38);
src/styles/design-tokens.css:371: --score-b-border: rgba(0, 210, 106, 0.38);
src/styles/design-tokens.css:372: --score-c-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:373: --score-d-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:374: --score-f-border: rgba(255, 59, 48, 0.42);
src/styles/design-tokens.css:380: --flow-ma-border: rgba(255, 59, 48, 0.42);
src/styles/design-tokens.css:382: --flow-aca-border: rgba(62, 199, 255, 0.42);
src/styles/design-tokens.css:384: --flow-medsup-border: rgba(0, 210, 106, 0.42);
src/styles/design-tokens.css:386: --flow-u65-border: rgba(184, 137, 255, 0.42);
src/styles/design-tokens.css:388: --flow-ancillary-border: rgba(255, 153, 0, 0.45);
src/styles/design-tokens.css:394: --clay-border: rgba(255, 255, 255, 0.055);
src/styles/design-tokens.css:408: --phone-border: #333333;
src/styles/design-tokens.css:434: border-color,
src/styles/phone-dropdown.css:23: border-radius: 50%;
src/styles/phone-dropdown.css:35: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:37: border-radius: var(--phone-radius-outer);
src/styles/phone-dropdown.css:98: border-radius: 50%;
src/styles/phone-dropdown.css:99: border: 0;
src/styles/phone-dropdown.css:123: border-radius: 50%;
src/styles/phone-dropdown.css:124: border: 2px solid var(--phone-answer-bg);
src/styles/phone-dropdown.css:177: border-radius: 50%;
src/styles/phone-dropdown.css:200: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:201: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:208: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:213: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:219: border-color: var(--phone-decline-bg);
src/styles/phone-dropdown.css:237: border-radius: 16px;
src/styles/phone-dropdown.css:259: border-bottom: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:283: border-top: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:292: border: 0;
src/styles/phone-dropdown.css:345: border: 1px solid transparent;
src/styles/phone-dropdown.css:346: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:355: border-color: var(--phone-border);
src/styles/phone-dropdown.css:418: border-radius: 50%;
src/styles/phone-dropdown.css:435: border-radius: 50%;
src/styles/phone-dropdown.css:436: border: 1px solid var(--phone-answer-bg);
src/styles/phone-dropdown.css:449: border-color: var(--phone-border);
src/styles/phone-dropdown.css:465: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:466: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:475: border: 0;
src/styles/phone-dropdown.css:482: outline: none;
src/styles/phone-dropdown.css:495: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:496: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:506: outline: none;
src/styles/phone-dropdown.css:507: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:527: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:528: border-radius: 50%;
src/styles/phone-dropdown.css:535: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:570: border-radius: 50%;
src/styles/phone-dropdown.css:571: border: 0;
src/styles/phone-dropdown.css:593: border-radius: 50%;
src/styles/phone-dropdown.css:594: border: 0;
src/styles/phone-dropdown.css:616: border-bottom: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:662: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:663: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:674: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:679: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:691: border-color: var(--phone-decline-bg);
src/styles/phone-dropdown.css:709: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:710: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:720: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:734: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:735: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:743: outline: none;
src/styles/phone-dropdown.css:744: border-color: var(--phone-header-text);
src/styles/phone-dropdown.css:749: border: 1px solid var(--phone-header-text);
src/styles/phone-dropdown.css:750: border-radius: var(--phone-radius-inner);
src/styles/phone-dropdown.css:797: border-bottom: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:804: border: 1px solid var(--phone-border);
src/styles/phone-dropdown.css:805: border-radius: 999px;
src/styles/public-shell.css:13: box-sizing: border-box;
src/styles/public-shell.css:50: border: 1px solid var(--eg-border);
src/styles/public-shell.css:51: border-radius: var(--eg-radius-card-lg);
src/styles/v3-overrides.css:35: border-bottom: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:58: border: none;
src/styles/v3-overrides.css:79: border: none !important;
src/styles/v3-overrides.css:95: border: none !important;
src/styles/v3-overrides.css:96: border-radius: 4px !important;
src/styles/v3-overrides.css:113: border-radius: 1px;
src/styles/v3-overrides.css:120: border: none !important;
src/styles/v3-overrides.css:127: border: none !important;
src/styles/v3-overrides.css:151: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:152: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:167: border-color: var(--eg-border-hover) !important;
src/styles/v3-overrides.css:172: border-color: var(--eg-accent-dim) !important;
src/styles/v3-overrides.css:204: border: 0;
src/styles/v3-overrides.css:213: outline: 2px solid var(--eg-accent);
src/styles/v3-overrides.css:214: outline-offset: 3px;
src/styles/v3-overrides.css:228: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:229: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:238: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:254: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:258: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:260: border-radius: var(--eg-radius-card) !important;
src/styles/v3-overrides.css:265: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:267: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:271: border-color: var(--eg-accent) !important;
src/styles/v3-overrides.css:285: border: none;
src/styles/v3-overrides.css:295: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:296: border: 1px solid transparent;
src/styles/v3-overrides.css:306: border-radius: 50%;
src/styles/v3-overrides.css:329: border-color: var(--flow-border, var(--eg-accent-dim));
src/styles/v3-overrides.css:350: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:351: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:362: border-color: var(--flow-border, var(--eg-accent-dim));
src/styles/v3-overrides.css:369: border-radius: 50%;
src/styles/v3-overrides.css:387: border-left: 4px solid transparent;
src/styles/v3-overrides.css:388: border-right: 4px solid transparent;
src/styles/v3-overrides.css:389: border-top: 5px solid var(--eg-text-dim);
src/styles/v3-overrides.css:402: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:403: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:413: border-color: transparent;
src/styles/v3-overrides.css:418: border-color: var(--flow-border, var(--eg-accent-dim));
src/styles/v3-overrides.css:435: border: 0 !important;
src/styles/v3-overrides.css:436: border-radius: var(--eg-radius-card);
src/styles/v3-overrides.css:447: border-left: 0 !important;
src/styles/v3-overrides.css:453: border: 0 !important;
src/styles/v3-overrides.css:454: border-radius: var(--eg-radius-card) !important;
src/styles/v3-overrides.css:477: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:478: border-right: none !important;
src/styles/v3-overrides.css:479: border-radius: var(--eg-radius-md) 0 0 var(--eg-radius-md) !important;
src/styles/v3-overrides.css:507: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:508: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:520: border: none !important;
src/styles/v3-overrides.css:521: border-bottom: 0 !important;
src/styles/v3-overrides.css:540: border: 0 !important;
src/styles/v3-overrides.css:541: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:547: border-color: transparent !important;
src/styles/v3-overrides.css:560: border: none !important;
src/styles/v3-overrides.css:571: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:574: border: none !important;
src/styles/v3-overrides.css:597: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:598: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:609: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:610: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:620: border-color: var(--eg-border-hover) !important;
src/styles/v3-overrides.css:625: border-color: rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:631: border-color: rgba(184, 92, 92, 0.42) !important;
src/styles/v3-overrides.css:637: border-color: var(--eg-border) !important;
src/styles/v3-overrides.css:642: border-color: rgba(192, 139, 85, 0.42) !important;
src/styles/v3-overrides.css:688: border: none !important;
src/styles/v3-overrides.css:689: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:704: border-radius: 50%;
src/styles/v3-overrides.css:738: border-left: none !important;
src/styles/v3-overrides.css:748: /* Section 11 rule 1: no colored left-border accent bars. */
src/styles/v3-overrides.css:770: border-radius: 2px;
src/styles/v3-overrides.css:780: border-radius: 2px;
src/styles/v3-overrides.css:789: border-bottom: 1px solid var(--eg-border);
src/styles/v3-overrides.css:804: border-radius: 2px;
src/styles/v3-overrides.css:836: border-radius: 2px !important;
src/styles/v3-overrides.css:841: border-radius: 2px !important;
src/styles/v3-overrides.css:853: border-bottom: 1px solid var(--eg-border);
src/styles/v3-overrides.css:857: border-bottom: none;
src/styles/v3-overrides.css:887: inside it used to double this up with its own border-right, and
src/styles/v3-overrides.css:888: the widget cards inside it have their own border, leaving 3 stacked
src/styles/v3-overrides.css:889: lines. Keep just the rail edge and the widget border. */
src/styles/v3-overrides.css:891: border-right: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:896: border: none !important;
src/styles/v3-overrides.css:897: border-style: none !important;
src/styles/v3-overrides.css:898: border-width: 0 !important;
src/styles/v3-overrides.css:907: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:908: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:920: border-color: var(--eg-border-hover) !important;
src/styles/v3-overrides.css:927: border-radius: 50% !important;
src/styles/v3-overrides.css:937: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:938: border-radius: var(--eg-radius-card) !important;
src/styles/v3-overrides.css:971: border: 0;
src/styles/v3-overrides.css:1005: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:1006: border-radius: var(--eg-radius-sm);
src/styles/v3-overrides.css:1018: border-bottom: 1px solid var(--eg-border);
src/styles/v3-overrides.css:1032: border: 0;
src/styles/v3-overrides.css:1092: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1093: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1096: outline: none;
src/styles/v3-overrides.css:1100: border-color: var(--eg-border-active) !important;
src/styles/v3-overrides.css:1105: border: none !important;
src/styles/v3-overrides.css:1118: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:1119: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1129: border-color: var(--eg-border-hover) !important;
src/styles/v3-overrides.css:1135: border-color: var(--eg-accent-dim) !important;
src/styles/v3-overrides.css:1143: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1144: border-radius: var(--eg-radius-card) !important;
src/styles/v3-overrides.css:1161: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1162: border: 1px solid rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:1170: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1172: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:1198: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1199: border-radius: var(--eg-radius-card) !important;
src/styles/v3-overrides.css:1209: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1210: border-radius: var(--eg-radius-card-lg) !important;
src/styles/v3-overrides.css:1256: border: none !important;
src/styles/v3-overrides.css:1257: border-left: none !important;
src/styles/v3-overrides.css:1258: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1272: border-radius: 50%;
src/styles/v3-overrides.css:1302: border: none;
src/styles/v3-overrides.css:1314: border-radius: 50%;
src/styles/v3-overrides.css:1326: border-radius: 4px;
src/styles/v3-overrides.css:1341: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1342: border-radius: var(--eg-radius-card-lg) !important;
src/styles/v3-overrides.css:1373: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1380: border: 1px solid rgba(106, 171, 125, 0.42) !important;
src/styles/v3-overrides.css:1388: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1499: border-radius: 50%;
src/styles/v3-overrides.css:1520: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1530: border: 1px solid rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:1537: border-color: var(--eg-green) !important;
src/styles/v3-overrides.css:1541: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1547: border-color: var(--eg-border-hover) !important;
src/styles/v3-overrides.css:1552: border: none !important;
src/styles/v3-overrides.css:1570: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:1571: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:1574: outline: none;
src/styles/v3-overrides.css:1586: border-color: var(--eg-border-active);
src/styles/v3-overrides.css:1600: border-color: var(--eg-border) !important;
src/styles/v3-overrides.css:1605: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1606: border-radius: var(--eg-radius-card) !important;
src/styles/v3-overrides.css:1620: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1622: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:1629: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1630: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1651: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1653: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1662: border-radius: 50%;
src/styles/v3-overrides.css:1688: border-radius: var(--eg-radius-pill);
src/styles/v3-overrides.css:1692: border: none;
src/styles/v3-overrides.css:1698: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:1699: border-radius: var(--eg-radius-card-lg);
src/styles/v3-overrides.css:1719: border-bottom: 1px solid rgba(61, 53, 43, 0.55);
src/styles/v3-overrides.css:1723: border-bottom: none;
src/styles/v3-overrides.css:1729: border-radius: 3px;
src/styles/v3-overrides.css:1730: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:1738: border-color: var(--eg-green);
src/styles/v3-overrides.css:1747: border-radius: 1px;
src/styles/v3-overrides.css:1767: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1768: border-radius: var(--eg-radius-card-lg) !important;
src/styles/v3-overrides.css:1775: border-color: var(--eg-border) !important;
src/styles/v3-overrides.css:1796: border: none !important;
src/styles/v3-overrides.css:1797: outline: none !important;
src/styles/v3-overrides.css:1803: border-bottom: 1px solid var(--eg-border-active) !important;
src/styles/v3-overrides.css:1810: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:1812: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1824: border-color: var(--eg-border-hover) !important;
src/styles/v3-overrides.css:1829: border-color: var(--eg-accent-dim) !important;
src/styles/v3-overrides.css:1840: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:1842: border: 1px solid rgba(106, 171, 125, 0.27) !important;
src/styles/v3-overrides.css:1854: border-color: var(--eg-green) !important;
src/styles/v3-overrides.css:1858: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1879: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1880: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:1888: border-color: rgba(196, 153, 64, 0.42) !important;
src/styles/v3-overrides.css:1894: border-color: rgba(184, 92, 92, 0.42) !important;
src/styles/v3-overrides.css:1901: border-bottom: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:1947: surfaces, no left-border accent bars, 1px solid borders.
src/styles/v3-overrides.css:1984: /* Rule 1: no colored left-border accent bars on cards/notes/bubbles. */
src/styles/v3-overrides.css:1995: border-left: none !important;
src/styles/v3-overrides.css:2040: /* Rule 6: borders are always 1px solid. */
src/styles/v3-overrides.css:2045: border-style: solid !important;
src/styles/v3-overrides.css:2046: border-width: 1px !important;
src/styles/v3-overrides.css:2064: border-radius: var(--eg-radius-md) !important;
src/styles/v3-overrides.css:2081: border-bottom: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:2086: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2087: border-radius: var(--eg-radius-card-lg);
src/styles/v3-overrides.css:2093: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:2094: border-radius: var(--eg-radius-card-lg) !important;
src/styles/v3-overrides.css:2102: border-bottom: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:2123: border-bottom: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:2128: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2129: border-radius: var(--eg-radius-card-lg);
src/styles/v3-overrides.css:2135: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:2490: border-bottom: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2501: border-bottom: 0 !important;
src/styles/v3-overrides.css:2530: border-radius: 50%;
src/styles/v3-overrides.css:2554: border-radius: 50%;
src/styles/v3-overrides.css:2595: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:2596: border: none;
src/styles/v3-overrides.css:2619: border-radius: var(--eg-radius-md);
src/styles/v3-overrides.css:2620: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2628: border-color: var(--eg-border-hover);
src/styles/v3-overrides.css:2638: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2639: border-radius: var(--eg-radius-card);
src/styles/v3-overrides.css:2688: border: none;
src/styles/v3-overrides.css:2693: outline: none;
src/styles/v3-overrides.css:2710: border-bottom: 1px dashed transparent;
src/styles/v3-overrides.css:2711: transition: border-color var(--eg-transition-fast);
src/styles/v3-overrides.css:2715: border-bottom-color: var(--eg-border-active);
src/styles/v3-overrides.css:2775: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2784: transition: border-color var(--eg-transition-fast), color var(--eg-transition-fast), background var(--eg-transition-fast);
src/styles/v3-overrides.css:2790: border-radius: var(--eg-radius-sm);
src/styles/v3-overrides.css:2796: border-color: var(--eg-border-hover);
src/styles/v3-overrides.css:2802: border-color: var(--eg-border-active);
src/styles/v3-overrides.css:2818: border: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2819: border-radius: var(--eg-radius-sm);
src/styles/v3-overrides.css:2825: outline: none;
src/styles/v3-overrides.css:2826: box-sizing: border-box;
src/styles/v3-overrides.css:2834: border-color: var(--eg-border-active);
src/styles/v3-overrides.css:2845: border-radius: var(--eg-radius-sm);
src/styles/v3-overrides.css:2871: border-top: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2880: border: 0;
src/styles/v3-overrides.css:2881: border-bottom: 1px solid var(--eg-border);
src/styles/v3-overrides.css:2936: border: 1px solid var(--eg-border) !important;
src/styles/v3-overrides.css:2937: border-radius: var(--eg-radius-card-lg) !important;
src/styles/v3-overrides.css:2982: scrollbar-color: var(--eg-border-hover) var(--bg-primary);
src/styles/v3-overrides.css:2986: scrollbar-color: var(--eg-border-hover) var(--bg-primary);
src/styles/v3-overrides.css:2999: background: var(--eg-border-hover);
src/styles/v3-overrides.css:3000: border-radius: 0;
src/styles/v3-overrides.css:3114: border-color: var(--border-default) !important;
src/styles/v3-overrides.css:3127: border-color: var(--border-default) !important;
src/styles/v3-overrides.css:3182: border-color: var(--eg-border-hover) !important;
src/styles/v3-overrides.css:3192: border-color: var(--border-focus) !important;
src/styles/v3-overrides.css:3194: outline: none !important;
src/styles/v3-overrides.css:3206: border: 0 !important;
src/styles/v3-overrides.css:3208: outline: none !important;
src/styles/v3-overrides.css:3220: border-color: var(--accent) !important;
src/styles/v3-overrides.css:3235: border-color: var(--accent) !important;
src/styles/v3-overrides.css:3245: border-color: var(--status-offline-border) !important;
src/styles/v3-overrides.css:3287: border-color: var(--border-default) !important;
src/styles/v3-overrides.css:3294: border-color: var(--border-default) !important;
src/styles/v3-overrides.css:3355: border-color: var(--border-default) !important;
src/styles/v3-overrides.css:3362: border: 1px solid var(--accent) !important;
src/styles/v3-overrides.css:3399: border-left: 0 !important;
src/styles/v3-overrides.css:3400: outline: 1px solid var(--border-default);
src/styles/v3-overrides.css:3405: using existing tokens; no colored left-border accent bars.
src/styles/v3-overrides.css:3446: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3455: outline: none;
src/styles/v3-overrides.css:3456: border-color: var(--eg-accent);
src/styles/v3-overrides.css:3467: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3479: border-color: var(--eg-accent);
src/styles/v3-overrides.css:3485: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3490: border-collapse: collapse;
src/styles/v3-overrides.css:3500: border-bottom: 1px solid var(--border-default);
src/styles/v3-overrides.css:3506: border-bottom: 1px solid var(--border-subtle, var(--border-default));
src/styles/v3-overrides.css:3530: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3537: .contacts-chip.status-lead { color: var(--status-pending); border-color: var(--status-pending-border, var(--status-pending)); }
src/styles/v3-overrides.css:3538: .contacts-chip.status-client { color: var(--status-live); border-color: var(--status-live-border, var(--status-live)); }
src/styles/v3-overrides.css:3545: .contacts-chip-score { color: var(--eg-accent); border-color: var(--eg-accent); }
src/styles/v3-overrides.css:3546: .contacts-chip-score.band-high { color: var(--status-live); border-color: var(--status-live); }
src/styles/v3-overrides.css:3547: .contacts-chip-score.band-low { color: var(--status-offline); border-color: var(--status-offline); }
src/styles/v3-overrides.css:3549: .contacts-chip-risk.risk-high { color: var(--status-offline); border-color: var(--status-offline); }
src/styles/v3-overrides.css:3550: .contacts-chip-risk.risk-medium { color: var(--status-pending); border-color: var(--status-pending); }
src/styles/v3-overrides.css:3551: .contacts-chip-risk.risk-low { color: var(--status-live); border-color: var(--status-live); }
src/styles/v3-overrides.css:3575: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3601: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3614: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3665: border-color: var(--eg-accent);
src/styles/v3-overrides.css:3696: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3705: outline: none;
src/styles/v3-overrides.css:3706: border-color: var(--eg-accent);
src/styles/v3-overrides.css:3715: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3749: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3775: border-bottom: 1px solid var(--border-default);
src/styles/v3-overrides.css:3781: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3793: border-color: var(--eg-accent);
src/styles/v3-overrides.css:3805: border: 0;
src/styles/v3-overrides.css:3816: border: 0;
src/styles/v3-overrides.css:3821: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:3833: border: 0;
src/styles/v3-overrides.css:3857: border-top: 1px solid var(--border-default);
src/styles/v3-overrides.css:3878: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4045: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4091: border-bottom: 1px solid var(--border-subtle, var(--border-default));
src/styles/v3-overrides.css:4096: border-bottom: 0;
src/styles/v3-overrides.css:4110: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4119: border-bottom: 1px solid var(--border-subtle, var(--border-default));
src/styles/v3-overrides.css:4161: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4167: .contacts-activity-tag.tag-call { color: var(--eg-accent); border-color: var(--eg-accent); }
src/styles/v3-overrides.css:4168: .contacts-activity-tag.tag-enrollment { color: var(--status-live); border-color: var(--status-live); }
src/styles/v3-overrides.css:4169: .contacts-activity-tag.tag-follow_up { color: var(--status-pending); border-color: var(--status-pending); }
src/styles/v3-overrides.css:4172: border-bottom: 1px solid var(--border-subtle, var(--border-default));
src/styles/v3-overrides.css:4182: border: 0;
src/styles/v3-overrides.css:4220: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4221: border-radius: var(--eg-radius-card);
src/styles/v3-overrides.css:4229: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4230: border-radius: var(--eg-radius-sm);
src/styles/v3-overrides.css:4241: border-color: var(--border-focus);
src/styles/v3-overrides.css:4251: border: 1px solid var(--status-live);
src/styles/v3-overrides.css:4252: border-radius: var(--eg-radius-sm);
src/styles/v3-overrides.css:4273: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4283: border-color: var(--eg-accent);
src/styles/v3-overrides.css:4288: border-color: var(--status-live);
src/styles/v3-overrides.css:4293: border-color: var(--status-offline);
src/styles/v3-overrides.css:4328: box-sizing: border-box;
src/styles/v3-overrides.css:4338: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4340: border-radius: var(--clay-radius);
src/styles/v3-overrides.css:4365: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4366: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4375: border: 0;
src/styles/v3-overrides.css:4382: outline: none;
src/styles/v3-overrides.css:4393: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4394: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4405: border-color: var(--bubble-agent-bg);
src/styles/v3-overrides.css:4429: border: 1px solid transparent;
src/styles/v3-overrides.css:4430: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4440: border-color: transparent;
src/styles/v3-overrides.css:4447: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4448: border-radius: 50%;
src/styles/v3-overrides.css:4504: border: 1px solid var(--eg-accent);
src/styles/v3-overrides.css:4526: border-bottom: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4549: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4550: border-radius: 50%;
src/styles/v3-overrides.css:4556: border-color: var(--bubble-agent-bg);
src/styles/v3-overrides.css:4566: border-bottom: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4570: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4574: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4586: border: 0;
src/styles/v3-overrides.css:4608: border-bottom: 1px solid var(--border-subtle, var(--border-default));
src/styles/v3-overrides.css:4622: box-sizing: border-box;
src/styles/v3-overrides.css:4644: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4645: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4681: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4682: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4693: border-color: var(--bubble-agent-bg);
src/styles/v3-overrides.css:4717: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4725: border: 1px solid var(--eg-accent);
src/styles/v3-overrides.css:4742: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4743: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4753: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:4754: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:4810: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4821: border-color: var(--eg-accent);
src/styles/v3-overrides.css:4836: border-bottom: 1px solid var(--eg-accent);
src/styles/v3-overrides.css:4845: border-radius: 50%;
src/styles/v3-overrides.css:4859: border: 1px solid var(--eg-accent);
src/styles/v3-overrides.css:4878: border: 0;
src/styles/v3-overrides.css:4890: border-color: var(--eg-accent);
src/styles/v3-overrides.css:4902: border-radius: 50%;
src/styles/v3-overrides.css:4937: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:4938: border-radius: 3px;
src/styles/v3-overrides.css:4951: border: 0;
src/styles/v3-overrides.css:4952: border-radius: 2px;
src/styles/v3-overrides.css:4966: outline: none;
src/styles/v3-overrides.css:4981: border-radius: 50%;
src/styles/v3-overrides.css:4993: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5003: border-color: var(--status-live);
src/styles/v3-overrides.css:5009: border-color: var(--status-live);
src/styles/v3-overrides.css:5025: border: 1px solid var(--status-live);
src/styles/v3-overrides.css:5081: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5102: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5134: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5144: border-color: var(--eg-accent);
src/styles/v3-overrides.css:5152: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5191: border: 0;
src/styles/v3-overrides.css:5227: border: 0;
src/styles/v3-overrides.css:5228: border-radius: 10px;
src/styles/v3-overrides.css:5239: border: 0;
src/styles/v3-overrides.css:5252: border: 1px solid var(--clay-border);
src/styles/v3-overrides.css:5253: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:5262: outline: none;
src/styles/v3-overrides.css:5263: border-color: var(--bubble-agent-bg);
src/styles/v3-overrides.css:5287: border: 1px solid var(--bubble-agent-bg);
src/styles/v3-overrides.css:5288: border-radius: var(--clay-radius-sm);
src/styles/v3-overrides.css:5320: border: 1px solid var(--eg-accent);
src/styles/v3-overrides.css:5354: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5396: border: 0;
src/styles/v3-overrides.css:5412: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5419: .call-log-chip.disposition-connected { color: var(--status-live); border-color: var(--status-live); }
src/styles/v3-overrides.css:5420: .call-log-chip.disposition-voicemail { color: var(--status-pending); border-color: var(--status-pending); }
src/styles/v3-overrides.css:5422: .call-log-chip.disposition-declined { color: var(--status-offline); border-color: var(--status-offline); }
src/styles/v3-overrides.css:5424: .call-log-chip.compliance-high { color: var(--status-live); border-color: var(--status-live); }
src/styles/v3-overrides.css:5425: .call-log-chip.compliance-mid { color: var(--status-pending); border-color: var(--status-pending); }
src/styles/v3-overrides.css:5426: .call-log-chip.compliance-low { color: var(--status-offline); border-color: var(--status-offline); }
src/styles/v3-overrides.css:5454: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5521: border: 1px solid var(--eg-accent);
src/styles/v3-overrides.css:5522: border-radius: 10px;
src/styles/v3-overrides.css:5564: border: 0;
src/styles/v3-overrides.css:5579: border-radius: 14px;
src/styles/v3-overrides.css:5583: border-bottom-left-radius: 4px;
src/styles/v3-overrides.css:5587: border-bottom-right-radius: 4px;
src/styles/v3-overrides.css:5591: border-radius: 10px;
src/styles/v3-overrides.css:5616: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5638: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5647: border-color: var(--eg-accent);
src/styles/v3-overrides.css:5683: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5706: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5726: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5734: border: 2px solid var(--border-default);
src/styles/v3-overrides.css:5735: border-top-color: var(--eg-accent);
src/styles/v3-overrides.css:5736: border-radius: 50%;
src/styles/v3-overrides.css:5750: border: 1px solid var(--status-live);
src/styles/v3-overrides.css:5754: border-color: var(--status-offline);
src/styles/v3-overrides.css:5825: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5835: border: none;
src/styles/v3-overrides.css:5852: background: var(--border-default);
src/styles/v3-overrides.css:5875: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5876: border-left: 3px solid var(--status-offline);
src/styles/v3-overrides.css:5883: border-left-color: var(--status-live);
src/styles/v3-overrides.css:5887: border-color: var(--eg-accent);
src/styles/v3-overrides.css:5914: border: 1px solid var(--border-default);
src/styles/v3-overrides.css:5922: border-bottom: 1px solid var(--border-default);
src/styles/v3-overrides.css:5950: Keep borders on interactive controls only; the rail, cards, and
src/styles/v3-overrides.css:5960: border: 0 !important;
src/styles/v3-overrides.css:5968: border: 0 !important;
src/styles/v3-overrides.css:5978: border-radius: 0 var(--eg-radius-sm) var(--eg-radius-sm) 0 !important;
src/styles/v3-overrides.css:6024: border: 0 !important;
src/styles/v3-overrides.css:6025: border-radius: 0 !important;
src/styles/v3-overrides.css:6041: border-bottom: 0 !important;
src/styles/v3-overrides.css:6064: border: 0 !important;
src/styles/v3-overrides.css:6070: border: 0 !important;
src/styles/v3-overrides.css:6079: border: 0 !important;
src/styles/v3-overrides.css:6080: border-right: 0 !important;
src/styles/v3-overrides.css:6089: box-sizing: border-box;
src/styles/v3-overrides.css:6090: border: 0 !important;
src/styles/v3-overrides.css:6095: border: 0 !important;
src/styles/v3-overrides.css:6104: border: 0 !important;
src/styles/v3-overrides.css:6105: border-radius: 0 !important;
src/styles/v3-overrides.css:6111: border: 0 !important;
src/styles/v3-overrides.css:6124: border: 0 !important;
src/styles/v3-overrides.css:6125: border-radius: var(--eg-radius-sm) !important;
src/styles/v3-overrides.css:6131: border: 0 !important;
src/styles.css:19: border: 1px solid var(--eg-border);
src/styles.css:20: border-radius: var(--eg-radius-card);
src/styles.css:26: border-color: transparent;
src/styles.css:27: border-radius: 0;
src/styles.css:48: border-radius: 50%;
src/styles.css:82: border: 1px solid var(--eg-border);
src/styles.css:83: border-radius: var(--eg-radius-card);
src/styles.css:112: border: 1px solid var(--eg-border);
src/styles.css:113: border-radius: var(--eg-radius-pill);
src/styles.css:123: border: 1px solid var(--eg-border);
src/styles.css:124: border-radius: var(--eg-radius-md);
src/styles.css:132: transition: border-color var(--eg-transition-fast), background var(--eg-transition-fast), color var(--eg-transition-fast);
src/styles.css:139: border-color: rgba(106, 171, 125, 0.27);
src/styles.css:158: border-color: var(--eg-border-hover);
src/styles.css:175: border-top: 1px solid var(--eg-border);
src/styles.css:203: border: 1px solid var(--eg-border);
src/styles.css:204: border-radius: var(--eg-radius-md);
src/styles.css:215: outline: none;
src/styles.css:216: border-color: var(--eg-border-active);
src/styles.css:232: border: 1px solid var(--eg-border);
src/styles.css:233: border-radius: var(--eg-radius-card);
src/styles.css:276: border-color: rgba(184, 92, 92, 0.34);
src/styles.css:286: border-color: rgba(106, 171, 125, 0.27);
src/styles.css:292: border-color: rgba(196, 153, 64, 0.32);
src/styles.css:317: border: 1px solid var(--eg-border);
src/styles.css:318: border-radius: var(--eg-radius-sm);
src/styles.css:325: border-color: var(--status-offline-border);
src/styles.css:348: border-color: rgba(106, 171, 125, 0.28);
src/styles.css:353: border-color: var(--status-offline-border);
src/styles.css:395: border: 1px solid var(--eg-border);
src/styles.css:396: border-radius: var(--eg-radius-sm);
src/styles.css:445: background: var(--eg-border);
src/styles.css:446: border-radius: 2px;
src/styles.css:451: background: var(--eg-border-hover);
src/styles.css:485: box-sizing: border-box;
src/styles.css:648: border-right: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:656: .app-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 10px; }
src/styles.css:664: border-bottom: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:685: border: none;
src/styles.css:694: border-radius: 0;
src/styles.css:713: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:787: border-bottom: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:796: border: none;
src/styles.css:797: border-top: 2px solid transparent;
src/styles.css:798: border-bottom: 2px solid transparent;
src/styles.css:799: border-right: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:800: border-radius: 0;
src/styles.css:812: border-color 0.2s ease,
src/styles.css:834: border-top-color: rgba(255, 255, 255, 0.12);
src/styles.css:851: border-top: 2px solid #E8002D;
src/styles.css:852: border-bottom-color: var(--eg-surface-1);
src/styles.css:853: border-right-color: rgba(232, 0, 45, 0.1);
src/styles.css:904: border-left: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:958: border-radius: 999px;
src/styles.css:988: box-sizing: border-box;
src/styles.css:998: border-radius: 14px;
src/styles.css:999: border: 1px solid var(--eg-surface-3);
src/styles.css:1023: border: 0;
src/styles.css:1024: border-radius: 999px;
src/styles.css:1049: border-radius: 999px;
src/styles.css:1098: border-radius: 10px;
src/styles.css:1100: border: 1px solid var(--eg-surface-3);
src/styles.css:1137: border-radius: 12px;
src/styles.css:1138: border: 1px solid var(--eg-surface-3);
src/styles.css:1142: transition: background 0.18s ease, border-color 0.18s ease,
src/styles.css:1148: border-color: #2f86c7;
src/styles.css:1171: border-radius: 12px;
src/styles.css:1172: border: 1px solid var(--eg-surface-3);
src/styles.css:1176: transition: border-color 0.18s ease, background 0.18s ease,
src/styles.css:1181: border-color: #2f86c7;
src/styles.css:1193: border-radius: 999px;
src/styles.css:1233: border: 1px solid #4d2d00;
src/styles.css:1234: border-radius: 10px;
src/styles.css:1242: transition: background 0.18s ease, border-color 0.18s ease,
src/styles.css:1248: border-color: #f4b24d;
src/styles.css:1259: border-radius: 999px;
src/styles.css:1260: border: 1px solid #f4b24d;
src/styles.css:1297: border: 1px solid var(--eg-surface-3);
src/styles.css:1298: border-radius: 12px;
src/styles.css:1312: border: 0;
src/styles.css:1351: border-top: 1px solid var(--eg-surface-3);
src/styles.css:1366: border-radius: 999px;
src/styles.css:1367: border: 1px solid #69a7c8;
src/styles.css:1374: border-color: #f2a35b;
src/styles.css:1382: border-radius: 4px;
src/styles.css:1422: box-sizing: border-box;
src/styles.css:1436: box-sizing: border-box;
src/styles.css:1463: border-radius: 3px;
src/styles.css:1474: box-sizing: border-box;
src/styles.css:1592: border-radius: 2px;
src/styles.css:1603: border-radius: 4px;
src/styles.css:1635: border-left: 3px solid #f4b24d;
src/styles.css:1641: border-left: 3px solid #c41e1e;
src/styles.css:1648: border-left: 3px solid #ff3838;
src/styles.css:1678: border-radius: 14px;
src/styles.css:1679: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:1686: transition: border-color 0.18s ease, opacity 0.18s ease;
src/styles.css:1698: border-color: rgba(234, 179, 8, 0.28);
src/styles.css:1726: border-radius: 999px;
src/styles.css:1766: border-radius: 999px;
src/styles.css:1767: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:1775: border-color 0.16s ease,
src/styles.css:1782: border-color: rgba(255, 255, 255, 0.16);
src/styles.css:1788: border-color: color-mix(in srgb, var(--availability-color, #f0f6fc) 42%, rgba(255, 255, 255, 0.08));
src/styles.css:1806: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:1807: border-right: none;
src/styles.css:1808: border-radius: 10px 0 0 10px;
src/styles.css:1848: border: 1px solid var(--rail-term-border, var(--sep-term-border, rgba(255, 255, 255, 0.08)));
src/styles.css:1849: border-radius: 4px;
src/styles.css:1859: transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
src/styles.css:1863: border-color: var(--rail-term-blue-bright, var(--sep-term-blue-bright, rgba(255, 255, 255, 0.18)));
src/styles.css:1872: border-radius: 4px 0 0 4px;
src/styles.css:1885: border-radius: 0 4px 4px 0;
src/styles.css:1916: border-left: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:1921: box-sizing: border-box;
src/styles.css:1942: --rail-term-border: var(--eg-surface-3);
src/styles.css:1943: --rail-term-border-bright: #2a2a2a;
src/styles.css:1967: border-radius: 0 !important;
src/styles.css:1978: border-left: 1px solid var(--rail-term-border) !important;
src/styles.css:1985: scrollbar-color: var(--rail-term-border-bright, rgba(255,255,255,0.15)) transparent;
src/styles.css:1990: background: var(--rail-term-border-bright, #2a2a2a) !important;
src/styles.css:2002: border: 0 !important;
src/styles.css:2018: border-bottom: 1px solid #4d2d00 !important;
src/styles.css:2050: background: var(--rail-term-border) !important;
src/styles.css:2055: border: 1px solid var(--rail-term-border);
src/styles.css:2060: border: 0 !important;
src/styles.css:2073: border-right: 0 !important;
src/styles.css:2104: border-bottom: 1px solid var(--rail-term-border);
src/styles.css:2117: border: 1px solid var(--rail-term-border) !important;
src/styles.css:2146: border: 1px solid var(--rail-term-border) !important;
src/styles.css:2155: border: 0 !important;
src/styles.css:2172: border: 1px solid #4d2d00 !important;
src/styles.css:2178: border-color: var(--rail-term-border) !important;
src/styles.css:2200: border-bottom: 1px solid var(--rail-term-border) !important;
src/styles.css:2201: border-left-color: transparent !important;
src/styles.css:2235: border: 1px solid var(--rail-term-border) !important;
src/styles.css:2236: border-left: 1px solid var(--rail-term-border) !important;
src/styles.css:2262: border-color: var(--rail-term-red) !important;
src/styles.css:2271: box-sizing: border-box;
src/styles.css:2280: border: 1px solid var(--copilot-alert-border, var(--eg-surface-3));
src/styles.css:2281: border-radius: 0;
src/styles.css:2363: border: 1px solid var(--rail-term-border) !important;
src/styles.css:2404: border: 1px solid var(--rail-term-border);
src/styles.css:2408: border: 0 !important;
src/styles.css:2409: border-right: 1px solid var(--rail-term-border) !important;
src/styles.css:2418: border-right: 0 !important;
src/styles.css:2428: border-color: var(--availability-color, var(--rail-term-border)) !important;
src/styles.css:2434: border-bottom: 1px solid var(--rail-term-border) !important;
src/styles.css:2451: border: 1px solid var(--rail-term-border) !important;
src/styles.css:2466: background: var(--rail-term-border) !important;
src/styles.css:2508: border: 1px solid var(--rail-term-red) !important;
src/styles.css:2515: border: 1px solid var(--rail-term-border) !important;
src/styles.css:2516: border-right: 0 !important;
src/styles.css:2553: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:2554: border-radius: 10px;
src/styles.css:2615: border-left: none;
src/styles.css:2616: border-radius: 0;
src/styles.css:2627: border-radius: 0;
src/styles.css:2674: border-radius: 0;
src/styles.css:2678: border-radius: 0;
src/styles.css:2717: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:2718: border-top-color: rgba(255, 255, 255, 0.08);
src/styles.css:2719: border-radius: 16px;
src/styles.css:2748: /* Active Card, white glow border, plain background (no carbon weave) */
src/styles.css:2752: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:2753: border-radius: 16px;
src/styles.css:2762: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:2810: border-bottom: none;
src/styles.css:2814: border-bottom: none;
src/styles.css:2861: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:2862: border-radius: var(--radius-md);
src/styles.css:2875: border-color: transparent;
src/styles.css:2882: border-color 180ms ease,
src/styles.css:2892: border-color: rgba(157, 0, 255, 0.18);
src/styles.css:2943: border: 1px solid var(--border-color);
src/styles.css:2944: border-radius: var(--radius-sm);
src/styles.css:2955: border-color: rgba(0, 209, 102, 0.38);
src/styles.css:2976: border: 1px solid #0f5c2b;
src/styles.css:2977: border-radius: 0;
src/styles.css:2996: border-color: var(--script-term-green, #33cc66);
src/styles.css:3015: outline: 2px solid rgba(51, 204, 102, 0.55);
src/styles.css:3016: outline-offset: 3px;
src/styles.css:3024: border-radius: var(--radius-sm);
src/styles.css:3025: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:3033: border-color: rgba(0, 209, 102, 0.25);
src/styles.css:3039: border-color: rgba(232, 0, 45, 0.35);
src/styles.css:3047: border: 1px solid rgba(232, 0, 45, 0.35);
src/styles.css:3099: --ops-border: var(--eg-surface-3);
src/styles.css:3100: --ops-border-bright: #2a2a2a;
src/styles.css:3130: border: 1px solid var(--ops-border);
src/styles.css:3139: border-radius: 0 !important;
src/styles.css:3140: box-sizing: border-box;
src/styles.css:3163: border-bottom: 1px solid var(--ops-border);
src/styles.css:3173: border-bottom: 1px solid #3a0505;
src/styles.css:3188: border-left: 1px solid #4a0508;
src/styles.css:3194: border-left: 1px solid #092d52;
src/styles.css:3208: border-bottom: 1px solid var(--ops-border);
src/styles.css:3224: border-right: 1px solid var(--ops-border-bright);
src/styles.css:3232: border: none;
src/styles.css:3233: border-right: 1px solid var(--ops-border-bright);
src/styles.css:3242: outline: 1px solid var(--ops-yellow);
src/styles.css:3243: outline-offset: -1px;
src/styles.css:3265: border-bottom: 1px solid var(--ops-border);
src/styles.css:3277: border-right: 1px solid var(--ops-red-dark);
src/styles.css:3280: .operations-tab .ops-ticker-item:last-child { border-right: none; }
src/styles.css:3305: border-right: 1px solid var(--ops-border);
src/styles.css:3307: .operations-tab .ops-grid > aside:last-child { border-right: none; }
src/styles.css:3321: border-bottom: 1px solid #4d2d00;
src/styles.css:3347: border-bottom: 1px solid var(--ops-border);
src/styles.css:3355: border-bottom: 1px solid var(--ops-border);
src/styles.css:3360: border: none;
src/styles.css:3361: border-right: 1px solid var(--ops-border);
src/styles.css:3372: .operations-tab .ops-window-toggle button:last-child { border-right: none; }
src/styles.css:3392: border-bottom: 1px solid var(--ops-border);
src/styles.css:3441: border-bottom: 1px solid var(--ops-border);
src/styles.css:3446: border-top: 1px solid var(--ops-border);
src/styles.css:3447: border-bottom: 1px solid var(--ops-border);
src/styles.css:3459: border: none;
src/styles.css:3480: border-right: 1px solid var(--ops-border);
src/styles.css:3481: border-bottom: 1px solid var(--ops-border);
src/styles.css:3485: border-right: none;
src/styles.css:3525: border-bottom: 1px solid var(--ops-border);
src/styles.css:3536: border-right: 1px solid var(--ops-border);
src/styles.css:3551: border: 1px solid var(--ops-border-bright);
src/styles.css:3561: outline: 1px solid var(--ops-yellow);
src/styles.css:3566: border: 1px solid var(--ops-border-bright);
src/styles.css:3571: border: none;
src/styles.css:3572: border-right: 1px solid var(--ops-border-bright);
src/styles.css:3581: .operations-tab .ops-date-buttons button:last-child { border-right: none; }
src/styles.css:3598: border-bottom: 1px solid var(--ops-border);
src/styles.css:3606: border-right: 1px solid var(--ops-border);
src/styles.css:3609: .operations-tab .ops-metric:last-child { border-right: none; }
src/styles.css:3633: border: 1px solid #5a3400;
src/styles.css:3643: border-color: var(--ops-blue);
src/styles.css:3651: .operations-tab .ops-table { width: 100%; border-collapse: collapse; font-size: 11px; }
src/styles.css:3664: border-bottom: 1px solid var(--ops-border);
src/styles.css:3679: border: none;
src/styles.css:3722: border-bottom: 1px solid var(--eg-surface-1);
src/styles.css:3770: border: 0;
src/styles.css:3805: border-top: 1px solid var(--ops-border);
src/styles.css:3828: border: 1px solid rgba(255, 255, 255, 0.18);
src/styles.css:3860: .operations-tab .ops-bottom-row > div + div { border-left: 1px solid var(--ops-border); }
src/styles.css:3869: border-bottom: 1px solid var(--ops-border);
src/styles.css:3918: border: 1px solid var(--ops-border);
src/styles.css:3947: border-bottom: 1px solid var(--ops-border);
src/styles.css:3960: border-bottom: 1px solid var(--ops-border);
src/styles.css:3972: border-right: 1px solid var(--ops-border);
src/styles.css:4011: border-top: 1px solid var(--ops-border);
src/styles.css:4020: border: none;
src/styles.css:4021: border-bottom: 1px solid #4d2d00;
src/styles.css:4039: border-bottom: 1px solid var(--ops-border);
src/styles.css:4048: border-right: 1px solid var(--ops-border);
src/styles.css:4049: border-bottom: 1px solid var(--ops-border);
src/styles.css:4051: .operations-tab .ops-agent-stat-grid div:nth-child(2n) { border-right: none; }
src/styles.css:4067: border-bottom: 1px solid var(--ops-border);
src/styles.css:4071: border-right: 1px solid var(--ops-border);
src/styles.css:4073: .operations-tab .ops-agent-trends > span:last-child { border-right: none; }
src/styles.css:4084: border-bottom: 1px solid var(--ops-border);
src/styles.css:4099: border-bottom: 1px solid var(--ops-border);
src/styles.css:4123: border-bottom: 1px solid var(--ops-border-bright);
src/styles.css:4129: border-bottom: 1px solid var(--ops-border);
src/styles.css:4134: border: none;
src/styles.css:4135: border-right: 1px solid var(--ops-border);
src/styles.css:4156: border: 1px solid var(--ops-border);
src/styles.css:4170: border-top: 1px solid var(--ops-border);
src/styles.css:4177: border-bottom: 1px solid var(--ops-border);
src/styles.css:4205: border: 1px solid var(--ops-border);
src/styles.css:4213: border: 1px solid var(--ops-border);
src/styles.css:4258: border: 1px solid var(--ops-border);
src/styles.css:4280: border: 1px solid var(--ops-border);
src/styles.css:4295: stroke: var(--ops-border-bright);
src/styles.css:4331: border: 1px solid var(--ops-border);
src/styles.css:4394: border: 1px solid var(--ops-border);
src/styles.css:4414: border: 1px solid var(--ops-border);
src/styles.css:4438: border-top: 1px solid var(--ops-border);
src/styles.css:4442: border-collapse: collapse;
src/styles.css:4447: border-bottom: 1px solid var(--ops-border);
src/styles.css:4448: border-right: 1px solid var(--ops-border);
src/styles.css:4467: border-top: 1px solid var(--ops-border);
src/styles.css:4473: border-bottom: 1px solid var(--ops-border);
src/styles.css:4476: border: none;
src/styles.css:4477: border-right: 1px solid var(--ops-border);
src/styles.css:4493: border-bottom: 1px solid var(--ops-border);
src/styles.css:4528: border: 1px solid var(--ops-red-dark);
src/styles.css:4536: border-top: 1px solid var(--ops-border);
src/styles.css:4548: border-right: 1px solid var(--ops-border);
src/styles.css:4549: border-bottom: 1px solid var(--ops-border);
src/styles.css:4552: .operations-tab .ops-pipeline-cell:last-child { border-right: none; }
src/styles.css:4575: border-bottom: 1px solid var(--ops-border);
src/styles.css:4640: border: 1px solid var(--ops-red-dark);
src/styles.css:4652: .operations-tab .ops-tracker-status:focus { outline: 1px solid var(--ops-yellow); }
src/styles.css:4663: border-top: 1px solid var(--ops-red-dark);
src/styles.css:4731: border-right: none;
src/styles.css:4732: border-bottom: 1px solid var(--ops-border);
src/styles.css:4740: border-right: none;
src/styles.css:4741: border-bottom: 1px solid var(--ops-border);
src/styles.css:4745: .operations-tab .ops-bottom-row > div + div { border-left: none; border-top: 1px solid var(--ops-border); }
src/styles.css:4795: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:4797: border-radius: var(--radius-sm);
src/styles.css:4801: outline: none;
src/styles.css:4810: border-color: rgba(232, 0, 45, 0.24);
src/styles.css:4837: border-radius: var(--radius-sm);
src/styles.css:4838: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:4841: outline: none;
src/styles.css:4850: border-color: rgba(232, 0, 45, 0.3);
src/styles.css:4938: border-radius: var(--radius-sm);
src/styles.css:4967: border: 1px solid rgba(232, 0, 45, 0.25);
src/styles.css:4968: border-top-color: rgba(232, 0, 45, 0.35);
src/styles.css:4970: border-radius: var(--radius-sm);
src/styles.css:5018: border-color: rgba(232, 0, 45, 0.45);
src/styles.css:5035: outline: 2px solid rgba(232, 0, 45, 0.6);
src/styles.css:5036: outline-offset: 3px;
src/styles.css:5040: outline: 2px solid rgba(255, 215, 0, 0.6);
src/styles.css:5041: outline-offset: 3px;
src/styles.css:5049: border: 1px solid rgba(255,255,255,0.07);
src/styles.css:5051: border-radius: 12px;
src/styles.css:5093: border: 1px solid rgba(255, 215, 0, 0.15);
src/styles.css:5094: border-top-color: rgba(255, 215, 0, 0.25);
src/styles.css:5096: border-radius: var(--radius-sm);
src/styles.css:5142: border-color: rgba(255, 215, 0, 0.3);
src/styles.css:5166: border-color: rgba(0, 255, 65, 0.25);
src/styles.css:5167: border-top-color: rgba(0, 255, 65, 0.4);
src/styles.css:5181: border-color: rgba(0, 255, 65, 0.55);
src/styles.css:5207: border-radius: 999px;
src/styles.css:5208: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:5267: border: 1px solid rgba(251, 191, 36, 0.08);
src/styles.css:5268: border-radius: var(--radius-md);
src/styles.css:5286: border: 1px solid var(--script-term-border, var(--eg-surface-3));
src/styles.css:5287: border-radius: 0;
src/styles.css:5307: border-color: var(--script-term-green, #33cc66);
src/styles.css:5318: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:5319: border-left: 2px solid rgba(232, 0, 45, 0.3);
src/styles.css:5321: border-radius: var(--radius-sm);
src/styles.css:5347: border-radius: 10px;
src/styles.css:5353: border-color: rgba(255, 255, 255, 0.07);
src/styles.css:5354: border-left: 1px solid rgba(255, 255, 255, 0.07) !important;
src/styles.css:5394: border: 0;
src/styles.css:5395: outline: 0;
src/styles.css:5414: outline: none;
src/styles.css:5437: --script-term-border: var(--eg-surface-3);
src/styles.css:5438: --script-term-border-bright: #2a2a2a;
src/styles.css:5456: border: 0 !important;
src/styles.css:5457: border-radius: 0 !important;
src/styles.css:5468: --client-script-border: var(--flow-ma-border);
src/styles.css:5490: border: 1px solid var(--border-default);
src/styles.css:5491: border-radius: var(--eg-radius-md);
src/styles.css:5507: --script-term-border: var(--eg-border);
src/styles.css:5516: border: 1px solid var(--eg-border);
src/styles.css:5529: --client-script-border: var(--flow-aca-border);
src/styles.css:5541: border: 1px solid var(--border-default);
src/styles.css:5542: border-radius: 8px;
src/styles.css:5560: border: 0;
src/styles.css:5580: outline: 1px solid var(--client-script-color);
src/styles.css:5581: outline-offset: 5px;
src/styles.css:5588: border: 1px solid var(--client-script-border);
src/styles.css:5589: border-radius: 50%;
src/styles.css:5594: border-color 0.2s ease,
src/styles.css:5600: border-color: var(--client-script-color);
src/styles.css:5611: border: 1px solid var(--client-script-border);
src/styles.css:5612: border-radius: 0;
src/styles.css:5625: border-bottom: 1px solid #4d2d00;
src/styles.css:5661: border: 1px solid #4d2d00;
src/styles.css:5662: border-radius: 0;
src/styles.css:5671: outline: 0;
src/styles.css:5690: border: 1px solid var(--script-term-border);
src/styles.css:5718: border: 1px solid var(--script-term-border);
src/styles.css:5729: border-top: 1px solid var(--script-term-border);
src/styles.css:5755: border: 1px solid var(--script-term-border);
src/styles.css:5756: border-radius: 0;
src/styles.css:5768: border-color 0.2s ease,
src/styles.css:5783: border-color: var(--client-script-branch-color);
src/styles.css:5788: outline: 1px solid var(--client-script-branch-color);
src/styles.css:5789: outline-offset: 2px;
src/styles.css:5840: border-bottom: 1px solid #4d2d00 !important;
src/styles.css:5852: border-color: #4d2d00 !important;
src/styles.css:5863: border: 1px solid var(--script-term-border) !important;
src/styles.css:5864: border-left: 1px solid var(--script-term-border) !important;
src/styles.css:5865: border-radius: 0 !important;
src/styles.css:5880: border-bottom: 1px solid var(--script-term-border);
src/styles.css:5906: border: 1px solid var(--script-term-border) !important;
src/styles.css:5907: border-radius: 0 !important;
src/styles.css:5917: border-color: var(--script-term-blue) !important;
src/styles.css:5938: border: 1px solid var(--script-term-border) !important;
src/styles.css:5939: border-left: 1px solid var(--script-term-border) !important;
src/styles.css:5940: border-radius: 0 !important;
src/styles.css:5985: border: 1px solid var(--script-term-border);
src/styles.css:5986: border-radius: 0;
src/styles.css:6028: border: 1px solid var(--script-term-border);
src/styles.css:6063: border: 1px solid var(--script-term-border);
src/styles.css:6064: border-radius: 0;
src/styles.css:6106: border: 1px solid var(--script-term-border);
src/styles.css:6166: border: 1px solid var(--script-term-border) !important;
src/styles.css:6167: border-left: 1px solid var(--script-term-border) !important;
src/styles.css:6168: border-radius: 0 !important;
src/styles.css:6182: border: 1px solid var(--script-term-border);
src/styles.css:6183: border-radius: 0;
src/styles.css:6198: border: 0;
src/styles.css:6199: border-radius: 0;
src/styles.css:6219: border-bottom: 1px solid var(--script-term-border);
src/styles.css:6268: border-right: 1px solid #4d2d00;
src/styles.css:6286: border: 1px solid #4d2d00 !important;
src/styles.css:6287: border-radius: 0 !important;
src/styles.css:6301: outline: 1px solid var(--eg-surface-1) !important;
src/styles.css:6302: outline-offset: 1px;
src/styles.css:6313: border: 1px solid var(--script-term-border);
src/styles.css:6322: border-color: var(--script-term-cyan);
src/styles.css:6333: border: 0;
src/styles.css:6334: border-radius: 0;
src/styles.css:6350: outline: 0;
src/styles.css:6354: border-bottom: 1px solid var(--script-term-cyan);
src/styles.css:6433: border-color: rgba(244, 178, 77, 0.52) !important;
src/styles.css:6442: border-color: rgba(255, 56, 56, 0.52) !important;
src/styles.css:6455: border: 1px solid var(--script-term-border);
src/styles.css:6483: border: 1px solid var(--script-term-border);
src/styles.css:6484: border-radius: 0;
src/styles.css:6503: border-color: var(--script-term-blue);
src/styles.css:6506: outline: 0;
src/styles.css:6510: border-color: var(--script-term-yellow);
src/styles.css:6523: border: 1px solid var(--script-term-border);
src/styles.css:6528: border-color: var(--script-term-cyan);
src/styles.css:6539: border: 0;
src/styles.css:6540: border-radius: 0;
src/styles.css:6556: outline: 0;
src/styles.css:6560: border-bottom: 1px solid var(--script-term-border);
src/styles.css:6585: border: 1px solid var(--script-term-border);
src/styles.css:6590: border-color: rgba(255, 56, 56, 0.42);
src/styles.css:6595: border-color: rgba(51, 204, 102, 0.4);
src/styles.css:6600: border-color: var(--flow-u65-border);
src/styles.css:6613: border: 0;
src/styles.css:6614: border-radius: 0;
src/styles.css:6630: outline: 0;
src/styles.css:6634: border-bottom: 1px solid var(--script-term-border);
src/styles.css:6640: border: 1px solid currentColor;
src/styles.css:6683: border: 1px solid var(--flow-u65-border);
src/styles.css:6684: border-radius: 0;
src/styles.css:6697: border-color: var(--eg-flow-u65);
src/styles.css:6700: outline: 0;
src/styles.css:6706: border: 1px solid var(--script-term-cyan);
src/styles.css:6711: border-color: var(--script-term-yellow);
src/styles.css:6721: border-bottom: 1px solid var(--script-term-border);
src/styles.css:6740: border: 0;
src/styles.css:6741: border-radius: 0;
src/styles.css:6742: outline: 0;
src/styles.css:6758: border-top: 1px solid var(--script-term-border);
src/styles.css:6769: border: 1px solid var(--script-term-border);
src/styles.css:6770: border-radius: 0;
src/styles.css:6783: border-color: #0f5c2b;
src/styles.css:6790: border-color: var(--script-term-cyan);
src/styles.css:6793: outline: 0;
src/styles.css:6824: border: 1px solid var(--flow-u65-border);
src/styles.css:6825: border-radius: 0;
src/styles.css:6838: border-bottom: 1px solid var(--flow-u65-border);
src/styles.css:6864: border: 1px solid var(--flow-u65-border);
src/styles.css:6865: border-radius: 0;
src/styles.css:6875: outline: 0;
src/styles.css:6906: border: 1px solid var(--script-term-cyan);
src/styles.css:6915: border: 1px solid var(--status-live-border);
src/styles.css:6947: border: 1px solid var(--status-live-border);
src/styles.css:6948: border-radius: 0;
src/styles.css:6963: outline: 0;
src/styles.css:6999: border-top: 0 !important;
src/styles.css:7025: border: 1px solid #0f5c2b !important;
src/styles.css:7026: border-radius: 0 !important;
src/styles.css:7038: border-color: var(--script-term-green) !important;
src/styles.css:7057: border: 1px solid var(--script-term-border) !important;
src/styles.css:7058: border-radius: 0 !important;
src/styles.css:7077: border-color: var(--script-term-yellow) !important;
src/styles.css:7119: border: 0 !important;
src/styles.css:7120: border-radius: 0 !important;
src/styles.css:7132: border: 1px solid #0f5c2b !important;
src/styles.css:7133: border-radius: 0 !important;
src/styles.css:7153: border: 0 !important;
src/styles.css:7166: border: 0 !important;
src/styles.css:7189: box-sizing: border-box;
src/styles.css:7218: border-radius: 999px;
src/styles.css:7242: border-color var(--speed-fast) ease,
src/styles.css:7257: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:7258: border-radius: 50px;
src/styles.css:7276: border: 1px solid rgba(251, 146, 60, 0.18);
src/styles.css:7277: border-top-color: rgba(251, 146, 60, 0.26);
src/styles.css:7278: border-radius: 10px;
src/styles.css:7294: border-color: rgba(255, 255, 255, 0.09);
src/styles.css:7302: border-color: rgba(251, 146, 60, 0.34);
src/styles.css:7354: border-radius: 10px;
src/styles.css:7361: border: 1px solid rgba(251, 146, 60, 0.16);
src/styles.css:7386: border-radius: 999px;
src/styles.css:7417: border: 1px dashed rgba(251, 146, 60, 0.16);
src/styles.css:7423: border: 1px solid rgba(251, 146, 60, 0.16);
src/styles.css:7442: border: 1px solid var(--border-subtle);
src/styles.css:7443: border-radius: var(--radius-md);
src/styles.css:7465: border-radius: var(--radius-md) var(--radius-md) 0 0;
src/styles.css:7475: border: none;
src/styles.css:7492: border-bottom: 1px solid var(--border-subtle);
src/styles.css:7514: border-color: var(--border-subtle);
src/styles.css:7557: outline: 1px solid var(--eg-accent);
src/styles.css:7558: outline-offset: -2px;
src/styles.css:7562: border-radius: 0;
src/styles.css:7618: border-radius: var(--radius-md);
src/styles.css:7620: border: 1px solid var(--border-subtle);
src/styles.css:7636: border-radius: 999px;
src/styles.css:7637: border: 1px solid rgba(251, 191, 36, 0.24);
src/styles.css:7649: border-radius: var(--radius-md);
src/styles.css:7650: border: 1px solid var(--border-subtle);
src/styles.css:7664: border: 1px solid var(--border-subtle);
src/styles.css:7665: border-radius: var(--radius-md);
src/styles.css:7672: border-bottom: 1px solid rgba(232, 0, 45, 0.12);
src/styles.css:7691: border-radius: var(--radius-md);
src/styles.css:7693: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:7739: border-bottom: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:7740: transition: border-color var(--speed-fast) ease;
src/styles.css:7744: border-color: #E8002D;
src/styles.css:7756: border: 1px solid var(--border-subtle);
src/styles.css:7758: border-radius: var(--radius-sm);
src/styles.css:7778: border: 1px solid var(--border-default);
src/styles.css:7817: border: 1px solid var(--border-subtle);
src/styles.css:7818: border-radius: var(--radius-md);
src/styles.css:7836: border-radius: 999px;
src/styles.css:7850: border-radius: var(--radius-md);
src/styles.css:7856: border: 1px solid rgba(248, 113, 113, 0.3);
src/styles.css:7862: border: 1px solid rgba(52, 211, 153, 0.35);
src/styles.css:7884: border-top: 1px solid var(--border-subtle);
src/styles.css:7918: border: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:7920: border-radius: var(--radius-sm);
src/styles.css:8048: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:8053: border-radius: var(--radius-sm);
src/styles.css:8088: border-color: rgba(0, 209, 102, 0.2);
src/styles.css:8100: border-color: rgba(0, 209, 102, 0.22);
src/styles.css:8120: border: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:8121: border-radius: 12px;
src/styles.css:8138: border-radius: 50%;
src/styles.css:8195: border-radius: 50%;
src/styles.css:8226: border-bottom: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:8233: border-radius: 50%;
src/styles.css:8234: border: 1.5px solid rgba(232, 0, 45, 0.14);
src/styles.css:8235: border-top-color: #E8002D;
src/styles.css:8236: border-right-color: rgba(232, 0, 45, 0.5);
src/styles.css:8258: border-radius: 999px;
src/styles.css:8259: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:8295: border: none;
src/styles.css:8298: border-radius: 0;
src/styles.css:8333: border-radius: 50%;
src/styles.css:8344: border: none !important;
src/styles.css:8347: border-radius: 0 !important;
src/styles.css:8388: transition: background 0.15s, border-color 0.15s, transform 0.15s;
src/styles.css:8392: border-color: rgba(232, 0, 45, 0.35);
src/styles.css:8447: border-radius: var(--radius-sm);
src/styles.css:8450: border: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:8451: border-top-color: rgba(232, 0, 45, 0.35);
src/styles.css:8516: border-radius: 999px;
src/styles.css:8517: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:8542: border: 1px solid rgba(255, 68, 85, 0.18);
src/styles.css:8547: border-radius: var(--radius-md);
src/styles.css:8575: border-color: rgba(255, 68, 85, 0.3);
src/styles.css:8587: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:8588: border-radius: 22px;
src/styles.css:8636: border: 1px solid var(--border-subtle);
src/styles.css:8641: border-radius: var(--radius-sm);
src/styles.css:8652: border-left: 3px solid transparent;
src/styles.css:8653: border-radius: 4px;
src/styles.css:8660: border-left-color: #E8002D;
src/styles.css:8669: border: 1px solid rgba(255,255,255,0.05);
src/styles.css:8670: border-left: 1px solid rgba(173,173,173,0.45);
src/styles.css:8674: border-radius: 3px;
src/styles.css:8701: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:8702: border-left: 1px solid rgba(232,0,45,0.6);
src/styles.css:8704: border-radius: 3px;
src/styles.css:8743: border-radius: 3px;
src/styles.css:8752: border-top: none;
src/styles.css:8765: border: 1px solid rgba(157, 0, 255, 0.25);
src/styles.css:8766: border-top-color: rgba(157, 0, 255, 0.35);
src/styles.css:8777: border-radius: 50%;
src/styles.css:8792: border-radius: 50%;
src/styles.css:8803: border-radius: 6px;
src/styles.css:8805: border: 1px solid rgba(157, 0, 255, 0.3);
src/styles.css:8825: border-color: rgba(157, 0, 255, 0.5);
src/styles.css:8838: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:8843: border-radius: var(--radius-sm);
src/styles.css:8858: border: 1px solid rgba(232, 0, 45, 0.2);
src/styles.css:8859: border-top: 2px solid rgba(232, 0, 45, 0.5);
src/styles.css:8864: border-radius: var(--radius-sm);
src/styles.css:8884: border-radius: 999px;
src/styles.css:8885: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:8891: transition: color 0.3s ease, border-color 0.3s ease, background 0.3s ease;
src/styles.css:8896: border: 0;
src/styles.css:8906: border-color: transparent;
src/styles.css:8914: border-color: rgba(251, 191, 36, 0.18);
src/styles.css:8922: border-color: rgba(248, 113, 113, 0.18);
src/styles.css:8967: border-radius: 999px;
src/styles.css:8975: border: 1px solid rgba(251, 191, 36, 0.2);
src/styles.css:8981: border: 1px solid rgba(248, 113, 113, 0.2);
src/styles.css:9006: border: 1px solid rgba(232, 0, 45, 0.3) !important;
src/styles.css:9007: border-top: 2px solid rgba(232, 0, 45, 0.5) !important;
src/styles.css:9013: border-radius: var(--radius-sm);
src/styles.css:9070: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9071: border-radius: 16px;
src/styles.css:9131: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9132: border-radius: 8px;
src/styles.css:9143: border-color: rgba(212, 175, 55, 0.3);
src/styles.css:9155: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9156: border-radius: 10px;
src/styles.css:9173: border-radius: 7px;
src/styles.css:9202: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9203: border-radius: 50%;
src/styles.css:9216: border-color: rgba(212, 175, 55, 0.25);
src/styles.css:9267: border-left: 2px solid rgba(212, 175, 55, 0.2);
src/styles.css:9294: border-radius: 12px;
src/styles.css:9296: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9306: border: 1px solid rgba(212, 175, 55, 0.18);
src/styles.css:9336: border-radius: 6px;
src/styles.css:9396: border-radius: 999px;
src/styles.css:9434: border-radius: 4px;
src/styles.css:9442: border-radius: 4px;
src/styles.css:9444: border: 1px solid rgba(248, 113, 113, 0.2);
src/styles.css:9457: border-radius: 6px;
src/styles.css:9481: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9482: border-radius: 10px;
src/styles.css:9496: border-color: rgba(212, 175, 55, 0.15);
src/styles.css:9501: border-color: rgba(212, 175, 55, 0.18);
src/styles.css:9503: border-bottom-left-radius: 0;
src/styles.css:9504: border-bottom-right-radius: 0;
src/styles.css:9505: border-bottom-color: transparent;
src/styles.css:9511: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9512: border-top: none;
src/styles.css:9513: border-radius: 0 0 10px 10px;
src/styles.css:9529: border-bottom: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9536: border-radius: 999px;
src/styles.css:9538: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9559: border-bottom: 1px solid rgba(212, 175, 55, 0.08);
src/styles.css:9564: border-bottom: none;
src/styles.css:9602: border-radius: 999px;
src/styles.css:9604: border: 1px solid rgba(212, 175, 55, 0.22);
src/styles.css:9616: border-radius: 999px;
src/styles.css:9618: border: 1px solid rgba(255, 120, 40, 0.25);
src/styles.css:9631: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:9632: border-radius: 50%;
src/styles.css:9640: border-color: rgba(212, 175, 55, 0.25);
src/styles.css:9645: border-color: rgba(212, 175, 55, 0.35);
src/styles.css:9656: border-top: 1px solid rgba(212, 175, 55, 0.1);
src/styles.css:9664: border-radius: 8px;
src/styles.css:9666: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9678: border-color: rgba(212, 175, 55, 0.2);
src/styles.css:9683: border-color: rgba(212, 175, 55, 0.35);
src/styles.css:9688: border-color: rgba(0, 209, 102, 0.3);
src/styles.css:9696: border-radius: 12px;
src/styles.css:9698: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9748: border-radius: 12px;
src/styles.css:9750: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9770: border-radius: 6px;
src/styles.css:9801: border-radius: 12px;
src/styles.css:9803: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9826: border-radius: 999px;
src/styles.css:9859: border: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:9860: border-radius: 8px;
src/styles.css:9868: border-color: rgba(212, 175, 55, 0.18);
src/styles.css:9892: border: 1px solid rgba(255, 255, 255, 0.04);
src/styles.css:9893: border-radius: 8px;
src/styles.css:9901: border-color: rgba(232, 0, 45, 0.3);
src/styles.css:9916: border-radius: 12px;
src/styles.css:9918: border: 1px solid rgba(212, 175, 55, 0.12);
src/styles.css:9936: border-radius: 999px;
src/styles.css:9938: border: 1px solid rgba(212, 175, 55, 0.2);
src/styles.css:9949: border-color: rgba(212, 175, 55, 0.4);
src/styles.css:9974: border-bottom: 1px solid rgba(255, 255, 255, 0.03);
src/styles.css:9977: border-bottom: none;
src/styles.css:9995: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:9996: border-radius: 6px;
src/styles.css:10007: border-color: rgba(212, 175, 55, 0.28);
src/styles.css:10012: border-color: rgba(232, 0, 45, 0.3);
src/styles.css:10020: border-radius: 8px;
src/styles.css:10022: border-left: 2px solid rgba(212, 175, 55, 0.35);
src/styles.css:10037: border-radius: 8px;
src/styles.css:10038: border: 1px solid rgba(212, 175, 55, 0.2);
src/styles.css:10045: outline: none;
src/styles.css:10048: border-color: rgba(212, 175, 55, 0.45);
src/styles.css:10061: border-radius: 6px;
src/styles.css:10063: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10075: border-color: rgba(212, 175, 55, 0.2);
src/styles.css:10079: border-color: rgba(212, 175, 55, 0.35);
src/styles.css:10091: border-radius: 12px;
src/styles.css:10189: border-radius: 16px;
src/styles.css:10190: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:10211: border-radius: 999px;
src/styles.css:10212: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:10237: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:10324: border: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:10325: border-top-color: rgba(255, 255, 255, 0.16);
src/styles.css:10403: outline: 2px solid rgba(59, 130, 246, 0.65);
src/styles.css:10404: outline-offset: 3px;
src/styles.css:10482: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10483: border-radius: 22px;
src/styles.css:10496: border: none;
src/styles.css:10497: border-radius: 16px;
src/styles.css:10510: border-color 0.18s ease,
src/styles.css:10530: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10556: border-radius: 22px;
src/styles.css:10557: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:10576: border-color: rgba(255, 215, 0, 0.2);
src/styles.css:10585: border-color: rgba(232, 0, 45, 0.22);
src/styles.css:10610: border-radius: 14px;
src/styles.css:10611: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:10636: border-radius: 18px;
src/styles.css:10776: border-top: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:10788: border-radius: 12px;
src/styles.css:10789: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:10809: border: 0;
src/styles.css:10810: border-radius: 9px;
src/styles.css:10822: outline: none;
src/styles.css:10897: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:10907: border-color 0.16s ease;
src/styles.css:10913: border-radius: 8px;
src/styles.css:10931: border-radius: 8px;
src/styles.css:10938: border-color: rgba(255, 255, 255, 0.22);
src/styles.css:10947: border-color: rgba(232, 55, 44, 0.56);
src/styles.css:10984: border-top: 0;
src/styles.css:11030: border-color: var(--eg-surface-3);
src/styles.css:11085: border-radius: 999px;
src/styles.css:11086: border: 2px solid rgba(0, 255, 65, 0.25);
src/styles.css:11100: border-color 0.18s ease,
src/styles.css:11120: border-radius: 999px;
src/styles.css:11121: border: 1px solid rgba(0, 255, 65, 0.08);
src/styles.css:11127: border-color: rgba(57, 255, 136, 0.45);
src/styles.css:11136: outline: 2px solid rgba(0, 255, 65, 0.5);
src/styles.css:11137: outline-offset: 4px;
src/styles.css:11166: border-bottom: 1px solid #30363d;
src/styles.css:11193: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:11194: border-bottom-color: rgba(0, 0, 0, 0.72);
src/styles.css:11195: border-radius: 3px;
src/styles.css:11215: border: 1px solid transparent;
src/styles.css:11216: border-right-color: rgba(0, 0, 0, 0.46);
src/styles.css:11232: transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
src/styles.css:11242: border-radius: 0;
src/styles.css:11251: border-top-color: rgba(255, 255, 255, 0.16);
src/styles.css:11256: border-color: rgba(244, 178, 77, 0.88);
src/styles.css:11257: border-bottom-color: #5a3200;
src/styles.css:11295: border-radius: 999px;
src/styles.css:11296: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11315: border-radius: 16px;
src/styles.css:11316: border: 1px solid #30363d;
src/styles.css:11342: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:11343: border-radius: 8px;
src/styles.css:11360: border-radius: 8px;
src/styles.css:11361: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11367: border-color: rgba(229, 62, 62, 0.68);
src/styles.css:11394: border-radius: 999px;
src/styles.css:11395: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11402: border-radius: 50%;
src/styles.css:11403: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:11420: border: 0;
src/styles.css:11439: border: 1px solid rgba(245, 166, 35, 0.34);
src/styles.css:11440: border-radius: 3px;
src/styles.css:11454: border-color: rgba(56, 189, 248, 0.28);
src/styles.css:11487: border: 1px solid rgba(255, 255, 255, 0.14);
src/styles.css:11488: border-radius: 2px;
src/styles.css:11564: border: 1px solid rgba(255, 255, 255, 0.13);
src/styles.css:11565: border-radius: 2px;
src/styles.css:11587: border-color: rgba(229, 62, 62, 0.58);
src/styles.css:11615: border: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:11616: border-radius: 2px;
src/styles.css:11670: border: 1px solid rgba(56, 189, 248, 0.24);
src/styles.css:11671: border-radius: 2px;
src/styles.css:11680: border-color: rgba(239, 68, 68, 0.34);
src/styles.css:11686: border-color: rgba(51, 204, 102, 0.28);
src/styles.css:11706: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:11707: border-radius: 3px;
src/styles.css:11722: border-color: rgba(232, 0, 45, 0.42);
src/styles.css:11762: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:11763: border-radius: 6px;
src/styles.css:11770: border-color: rgba(232, 0, 45, 0.32);
src/styles.css:11826: border: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:11827: border-radius: 2px;
src/styles.css:11883: border: 1px solid rgba(255, 255, 255, 0.13);
src/styles.css:11884: border-radius: 2px;
src/styles.css:11888: outline: none;
src/styles.css:11894: border-color: rgba(232, 0, 45, 0.36);
src/styles.css:11913: border: 1px solid rgba(255, 255, 255, 0.09);
src/styles.css:11914: border-radius: 2px;
src/styles.css:11957: border: 1px solid rgba(255, 255, 255, 0.09);
src/styles.css:11958: border-radius: 2px;
src/styles.css:11992: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:11993: border-radius: 7px;
src/styles.css:12041: border: 1px solid rgba(255, 255, 255, 0.14);
src/styles.css:12042: border-radius: 2px;
src/styles.css:12057: border-bottom: 1px solid rgba(255, 255, 255, 0.11);
src/styles.css:12081: border: 1px solid rgba(255, 255, 255, 0.09);
src/styles.css:12082: border-radius: 2px;
src/styles.css:12093: border-color: rgba(232, 0, 45, 0.46);
src/styles.css:12108: border-top: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:12115: border: 0;
src/styles.css:12232: border-radius: 18px;
src/styles.css:12233: border: 1px solid #30363d;
src/styles.css:12248: border-bottom: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:12269: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:12270: border-radius: 999px;
src/styles.css:12314: border-right: 1px solid #30363d;
src/styles.css:12317: box-sizing: border-box;
src/styles.css:12337: border-right: 0;
src/styles.css:12379: box-sizing: border-box;
src/styles.css:12417: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:12418: border-left: 0;
src/styles.css:12419: border-radius: 0 6px 6px 0;
src/styles.css:12433: border-radius: 999px;
src/styles.css:12458: border-radius: 3px;
src/styles.css:12470: border-color: rgba(139, 110, 184, 0.42);
src/styles.css:12553: border-radius: 0;
src/styles.css:12561: border: 1px solid var(--eg-border);
src/styles.css:12607: border-radius: 0;
src/styles.css:12625: border: 1px solid var(--sep-term-border);
src/styles.css:12666: border: 1px solid var(--sep-term-border);
src/styles.css:12671: border-color: var(--sep-term-blue-bright);
src/styles.css:12683: border: 0;
src/styles.css:12694: outline: 0;
src/styles.css:12708: border: 1px solid currentColor;
src/styles.css:12759: border-top: 1px solid var(--sep-term-border);
src/styles.css:12784: border: 1px solid var(--sep-term-border);
src/styles.css:12806: border: 1px solid var(--sep-term-cyan);
src/styles.css:12822: border: 1px solid var(--sep-term-border);
src/styles.css:12852: border: 1px solid #0f5c2b;
src/styles.css:12853: border-radius: 0;
src/styles.css:12868: border-color: var(--sep-term-green);
src/styles.css:12871: outline: 0;
src/styles.css:12880: border: 1px solid var(--sep-term-border);
src/styles.css:12899: border-radius: 0;
src/styles.css:12907: border: 1px solid var(--eg-border);
src/styles.css:12953: border-radius: 0;
src/styles.css:12972: border: 1px solid rgba(59, 130, 246, 0.24);
src/styles.css:12973: border-radius: 5px;
src/styles.css:12984: border-color var(--eg-transition-fast),
src/styles.css:13004: border-color: rgba(139, 110, 184, 0.7);
src/styles.css:13011: --private-plan-border: var(--eg-border);
src/styles.css:13012: --private-plan-border-strong: rgba(139, 110, 184, 0.46);
src/styles.css:13033: border: 1px solid var(--private-plan-border);
src/styles.css:13034: border-radius: 6px;
src/styles.css:13038: box-sizing: border-box;
src/styles.css:13073: border: 1px solid rgba(139, 110, 184, 0.36);
src/styles.css:13074: border-radius: var(--eg-radius-md);
src/styles.css:13133: border: 1px solid var(--eg-border-hover);
src/styles.css:13134: border-radius: var(--eg-radius-md);
src/styles.css:13143: transition: border-color var(--eg-transition-fast), background var(--eg-transition-fast), color var(--eg-transition-fast);
src/styles.css:13148: border-color: rgba(139, 110, 184, 0.5);
src/styles.css:13173: border: 1px solid var(--eg-border);
src/styles.css:13174: border-radius: var(--eg-radius-pill);
src/styles.css:13185: transition: border-color var(--eg-transition-fast), background var(--eg-transition-fast), color var(--eg-transition-fast);
src/styles.css:13189: border-color: var(--eg-border-hover);
src/styles.css:13195: border-color: rgba(139, 110, 184, 0.52);
src/styles.css:13206: box-sizing: border-box;
src/styles.css:13222: border: 1px solid var(--eg-border);
src/styles.css:13223: border-radius: var(--eg-radius-card);
src/styles.css:13228: transition: border-color var(--eg-transition-fast), background var(--eg-transition-fast);
src/styles.css:13232: border-color: var(--eg-border-hover);
src/styles.css:13237: border-color: rgba(139, 110, 184, 0.52);
src/styles.css:13290: box-sizing: border-box;
src/styles.css:13332: border: 1px solid var(--eg-border);
src/styles.css:13333: border-radius: var(--eg-radius-md);
src/styles.css:13340: outline: none;
src/styles.css:13342: box-sizing: border-box;
src/styles.css:13346: border-color: rgba(139, 110, 184, 0.5);
src/styles.css:13354: border: 1px solid var(--eg-border);
src/styles.css:13355: border-radius: var(--eg-radius-md);
src/styles.css:13362: transition: border-color var(--eg-transition-fast), background var(--eg-transition-fast), color var(--eg-transition-fast), opacity var(--eg-transition-fast);
src/styles.css:13366: border-color: rgba(139, 110, 184, 0.5);
src/styles.css:13378: border: 1px solid rgba(139, 110, 184, 0.3);
src/styles.css:13379: border-radius: var(--eg-radius-md);
src/styles.css:13389: border-color: rgba(217, 139, 69, 0.32);
src/styles.css:13407: border: 1px solid var(--eg-border);
src/styles.css:13408: border-radius: var(--eg-radius-md);
src/styles.css:13456: border: 1px solid var(--eg-border);
src/styles.css:13457: border-radius: var(--eg-radius-card);
src/styles.css:13463: border-collapse: collapse;
src/styles.css:13470: border-bottom: 1px solid var(--eg-border);
src/styles.css:13471: border-right: 1px solid var(--eg-border);
src/styles.css:13494: border-bottom: 0;
src/styles.css:13506: border: 1px solid rgba(139, 110, 184, 0.28);
src/styles.css:13507: border-radius: var(--eg-radius-md);
src/styles.css:13525: border-collapse: collapse;
src/styles.css:13532: border-top: 1px solid var(--eg-border);
src/styles.css:13553: border-color: rgba(139, 110, 184, 0.52);
src/styles.css:13569: border-radius: var(--eg-radius-pill);
src/styles.css:13588: border: 1px solid var(--eg-border);
src/styles.css:13589: border-radius: var(--eg-radius-md);
src/styles.css:13594: border-color: rgba(184, 92, 92, 0.28);
src/styles.css:13599: border-color: rgba(139, 110, 184, 0.24);
src/styles.css:13611: border-radius: var(--eg-radius-pill);
src/styles.css:13615: border: 1px solid var(--eg-border);
src/styles.css:13633: border: 1px solid var(--eg-border);
src/styles.css:13634: border-radius: var(--eg-radius-sm);
src/styles.css:13643: transition: border-color var(--eg-transition-fast), background var(--eg-transition-fast), color var(--eg-transition-fast);
src/styles.css:13647: border-color: rgba(184, 92, 92, 0.5);
src/styles.css:13653: border-color: rgba(139, 110, 184, 0.46);
src/styles.css:13663: border: 1px solid rgba(139, 110, 184, 0.3);
src/styles.css:13664: border-radius: var(--eg-radius-md);
src/styles.css:13685: border-color: rgba(106, 171, 125, 0.28);
src/styles.css:13694: border-color: rgba(217, 139, 69, 0.32);
src/styles.css:13703: border-color: rgba(184, 92, 92, 0.38);
src/styles.css:13713: border-color: rgba(255, 255, 255, 0.1);
src/styles.css:13762: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:13763: border-radius: 6px;
src/styles.css:13790: border: 1px solid rgba(255, 255, 255, 0.1);
src/styles.css:13791: border-radius: 5px;
src/styles.css:13798: border-color: rgba(184, 92, 92, 0.45);
src/styles.css:13806: border: 1px solid rgba(255, 255, 255, 0.12);
src/styles.css:13807: border-radius: 6px;
src/styles.css:13813: border-color: rgba(139, 110, 184, 0.3);
src/styles.css:13816: border-color: rgba(139, 110, 184, 0.72);
src/styles.css:13822: border-color: rgba(139, 110, 184, 0.34);
src/styles.css:13825: border-color: rgba(139, 110, 184, 0.74);
src/styles.css:13888: border-radius: 50%;
src/styles.css:13915: border-radius: 6px;
src/styles.css:13916: border: 1px solid var(--border-subtle);
src/styles.css:13925: transition: border-color 0.15s ease, color 0.15s ease;
src/styles.css:13931: border-color: var(--border-default);
src/styles.css:13974: border-radius: 14px;
src/styles.css:13975: border: 1px solid rgba(0, 255, 65, 0.15);
src/styles.css:13996: border: 0;
src/styles.css:13997: border-radius: 0;
src/styles.css:14009: border-radius: 0;
src/styles.css:14010: border: 0;
src/styles.css:14011: border-top: 1px solid rgba(0, 255, 65, 0.1);
src/styles.css:14036: border-radius: 10px;
src/styles.css:14037: border: 1px solid var(--border-subtle);
src/styles.css:14100: border-radius: 8px;
src/styles.css:14101: border: 1px solid rgba(229, 62, 62, 0.42);
src/styles.css:14111: transition: border-color 0.15s ease, background 0.15s ease;
src/styles.css:14120: border: 0;
src/styles.css:14121: border-radius: 0;
src/styles.css:14152: border-radius: 50%;
src/styles.css:14171: outline: 2px solid rgba(0, 255, 65, 0.6);
src/styles.css:14172: outline-offset: 2px;
src/styles.css:14184: border-color: rgba(229, 62, 62, 0.18);
src/styles.css:14188: border-color: rgba(57, 255, 136, 0.38);
src/styles.css:14204: border-left: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:14214: --agent-notes-border: var(--eg-surface-3);
src/styles.css:14215: --agent-notes-border-bright: #2a2a2a;
src/styles.css:14221: border: 1px solid var(--agent-notes-border);
src/styles.css:14222: border-radius: 0;
src/styles.css:14239: border-bottom: 1px solid #4d2d00;
src/styles.css:14281: border: none;
src/styles.css:14282: border-radius: 0;
src/styles.css:14289: outline: none;
src/styles.css:14290: box-sizing: border-box;
src/styles.css:14309: border-top: 1px solid var(--agent-notes-border);
src/styles.css:14322: border: 0;
src/styles.css:14340: border-radius: 999px;
src/styles.css:14351: border: 1px solid rgba(255, 179, 0, 0.28);
src/styles.css:14357: border: 1px solid rgba(0, 209, 102, 0.28);
src/styles.css:14363: border: 1px solid rgba(255, 68, 85, 0.28);
src/styles.css:14380: border-radius: 2px;
src/styles.css:14388: border-radius: 2px;
src/styles.css:14451: border-radius: 50%;
src/styles.css:14453: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:14455: transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
src/styles.css:14460: border-color: var(--accent-green);
src/styles.css:14470: border: 1px solid var(--border-subtle);
src/styles.css:14471: border-radius: 6px;
src/styles.css:14478: outline: none;
src/styles.css:14480: transition: border-color 0.15s ease, box-shadow 0.15s ease;
src/styles.css:14481: box-sizing: border-box;
src/styles.css:14485: border-color: rgba(255, 179, 0, 0.35);
src/styles.css:14490: border-color: rgba(255, 68, 85, 0.45);
src/styles.css:14520: border: 1px solid var(--border-subtle);
src/styles.css:14521: border-radius: 6px;
src/styles.css:14533: border-color 0.16s ease,
src/styles.css:14540: border-color: rgba(0, 209, 102, 0.34);
src/styles.css:14568: border-radius: 14px;
src/styles.css:14569: border: 1px solid var(--border-subtle);
src/styles.css:14588: border-bottom: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:14640: border-radius: 10px;
src/styles.css:14641: border: 1px solid var(--border-subtle);
src/styles.css:14669: border-collapse: collapse;
src/styles.css:14688: border-bottom: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:14706: border: 0;
src/styles.css:14738: border-radius: 12px;
src/styles.css:14791: border-top: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:14806: border: 1px solid var(--border-subtle);
src/styles.css:14807: border-radius: 8px;
src/styles.css:14820: border-color: rgba(255, 255, 255, 0.16);
src/styles.css:14862: border-radius: 12px;
src/styles.css:14863: border: 1px solid color-mix(in srgb, var(--snp-route-color) 38%, rgba(255, 255, 255, 0.08));
src/styles.css:14889: border-radius: 999px;
src/styles.css:14890: border: 1px solid color-mix(in srgb, var(--snp-route-color) 40%, rgba(255, 255, 255, 0.1));
src/styles.css:14914: border-radius: 10px;
src/styles.css:14915: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:14926: border-color: rgba(210, 153, 34, 0.24);
src/styles.css:14932: border-color: rgba(229, 62, 62, 0.24);
src/styles.css:14938: border-radius: 12px;
src/styles.css:14939: border: 1px solid rgba(255, 255, 255, 0.07);
src/styles.css:14950: border: 0;
src/styles.css:15043: border-left: 0;
src/styles.css:15124: border-radius: 6px;
src/styles.css:15125: border-color: var(--border-subtle);
src/styles.css:15132: border-color: rgba(0, 209, 102, 0.4);
src/styles.css:15140: border-color: rgba(255, 68, 85, 0.4);
src/styles.css:15149: border: 1px solid var(--border-subtle);
src/styles.css:15150: border-radius: 6px;
src/styles.css:15159: outline: none;
src/styles.css:15160: transition: border-color 0.15s ease, box-shadow 0.15s ease;
src/styles.css:15161: box-sizing: border-box;
src/styles.css:15165: border-color: rgba(255, 179, 0, 0.35);
src/styles.css:15179: border-radius: 10px;
src/styles.css:15180: border: 1px solid var(--border-subtle);
src/styles.css:15218: border-radius: 999px;
src/styles.css:15230: border: 1px solid var(--border-subtle);
src/styles.css:15270: border: 1px solid color-mix(in srgb, var(--sep-state-badge-color) 34%, var(--border-subtle));
src/styles.css:15282: border-radius: 6px;
src/styles.css:15283: border: 1px solid rgba(210, 153, 34, 0.24);
src/styles.css:15294: border-color: rgba(255, 68, 85, 0.28);
src/styles.css:15310: border-radius: 8px;
src/styles.css:15311: border: 1px solid color-mix(in srgb, var(--sep-state-play-color) 28%, var(--border-subtle));
src/styles.css:15338: border-radius: 8px;
src/styles.css:15339: border: 1px solid rgba(210, 153, 34, 0.18);
src/styles.css:15370: border-radius: 8px;
src/styles.css:15371: border: 1px solid var(--border-subtle);
src/styles.css:15382: border: 0;
src/styles.css:15444: border-radius: 8px;
src/styles.css:15445: border: 1px solid var(--border-subtle);
src/styles.css:15476: border-radius: 8px;
src/styles.css:15477: border: 1px solid var(--border-subtle);
src/styles.css:15512: border-color: color-mix(in srgb, var(--sep-category-color) 32%, var(--border-subtle));
src/styles.css:15519: border-radius: 10px;
src/styles.css:15562: border-radius: 999px;
src/styles.css:15617: border-radius: 10px;
src/styles.css:15618: border: 1px solid rgba(0, 209, 102, 0.18);
src/styles.css:15852: border: 1px solid var(--eg-border) !important;
src/styles.css:15853: border-radius: var(--eg-radius-sm);
src/styles.css:15858: border-color: var(--eg-border-active) !important;
src/styles.css:15918: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:15919: border-radius: 8px;
src/styles.css:15926: outline: none;
src/styles.css:15928: transition: border-color 0.15s ease, box-shadow 0.15s ease;
src/styles.css:15929: box-sizing: border-box;
src/styles.css:15939: border-color: rgba(255, 255, 255, 0.18);
src/styles.css:15944: border-color: rgba(255, 68, 85, 0.45);
src/styles.css:15960: border: 0;
src/styles.css:15961: border-left: 2px solid transparent;
src/styles.css:15962: border-radius: 0;
src/styles.css:15986: border-left-color: rgba(255, 255, 255, 0.22);
src/styles.css:15993: border-left-color: rgba(255, 255, 255, 0.22);
src/styles.css:16000: border-left-color: rgba(255, 255, 255, 0.22);
src/styles.css:16014: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:16015: border-radius: 12px;
src/styles.css:16022: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:16026: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:16030: border-color: rgba(255, 255, 255, 0.06);
src/styles.css:16041: border-radius: 10px;
src/styles.css:16056: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:16057: border-radius: 6px;
src/styles.css:16066: transition: color 0.15s ease, border-color 0.15s ease;
src/styles.css:16071: border-color: rgba(255, 255, 255, 0.16);
src/styles.css:16081: border: 1px solid rgba(255, 171, 0, 0.42);
src/styles.css:16082: border-radius: 8px;
src/styles.css:16092: transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
src/styles.css:16096: border-color: rgba(255, 171, 0, 0.6);
src/styles.css:16115: border: 1px solid rgba(255, 255, 255, 0.06);
src/styles.css:16116: border-radius: 16px;
src/styles.css:16124: border-radius: 10px;
src/styles.css:16177: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:16178: border-radius: 6px;
src/styles.css:16182: transition: color 0.15s ease, border-color 0.15s ease;
src/styles.css:16188: border-color: rgba(0, 200, 83, 0.3);
src/styles.css:16205: border-radius: 10px;
src/styles.css:16215: border-radius: 10px;
src/styles.css:16240: border: 1px solid rgba(255, 255, 255, 0.05);
src/styles.css:16241: border-radius: 10px;
src/styles.css:16273: border-radius: 50%;
src/styles.css:16301: border-radius: 999px;
src/styles.css:16345: border: 0;
src/styles.css:16383: border-radius: 8px;
src/styles.css:16444: border-radius: 10px;
src/styles.css:16457: border-radius: 10px;
src/styles.css:16467: border-radius: 10px;
src/styles.css:16489: border: 1px solid rgba(0, 200, 83, 0.45);
src/styles.css:16490: border-radius: 10px;
src/styles.css:16500: transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
src/styles.css:16504: border-color: rgba(0, 200, 83, 0.7);
src/styles.css:16521: border: 1px solid rgba(255, 255, 255, 0.08);
src/styles.css:16522: border-radius: 10px;
src/styles.css:16526: transition: color 0.15s ease, border-color 0.15s ease;
src/styles.css:16531: border-color: rgba(0, 200, 83, 0.3);
src/styles.css:16549: border-right: 0;
src/styles.css:16558: --sep-term-border: var(--eg-surface-3);
src/styles.css:16559: --sep-term-border-bright: #2a2a2a;
src/styles.css:16659: border-radius: 0;
src/styles.css:16660: border: 1px solid var(--sep-term-border);
src/styles.css:16731: border: 1px solid var(--sep-term-border);
src/styles.css:16733: box-sizing: border-box;
src/styles.css:16744: border-radius: 0;
src/styles.css:16745: border: 1px solid var(--sep-term-border);
src/styles.css:16757: border: 0;
src/styles.css:16776: border-color: var(--sep-term-blue-bright);
src/styles.css:16784: border: 1px solid var(--sep-term-border);
src/styles.css:16792: border: 0;
src/styles.css:16793: border-right: 1px solid var(--sep-term-border);
src/styles.css:16804: border-right: 0;
src/styles.css:16847: border-radius: 0;
src/styles.css:16848: border: 1px solid var(--sep-term-border);
src/styles.css:16886: border-color: var(--sep-term-blue-bright);
src/styles.css:16895: border-color: #4d2d00;
src/styles.css:16901: border-color: var(--sep-term-border);
src/styles.css:16908: border-color: var(--sep-term-blue-bright);
src/styles.css:16916: border-color: var(--sep-term-red);
src/styles.css:16923: border-color: var(--sep-term-border);
src/styles.css:16937: border-color: var(--sep-term-green);
src/styles.css:16967: border-color: var(--sep-term-blue-bright);
src/styles.css:16985: border-radius: 0;
src/styles.css:16986: border: 1px solid var(--sep-term-border-bright);
src/styles.css:17029: border-radius: 0;
src/styles.css:17030: background: var(--sep-term-border);
src/styles.css:17034: border-radius: 0;
src/styles.css:17043: border-color: var(--sep-term-border);
src/styles.css:17052: border-color: #4d2d00;
src/styles.css:17058: border-color: var(--sep-term-red);
src/styles.css:17086: border: 1px solid var(--border-default);
src/styles.css:17087: border-radius: 4px 4px 0 0;
src/styles.css:17119: border: 1px solid var(--border-default);
src/styles.css:17120: border-radius: 3px;
src/styles.css:17143: border: 0;
src/styles.css:17144: outline: 0;
src/styles.css:17158: border-color: var(--border-focus);
src/styles.css:17159: outline: 1px solid var(--border-focus);
src/styles.css:17160: outline-offset: -1px;
src/styles.css:17169: border-right: 1px solid var(--border-default);
src/styles.css:17170: border-bottom: 1px solid var(--border-default);
src/styles.css:17171: border-left: 1px solid var(--border-default);
src/styles.css:17181: border: 1px solid var(--border-default);
src/styles.css:17182: border-radius: 999px;
src/styles.css:17192: .rts-summary .is-active { border-color: var(--status-live-border); color: var(--status-live); }
src/styles.css:17193: .rts-summary .is-pending { border-color: var(--status-pending-border); color: var(--status-pending); }
src/styles.css:17194: .rts-summary .is-action { border-color: var(--status-offline-border); color: var(--status-offline); }
src/styles.css:17202: border-right: 1px solid var(--border-default);
src/styles.css:17203: border-bottom: 1px solid var(--border-default);
src/styles.css:17204: border-left: 1px solid var(--border-default);
src/styles.css:17218: border: 1px solid var(--border-default);
src/styles.css:17229: border: 0;
src/styles.css:17230: border-right: 1px solid var(--border-default);
src/styles.css:17238: .rts-agent-switcher button:last-child { border-right: 0; }
src/styles.css:17247: border: 1px solid var(--status-offline-border);
src/styles.css:17254: border: 1px solid currentColor;
src/styles.css:17255: border-radius: 3px;
src/styles.css:17267: border-right: 1px solid var(--border-default);
src/styles.css:17268: border-bottom: 1px solid var(--border-default);
src/styles.css:17269: border-left: 1px solid var(--border-default);
src/styles.css:17276: border-collapse: collapse;
src/styles.css:17301: border-right: 1px solid var(--border-default);
src/styles.css:17302: border-bottom: 1px solid var(--border-default);
src/styles.css:17308: .rts-table tr > :last-child { border-right: 0; }
src/styles.css:17338: border: 0;
src/styles.css:17352: border-bottom-color: var(--border-default);
src/styles.css:17362: border: 0;
src/styles.css:17379: border: 1px solid var(--border-default);
src/styles.css:17380: border-radius: 999px;
src/styles.css:17402: border: 1px solid transparent;
src/styles.css:17403: border-radius: 2px;
src/styles.css:17419: .rts-cell-value.is-editable:hover { border-color: var(--border-default); background: var(--bg-elevated); }
src/styles.css:17434: border: 1px solid var(--border-default);
src/styles.css:17435: border-radius: 999px;
src/styles.css:17441: .rts-status--active { border-color: var(--status-live); background: var(--status-live); color: #000; }
src/styles.css:17442: .rts-status--progress { border-color: var(--status-pending); background: var(--status-pending); color: #000; }
src/styles.css:17443: .rts-status--pending { border-color: var(--status-pending-border); background: transparent; color: var(--status-pending); }
src/styles.css:17444: .rts-status--action { border-color: var(--status-offline); background: var(--status-offline); color: #000; }
src/styles.css:17453: border: 1px solid var(--border-focus);
src/styles.css:17454: border-radius: 2px;
src/styles.css:17485: border: 1px solid var(--border-default);
src/styles.css:17486: border-radius: 3px;
src/styles.css:17495: border-color: var(--status-live-border);
src/styles.css:17509: border-color: var(--border-focus);
src/styles.css:17510: outline: none;
src/styles.css:17531: border: 1px solid var(--border-default);
src/styles.css:17532: border-radius: 4px;
src/styles.css:17545: border-bottom: 1px solid var(--border-default);
src/styles.css:17594: border: 1px solid var(--status-live-border);
src/styles.css:17595: border-radius: 50%;
src/styles.css:17644: border-color: var(--status-live-border);
src/styles.css:17679: border-bottom: 1px solid var(--border-default);
src/styles.css:17689: border: 1px solid var(--border-default);
src/styles.css:17690: border-radius: 999px;
src/styles.css:17712: border: 1px solid var(--border-default);
src/styles.css:17713: border-radius: 3px;
src/styles.css:17724: border-bottom: 1px solid var(--border-default);
src/styles.css:17756: border-bottom: 1px solid var(--border-default);
src/styles.css:17761: .rts-review-row:last-child { border-bottom: 0; }
src/styles.css:17788: border: 1px solid var(--border-default);
src/styles.css:17789: border-radius: 2px;
src/styles.css:17799: border-color: var(--border-focus);
src/styles.css:17800: outline: none;
src/styles.css:17814: border: 1px solid var(--border-default);
src/styles.css:17815: border-radius: 999px;
src/styles.css:17823: border-color: var(--status-live-border);
src/styles.css:17829: border-color: var(--status-offline-border);
src/styles.css:17856: border-collapse: collapse;
src/styles.css:17867: border-right: 1px solid var(--border-default);
src/styles.css:17868: border-bottom: 1px solid var(--border-default);
src/styles.css:17875: .rts-review-table td:last-child { border-right: 0; }
src/styles.css:17876: .rts-review-table tbody tr:last-child td { border-bottom: 0; }
src/styles.css:17925: border-top: 1px solid var(--border-default);
src/styles.css:17965: .rts-ingest-panel { width: 100%; max-height: 100dvh; min-height: 100dvh; border: 0; border-radius: 0; }
src/styles.css:17989: border: 0;
src/styles.css:17990: border-radius: 0;
src/styles.css:17997: border-bottom-color: var(--border-default);
src/styles.css:18003: border-color: var(--border-default);
src/styles.css:18004: border-radius: 3px;
src/styles.css:18010: border-color: var(--border-focus);
src/styles.css:18013: outline: none;
src/styles.css:18038: .phone-conference { border-top: 1px solid var(--border-default); padding: 12px; font: 11px var(--font-mono); color: var(--text-primary); }
src/styles.css:18042: .phone-conference input, .phone-conference select { width: 100%; border: 1px solid var(--border-default); background: var(--bg-primary); color: var(--text-primary); padding: 8px; font: inherit; }
src/styles.css:18043: .phone-conference button { border: 1px solid var(--border-default); background: var(--bg-primary); color: var(--text-primary); padding: 7px 10px; font: inherit; cursor: pointer; }
src/styles.css:18045: .phone-conference button:focus-visible, .phone-conference input:focus-visible, .phone-conference select:focus-visible { outline: 1px solid var(--eg-amber); outline-offset: 2px; }
src/styles.css:18050: .phone-conference li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border-default); }
src/styles.css:18067: .agent-dash-scope select { max-width: 240px; border: 1px solid var(--eg-border); background: #000; color: var(--eg-amber); padding: 7px 10px; font: 11px var(--eg-font-mono); }
src/styles.css:18068: .agent-dash-scope select:focus-visible { outline: 1px solid var(--eg-amber); outline-offset: 2px; }
src/styles.css:18072: .agent-dashboard button { border: 1px solid var(--eg-border); background: #000; color: var(--eg-amber); padding: 8px 12px; font: inherit; font-size: 11px; cursor: pointer; }
src/styles.css:18073: .agent-dashboard button:hover, .agent-dashboard button[aria-pressed="true"] { color: var(--eg-amber); border-color: var(--eg-amber); }
src/styles.css:18074: .agent-dashboard button:focus-visible { outline: 2px solid var(--eg-amber); outline-offset: 3px; }
src/styles.css:18085: .agent-dash-metric + .agent-dash-metric { border-left: 1px solid var(--eg-border); }
src/styles.css:18087: .agent-dash-metric:focus-visible { outline: 1px solid var(--eg-amber); outline-offset: 4px; }
src/styles.css:18091: .agent-dash-panel { min-width: 0; border: 1px solid var(--eg-border); margin: 0; padding: 14px; }
src/styles.css:18096: .agent-dash-gridline { stroke: var(--eg-border); stroke-width: 1; }
src/styles.css:18110: .agent-dash-pie-slice:focus-visible { outline: none; stroke: var(--eg-amber); stroke-width: 3; }
src/styles.css:18114: border: 1px solid var(--eg-border); background: var(--eg-surface-1); color: var(--eg-amber);
src/styles.css:18118: .agent-dash-pie-empty { fill: none; stroke: var(--eg-border); stroke-width: 1; }
src/styles.css:18123: .agent-dash-pie-legend li:focus-visible { outline: 1px solid var(--eg-amber); outline-offset: -1px; }
src/styles.css:18126: .agent-dashboard table { width: 100%; border-collapse: collapse; font-size: 12px; }
src/styles.css:18127: .agent-dashboard th, .agent-dashboard td { color: var(--eg-amber); padding: 7px 0; border-bottom: 1px solid var(--eg-border); text-align: right; font-weight: 400; }
src/styles.css:18131: .agent-dash-error { border: 1px solid var(--eg-amber); color: var(--eg-amber); padding: 12px; font-size: 12px; }
src/styles.css:18137: max-width: 100%; min-height: 34px; border: 1px solid var(--eg-border); background: #000;
src/styles.css:18140: .agent-status-log__filters input:focus-visible, .agent-status-log__filters select:focus-visible { outline: 1px solid var(--eg-amber); outline-offset: 2px; }
src/styles.css:18164: .contact-toast { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; background: var(--eg-surface-2, #171717); color: var(--eg-text, #eee); border: 1px solid var(--eg-accent, #f97316); box-shadow: 0 8px 32px #0008; font-size: 13px; }
src/styles.css:18165: .contact-toast.is-error { border-color: #ef6464; }
src/styles.css:18166: .contact-toast button, .compose-picker-heading button { background: none; border: 0; color: inherit; cursor: pointer; font-size: 22px; }
src/styles.css:18167: .contacts-create-toolbar, .contacts-new-form, .contacts-merge-prompt { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px; border-bottom: 1px solid var(--eg-border, #333); }
src/styles.css:18172: .compose-picker-panel { position: absolute; bottom: calc(100% + 12px); right: 0; z-index: 100; width: min(340px, calc(100vw - 40px)); max-height: min(440px, 65vh); overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: var(--eg-surface-2, #171717); color: var(--eg-text, #eee); border: 1px solid var(--eg-accent, #f97316); box-shadow: 0 8px 30px #0009; }
src/styles.css:18174: .compose-picker-panel input { width: 100%; box-sizing: border-box; }
src/styles.css:18177: .compose-picker-categories button { padding: 5px; background: transparent; border: 1px solid #444; color: inherit; cursor: pointer; font-size: 11px; }
src/styles.css:18178: .compose-picker-categories button.is-active { border-color: var(--eg-accent, #f97316); color: var(--eg-accent, #f97316); }
src/styles.css:18180: .compose-emoji-grid button { background: transparent; border: 0; font-size: 24px; padding: 5px; cursor: pointer; }
src/styles.css:18183: .compose-gif-grid button { border: 1px solid #444; padding: 0; background: #111; cursor: pointer; }
src/styles.css:18205: border: 1px solid var(--script-term-amber, #d98b45) !important;
src/styles.css:18206: border-radius: 0;
src/styles.css:18221: outline: 2px solid var(--script-term-amber, #d98b45);
src/styles.css:18222: outline-offset: 2px;
src/styles.css:18246: border: 0;
src/styles.css:18321: outline: 2px solid var(--script-term-amber, #d98b45);
src/styles.css:18322: outline-offset: 3px;
src/styles.css:18340: border: 1px solid var(--script-term-border, var(--eg-surface-3));
src/styles.css:18341: border-radius: 0;
src/styles.css:18350: border-color: var(--script-term-green, #33cc66);
src/styles.css:18361: .vendor-routing__config input, .vendor-routing select { color: inherit; background: var(--surface, #151c2b); border: 1px solid var(--border, #334155); border-radius: 7px; padding: 8px; }
src/styles.css:18364: .vendor-routing__age span { border: 1px solid var(--border, #334155); border-radius: 7px; padding: 8px; }
src/styles.css:18365: .vendor-routing__stale { color: #fbbf24; border-color: #b45309 !important; }
src/styles.css:18367: .vendor-routing__table { width: 100%; border-collapse: collapse; font-size: 12px; }
src/styles.css:18368: .vendor-routing__table th, .vendor-routing__table td { border-bottom: 1px solid var(--border, #334155); padding: 8px; text-align: left; white-space: nowrap; }
src/styles.css:18370: .phone-expanded__zip-gate { border: 1px solid #b45309; border-radius: 8px; padding: 12px; margin: 10px 0; background: rgba(180,83,9,.12); color: inherit; }
src/styles.css:18372: .phone-expanded__zip-fields input, .phone-expanded__zip-fields select { min-width: 110px; padding: 8px; border-radius: 6px; }
src/styles.css:18373: .phone-expanded__zip-fields button { border-radius: 6px; padding: 8px 12px; cursor: pointer; }
src/styles.css:18374: .phone-expanded__zip-block { margin-top: 10px; padding: 10px; border-radius: 6px; background: #7f1d1d; color: #fff; font-weight: 700; }
src/styles.css:18376: .paragon-callbacks__row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border, #334155); }
src/styles.css:18392: .crm-call-summary { padding: 12px; border-bottom: 1px solid var(--border-default); font-family: var(--font-mono); }
src/styles.css:18397: .opps-header, .opps-filters, .opps-board { width: 100%; min-width: 0; box-sizing: border-box; }
src/styles.css:18402: .opps-total-pill { border: 1px solid var(--border-default); border-radius: 20px; padding: 5px 10px; color: var(--text-secondary); font-size: 10px; white-space: nowrap; }
src/styles.css:18403: .opps-layout-toggle { display: inline-flex; border: 1px solid var(--border-default); border-radius: 6px; padding: 3px; gap: 3px; }
src/styles.css:18404: .opps-layout-toggle button { display: flex; align-items: center; justify-content: center; width: 32px; height: 30px; color: var(--text-muted); border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
src/styles.css:18408: .opps-primary { border-color: var(--eg-accent) !important; color: var(--eg-accent) !important; }
src/styles.css:18418: .opps-board-scrollbar { appearance: none; display: block; width: 100%; height: 12px; padding: 0; margin: 0; border: 0; border-radius: 6px; box-shadow: none; background: var(--bg-elevated); cursor: pointer; }
src/styles.css:18420: .opps-board-scrollbar::-webkit-slider-thumb { appearance: none; width: var(--opps-scroll-thumb-width); height: 12px; border: 2px solid var(--bg-elevated); border-radius: 6px; background: var(--text-secondary); cursor: grab; }
src/styles.css:18421: .opps-board-scrollbar::-moz-range-thumb { width: var(--opps-scroll-thumb-width); height: 8px; border: 2px solid var(--bg-elevated); border-radius: 6px; background: var(--text-secondary); cursor: grab; }
src/styles.css:18422: .opps-board-scrollbar:focus-visible, .opps-board:focus-visible { outline: 2px solid var(--eg-accent) !important; outline-offset: 2px; }
src/styles.css:18423: .opps-column { flex: 1 1 0; min-width: 220px; display: flex; flex-direction: column; border: 0; border-radius: 8px; background: var(--bg-surface); overflow: hidden; }
src/styles.css:18424: .opps-column.is-over { outline: 2px solid var(--stage-color); outline-offset: -2px; }
src/styles.css:18425: .opps-column-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0; padding: 15px 14px; min-height: 74px; box-sizing: border-box; color: var(--text-primary); background: color-mix(in srgb, var(--stage-color) 24%, #10121b); }
src/styles.css:18429: .opps-column-head > button { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 26px; height: 26px; border: 0; border-radius: 4px; color: rgba(255,255,255,.72); background: transparent; cursor: pointer; }
src/styles.css:18433: .opps-card { border: 0; border-radius: 8px; padding: 14px 12px 9px; background: color-mix(in srgb, var(--stage-color) 32%, #171b27); color: var(--text-primary); display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,.12); cursor: pointer; }
src/styles.css:18439: .opps-card-body { display: flex; flex-direction: column; gap: 12px; touch-action: pan-x pan-y; cursor: grab; border-radius: 4px; }
src/styles.css:18441: .opps-card-body:focus-visible, .opps-card-action:focus-visible, .opps-layout-toggle button:focus-visible { outline: 2px solid var(--stage-color, var(--eg-accent)); outline-offset: 3px; }
src/styles.css:18442: .opps-days { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 20px; padding: 3px 7px; color: rgba(255,255,255,.82); background: rgba(0,0,0,.2); font-size: 10px; line-height: 1.3; }
src/styles.css:18448: .opps-card-action { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 28px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: rgba(255,255,255,.56); cursor: pointer; }
src/styles.css:18450: .opps-action-count { position: absolute; right: -5px; top: -3px; width: 16px; height: 16px; padding: 0; box-sizing: border-box; border-radius: 50%; background: #3b82f6; color: #fff; font-size: 8px; line-height: 16px; text-align: center; pointer-events: none; }
src/styles.css:18451: .opps-empty-column { text-align: center; border: 1px dashed var(--border-default); padding: 22px 10px; color: var(--text-muted); font-size: 10px; }
src/styles.css:18452: .opps-stage-badge { color: var(--stage-color) !important; border-color: color-mix(in srgb, var(--stage-color) 50%, transparent) !important; background: color-mix(in srgb, var(--stage-color) 12%, transparent) !important; }
src/styles.css:18453: .opps-table th > button { font: inherit; color: inherit; border: 0; background: transparent; cursor: pointer; text-align: left; padding: 0; }
src/styles.css:18455: .opps-contact-link { font: inherit; color: var(--eg-accent); padding: 0; border: 0; background: transparent; cursor: pointer; text-align: left; }
src/styles.css:18458: .opps-dialog { width: min(800px, 100%); max-height: calc(100dvh - 40px); display: flex; flex-direction: column; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--clay-radius, 8px); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; box-shadow: 0 16px 60px rgba(0,0,0,.5); }
src/styles.css:18459: .opps-dialog--drawer { width: min(660px,100%); height: 100dvh; max-height: 100dvh; border-radius: 0; }
src/styles.css:18460: .opps-dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border-default); gap: 12px; }
src/styles.css:18464: .opps-editor fieldset { border: 0; padding: 0; margin: 0; }
src/styles.css:18466: .opps-dialog .contacts-edit-input { box-sizing: border-box; }
src/styles.css:18467: .opps-dialog input[type=color] { width: 44px; height: 30px; padding: 2px; background: transparent; border: 1px solid var(--border-default); }
src/styles.css:18468: .opps-stage-settings { display: grid; grid-template-columns: auto minmax(120px,1fr) auto 90px auto; gap: 10px; align-items: center; background: var(--bg-elevated); border: 1px solid var(--border-default); padding: 10px; margin-bottom: 8px; }
src/styles.css:18469: .opps-delete-stage { padding: 12px; border: 1px solid var(--border-default); display: flex; flex-direction: column; gap: 12px; }
src/styles.css:18472: .opps-timeline li { border-left: 2px solid var(--stage-color, var(--border-default)); margin-left: 4px; padding: 0 0 16px 14px; display: flex; flex-direction: column; gap: 6px; }
src/styles.css:18479: .opps-row-menu { position: fixed; z-index: 11000; width: 180px; box-sizing: border-box; padding: 6px; border: 1px solid var(--border-default); border-radius: 6px; background: var(--bg-surface); box-shadow: 0 8px 28px rgba(0,0,0,.45); }
src/styles.css:18480: .opps-row-menu button { display: block; width: 100%; padding: 10px 8px; font: 12px var(--font-mono, ui-monospace, monospace); color: var(--text-primary); text-align: left; border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
src/styles.css:18481: .opps-row-menu button:hover, .opps-row-menu button:focus-visible { background: var(--bg-elevated); outline: 1px solid var(--border-focus); }
src/styles.css:18482: .opps-call { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border-default); }
src/styles.css:18483: .opps-contact-section { border-top: 1px solid var(--border-default); padding: 12px; }
src/styles.css:18486: .opps-contact-opportunity { margin-top: 10px; width: 100%; display: flex; align-items: start; gap: 8px; flex-direction: column; border: 1px solid var(--border-default); border-radius: 4px; background: var(--bg-elevated); color: var(--text-primary); padding: 10px; cursor: pointer; text-align: left; font: inherit; overflow-wrap: anywhere; }
src/styles.css:18487: .opps-contact-opportunity:hover { border-color: var(--eg-accent); }
src/styles.css:18489: .opps-tags-popover { position: fixed; z-index: 11000; width: 280px; box-sizing: border-box; padding: 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font: 12px var(--font-mono, ui-monospace, monospace); box-shadow: 0 8px 28px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 12px; max-height: calc(100dvh - 24px); overflow-y: auto; }
src/styles.css:18494: .opps-tag-list button { display: inline-flex; padding: 0; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
src/styles.css:18514: .sep-penetration-map path:hover, .sep-penetration-map path:focus { stroke: var(--text-primary); stroke-width: 2; outline: none; }
src/styles.css:18515: .sep-penetration-detail { display: flex; flex-wrap: wrap; gap: 12px 24px; padding: 16px 0; border-top: 1px solid var(--border-default); font-size: 13px; }
src/styles.css:18531: /* CRM call log: use the shared surfaces, typography and outline controls. */
src/styles.css:18539: display: inline-flex; align-items: center; padding: 4px 9px; border: 1px solid transparent;
src/styles.css:18540: border-radius: 999px; font-size: 10px; line-height: 1.4; white-space: nowrap;
src/styles.css:18542: .call-compliance-pill.compliance-low { color: #ff9b8f; background: rgba(255, 155, 143, .1); border-color: rgba(255, 155, 143, .2); }
src/styles.css:18543: .call-compliance-pill.compliance-high { color: #3ccf7a; background: rgba(60, 207, 122, .08); border-color: rgba(60, 207, 122, .2); }
src/styles.css:18544: .call-compliance-pill.is-neutral { color: var(--text-secondary); background: var(--surface-raised); border-color: var(--border-default); }
src/styles.css:18546: .compliance-review-flag.is-neutral { border-left-color: var(--text-muted); }
src/styles.css:18548: .compliance-review-flag.is-review { border-left-color: var(--status-pending); }
src/styles.css:18551: display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; flex-shrink: 0; border-radius: 6px;
src/styles.css:18554: .call-log-table .call-log-expand { padding: 16px; gap: 14px; background: var(--surface-base, var(--eg-surface-1)); border-radius: var(--eg-radius-card); }
src/styles.css:18560: .call-actions-menu-items { position: absolute; right: 0; top: calc(100% + 6px); z-index: 5; min-width: 190px; padding: 6px; background: var(--eg-surface-2); border: 1px solid var(--border-default); border-radius: var(--eg-radius-card); box-shadow: var(--eg-shadow-card); }
src/styles.css:18571: .call-transcript-panel { min-width: 0; border: 1px solid var(--border-default); border-radius: var(--eg-radius-card); overflow: hidden; }
src/styles.css:18572: .call-audio-bar { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--surface-raised); border-bottom: 1px solid var(--border-default); }
src/styles.css:18583: width: 100%; padding: 10px 14px 10px 11px; border: 0; border-left: 3px solid transparent; background: transparent;
src/styles.css:18588: .call-transcript-line.is-current { background: rgba(245, 165, 36, .08); border-left-color: #f5a524; }
src/styles.css:18596: .call-log-sidebar .contacts-section { margin: 0; padding: 14px; min-width: 0; border-radius: var(--eg-radius-card); }
src/styles.css:18600: .call-review-link { background: none; border: 0; padding: 4px 0; color: var(--eg-accent); font-family: inherit; font-size: 10px; letter-spacing: .5px; cursor: pointer; }
src/styles.css:18601: .call-notes-input { display: block; box-sizing: border-box; width: 100%; min-height: 108px; resize: vertical; padding: 10px; border: 1px solid var(--border-default); border-radius: 4px; background: var(--surface-raised); color: var(--text-primary); font-family: var(--font-primary); font-size: 12px; line-height: 1.6; }
src/styles.css:18602: .call-notes-input:focus { outline: 1px solid var(--eg-accent); }
src/styles.css:18604: .call-expand-toggle { border: 0; background: none; color: var(--text-secondary); cursor: pointer; font-size: 20px; width: 28px; height: 28px; }
src/styles.css:18607: .call-log-callback .call-back-icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border-radius: 6px; }
src/styles.css:18619: .call-log-table .call-log-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); position: relative; border-bottom: 1px solid var(--border-default); padding: 8px 4px; }
src/styles.css:18620: .call-log-table .call-log-row > td { display: block; border: 0; white-space: normal; padding: 6px 10px; }
src/styles.css:18626: .call-log-table .call-log-expand-row, .call-log-table .call-log-expand-row > td { display: block; width: 100%; box-sizing: border-box; }
src/styles.css:18635: .call-log-tab .call-log-toolbar-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border-radius: 6px; }
src/styles.css:18636: .call-log-tab .call-log-toolbar-icon.is-active { color: var(--eg-accent); border-color: var(--eg-accent); background: rgba(245, 165, 36, .06); }
src/styles.css:18637: .call-date-popover { position: absolute; top: calc(100% + 8px); right: 0; z-index: 60; box-sizing: border-box; width: 304px; max-width: calc(100vw - 48px); padding: 14px; border: 1px solid var(--border-default); border-radius: var(--eg-radius-card); background: var(--eg-surface-2); box-shadow: var(--eg-shadow-card); color: var(--text-primary); }
src/styles.css:18643: .call-date-days .call-date-day { box-sizing: border-box; aspect-ratio: 1; width: 100%; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 11px; cursor: pointer; }
src/styles.css:18644: .call-date-days .call-date-day.is-today { border-color: var(--border-default); }
src/styles.css:18647: .call-date-days .call-date-day:hover, .call-date-days .call-date-day:focus-visible { border-color: var(--eg-accent); outline: 1px solid var(--eg-accent); outline-offset: 1px; }
src/styles.css:18649: .call-date-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border-default); }
src/styles.css:18665: .call-log-icon-filter { position: relative; box-sizing: border-box; cursor: pointer; }
src/styles.css:18668: .call-log-icon-filter:focus-within { border-color: var(--eg-accent); color: var(--eg-accent); outline: 1px solid var(--eg-accent); outline-offset: 1px; }
src/styles.css:18671: .contacts-workspace-tabs.contacts-subviews { border: 0; padding: 8px 0; gap: 10px; }
src/styles.css:18672: .contacts-workspace-tabs.contacts-subviews > button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 6px; border: 0; border-radius: 0; background: transparent; box-shadow: none; letter-spacing: .4px; }
src/styles.css:18686: border-color: var(--accent-red);
```

## Buttons (classification candidates)
```text
src/App.jsx:257: <button
src/App.jsx:275: <button
src/App.jsx:299: <button
src/App.jsx:381: <button
src/App.jsx:834: <button
src/App.jsx:916: <button
src/App.jsx:950: <button
src/App.jsx:964: <button
src/App.jsx:1000: <button
src/App.jsx:1010: <button
src/App.jsx:1033: <button
src/App.jsx:1363: {!callProtected && <button type="button" className="contacts-mini-btn" onClick={() => {
src/components/ACAIntelligence.jsx:335: <button
src/components/ACAIntelligence.jsx:398: <button
src/components/ACAIntelligence.jsx:406: <button
src/components/AgentAudioSettings.jsx:84: <button type="button" className="billing-button" disabled={busy || callActive} onClick={() => void save(preferences)}>Save audio settings</button>
src/components/AgentAudioSettings.jsx:85: <button type="button" className="billing-button" disabled={busy || callActive || !preferences.enabled} onClick={() => void calibrate()}>Calibrate</button>
src/components/AgentAudioSettings.jsx:86: {busy && active.current ? <button type="button" className="billing-button" onClick={() => active.current?.cancel()}>Cancel</button> : null}
src/components/AgentAvailabilityToggle.jsx:51: <button
src/components/AgentDashboard.jsx:167: <div className="agent-dash-status"><ParagonCallbackBadge /><button onClick={onOpenContacts}>{data.loading ? 'Loading' : data.contacts} {scope === 'agency' ? 'agency contacts' : 'assigned contacts'} ↗</button><button onClick={data.refresh} disabled={data.loading}>Refresh</button><span role="status">{data.loading ? 'Loading your activity...' : data.updatedAt ? `Updated ${data.updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Awaiting data'}</span></div>
src/components/AgentDashboard.jsx:179: <div className="agent-dash-range-row"><span>{scopeLabel} · ACTIVITY WINDOW</span><div className="agent-dash-ranges" aria-label="Chart time range">{DASHBOARD_RANGES.map(([value, label]) => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>)}</div></div>
src/components/AgentStatusLog.jsx:68: <header><h2 id={`${id}-title`}>Agent Status Log</h2><div className="agent-dash-status"><span>Auto-refreshes every 30 seconds</span><button onClick={() => setVersion(value => value + 1)} disabled={current.loading}>Refresh log</button></div></header>
src/components/AgentStatusLog.jsx:80: <div className="agent-status-log__pagination"><span role="status">{current.loading ? 'Loading…' : `${current.count ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, current.count)} of ${current.count} changes`}</span><div><button onClick={() => setPage(value => value - 1)} disabled={current.loading || page === 0}>Previous</button><button onClick={() => setPage(value => value + 1)} disabled={current.loading || (page + 1) * PAGE_SIZE >= current.count}>Next</button></div></div>
src/components/AgentTools.jsx:301: <button
src/components/AgentTools.jsx:344: <button className="at-modal-close" onClick={onClose} type="button" aria-label="Close">
src/components/AgentTools.jsx:494: <button className="at-doc-back" onClick={onBack} type="button">
src/components/AgentTools.jsx:567: <button
src/components/AgentTools.jsx:594: <button
src/components/AgentTools.jsx:639: <button
src/components/AgentToolsProductQuiz.jsx:103: <button className="at-quiz-secondary-btn" type="button" onClick={resetQuiz}>
src/components/AgentToolsProductQuiz.jsx:177: <button
src/components/AgentToolsProductQuiz.jsx:202: <button className="at-quiz-next-btn" type="button" onClick={goNext}>
src/components/AskCopilotMini.jsx:100: <button
src/components/AvailabilityStrip.jsx:71: <button
src/components/AvailabilityStrip.jsx:95: <button
src/components/BillingSettings.jsx:110: <button
src/components/BillingSettings.jsx:170: <button
src/components/BillingSettings.jsx:188: <button
src/components/BillingSettings.jsx:208: <button
src/components/CarrierQuickRef.jsx:80: <button
src/components/CarrierQuickRef.jsx:136: <button
src/components/CarrierRef.jsx:111: <button
src/components/CarrierRef.jsx:320: <button
src/components/CarrierRef.jsx:705: <button
src/components/CarrierRef.jsx:1115: <button
src/components/CenterTimerBar.jsx:28: <button
src/components/ClientQuickScripts.jsx:165: <button
src/components/ClientQuickScripts.jsx:206: <button
src/components/CompactCopilotRail.jsx:86: <button
src/components/CompactCopilotRail.jsx:98: <button
src/components/CompactCopilotRail.jsx:104: <button
src/components/CompactCopilotRail.jsx:252: <button
src/components/CompactCopilotRail.jsx:271: <button
src/components/CompactCopilotRail.jsx:287: <button
src/components/CompactCopilotRail.jsx:311: <button
src/components/ComplianceDashboard.jsx:676: <button
src/components/ComplianceIntentAccordion.jsx:58: <button
src/components/ContactToast.jsx:12: <span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={onDismiss}>×</button>
src/components/DailyVerse.jsx:651: <button
src/components/DailyVerse.jsx:678: <button
src/components/DailyVerse.jsx:688: <button
src/components/DailyVerse.jsx:698: <button
src/components/DailyVerse.jsx:728: <button
src/components/DailyVerse.jsx:759: <button
src/components/DailyVerse.jsx:779: <button
src/components/DailyVerse.jsx:786: <button
src/components/DailyVerse.jsx:801: <button
src/components/DailyVerse.jsx:810: <button
src/components/DailyVerse.jsx:854: <button
src/components/DailyVerse.jsx:969: <button
src/components/DailyVerse.jsx:978: <button
src/components/DailyVerse.jsx:987: <button
src/components/DailyVerse.jsx:1013: <button
src/components/DailyVerse.jsx:1025: <button
src/components/DailyVerse.jsx:1034: <button
src/components/DailyVerse.jsx:1080: <button
src/components/DailyVerse.jsx:1114: <button
src/components/DtmfKeypad.jsx:17: <button
src/components/DtmfKeypad.jsx:29: <button
src/components/MAScriptBranches.jsx:59: <button key={node.key} type="button" className="script-start-call-button"
src/components/MAScriptBranches.jsx:72: <button key={option.value} type="button"
src/components/MedSupFlow.jsx:72: <button
src/components/MedSupFlow.jsx:277: <button
src/components/MedSupFlow.jsx:405: <button
src/components/MiniLiveTranscript.jsx:209: <button type="button" className="copilot-pill-button" onClick={followLatest}>
src/components/Onboarding.jsx:205: <button
src/components/Onboarding.jsx:215: <button
src/components/Onboarding.jsx:259: <button type="button" className="billing-button" disabled={saving} onClick={() => choosePlan("starter")}>
src/components/Onboarding.jsx:269: <button type="button" className="billing-button is-primary" disabled={saving} onClick={() => choosePlan("pro")}>
src/components/Onboarding.jsx:274: <button type="button" className="onboarding-skip" onClick={finishWithoutCheckout} disabled={saving}>
src/components/Onboarding.jsx:285: <button type="button" className="billing-button is-primary" onClick={onComplete}>
src/components/Onboarding.jsx:294: <button
src/components/Onboarding.jsx:302: <button
src/components/PlaybookModal.jsx:13: <button
src/components/PreloadRecoveryNotice.jsx:13: <button type="button" className="secondary" onClick={onReload} disabled={callInProgress}
src/components/PreloadRecoveryNotice.jsx:15: <button type="button" className="secondary" onClick={preloadRecovery.dismiss}>Dismiss</button>
src/components/PrivatePlanCard.jsx:5: <button
src/components/PrivatePlanPanel.jsx:13: <button type="button" className="private-plan-open-btn private-plan-open-btn--bottom" onClick={() => setModalOpen(true)}>
src/components/ProfileMenu.jsx:36: <button ref={triggerRef} type="button" className="top-bar-profile-trigger"
src/components/ProfileMenu.jsx:45: <button type="button" role="menuitem" className="top-bar-profile-signout"
src/components/ProgressDots.jsx:18: <button
src/components/RTSIngestionPanel.jsx:295: <button type="button" className="rts-upload-trigger" onClick={() => setOpen(true)}>
src/components/RTSIngestionPanel.jsx:313: <button
src/components/RTSIngestionPanel.jsx:347: <button
src/components/RTSIngestionPanel.jsx:562: <button type="button" className="rts-secondary-button" onClick={reset} disabled={phase === "committing"}>
src/components/RTSIngestionPanel.jsx:565: <button
src/components/RTSIngestionPanel.jsx:590: <button type="button" className="rts-primary-button" onClick={close}>Done</button>
src/components/RTSTab.jsx:170: <button
src/components/RTSTab.jsx:193: <button
src/components/RTSTab.jsx:494: <button type="button" onClick={loadRows}>Retry</button>
src/components/RTSTab.jsx:560: <button
src/components/SEPFinder.jsx:91: <button
src/components/SEPFinder.jsx:100: <button
src/components/SEPGuide2026.jsx:414: <button
src/components/SEPGuide2026.jsx:621: <button
src/components/SEPGuide2026.jsx:731: <button
src/components/SEPLookup.jsx:98: <button
src/components/SEPLookup.jsx:162: <button
src/components/SEPLookup.jsx:170: <button
src/components/SEPLookup.jsx:257: <button className="undo-btn" onClick={() => { s.setFilterCategory("all"); s.setFilterProduct("all"); }}>
src/components/SEPResultsModal.jsx:42: <button
src/components/SEPResultsModal.jsx:64: <button
src/components/SEPResultsPanel.jsx:162: <button
src/components/SEPResultsPanel.jsx:226: <button
src/components/ScriptEditor.jsx:219: <button type="button" className="secondary" onClick={loadTemplate} disabled={saving}>
src/components/ScriptEditor.jsx:222: <button type="button" className="primary" onClick={saveTemplate} disabled={flow === "ma" || saving || !changedCount}>
src/components/ScriptEditor.jsx:230: <button
src/components/ScriptEditor.jsx:260: <button type="button" title="Move up" disabled={flow === "ma"} onClick={() => moveSection(index, -1)}>
src/components/ScriptEditor.jsx:263: <button type="button" title="Move down" disabled={flow === "ma"} onClick={() => moveSection(index, 1)}>
src/components/ScriptEditor.jsx:266: <button
src/components/ScriptEditor.jsx:325: <button type="button" className="script-editor-add" disabled={flow === "ma"} onClick={addSection}>
src/components/ScriptFlow.jsx:222: <button
src/components/ScriptFlow.jsx:239: <button
src/components/ScriptFlow.jsx:245: <button
src/components/ScriptFlow.jsx:386: <button
src/components/ScriptFlow.jsx:408: <button
src/components/ScriptFlow.jsx:426: <button
src/components/ScriptFlow.jsx:448: <button
src/components/ScriptFlow.jsx:1057: <button
src/components/ScriptFlow.jsx:1073: <button
src/components/ScriptSection.jsx:76: <button
src/components/SessionLockOverlay.jsx:52: <button type="button" className="session-lock-manual-continue" onClick={unlock}>
src/components/SessionSummary.jsx:626: <button className="btn-clay" onClick={handleCopyToClipboard}>
src/components/SessionSummary.jsx:629: <button className="btn-clay" onClick={handlePDF} disabled={exportingPdf}>
src/components/SharedUI.jsx:72: <button
src/components/SharedUI.jsx:85: <button
src/components/SharedUI.jsx:199: <button
src/components/SmsToastHost.jsx:74: <button
src/components/TenantSettings.jsx:496: <button type="button" className="billing-button is-primary" onClick={saveTenant} disabled={saving}>
src/components/TenantSettings.jsx:509: <button type="button" className={`billing-button${vendorPaused ? " is-primary" : ""}`} onClick={toggleVendorPause} disabled={vendorPauseSaving}>
src/components/TenantSettings.jsx:557: <button type="button" className="billing-icon-button" onClick={testWebhook} title="Test webhook">
src/components/TenantSettings.jsx:600: <button
src/components/TenantSettings.jsx:627: <button type="button" className="billing-button" onClick={addAgent} disabled={atSeatLimit}>
src/components/TenantSettings.jsx:648: <button
src/components/TenantSettings.jsx:661: <button
src/components/TenantSettings.jsx:699: <button
src/components/TenantSettings.jsx:709: <button
src/components/TenantSettings.jsx:722: <button
src/components/TranscriptUpload.jsx:363: <button className="primary" type="submit" disabled={submitting}>
src/components/UnderwritingChecker.jsx:5: {highlighted ? <button type="button" className="private-plan-open-btn" onClick={onAcknowledgeHighlight}>Acknowledge</button> : null}
src/components/VendorRoutingSettings.jsx:63: <button className="billing-button is-primary" type="button" disabled={saving} onClick={() => save({action:'report_token_rotate'})}>{data.report_token_updated_at ? 'Rotate report link' : 'Create report link'}</button>
src/components/VendorRoutingSettings.jsx:64: {data.report_token_updated_at && <button className="billing-button" type="button" disabled={saving} onClick={() => save({action:'report_token_revoke'})}>Revoke report link</button>}
src/components/VendorRoutingSettings.jsx:88: <button className="billing-button is-primary" type="button" disabled={!billing_ready || saving} onClick={()=>save({action:'controls',staffed_hours:controls.staffed_hours,rate:Number(controls.paragon_rate)})}>Save hours and billing</button>
src/components/VendorRoutingSettings.jsx:97: <button className="billing-button is-primary" type="button" disabled={saving} onClick={saveConfig}>Save routing settings</button>
src/components/VendorRoutingSettings.jsx:113: <td><button type="button" className="billing-button" disabled={saving} onClick={() => saveRow(row,false)}>Remove</button></td>
src/components/VendorRoutingSettings.jsx:118: <button className="billing-button" type="button" disabled={saving || !newAgent || !newState || matrix.some(row => row.agent_id===newAgent && row.state===newState)} onClick={() => save({ action:'matrix',agent_id:newAgent,state:newState,licensed:true,carriers:[] })}>Add licensed state</button>
src/components/aca/AcaFfmSepFinder.jsx:36: <button
src/components/aca/AcaFfmSepFinder.jsx:79: <button
src/components/ancillary/AncillaryPopup.jsx:69: <button
src/components/ancillary/AncillaryPopupManager.jsx:151: <button
src/components/ancillary/AncillaryPopupManager.jsx:207: <button
src/components/ancillary/AncillaryPopupManager.jsx:285: <button
src/components/ancillary/CarrierReferencePopupManager.jsx:63: <button
src/components/ancillary/MOHRiderBundle.jsx:131: <button
src/components/callDetail/CallDetailPanel.jsx:72: <button
src/components/callDetail/CallDetailPanel.jsx:357: {showCombination && detail.id && <button type="button" className="contacts-mini-btn" onClick={() => setCombining(true)}>Combine with…</button>}
src/components/callDetail/ComplianceReviewModal.jsx:96: <button type="button" className="compliance-review-category-head" onClick={() => setOpen((v) => !v)}>
src/components/callDetail/ComplianceReviewModal.jsx:112: <button
src/components/callDetail/ComplianceReviewModal.jsx:279: <button type="button" className="contacts-mini-btn" onClick={onClose}>CLOSE</button>
src/components/callDetail/MergedRecordingPlayer.jsx:69: <button type="button" className="contacts-mini-btn" disabled={busy} onClick={() => void build(true)}>{busy ? 'Preparing merged recording…' : media ? 'Rebuild merged playback' : 'Prepare merged playback'}</button>
src/components/callDetail/RecordingPanel.jsx:71: <div className="contacts-section-head">RECORDINGS <button type="button" className="contacts-mini-btn" onClick={load} disabled={loading}>REFRESH</button></div>
src/components/callDetail/RecordingPanel.jsx:83: <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => media(row, false)}>PLAY</button>{' '}
src/components/callDetail/RecordingPanel.jsx:84: <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => media(row, true)}>DOWNLOAD WAV</button>{' '}
src/components/callDetail/RecordingPanel.jsx:85: {row.provider_available ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => media(row, true, true)}>DOWNLOAD TWILIO COPY</button> : null}{' '}
src/components/callDetail/RecordingPanel.jsx:87: <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => copyConversly(row, 'wav')}>COPY CONVERSLY LINK (WAV)</button>{' '}
src/components/callDetail/RecordingPanel.jsx:88: {row.provider_available ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => copyConversly(row, 'mp3')}>COPY CONVERSLY LINK (MP3)</button> : null}{' '}
src/components/callDetail/RecordingPanel.jsx:92: {['retry', 'failed'].includes(row.status) ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => retry(row)}>RETRY COPY</button> : null}
src/components/callLog/CallDateRangePicker.jsx:67: <button type="button" ref={triggerRef} className={`contacts-mini-btn call-log-toolbar-icon call-date-trigger${from ? ' is-active' : ''}`} title={`Filter calls by date: ${label}`} aria-label={`Filter calls by date: ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => {
src/components/callLog/CallDateRangePicker.jsx:74: <button type="button" className="contacts-mini-btn" aria-label="Previous month" onClick={() => move(shiftMonth(localDate(focusedDay), -1))}><ChevronLeft size={16} /></button>
src/components/callLog/CallDateRangePicker.jsx:76: <button type="button" className="contacts-mini-btn" aria-label="Next month" onClick={() => move(shiftMonth(localDate(focusedDay), 1))}><ChevronRight size={16} /></button>
src/components/callLog/CallDateRangePicker.jsx:87: return <button type="button" key={key} data-date={key} tabIndex={key === focusedDay ? 0 : -1}
src/components/callLog/CallDateRangePicker.jsx:97: <button type="button" className="contacts-mini-btn" onClick={() => { onChange('', ''); setAnchor(null); setHovered(null); }}>CLEAR</button>
src/components/callLog/CallDateRangePicker.jsx:98: <button type="button" className="contacts-mini-btn" onClick={close}>DONE</button>
src/components/callLog/CallLogTab.jsx:110: {needsIntake && ['enrolled','enrolled_pending_verification'].includes(selectedOutcome) && <button type="button" className="contacts-mini-btn" disabled={saving||disabled} onClick={()=>setIntakeOpen(true)}>Enrollment intake / save disposition</button>}
src/components/callLog/CallLogTab.jsx:114: <button type="button" className="contacts-mini-btn" disabled={saving || disabled || !codes.trim()} onClick={()=>void saveOutcome(selectedOutcome,null)}>Save disposition and codes</button>
src/components/callLog/CallLogTab.jsx:132: <button
src/components/callLog/CallLogTab.jsx:201: <button type="button" className="contacts-mini-btn" disabled={!row.call_record_id} onClick={onCombine}>Combine with…</button>
src/components/callLog/CallLogTab.jsx:202: <button type="button" className="contacts-mini-btn" disabled={!row.call_record_id} onClick={()=>setShowIntake(true)}>Enrollment Intake</button>
src/components/callLog/CallLogTab.jsx:204: <button type="button" className="contacts-mini-btn" disabled={!row.call_record_id} aria-expanded={showFullDetail} onClick={() => setShowFullDetail(current => !current)}>{showFullDetail ? "HIDE FULL DETAIL" : "FULL DETAIL"}</button>
src/components/callLog/CallLogTab.jsx:208: <button type="button" className="contacts-mini-btn" disabled={!row.call_record_id} onClick={event => {
src/components/callLog/CallLogTab.jsx:216: {detailError && <div className="ops-error" role="alert">{detailError} <button type="button" className="contacts-mini-btn" onClick={() => void loadDetail()}>RETRY</button></div>}
src/components/callLog/CallLogTab.jsx:238: {row.call_record_id && <button type="button" className="call-review-link" onClick={() => setShowComplianceReview(true)}>REVIEW →</button>}
src/components/callLog/CallLogTab.jsx:378: {selectedCalls.length === 2 && <button type="button" className="contacts-mini-btn" onClick={() => setCombineIds(selectedCalls)}>Combine Calls</button>}
src/components/callLog/CallLogTab.jsx:395: <button type="button" className={`contacts-mini-btn call-log-toolbar-icon${showRecordings ? ' is-active' : ''}`} aria-label="Recordings" title="Recordings" aria-expanded={showRecordings} onClick={() => setShowRecordings(value => !value)}><FileAudio size={16} aria-hidden="true" /></button>
src/components/callLog/CallLogTab.jsx:396: <button type="button" className="contacts-mini-btn call-log-toolbar-icon" aria-label="Refresh calls" title="Refresh calls" onClick={load}><RefreshCw size={16} aria-hidden="true" /></button>
src/components/callLog/CallLogTab.jsx:397: <button type="button" className="contacts-mini-btn call-log-toolbar-icon" aria-label={exporting ? "Exporting calls" : "Export calls (CSV)"} title={exporting ? "Exporting calls…" : "Export calls (CSV)"} aria-busy={exporting} disabled={loading || exporting} onClick={() => void exportCalls()}><Download size={16} aria-hidden="true" /></button>
src/components/callLog/CallLogTab.jsx:456: <button
src/components/callLog/CallLogTab.jsx:465: <button
src/components/callLog/CallLogTab.jsx:521: <div className="call-actions-menu-items"><button type="button" className="contacts-mini-btn" disabled={!row.call_record_id} onClick={event => { event.currentTarget.closest('details').open = false; onCombine(); }}>Combine with…</button></div>
src/components/callLog/CallLogTab.jsx:522: </details><button type="button" className="call-expand-toggle" aria-label={isExpanded ? "Collapse call" : "Expand call"} aria-expanded={isExpanded} onClick={event => { event.stopPropagation(); onToggle(); }}>{isExpanded ? "⌄" : "›"}</button></span></td>
src/components/callLog/CallNotesEditor.jsx:37: {error && <div className="ops-error" role="alert">{error} <button type="button" className="contacts-mini-btn" onClick={() => void save()}>RETRY</button></div>}
src/components/callLog/CallRecordDetailsEditor.jsx:30: {!editing ? <button type="button" className="contacts-mini-btn" disabled={!record} onClick={()=>{setDraft({});setEditing(true);}}>Edit notes and details</button> : <>
src/components/callLog/CallRecordDetailsEditor.jsx:37: <div className="call-log-expand-actions"><button type="button" className="contacts-mini-btn" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save details'}</button>
src/components/callLog/CallRecordDetailsEditor.jsx:38: <button type="button" className="contacts-mini-btn" disabled={saving} onClick={()=>setEditing(false)}>Cancel</button></div>
src/components/callLog/CallRecordings.jsx:29: {error && <div className="ops-error" role="alert">{error} <button type="button" className="contacts-mini-btn" onClick={() => void load()}>RETRY</button></div>}
src/components/callLog/CallRecordings.jsx:39: <td><button type="button" className="contacts-mini-btn call-log-toolbar-icon" title="Recording details" aria-label={`Recording details for ${row.contact_name || row.contact_phone || 'call'}`} onClick={() => setSelected(row)}><ChevronRight size={16} aria-hidden="true" /></button></td>
src/components/callLog/CallRecordings.jsx:43: <button type="button" className="contacts-mini-btn" disabled={offset === 0} onClick={() => setOffset(current => Math.max(0, current - 100))}>← PREV</button>
src/components/callLog/CallRecordings.jsx:45: <button type="button" className="contacts-mini-btn" disabled={data.next_offset == null} onClick={() => setOffset(data.next_offset)}>NEXT →</button>
src/components/callLog/CallRecordings.jsx:49: <div className="call-recordings-detail-head"><span>{selected.contact_name || selected.contact_phone || 'Call'} · {formatCallDateTime(selected.occurred_at)}</span><button type="button" className="contacts-mini-btn call-log-toolbar-icon" title="Close recording details" aria-label="Close recording details" onClick={() => setSelected(null)}><X size={16} aria-hidden="true" /></button></div>
src/components/callLog/CallRecordings.jsx:59: <div className="contacts-section-head call-recordings-heading"><span>RECORDINGS</span><button type="button" className="contacts-mini-btn call-log-toolbar-icon" title="Refresh recordings" aria-label="Refresh recordings" onClick={() => setRefreshKey(current => current + 1)}><RefreshCw size={16} aria-hidden="true" /></button></div>
src/components/callLog/CallRecordings.jsx:61: <button type="button" className={view === 'available' ? 'is-active' : ''} aria-pressed={view === 'available'} onClick={() => setView('available')}>AVAILABLE</button>
src/components/callLog/CallRecordings.jsx:62: <button type="button" className={view === 'missing' ? 'is-active' : ''} aria-pressed={view === 'missing'} onClick={() => setView('missing')}>MISSING</button>
src/components/callLog/CallRowParts.jsx:63: <button type="button" className="contacts-mini-btn call-recording-icon" aria-label={audioUrl ? 'Hide recording player' : 'Play recording'} title="Play recording" onClick={() => onPlay ? onPlay() : handlePlay()} disabled={loading}>{audioUrl ? <Pause size={16} /> : <Play size={16} />}</button>
src/components/callLog/CallRowParts.jsx:64: <button type="button" className="contacts-mini-btn call-recording-icon" aria-label="Download recording" title="Download WAV" onClick={() => handlePlay(true)} disabled={loading}><Download size={16} /></button>
src/components/callLog/CallTranscriptPlayer.jsx:82: <button type="button" className="contacts-mini-btn call-recording-icon" aria-label={playing ? 'Pause recording' : 'Play recording'} disabled={!hasRecording || busy} onClick={toggle}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
src/components/callLog/CallTranscriptPlayer.jsx:85: <button type="button" className="contacts-mini-btn call-audio-speed" aria-label={`Playback speed ${speed}x`} onClick={() => {
src/components/callLog/CallTranscriptPlayer.jsx:105: {loading ? <p className="contacts-muted">Loading transcript…</p> : !lines.length ? <p className="contacts-muted">No transcript stored</p> : lines.map((line, index) => <button
src/components/callLog/CombineCallsModal.jsx:47: {error && <div className="ops-error" role="alert">{error} <button className="contacts-mini-btn" disabled={busy} onClick={() => setRetry(value => value + 1)}>Reload calls</button></div>}
src/components/callLog/CombineCallsModal.jsx:51: {candidates.map(row => <button type="button" className="contacts-mini-btn combine-call-candidate" key={row.log_id} onClick={() => setSecond(row.call_record_id)}>
src/components/callLog/CombineCallsModal.jsx:74: <button type="button" className="contacts-mini-btn" disabled={busy || (preview.different_contacts && !confirmed)} onClick={combine}>{busy ? 'Combining…' : 'Combine Calls'}</button>
src/components/callLog/CombinedCalls.jsx:40: {error && <div className="ops-error" role="alert">{error} <button className="contacts-mini-btn" onClick={refresh}>Retry</button></div>}
src/components/callLog/CombinedCalls.jsx:44: <button type="button" className="contacts-mini-btn" disabled={busy !== null} onClick={() => uncombine(row.call_record_id)}>{busy === row.call_record_id ? 'Restoring…' : 'Uncombine'}</button>
src/components/callLog/ComplianceUploads.jsx:40: <button className="contacts-mini-btn" onClick={()=>void load()}>Refresh</button>
src/components/callLog/ComplianceUploads.jsx:44: <button type="button" className="contacts-mini-btn" disabled={running||activeRun||!data.weekly?.enabled||!data.weekly?.worker_available} onClick={()=>void runNow()}>{running?'Starting…':'Run Conversely now'}</button>
src/components/callLog/ComplianceUploads.jsx:57: {data.missing.map(row=><div key={row.call_id}>{row.agent_name} · {new Date(row.call_start).toLocaleString()} · {row.call_id} <label>SunFire Confirmation Codes<textarea value={codes[row.call_id] || ''} onChange={event=>setCodes(previous=>({...previous,[row.call_id]:event.target.value}))}/></label><button className="contacts-mini-btn" disabled={!codes[row.call_id]?.trim()} onClick={()=>void fix(row.call_id)}>Save codes</button></div>)}
src/components/callLog/MissingRecordings.jsx:23: {!embedded && <div className="contacts-section-head">MISSING RECORDINGS <button type="button" className="contacts-mini-btn call-log-toolbar-icon" aria-label="Refresh missing recordings" title="Refresh missing recordings" onClick={load} disabled={loading}><RefreshCw size={16} aria-hidden="true" /></button></div>}
src/components/callLog/MissingRecordings.jsx:29: <td>{(row.direction === 'outbound' && row.attempt_id) || row.call_record_id || row.inbound_call_id ? <button type="button" className="contacts-mini-btn" onClick={() => setSelected({ ...row, attempt_id: row.direction === 'outbound' ? row.attempt_id : null, call_record_id: row.direction !== 'outbound' && row.inbound_call_id ? null : row.call_record_id })}>VIEW RECORDINGS</button> : 'Awaiting call record link'}</td>
src/components/callLog/MissingRecordings.jsx:33: <button type="button" className="contacts-mini-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>PREV</button>{' '}
src/components/callLog/MissingRecordings.jsx:34: <button type="button" className="contacts-mini-btn" disabled={data.next_offset == null} onClick={() => setOffset(data.next_offset)}>NEXT</button>
src/components/contacts/ComposePickers.jsx:57: const emojiButton = ([emoji, label]) => <button type="button" key={emoji} title={label} aria-label={label} onClick={() => chooseEmoji(emoji)}>{emoji}</button>;
src/components/contacts/ComposePickers.jsx:59: <button type="button" className="contacts-mini-btn" disabled={disabled} aria-label="Emoji picker" aria-expanded={panel === "emoji"} onMouseDown={(e) => e.preventDefault()} onClick={() => { setPanel(panel === "emoji" ? null : "emoji"); setQuery(""); }}><Smile size={18} /></button>
src/components/contacts/ComposePickers.jsx:60: <button type="button" className="contacts-mini-btn" disabled={disabled} aria-label="GIF picker" aria-expanded={panel === "gif"} onClick={() => { setPanel(panel === "gif" ? null : "gif"); setQuery(""); }}><Image size={18} /><span>GIF</span></button>
src/components/contacts/ComposePickers.jsx:62: <div className="compose-picker-heading"><strong>{panel === "emoji" ? "EMOJI" : "GIF · MMS"}</strong><button type="button" aria-label="Close picker" onClick={() => setPanel(null)}>×</button></div>
src/components/contacts/ComposePickers.jsx:66: <div className="compose-picker-categories">{Object.keys(EMOJI).map((name) => <button type="button" className={category === name ? "is-active" : ""} key={name} onClick={() => { setCategory(name); setQuery(""); }}>{name}</button>)}</div>
src/components/contacts/ComposePickers.jsx:70: <button type="button" className="contacts-mini-btn" onClick={() => setQuery("minions")}>🍌 FEATURED: MINIONS</button>
src/components/contacts/ComposePickers.jsx:74: <div className="compose-gif-grid">{gifs.map((gif) => <button type="button" key={gif.id} onClick={() => { onGif(gif); setPanel(null); }}><img src={gif.url} alt={gif.title} loading="lazy" /></button>)}</div>
src/components/contacts/ContactsTab.jsx:310: <button
src/components/contacts/ContactsTab.jsx:349: <button
src/components/contacts/ContactsTab.jsx:367: <button
src/components/contacts/ContactsTab.jsx:411: <button type="button" title="Email" disabled={!contact?.email_set} onClick={onEmail}>
src/components/contacts/ContactsTab.jsx:414: <button type="button" title="Star contact" disabled={!contact}>
src/components/contacts/ContactsTab.jsx:417: <button type="button" title="Archive conversation" disabled={!contact}>
src/components/contacts/ContactsTab.jsx:473: <button type="button" className="contacts-mini-btn" onClick={() => onTogglePin(note.id, !note.pinned)}>
src/components/contacts/ContactsTab.jsx:487: <button type="button" className="contacts-mini-btn" disabled={saving} onClick={onAddNote}>
src/components/contacts/ContactsTab.jsx:667: <button type="button" className="contacts-mini-btn" disabled={saving} onClick={onAddPolicy}>
src/components/contacts/ContactsTab.jsx:704: <button type="button" className="contacts-mini-btn" onClick={() => setRightOpen(true)}>
src/components/contacts/ContactsTab.jsx:716: <button type="button" className="contacts-mini-btn" onClick={() => setRightOpen(false)}>
src/components/contacts/ContactsTab.jsx:736: <button
src/components/contacts/ContactsTab.jsx:861: <button type="button" className="contacts-mini-btn" disabled={saving} onClick={onAddFollowUp}>
src/components/contacts/ContactsTab.jsx:1180: <button className="contacts-mini-btn" type="button" onClick={() => setNewContact({ first_name: "", last_name: "", phone: "", email: "" })}>+ ADD CONTACT</button>
src/components/contacts/ContactsTab.jsx:1197: <button className="contacts-mini-btn" disabled={saving || !agentUuid}>SAVE CONTACT</button>
src/components/contacts/ContactsTab.jsx:1198: {existingContactId && <button className="contacts-mini-btn" type="button" onClick={() => { setSelectedContactId(existingContactId); onSelectContact?.(existingContactId); setNewContact(null); setExistingContactId(null); setInlineError(""); }}>OPEN EXISTING CONTACT</button>}
src/components/contacts/ContactsTab.jsx:1199: <button className="contacts-mini-btn" type="button" onClick={() => setNewContact(null)}>CANCEL</button>
src/components/contacts/ContactsTab.jsx:1203: <button className="contacts-mini-btn" disabled={saving} onClick={async () => {
src/components/contacts/ContactsTab.jsx:1209: <button className="contacts-mini-btn" disabled={saving} onClick={() => setMerge(null)}>CANCEL</button>
src/components/contacts/ContactsTab.jsx:1232: <button
src/components/contacts/ContactsTab.jsx:1244: {callData.error ? <div className="ops-error" role="alert">{callData.error} <button type="button" className="contacts-mini-btn" onClick={callData.refresh}>RETRY CALLS</button></div> : null}
src/components/contacts/ContactsTab.jsx:1326: <button type="button" className={location.view === 'calls' ? 'is-active' : ''} aria-pressed={location.view === 'calls'} onClick={() => updateLocation('calls')}><Phone size={14} aria-hidden="true" />Calls</button>
src/components/contacts/ContactsTab.jsx:1327: <button type="button" className={location.view === 'contacts' ? 'is-active' : ''} aria-pressed={location.view === 'contacts'} onClick={() => updateLocation('contacts', location.contactId)}><UsersRound size={14} aria-hidden="true" />Contacts</button>
src/components/contacts/ContactsTab.jsx:1328: <button type="button" className={location.view === 'opportunities' ? 'is-active' : ''} aria-pressed={location.view === 'opportunities'} onClick={() => updateLocation('opportunities')}><BriefcaseBusiness size={14} aria-hidden="true" />Opportunities</button>
src/components/contacts/ContactsTab.jsx:1329: <button type="button" className={location.view === 'followups' ? 'is-active' : ''} aria-pressed={location.view === 'followups'} onClick={() => updateLocation('followups')}><CalendarClock size={14} aria-hidden="true" />Follow-ups{dueToday > 0 && <span className="call-log-chip" aria-label={`${dueToday} follow-ups due today`}> {dueToday}</span>}</button>
src/components/contacts/FollowUpsView.jsx:19: <td>{row.source==='paragon'&&<><div>{row.caller_name||'Unknown caller'}</div><div className="mono">{row.caller_phone||'Phone unavailable'} · {row.caller_state}</div><a className="contacts-mini-btn" href={`/crm/calls?inbound_call_id=${encodeURIComponent(row.inbound_call_id)}`}>ORIGINAL CALL</a>{' '}</>}{row.contact_id&&<button type="button" className="contacts-mini-btn" onClick={() => onOpenContact(row.contact_id)}>OPEN CONTACT</button>}</td>
src/components/contacts/FollowUpsView.jsx:21: <button type="button" className="contacts-mini-btn" disabled={pending} onClick={() => void save('complete')}>MARK COMPLETE</button>{' '}
src/components/contacts/FollowUpsView.jsx:22: <button type="button" className="contacts-mini-btn" disabled={pending} onClick={() => setRescheduling(value => !value)}>RESCHEDULE</button>
src/components/contacts/FollowUpsView.jsx:25: <button type="submit" className="contacts-mini-btn" disabled={pending || !dueAt}>SAVE</button>
src/components/contacts/FollowUpsView.jsx:26: <button type="button" className="contacts-mini-btn" onClick={() => setRescheduling(false)}>CANCEL</button>
src/components/contacts/FollowUpsView.jsx:49: <button type="button" className="contacts-mini-btn" disabled={data.loading} onClick={() => void data.refresh()}>REFRESH</button>
src/components/contacts/MessagesThread.jsx:214: {gif && <div className="compose-gif-preview"><img src={gif.url} alt={gif.title} /><span>MMS preview · {Math.ceil(gif.size / 1000)} KB</span><button className="contacts-mini-btn" type="button" disabled={sending} onClick={() => setGif(null)}>REMOVE GIF</button></div>}
src/components/contacts/MessagesThread.jsx:238: <button
src/components/copilot/CrossSellTrigger.jsx:277: <button
src/components/copilot/CrossSellTrigger.jsx:308: <button
src/components/enrollment/EnrollmentIntake.jsx:94: <button type="submit" className="contacts-mini-btn" disabled={busy||!contactId}>{busy?'Saving…':'Save completed intake'}</button>
src/components/leftRail/ClientInfoCard.jsx:329: <button
src/components/leftRail/GLP1BridgeGuide.jsx:22: <button
src/components/leftRail/GLP1BridgeGuide.jsx:38: <button type="button" onClick={() => setIsOpen(false)} aria-label="Close GLP-1 Bridge guidance" title="Close">
src/components/leftRail/LeftRailManager.jsx:323: <button
src/components/leftRail/LeftRailManager.jsx:369: <button
src/components/leftRail/PlanContextCard.jsx:99: <button
src/components/leftRail/PlanContextCard.jsx:115: <button
src/components/leftRail/PlanContextCard.jsx:145: <button
src/components/leftRail/SEPQualifier.jsx:160: <button
src/components/leftRail/SEPQualifier.jsx:397: <button type="button" className="sep-qualifier-action" onClick={resetAll}>
src/components/leftRail/SEPQualifier.jsx:401: <button type="button" className="sep-qualifier-action" onClick={onMinimize}>
src/components/leftRail/SEPQualifier.jsx:431: <button
src/components/leftRail/SEPQualifier.jsx:441: <button
src/components/leftRail/SEPQualifier.jsx:451: <button
src/components/leftRail/SEPQualifier.jsx:474: <button
src/components/leftRail/SEPQualifier.jsx:481: <button
src/components/leftRail/SEPQualifier.jsx:520: <button
src/components/leftRail/SEPQualifier.jsx:537: <button
src/components/leftRail/SEPQualifier.jsx:547: <button
src/components/leftRail/SEPQualifier.jsx:601: <button
src/components/leftRail/SEPQualifier.jsx:627: <button
src/components/leftRail/SEPQualifier.jsx:642: <button
src/components/leftRail/SEPQualifier.jsx:662: <button
src/components/leftRail/SEPQualifier.jsx:688: <button
src/components/leftRail/SEPQualifier.jsx:706: <button
src/components/leftRail/SEPQualifier.jsx:778: <button type="button" className="sep-qualifier-secondary" onClick={resetAll}>
src/components/leftRail/SEPQualifier.jsx:781: <button
src/components/leftRail/SNPRoutingWidget.jsx:37: <button
src/components/medsup/RateComparisonPanel.jsx:237: <button type="button" className="sf-icon-button" onClick={addManualRate} title="Add manual quote">
src/components/opportunities/ContactOpportunities.jsx:15: return <><button type="button" className="contacts-mini-btn" disabled={needsContact} title={needsContact ? 'Link a contact to this call first.' : undefined} onClick={() => setOpen(true)}>{label}</button>
src/components/opportunities/ContactOpportunities.jsx:27: {data.loading ? <p className="contacts-muted">Loading opportunities…</p> : data.error ? <div className="ops-error" role="alert">{data.error}<button className="contacts-mini-btn" onClick={() => data.refresh()}>RETRY</button></div> : !data.rows.length ? <p className="contacts-muted">No opportunities yet.</p> : data.rows.map((row) => <button type="button" className="opps-contact-opportunity" key={row.id} onClick={() => setSelectedId(row.id)}><strong>{row.title}</strong><StageBadge stage={data.stages.find((stage) => stage.id === row.stage_id)} /><span>{row.line_of_business} · {money(row.est_value)}</span></button>)}
src/components/opportunities/ContactTagsPopover.jsx:33: <header><strong>Contact tags</strong><button type="button" className="contacts-mini-btn" aria-label="Close tags" onClick={() => { onClose(); anchor.focus(); }}><X size={14} /></button></header>
src/components/opportunities/ContactTagsPopover.jsx:34: <div className="opps-tag-list">{contactTags.map((tag) => <span key={tag.id} className="contacts-chip">{tag.name}<button type="button" aria-label={`Remove ${tag.name} tag`} disabled={tags.saving} onClick={() => { void tags.remove(tag.id).catch(() => {}); }}><X size={12} /></button></span>)}
src/components/opportunities/ContactTagsPopover.jsx:37: {tags.error && <div className="ops-error" role="alert">{tags.error}<button type="button" className="contacts-mini-btn" disabled={tags.loading} onClick={() => { void tags.refresh(); }}>RETRY</button></div>}
src/components/opportunities/ContactTagsPopover.jsx:38: <form onSubmit={submit}><input ref={inputRef} className="contacts-edit-input" aria-label="New contact tag" placeholder="Add a tag…" value={draft} maxLength={60} onChange={(event) => setDraft(event.target.value)} disabled={tags.saving || tags.loading} /><button type="submit" className="contacts-mini-btn" aria-label="Add tag" disabled={!draft.trim() || tags.saving || tags.loading}><Plus size={16} /></button></form>
src/components/opportunities/DeleteOpportunityDialog.jsx:23: <button type="button" className="contacts-mini-btn opps-danger" disabled={busy} onClick={() => { void confirm(); }}>{busy ? 'DELETING…' : 'DELETE OPPORTUNITY'}</button>
src/components/opportunities/DeleteOpportunityDialog.jsx:24: <button type="button" className="contacts-mini-btn" disabled={busy} onClick={onClose}>CANCEL</button>
src/components/opportunities/OpportunitiesView.jsx:21: return <button type="button" className="opps-card-action" aria-label={label} title={label} disabled={disabled} aria-expanded={expanded}
src/components/opportunities/OpportunitiesView.jsx:56: <button type="button" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${stage.name}`} aria-expanded={!collapsed} aria-controls={`opps-stage-${stage.id}`} onClick={() => setCollapsed((current) => !current)}>{collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>
src/components/opportunities/OpportunitiesView.jsx:148: <div className="opps-actions"><div className="opps-layout-toggle" role="group" aria-label="Opportunity layout"><button type="button" className={layout === 'board' ? 'is-active' : ''} aria-label="Board view" title="Board view" aria-pressed={layout === 'board'} onClick={() => { setLayout('board'); closeTags(); }}><LayoutGrid size={17} /></button><button type="button" className={layout === 'list' ? 'is-active' : ''} aria-label="List view" title="List view" aria-pressed={layout === 'list'} onClick={() => { setLayout('list'); closeTags(); }}><List size={17} /></button></div>
src/components/opportunities/OpportunitiesView.jsx:149: <button className="contacts-mini-btn" aria-label="Pipeline settings" title="Pipeline settings" disabled={data.loading || !pipelineId} onClick={() => setSettings(true)}><Settings size={16} /></button>
src/components/opportunities/OpportunitiesView.jsx:150: <button className="contacts-mini-btn opps-primary" disabled={data.loading || !stageRows.length || !data.agentUuid} onClick={() => setCreating(true)}><Plus size={15} /> NEW OPPORTUNITY</button>
src/components/opportunities/OpportunitiesView.jsx:159: <button type="button" className="contacts-mini-btn" onClick={() => setFilters({ pipeline: pipelineId, agent: '', lob: '', carrier: '', source: '', search: '' })}>CLEAR</button>
src/components/opportunities/OpportunitiesView.jsx:160: <button type="button" className="contacts-mini-btn" disabled={data.loading || data.pendingIds.size > 0} onClick={() => data.refresh()}>REFRESH</button>
src/components/opportunities/OpportunitiesView.jsx:173: </DndContext> : <div className="contacts-table-wrap"><table className="contacts-table opps-table"><thead><tr>{COLUMNS.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => setSort({ key, direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc' })}>{label}{sort.key === key ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>)}<th scope="col">Actions</th></tr></thead>
src/components/opportunities/OpportunitiesView.jsx:174: <tbody>{sorted.map((row) => <tr key={row.id}>{COLUMNS.map(([key]) => <td key={key}>{key === 'contact_name' ? <button type="button" className="opps-contact-link" onClick={() => openDrawer(row.id)}>{row.contact_name}</button> : key === 'stage_id' ? <StageBadge stage={data.stages.find((stage) => stage.id === row.stage_id)} /> : key === 'est_value' ? money(row.est_value) : valueFor(row, key) === '' ? '—' : String(valueFor(row, key))}</td>)}
src/components/opportunities/OpportunitiesView.jsx:175: <td><button type="button" className="contacts-mini-btn" aria-label={`Actions for ${row.contact_name}`} aria-haspopup="menu" aria-expanded={rowMenu?.id === row.id} disabled={data.pendingIds.has(row.id)} onClick={(event) => {
src/components/opportunities/OpportunityDialog.jsx:31: <header className="opps-dialog-head"><h2>{title}</h2><button type="button" className="contacts-mini-btn" aria-label="Close" disabled={busy} onClick={onClose}><X size={16} /></button></header>
src/components/opportunities/OpportunityDrawer.jsx:52: <button className="contacts-mini-btn" type="button" disabled={busy} onClick={() => onOpenContact(row.contact_id)}>OPEN CONTACT</button>
src/components/opportunities/OpportunityDrawer.jsx:53: {canDeleteOpportunity(row, data.agentUuid, data.isAdmin) && <button className="contacts-mini-btn opps-danger" type="button" disabled={busy || data.pendingIds.has(row.id)} onClick={() => setDeleting(true)}>DELETE</button>}
src/components/opportunities/OpportunityDrawer.jsx:57: {error && <div className="ops-error" role="alert">{error}<button className="contacts-mini-btn" type="button" onClick={load}>RETRY</button></div>}
src/components/opportunities/OpportunityDrawer.jsx:70: <button type="button" className="contacts-mini-btn" disabled={callLoading} onClick={() => openCall(call)}>{callDetail?.id === call.id ? 'HIDE CALL' : 'VIEW CALL'}</button></div>)}
src/components/opportunities/OpportunityEditor.jsx:81: {duplicateId && <button type="button" className="contacts-mini-btn" onClick={() => { set('contact_id', duplicateId); setCreateNew(false); setError(''); setDuplicateId(null); }}>USE EXISTING CONTACT</button>}
src/components/opportunities/OpportunityEditor.jsx:85: <button type="button" className={!createNew ? 'is-active' : ''} onClick={() => setCreateNew(false)}>Existing contact</button>
src/components/opportunities/OpportunityEditor.jsx:86: <button type="button" className={createNew ? 'is-active' : ''} onClick={() => {
src/components/opportunities/OpportunityEditor.jsx:125: <button className="contacts-mini-btn opps-primary" disabled={saving || !data.agentUuid || !data.stages.length}>{saving ? 'SAVING…' : existing ? 'SAVE OPPORTUNITY' : 'CREATE OPPORTUNITY'}</button>
src/components/opportunities/OpportunityEditor.jsx:132: {data.loading ? <p className="contacts-muted">Loading pipeline…</p> : data.error && !data.stages.length ? <div className="ops-error" role="alert">{data.error}<button className="contacts-mini-btn" onClick={() => data.refresh()}>RETRY</button></div>
src/components/opportunities/OpportunityRowMenu.jsx:36: <button type="button" role="menuitem" onClick={onOpen}>Open opportunity</button>
src/components/opportunities/OpportunityRowMenu.jsx:37: {canDelete && <button type="button" role="menuitem" className="opps-danger" onClick={onDelete}>Delete opportunity</button>}
src/components/opportunities/PipelineSettings.jsx:12: <button type="button" className="contacts-mini-btn opps-drag-handle" aria-label={`Reorder ${stage.name}`} {...attributes} {...listeners}><GripVertical size={16} /></button>
src/components/opportunities/PipelineSettings.jsx:16: <div className="opps-actions"><button type="button" className="contacts-mini-btn" aria-label={`Move ${stage.name} up`} disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={14} /></button><button type="button" className="contacts-mini-btn" aria-label={`Move ${stage.name} down`} disabled={disabled || index === count - 1} onClick={() => onMove(index, index + 1)}><ArrowDown size={14} /></button><button type="button" className="contacts-mini-btn" disabled={disabled || count === 1} onClick={onDelete}>DELETE</button></div>
src/components/opportunities/PipelineSettings.jsx:61: <button type="button" className="contacts-mini-btn" onClick={() => setStages((rows) => [...rows, { id: crypto.randomUUID(), name: 'New Stage', color: '#a78bfa', is_won: false, is_lost: false }])}>+ ADD STAGE</button>
src/components/opportunities/PipelineSettings.jsx:65: <div className="opps-actions"><button type="button" className="contacts-mini-btn" disabled={saving || (stageCount > 0 && !moveTo)} onClick={() => { void withBusy(async () => {
src/components/opportunities/PipelineSettings.jsx:69: }); }}> {moveTo ? 'MOVE & DELETE' : 'DELETE EMPTY STAGE'}</button><button type="button" className="contacts-mini-btn" onClick={() => setDeleting(null)}>CANCEL</button></div>
src/components/opportunities/PipelineSettings.jsx:73: <button className="contacts-mini-btn opps-primary" disabled={saving || !data.isAdmin || Boolean(deleting)}>{saving ? 'SAVING…' : 'SAVE PIPELINE'}</button>
src/components/opportunities/PipelineSettings.jsx:82: {data.isAdmin && <button type="button" className="contacts-mini-btn" disabled={busy} onClick={() => setSelected(null)}>+ NEW PIPELINE</button>}
src/components/phone/ActiveCallBar.jsx:34: role="button"
src/components/phone/ActiveCallBar.jsx:57: <button
src/components/phone/ActiveCallBar.jsx:69: <button
src/components/phone/ActiveCallBar.jsx:84: <button
src/components/phone/ActiveCallExpanded.jsx:68: {!result && <button type="button" disabled={saving || zip.length!==5 || (states.length>1 && !state)} onClick={confirm}>{saving?'Checking…':'Confirm ZIP'}</button>}
src/components/phone/ActiveCallExpanded.jsx:111: <button type="button" className="phone-expanded__save-note" disabled={!body.trim() || saving} onClick={handleSave}>
src/components/phone/ActiveCallExpanded.jsx:123: <button
src/components/phone/ActiveCallExpanded.jsx:175: <button
src/components/phone/ActiveCallExpanded.jsx:183: <button
src/components/phone/ActiveCallExpanded.jsx:192: <button
src/components/phone/ActiveCallExpanded.jsx:200: <button
src/components/phone/ActiveCallExpanded.jsx:208: <button
src/components/phone/ActiveCallExpanded.jsx:217: <button type="button" className="phone-expanded__action" disabled={conferenceDisabled} title={controls?.enabled ? 'Transfer and leave the call' : 'Conference calling is disabled'} onClick={() => setConferenceMode('blind')}>
src/components/phone/ActiveCallExpanded.jsx:221: <button type="button" className="phone-expanded__action" disabled={conferenceDisabled} title={controls?.enabled ? 'Consult privately before transferring' : 'Conference calling is disabled'} onClick={() => setConferenceMode('warm')}>
src/components/phone/ActiveCallExpanded.jsx:225: <button type="button" className="phone-expanded__action" disabled={conferenceDisabled} onClick={() => setConferenceMode('add')} title={controls?.enabled ? 'Add a third person' : 'Conference calling is disabled'}><Users size={16} />ADD PERSON</button>
src/components/phone/ActiveCallExpanded.jsx:226: <button type="button" className="phone-expanded__action phone-expanded__action--end" onClick={inbound.hangUp}>
src/components/phone/CallDispositionBox.jsx:71: <button type="button" className="top-bar-settings-button" aria-label="Collapse disposition" title="Collapse" onClick={()=>onCollapsedChange?.(true)}><X size={16}/></button>
src/components/phone/CallDispositionBox.jsx:80: {task.product_type?.toUpperCase()==='MA' && ['enrolled','enrolled_pending_verification'].includes(outcome) && <button type="button" className="contacts-mini-btn" onClick={()=>setIntakeOpen(true)}>{intakeComplete?'Edit completed intake':'Complete enrollment intake'}</button>}
src/components/phone/CallDispositionBox.jsx:83: <button type="button" className="phone-expanded__save-note" disabled={saving||!outcome||(task.product_type?.toUpperCase()==='MA' && ['enrolled','enrolled_pending_verification'].includes(outcome) && !intakeComplete)} onClick={()=>void save(task,outcome)}>{saving?'Saving…':'Save disposition'}</button>
src/components/phone/ConferenceControls.jsx:24: <div className="phone-conference__buttons"><button type="submit" disabled={!enabled || busy}>{busy ? 'Connecting…' : 'Dial'}</button><button type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
src/components/phone/ConferenceControls.jsx:29: <ul>{conference.participants.map(p => <li key={p.id}><span>{p.role === 'third_party' ? 'Third party' : p.role === 'agent' ? 'Agent' : 'Customer'}{p.phone ? ` · ${p.phone}` : p.agentId ? ` · ${p.agentId.replaceAll('_', ' ')}` : ''}</span><span>{p.status}</span>{p.role === 'third_party' && p.status !== 'left' && conference.ownerAgentId === agentId && <button type="button" disabled={busy} onClick={() => perform({ action: 'remove', participantId: p.id })}>Remove</button>}</li>)}</ul>
src/components/phone/ConferenceControls.jsx:31: {conference.phase === 'warm' && <><button type="button" disabled={busy || !connectedTarget} onClick={() => perform({ action: 'warm_complete' })}>Complete Transfer</button><button type="button" disabled={busy} onClick={() => perform({ action: 'warm_cancel' })}>Cancel Transfer</button></>}
src/components/phone/ConferenceControls.jsx:32: {canLeave && <button type="button" disabled={busy} onClick={() => perform({ action: 'leave' })}>Leave Call</button>}
src/components/phone/DialerPanel.jsx:203: <button type="button" key={digit} className="phone-dialer__key" onClick={() => handleKey(digit)}>
src/components/phone/DialerPanel.jsx:223: <button
src/components/phone/DialerPanel.jsx:298: <button
src/components/phone/DialerPanel.jsx:425: <button
src/components/phone/IncomingCallToast.jsx:36: <button
src/components/phone/IncomingCallToast.jsx:45: <button
src/components/phone/PhoneDropdown.jsx:87: <button
src/components/phone/PhoneDropdown.jsx:105: <button type="button" className="top-bar-settings-button phone-dd__disposition-pill"
src/components/sep/CountyGrid.jsx:46: <button
src/components/sep/CountyPenetration.jsx:31: <button type="button" className={`tab${layer === 'penetration' ? ' active' : ''}`} onClick={() => setLayer('penetration')}>MA penetration</button>
src/components/sep/CountyPenetration.jsx:32: <button type="button" className={`tab${layer === 'counties' ? ' active' : ''}`} onClick={() => setLayer('counties')}>Counties</button>
src/components/sep/CountyPenetration.jsx:43: fillRule="evenodd" role="button" tabIndex={0} aria-label={`${path.county}: ${penetrationLabel(row)}`}
src/components/sep/FemaFeed.jsx:93: <button
src/components/sep/FemaFeed.jsx:200: <button
src/components/sep/FemaFeed.jsx:254: <button
src/components/sep/FemaFeed.jsx:267: <button
src/components/sep/FemaFeed.jsx:277: <button
src/components/sep/FemaFeed.jsx:303: <button
src/components/sep/FemaFeed.jsx:347: <button
src/components/sep/PlanTable.jsx:87: <button
src/components/sep/SearchBar.jsx:17: <button className="primary" onClick={handleSearch} disabled={!isValidZip || loading}>
src/components/sep/SearchBar.jsx:27: <button key={z} className="sep-quick-zip-btn" onClick={() => setZip(z)}>
src/components/sep/StatsBar.jsx:47: <button key={k} className={`tab${activeTab === k ? " active" : ""}`} onClick={() => setActiveTab(k)}>
src/flows/aca/ACAFlow.jsx:101: <button
src/flows/aca/ACAFlow.jsx:285: <button
src/flows/aca/ACAFlow.jsx:593: <button
src/flows/aca/ACAFlow.jsx:657: <button className="primary script-start-call-button" onClick={() => dispatch({ type: "START_CALL" })} style={{
src/flows/aca/ACAScript.jsx:68: <button
src/flows/aca/StateACAFlow.jsx:105: <button
src/flows/aca/StateACAFlow.jsx:379: <button
src/flows/aca/StateACAFlow.jsx:484: <button
src/flows/ancillary/AncillaryFlow.jsx:749: <button
src/flows/ancillary/AncillaryFlow.jsx:819: <button
src/flows/ancillary/AncillaryFlow.jsx:1293: <button
src/flows/ancillary/AncillaryFlow.jsx:1484: <button
src/flows/ancillary/AncillaryFlow.jsx:1522: <button
src/flows/ancillary/AncillaryFlow.jsx:1598: <button
src/flows/u65/U65Flow.jsx:269: <button
src/flows/u65/U65Flow.jsx:306: <button
src/flows/u65/U65Flow.jsx:362: <button
src/flows/u65/U65Flow.jsx:394: <button
src/flows/u65/U65Flow.jsx:517: <button
src/flows/u65/U65Flow.jsx:605: <button
src/flows/u65/U65Flow.jsx:762: <button
src/flows/u65/U65Flow.jsx:802: <button
src/flows/u65/U65Flow.jsx:814: <button
src/flows/u65/U65Flow.jsx:840: <button
src/flows/u65/U65Flow.jsx:849: <button type="button" onClick={resetFlow}>New Call</button>
src/flows/u65/U65Script.jsx:73: <button
```

## Typography
```text
src/AgentTools.css:5: font-family: var(--font-primary);
src/AgentTools.css:34: font-family: var(--font-primary);
src/AgentTools.css:36: font-weight: 700;
src/AgentTools.css:90: font-family: var(--font-primary);
src/AgentTools.css:92: font-weight: 500;
src/AgentTools.css:99: font-weight: 400;
src/AgentTools.css:129: font-family: var(--font-primary);
src/AgentTools.css:131: font-weight: 700;
src/AgentTools.css:205: font-family: var(--font-primary);
src/AgentTools.css:207: font-weight: 800;
src/AgentTools.css:279: font-family: var(--font-primary);
src/AgentTools.css:281: font-weight: 700;
src/AgentTools.css:289: font-family: var(--font-primary);
src/AgentTools.css:291: font-weight: 800;
src/AgentTools.css:368: font-weight: 600;
src/AgentTools.css:426: font-family: var(--font-primary);
src/AgentTools.css:427: font-weight: 700;
src/AgentTools.css:464: font-family: var(--font-primary);
src/AgentTools.css:466: font-weight: 500;
src/AgentTools.css:550: font-weight: 600;
src/AgentTools.css:555: font-family: var(--font-primary);
src/AgentTools.css:557: font-weight: 700;
src/AgentTools.css:583: font-family: var(--font-primary);
src/AgentTools.css:585: font-weight: 800;
src/AgentTools.css:593: font-family: var(--font-mono);
src/AgentTools.css:595: font-weight: 600;
src/AgentTools.css:620: font-weight: 600;
src/AgentTools.css:625: font-family: var(--font-mono);
src/AgentTools.css:642: font-family: var(--font-primary);
src/AgentTools.css:644: font-weight: 700;
src/AgentTools.css:664: font-weight: 700;
src/AgentTools.css:715: font-weight: 600;
src/AgentTools.css:762: font-family: var(--font-primary);
src/AgentTools.css:764: font-weight: 700;
src/AgentTools.css:784: font-family: var(--font-primary);
src/AgentTools.css:786: font-weight: 700;
src/AgentTools.css:807: font-family: var(--font-primary);
src/AgentTools.css:808: font-weight: 800;
src/AgentTools.css:841: font-family: var(--font-primary);
src/AgentTools.css:843: font-weight: 700;
src/AgentTools.css:884: font-weight: 700;
src/AgentTools.css:989: font-family: var(--font-mono);
src/AgentTools.css:991: font-weight: 700;
src/AgentTools.css:1012: font-weight: 700;
src/AgentTools.css:1018: font-weight: 600;
src/AgentTools.css:1080: font-family: var(--font-primary);
src/AgentTools.css:1082: font-weight: 800;
src/AgentTools.css:1133: font-family: var(--font-primary);
src/AgentTools.css:1135: font-weight: 800;
src/AgentTools.css:1172: font-family: var(--font-primary);
src/AgentTools.css:1174: font-weight: 800;
src/AgentTools.css:1202: font-family: var(--font-primary);
src/AgentTools.css:1204: font-weight: 800;
src/AgentTools.css:1236: font-family: var(--font-primary);
src/AgentTools.css:1238: font-weight: 800;
src/AgentTools.css:1275: font-family: var(--font-primary);
src/AgentTools.css:1277: font-weight: 800;
src/AgentTools.css:1375: font-family: var(--font-primary);
src/AgentTools.css:1377: font-weight: 800;
src/AgentTools.css:1426: font-family: var(--font-primary);
src/AgentTools.css:1428: font-weight: 800;
src/AgentTools.css:1579: font-family: var(--font-primary);
src/AgentTools.css:1611: font-family: var(--font-primary);
src/AgentTools.css:1613: font-weight: 700;
src/AgentTools.css:1637: font-family: var(--font-primary);
src/AgentTools.css:1669: font-family: var(--font-primary);
src/AgentTools.css:1671: font-weight: 700;
src/AgentTools.css:1690: font-family: var(--font-primary);
src/AgentTools.css:1692: font-weight: 700;
src/AgentTools.css:1705: font-family: var(--font-primary);
src/AgentTools.css:1707: font-weight: 700;
src/AgentTools.css:1714: font-family: var(--font-primary);
src/AgentTools.css:1758: font-family: var(--font-primary);
src/AgentTools.css:1760: font-weight: 600;
src/AgentTools.css:1771: font-family: var(--font-primary);
src/AgentTools.css:1773: font-weight: 700;
src/AgentTools.css:1792: font-family: var(--font-primary);
src/AgentTools.css:1834: font-family: var(--font-primary);
src/AgentTools.css:1836: font-weight: 700;
src/AgentTools.css:1856: font-family: var(--font-mono);
src/AgentTools.css:1875: font-family: var(--font-mono) !important;
src/AgentTools.css:1877: font-weight: 800 !important;
src/AgentTools.css:1909: font-family: var(--font-mono);
src/AgentTools.css:1964: font-family: var(--font-mono);
src/AgentTools.css:1966: font-weight: 800;
src/AgentTools.css:1973: font-family: var(--font-mono);
src/AgentTools.css:1995: font-family: var(--font-mono);
src/AgentTools.css:2006: font-family: var(--font-mono);
src/AgentTools.css:2013: font-family: var(--font-mono);
src/AgentTools.css:2020: font-family: var(--font-mono);
src/AgentTools.css:2086: font-family: var(--font-mono);
src/AgentTools.css:2098: font-family: var(--font-mono);
src/AgentTools.css:2108: font-family: var(--font-mono);
src/AgentTools.css:2128: font-family: var(--font-mono);
src/AgentTools.css:2145: font-family: var(--font-mono);
src/AgentTools.css:2172: font-family: var(--font-mono);
src/AgentTools.css:2174: font-weight: 800;
src/AgentTools.css:2217: font-family: var(--font-mono);
src/AgentTools.css:2238: font-family: var(--font-mono);
src/AgentTools.css:2265: font-weight: 900;
src/AgentTools.css:2306: font-family: var(--font-mono);
src/AgentTools.css:2308: font-weight: 900;
src/AgentTools.css:2352: font-family: var(--font-mono);
src/AgentTools.css:2354: font-weight: 900;
src/AgentTools.css:2390: font-weight: 800;
src/AgentTools.css:2402: font-weight: 700;
src/AgentTools.css:2448: font-weight: 800;
src/App.jsx:121: fontFamily: "var(--font-primary)",
src/App.jsx:142: fontFamily: "var(--font-primary)",
src/App.jsx:144: fontWeight: 600,
src/App.jsx:151: fontFamily: "var(--font-primary)",
src/App.jsx:161: fontFamily: "var(--font-primary)",
src/App.jsx:163: fontWeight: 500,
src/App.jsx:170: fontFamily: SYSTEM_MONO_STACK,
src/App.jsx:177: fontFamily: SYSTEM_MONO_STACK,
src/App.jsx:179: fontWeight: 500,
src/App.jsx:189: fontFamily: "var(--font-primary)",
src/App.jsx:198: fontFamily: SYSTEM_MONO_STACK,
src/App.jsx:200: fontWeight: 500,
src/App.jsx:210: fontWeight: 500,
src/SEPLookupTool.css:10: font-family: var(--font-primary);
src/SEPLookupTool.css:37: font-weight: 600;
src/SEPLookupTool.css:41: font-family: var(--font-mono);
src/SEPLookupTool.css:88: font-family: var(--font-mono);
src/SEPLookupTool.css:98: font-family: var(--font-mono);
src/SEPLookupTool.css:100: font-weight: 600;
src/SEPLookupTool.css:162: font-weight: 700;
src/SEPLookupTool.css:166: font-family: var(--font-mono);
src/SEPLookupTool.css:174: font-weight: 700;
src/SEPLookupTool.css:175: font-family: var(--font-mono);
src/SEPLookupTool.css:198: font-weight: 700;
src/SEPLookupTool.css:202: font-family: var(--font-mono);
src/SEPLookupTool.css:245: font-weight: 700;
src/SEPLookupTool.css:250: font-family: var(--font-mono);
src/SEPLookupTool.css:292: font-weight: 600;
src/SEPLookupTool.css:318: font-weight: 700;
src/SEPLookupTool.css:323: font-family: var(--font-mono);
src/SEPLookupTool.css:328: font-weight: 600;
src/SEPLookupTool.css:333: font-family: var(--font-mono);
src/SEPLookupTool.css:342: font-weight: 700;
src/SEPLookupTool.css:343: font-family: var(--font-primary);
src/SEPLookupTool.css:357: font-weight: 700;
src/SEPLookupTool.css:369: font-weight: 600;
src/SEPLookupTool.css:373: font-family: var(--font-mono);
src/SEPLookupTool.css:489: font-weight: 700;
src/SEPLookupTool.css:494: font-family: var(--font-mono);
src/SEPLookupTool.css:521: font-weight: 700;
src/SEPLookupTool.css:526: font-family: var(--font-mono);
src/SEPLookupTool.css:543: font-weight: 700;
src/SEPLookupTool.css:547: font-family: var(--font-mono);
src/SEPLookupTool.css:584: font-weight: 700;
src/SEPLookupTool.css:596: font-weight: 600;
src/SEPLookupTool.css:603: font-family: var(--font-mono);
src/SEPLookupTool.css:662: font-weight: 700;
src/SEPLookupTool.css:713: font-weight: 700;
src/SEPLookupTool.css:781: font-family: var(--font-primary);
src/SEPLookupTool.css:782: font-weight: 700;
src/SEPLookupTool.css:801: font-family: var(--font-mono);
src/SEPLookupTool.css:811: font-family: var(--font-primary);
src/SEPLookupTool.css:812: font-weight: 800;
src/SEPLookupTool.css:821: font-weight: 700;
src/SEPLookupTool.css:841: font-weight: 700;
src/SEPLookupTool.css:842: font-family: var(--font-primary);
src/SEPLookupTool.css:885: font-family: var(--font-primary);
src/SEPLookupTool.css:887: font-weight: 700;
src/SEPLookupTool.css:926: font-weight: 700;
src/SEPLookupTool.css:934: font-family: var(--font-mono);
src/SEPLookupTool.css:959: font-family: var(--font-primary);
src/SEPLookupTool.css:960: font-weight: 700;
src/SEPLookupTool.css:969: font-family: var(--font-mono);
src/SEPLookupTool.css:971: font-weight: 700;
src/SEPLookupTool.css:995: font-family: var(--font-primary);
src/SEPLookupTool.css:1034: font-weight: 600;
src/SEPLookupTool.css:1060: font-family: var(--font-mono);
src/SEPLookupTool.css:1062: font-weight: 700;
src/SEPLookupTool.css:1103: font-weight: 700;
src/SEPLookupTool.css:1142: font-family: var(--font-mono);
src/SEPLookupTool.css:1210: font-family: var(--font-primary);
src/SEPLookupTool.css:1211: font-weight: 600;
src/SEPLookupTool.css:1270: font-family: var(--font-mono);
src/SEPLookupTool.css:1283: font-family: var(--font-mono);
src/SEPLookupTool.css:1325: font-family: var(--font-primary);
src/SEPLookupTool.css:1326: font-weight: 700;
src/SEPLookupTool.css:1348: font-weight: 700;
src/SEPLookupTool.css:1349: font-family: var(--font-mono);
src/SEPLookupTool.css:1376: font-family: var(--font-primary);
src/SEPLookupTool.css:1377: font-weight: 700;
src/SEPLookupTool.css:1386: font-family: var(--font-mono);
src/SEPLookupTool.css:1388: font-weight: 700;
src/SEPLookupTool.css:1449: font-family: var(--font-primary);
src/SEPLookupTool.css:1451: font-weight: 700;
src/SEPLookupTool.css:1472: font-family: var(--font-mono);
src/SEPLookupTool.css:1474: font-weight: 700;
src/SEPLookupTool.css:1480: font-family: var(--font-mono);
src/SEPLookupTool.css:1488: font-weight: 600;
src/SEPLookupTool.css:1518: font-family: var(--font-primary);
src/SEPLookupTool.css:1520: font-weight: 700;
src/SEPLookupTool.css:1531: font-family: var(--font-mono);
src/SEPLookupTool.css:1533: font-weight: 700;
src/SEPLookupTool.css:1538: font-family: var(--font-mono);
src/SEPLookupTool.css:1546: font-family: var(--font-primary);
src/SEPLookupTool.css:1548: font-weight: 700;
src/SEPLookupTool.css:1559: font-family: var(--font-primary);
src/SEPLookupTool.css:1561: font-weight: 700;
src/SEPLookupTool.css:1589: font-family: var(--font-mono);
src/SEPLookupTool.css:1595: font-family: var(--font-mono);
src/SEPLookupTool.css:1597: font-weight: 600;
src/SEPLookupTool.css:1606: font-weight: 600;
src/SEPLookupTool.css:1626: font-weight: 600;
src/SEPLookupTool.css:1627: font-family: var(--font-mono);
src/SEPLookupTool.css:1642: font-family: var(--font-mono);
src/components/ACAIntelligence.jsx:63: fontFamily: "var(--eg-font-mono)",
src/components/ACAIntelligence.jsx:64: fontWeight: 500,
src/components/ACAIntelligence.jsx:70: const mono = { fontFamily: "var(--eg-font-mono)", fontWeight: 500 };
src/components/ACAIntelligence.jsx:341: fontFamily: "var(--font-primary)", fontWeight: 800,
src/components/ACAIntelligence.jsx:531: fontFamily: "var(--font-primary)", fontWeight: 700,
src/components/ACAIntelligence.jsx:547: fontFamily: "var(--font-mono)",
src/components/ACAIntelligence.jsx:557: fontFamily: "var(--font-primary)",
src/components/ACAIntelligence.jsx:558: fontWeight: 800,
src/components/CallHistory.jsx:68: <span style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-primary)" }}>
src/components/CallHistory.jsx:78: <span style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-primary)" }}>
src/components/CallHistory.jsx:88: <span style={{ color: "var(--danger)", fontSize: 13, fontFamily: "var(--font-primary)" }}>
src/components/CallHistory.jsx:98: <span style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-primary)" }}>
src/components/CallHistory.jsx:109: fontFamily: "var(--font-primary)",
src/components/CallHistory.jsx:110: fontWeight: 700,
src/components/CallHistory.jsx:121: fontFamily: "var(--font-primary)",
src/components/CallHistory.jsx:122: fontWeight: 500,
src/components/CallHistory.jsx:136: fontFamily: "var(--font-primary)",
src/components/CallHistory.jsx:137: fontWeight: 700,
src/components/CallHistory.jsx:193: fontWeight: 700,
src/components/CarrierRef.jsx:136: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:137: fontWeight: 800,
src/components/CarrierRef.jsx:150: fontFamily: "var(--font-mono)",
src/components/CarrierRef.jsx:152: fontWeight: 700,
src/components/CarrierRef.jsx:189: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:218: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:247: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:248: fontWeight: 700,
src/components/CarrierRef.jsx:295: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:296: fontWeight: 800,
src/components/CarrierRef.jsx:313: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:314: fontWeight: 800,
src/components/CarrierRef.jsx:330: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:354: fontFamily: "var(--font-mono)",
src/components/CarrierRef.jsx:356: fontWeight: 800,
src/components/CarrierRef.jsx:364: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:366: fontWeight: 700,
src/components/CarrierRef.jsx:383: fontFamily: "var(--font-mono)",
src/components/CarrierRef.jsx:410: fontFamily: "var(--font-primary)", fontWeight: 800,
src/components/CarrierRef.jsx:423: fontFamily: "var(--font-primary)", whiteSpace: "nowrap",
src/components/CarrierRef.jsx:446: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:447: fontWeight: 700,
src/components/CarrierRef.jsx:722: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:723: fontWeight: 700,
src/components/CarrierRef.jsx:747: fontFamily: "var(--font-mono)",
src/components/CarrierRef.jsx:864: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:865: fontWeight: 800,
src/components/CarrierRef.jsx:900: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:901: fontWeight: 800,
src/components/CarrierRef.jsx:936: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:937: fontWeight: 700,
src/components/CarrierRef.jsx:949: fontFamily: "var(--font-mono)",
src/components/CarrierRef.jsx:950: fontWeight: 700,
src/components/CarrierRef.jsx:983: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:984: fontWeight: 800,
src/components/CarrierRef.jsx:1066: fontFamily: "var(--font-mono)",
src/components/CarrierRef.jsx:1101: fontFamily: "var(--font-primary)", fontWeight: 800,
src/components/CarrierRef.jsx:1110: fontFamily: "var(--font-primary)", fontWeight: 800,
src/components/CarrierRef.jsx:1120: padding: "4px 8px", fontSize: "0.7rem", fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:1135: fontFamily: "var(--font-mono)", fontSize: "1.4rem",
src/components/CarrierRef.jsx:1136: fontWeight: 800, color: "var(--accent)",
src/components/CarrierRef.jsx:1141: fontFamily: "var(--font-primary)", fontSize: "0.56rem",
src/components/CarrierRef.jsx:1142: fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
src/components/CarrierRef.jsx:1159: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:1160: fontWeight: 800,
src/components/CarrierRef.jsx:1183: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:1184: fontWeight: 700,
src/components/CarrierRef.jsx:1202: fontFamily: "var(--font-primary)", fontWeight: 800,
src/components/CarrierRef.jsx:1217: fontFamily: "var(--font-primary)", whiteSpace: "nowrap",
src/components/CarrierRef.jsx:1229: fontFamily: "var(--font-mono)",
src/components/CarrierRef.jsx:1260: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:1261: fontWeight: 800,
src/components/CarrierRef.jsx:1295: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:1296: fontWeight: 700,
src/components/CarrierRef.jsx:1319: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:1320: fontWeight: 700,
src/components/CarrierRef.jsx:1350: fontFamily: "var(--font-primary)",
src/components/CarrierRef.jsx:1351: fontWeight: 800,
src/components/CarrierRef.jsx:1388: fontFamily: "var(--font-mono)",
src/components/CollapsibleWidget.jsx:122: fontFamily: "var(--eg-font-mono)",
src/components/CollapsibleWidget.jsx:124: fontWeight: 500,
src/components/ComplianceDashboard.jsx:148: fontWeight="700"
src/components/ComplianceDashboard.jsx:192: fontFamily: "var(--font-primary)",
src/components/ComplianceDashboard.jsx:194: fontWeight: 700,
src/components/ComplianceDashboard.jsx:221: fontWeight: 700,
src/components/ComplianceDashboard.jsx:283: fontWeight: 700,
src/components/ComplianceDashboard.jsx:323: fontWeight: isViolation ? 600 : 400,
src/components/ComplianceDashboard.jsx:510: fontFamily: "var(--font-primary)",
src/components/ComplianceDashboard.jsx:512: fontWeight: 700,
src/components/ComplianceDashboard.jsx:521: fontFamily: "var(--font-primary)",
src/components/ComplianceDashboard.jsx:523: fontWeight: 800,
src/components/ComplianceDashboard.jsx:534: fontFamily: "var(--font-primary)",
src/components/ComplianceDashboard.jsx:535: fontWeight: 700,
src/components/ComplianceDashboard.jsx:552: <div style={{ fontSize: "0.68em", color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
src/components/ComplianceDashboard.jsx:626: fontWeight: 600,
src/components/ComplianceDashboard.jsx:638: fontWeight: 800,
src/components/ComplianceDashboard.jsx:683: fontFamily: "var(--font-primary)",
src/components/ComplianceDashboard.jsx:685: fontWeight: 700,
src/components/ComplianceDashboard.jsx:706: fontWeight: 700,
src/components/ComplianceDashboard.jsx:722: fontWeight: 600,
src/components/ComplianceDashboard.jsx:750: fontFamily: "var(--font-primary)",
src/components/ComplianceDashboard.jsx:752: fontWeight: 700,
src/components/ComplianceDashboard.jsx:798: fontWeight: 700,
src/components/ComplianceDashboard.jsx:828: <span style={{ color: "var(--danger)", fontWeight: 700 }}>
src/components/ComplianceDashboard.jsx:854: fontWeight: 700,
src/components/ComplianceMini.jsx:150: fontWeight: 800,
src/components/ComplianceMini.jsx:204: fontWeight: 700,
src/components/ComplianceMini.jsx:268: fontWeight: isActiveCategory ? 700 : undefined,
src/components/ComplianceMini.jsx:304: fontWeight: 700,
src/components/ComplianceMini.jsx:342: fontWeight: 600,
src/components/FplCalculatorPanel.jsx:16: fontFamily: "var(--font-primary)",
src/components/FplCalculatorPanel.jsx:65: fontWeight: 700,
src/components/FplCalculatorPanel.jsx:178: fontWeight: 700,
src/components/FplCalculatorPanel.jsx:180: fontFamily: "var(--font-primary)",
src/components/FplCalculatorPanel.jsx:208: fontWeight: 700,
src/components/FplCalculatorPanel.jsx:210: fontFamily: "var(--font-primary)",
src/components/FplCalculatorPanel.jsx:254: fontWeight: 700,
src/components/FplCalculatorPanel.jsx:299: fontWeight: 800,
src/components/FplCalculatorPanel.jsx:301: fontFamily: "var(--font-primary)",
src/components/FplCalculatorPanel.jsx:312: fontWeight: 600,
src/components/FplCalculatorPanel.jsx:338: fontWeight: 700,
src/components/FplCalculatorPanel.jsx:349: fontWeight: 800,
src/components/FplCalculatorPanel.jsx:351: fontFamily: "var(--font-primary)",
src/components/LandingPage.css:4: font-family: var(--font-primary);
src/components/LandingPage.css:10: font-family: var(--font-primary);
src/components/LandingPage.css:12: font-weight: 300;
src/components/LandingPage.css:51: font-family: "Formula1", var(--font-primary);
src/components/LandingPage.css:52: font-weight: 700;
src/components/LandingPage.css:75: font-family: var(--font-primary);
src/components/LandingPage.css:77: font-weight: 500;
src/components/LandingPage.css:99: font-family: var(--font-primary);
src/components/LandingPage.css:101: font-weight: 500;
src/components/LandingPage.css:188: font-family: var(--font-mono);
src/components/LandingPage.css:190: font-weight: 400;
src/components/LandingPage.css:206: font-family: var(--font-primary);
src/components/LandingPage.css:208: font-weight: 700;
src/components/LandingPage.css:227: font-family: var(--font-primary);
src/components/LandingPage.css:229: font-weight: 300;
src/components/LandingPage.css:288: font-family: var(--font-mono);
src/components/LandingPage.css:290: font-weight: 500;
src/components/LandingPage.css:343: font-family: var(--font-mono);
src/components/LandingPage.css:345: font-weight: 500;
src/components/LandingPage.css:370: font-family: var(--font-mono);
src/components/LandingPage.css:378: font-family: var(--font-mono);
src/components/LandingPage.css:380: font-weight: 700;
src/components/LandingPage.css:403: font-family: var(--font-mono);
src/components/LandingPage.css:419: font-family: var(--font-mono);
src/components/LandingPage.css:489: font-family: var(--font-mono);
src/components/LandingPage.css:491: font-weight: 500;
src/components/LandingPage.css:499: font-family: var(--font-primary);
src/components/LandingPage.css:501: font-weight: 300;
src/components/LandingPage.css:520: font-family: var(--font-primary);
src/components/LandingPage.css:522: font-weight: 300;
src/components/LandingPage.css:589: font-family: var(--font-primary) !important;
src/components/LandingPage.css:602: font-family: var(--eg-font-mono) !important;
src/components/LandingPage.css:605: font-weight: 500 !important;
src/components/LandingPage.css:617: font-family: var(--eg-font-mono) !important;
src/components/LandingPage.css:619: font-weight: 500 !important;
src/components/LandingPage.css:654: font-family: var(--eg-font-mono);
src/components/LandingPage.css:656: font-weight: 500;
src/components/LandingPage.css:679: font-family: var(--font-primary) !important;
src/components/LandingPage.css:680: font-weight: 400 !important;
src/components/LandingPage.css:689: font-family: var(--font-primary) !important;
src/components/LandingPage.css:695: font-weight: 400 !important;
src/components/LandingPage.css:708: font-family: var(--eg-font-mono) !important;
src/components/LandingPage.css:722: font-weight: 500;
src/components/LandingPage.css:740: font-family: var(--eg-font-mono) !important;
src/components/LandingPage.css:752: font-family: var(--font-primary);
src/components/LandingPage.css:765: font-family: var(--eg-font-mono);
src/components/LandingPage.css:767: font-weight: 500;
src/components/LandingPage.css:784: font-family: var(--font-primary) !important;
src/components/LandingPage.css:822: font-family: var(--font-primary);
src/components/LandingPage.css:828: font-family: var(--eg-font-mono);
src/components/LandingPage.css:830: font-weight: 500;
src/components/LandingPage.css:869: font-family: var(--eg-font-mono) !important;
src/components/LandingPage.css:879: font-family: var(--font-primary) !important;
src/components/LandingPage.css:966: font-family: var(--eg-font-mono) !important;
src/components/LandingPage.css:968: font-weight: 500 !important;
src/components/LandingPage.css:1005: font-family: var(--font-primary) !important;
src/components/LandingPage.css:1007: font-weight: 400 !important;
src/components/MedSupFlow.jsx:170: fontWeight: 700,
src/components/MedSupFlow.jsx:191: <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
src/components/MedSupFlow.jsx:198: fontWeight: 700,
src/components/MedSupFlow.jsx:274: <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-live)" }}>
src/components/MedSupFlow.jsx:287: fontWeight: 600,
src/components/MedSupFlow.jsx:289: fontFamily: "var(--font-primary)",
src/components/MedSupFlow.jsx:386: style={{ fontFamily: "var(--font-primary)" }}
src/components/MedSupFlow.jsx:410: fontFamily: "var(--font-primary)",
src/components/MedSupFlow.jsx:411: fontWeight: 700,
src/components/MiniLiveTranscript.jsx:46: fontFamily: "var(--font-mono)",
src/components/MiniLiveTranscript.jsx:48: fontWeight: 700,
src/components/MiniLiveTranscript.jsx:186: fontFamily: "var(--font-primary)",
src/components/MiniLiveTranscript.jsx:193: fontWeight: 800,
src/components/MiniLiveTranscript.jsx:194: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:139: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:140: fontWeight: 700,
src/components/SEPGuide2026.jsx:393: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:395: fontWeight: 700,
src/components/SEPGuide2026.jsx:430: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:512: <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--font-primary)", color: isFail ? "var(--status-offline)" : isEnsure ? "var(--status-pending)" : "var(--status-live)" }}>
src/components/SEPGuide2026.jsx:528: fontWeight: 600,
src/components/SEPGuide2026.jsx:566: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:577: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:579: fontWeight: 700,
src/components/SEPGuide2026.jsx:656: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:657: fontWeight: 600,
src/components/SEPGuide2026.jsx:693: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:694: fontWeight: 700,
src/components/SEPGuide2026.jsx:750: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:755: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:757: fontWeight: 800,
src/components/SEPGuide2026.jsx:810: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:812: fontWeight: 800,
src/components/SEPGuide2026.jsx:847: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:849: fontWeight: 700,
src/components/SEPGuide2026.jsx:862: fontFamily: "var(--font-primary)",
src/components/SEPGuide2026.jsx:864: fontWeight: 700,
src/components/SEPLookup.jsx:72: <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
src/components/SEPLookup.jsx:269: <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
src/components/SEPLookup.jsx:291: <div style={{ fontSize: 16, fontWeight: 600 }}>No SEPs match current filters</div>
src/components/SEPResultsModal.css:51: font-family: var(--font-primary);
src/components/SEPResultsModal.css:52: font-weight: 700;
src/components/SEPResultsModal.css:114: font-family: var(--font-primary);
src/components/SEPResultsModal.css:115: font-weight: 700;
src/components/SEPResultsModal.css:153: font-family: var(--font-mono);
src/components/ScriptEditor.css:6: font-family: var(--font-primary);
src/components/ScriptEditor.css:14: font-family: var(--font-primary);
src/components/ScriptEditor.css:16: font-weight: 400;
src/components/ScriptEditor.css:26: font-family: var(--eg-font-mono);
src/components/ScriptEditor.css:68: font-family: var(--eg-font-mono);
src/components/ScriptEditor.css:70: font-weight: 500;
src/components/ScriptEditor.css:143: font-family: var(--eg-font-mono);
src/components/ScriptEditor.css:181: font-family: var(--eg-font-mono);
src/components/ScriptEditor.css:183: font-weight: 500;
src/components/ScriptEditor.css:214: font-family: var(--font-primary);
src/components/ScriptEditor.css:216: font-weight: 500;
src/components/ScriptEditor.css:232: font-family: var(--font-primary);
src/components/ScriptEditor.css:242: font-family: var(--eg-font-mono);
src/components/ScriptEditor.css:264: font-family: var(--eg-font-mono);
src/components/ScriptEditor.css:271: font-family: var(--font-primary);
src/components/sep/PlanTable.jsx:29: <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
src/components/sep/PlanTable.jsx:139: <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
src/components/sep/PlanTable.jsx:151: <td className="text-right nowrap" style={{ fontWeight: 700, color: p.prem === 0 ? "var(--accent-green)" : "var(--text-primary)" }}>
src/components/sep/PlanTable.jsx:207: <div style={{ fontSize: 14, fontWeight: 600 }}>No plans match current filters</div>
src/components/sep/SEPCard.jsx:69: <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
src/components/sep/SEPCard.jsx:148: <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{cr.abbr}</span>
src/components/sep/SEPCard.jsx:151: <td style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", maxWidth: 200 }}>{p.name}</td>
src/components/sep/SEPCard.jsx:158: <td className="text-right" style={{ fontWeight: 700, color: p.prem === 0 ? "var(--accent-green)" : "var(--text-primary)", fontSize: 11 }}>
src/components/sep/SEPCard.jsx:161: <td className="text-right" style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>
src/components/sep/StateMap.jsx:106: fontFamily: "var(--font-primary)",
src/components/sep/StateMap.jsx:107: fontWeight: 800,
src/components/sep/StateMap.jsx:138: fontFamily: "var(--font-primary)",
src/components/sep/StateMap.jsx:139: fontWeight: 800,
src/components/sep/StatsBar.jsx:27: <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
src/flows/aca/ACAFlow.jsx:73: fontWeight: 600,
src/flows/aca/ACAFlow.jsx:147: fontWeight: 700,
src/flows/aca/ACAFlow.jsx:188: fontWeight: 700,
src/flows/aca/ACAFlow.jsx:209: <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
src/flows/aca/ACAFlow.jsx:214: fontWeight: 700,
src/flows/aca/ACAFlow.jsx:280: <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
src/flows/aca/ACAFlow.jsx:296: fontWeight: 600,
src/flows/aca/ACAFlow.jsx:298: fontFamily: "var(--font-primary)",
src/flows/aca/ACAFlow.jsx:358: <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
src/flows/aca/ACAFlow.jsx:366: <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border-default)", fontSize: 11 }}>
src/flows/aca/ACAFlow.jsx:415: <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
src/flows/aca/ACAFlow.jsx:423: <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 600, borderBottom: "1px solid var(--border-default)", fontSize: 11 }}>
src/flows/aca/ACAFlow.jsx:433: <td style={{ padding: "7px 10px", color: ACCENT, fontWeight: 400, whiteSpace: "nowrap" }}>{row.range}</td>
src/flows/aca/ACAFlow.jsx:476: <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
src/flows/aca/ACAFlow.jsx:592: <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-live)" }}>ACA Enrollment Complete</div>
src/flows/aca/ACAFlow.jsx:603: fontWeight: 600,
src/flows/aca/ACAFlow.jsx:605: fontFamily: "var(--font-primary)",
src/flows/aca/ACAFlow.jsx:647: style={{ fontFamily: "var(--font-primary)" }}
src/flows/aca/ACAFlow.jsx:658: fontSize: 15, fontFamily: "var(--font-primary)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 36px",
src/flows/aca/ACAScript.jsx:82: fontFamily: "var(--font-primary)",
src/flows/aca/ACAScript.jsx:105: fontWeight: 700,
src/flows/aca/ACAScript.jsx:107: fontFamily: "var(--font-primary)",
src/flows/aca/StateACAFlow.jsx:153: fontWeight: 700,
src/flows/aca/StateACAFlow.jsx:202: fontWeight: 700,
src/flows/aca/StateACAFlow.jsx:217: <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
src/flows/aca/StateACAFlow.jsx:360: style={{ fontFamily: "var(--font-primary)" }}
src/flows/aca/StateACAFlow.jsx:384: fontFamily: "var(--font-primary)",
src/flows/aca/StateACAFlow.jsx:385: fontWeight: 700,
src/flows/aca/StateACAFlow.jsx:480: style={{ fontSize: 16, fontWeight: 700, color: "var(--status-live)" }}
src/flows/aca/StateACAFlow.jsx:494: fontWeight: 600,
src/flows/aca/StateACAFlow.jsx:496: fontFamily: "var(--font-primary)",
src/flows/ancillary/AncillaryFlow.jsx:786: fontFamily: "var(--font-mono)",
src/flows/ancillary/AncillaryFlow.jsx:802: fontWeight: 800,
src/flows/ancillary/AncillaryFlow.jsx:946: fontFamily: "var(--font-mono)",
src/flows/ancillary/AncillaryFlow.jsx:964: fontFamily: "var(--font-mono)",
src/flows/ancillary/AncillaryFlow.jsx:991: fontFamily: "var(--font-mono)",
src/flows/ancillary/AncillaryFlow.jsx:1008: fontWeight: 800,
src/flows/ancillary/AncillaryFlow.jsx:1021: fontWeight: 800,
src/flows/ancillary/AncillaryFlow.jsx:1044: fontWeight: 700,
src/flows/ancillary/AncillaryFlow.jsx:1100: fontFamily: "var(--font-mono)",
src/flows/ancillary/AncillaryFlow.jsx:1107: fontWeight: 800,
src/flows/ancillary/AncillaryFlow.jsx:1150: fontFamily: "var(--font-mono)",
src/flows/ancillary/AncillaryFlow.jsx:1342: fontWeight: 700,
src/flows/ancillary/AncillaryFlow.jsx:1386: fontWeight: 700,
src/flows/ancillary/AncillaryFlow.jsx:1397: <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
src/flows/ancillary/AncillaryFlow.jsx:1442: fontFamily: "var(--font-mono)",
src/flows/ancillary/AncillaryFlow.jsx:1481: <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-live)" }}>
src/flows/ancillary/AncillaryFlow.jsx:1495: fontWeight: 600,
src/flows/ancillary/AncillaryFlow.jsx:1497: fontFamily: "var(--font-primary)",
src/flows/ancillary/AncillaryFlow.jsx:1559: fontFamily: "var(--font-primary)",
src/flows/ancillary/AncillaryFlow.jsx:1561: fontWeight: 800,
src/flows/ancillary/AncillaryFlow.jsx:1572: fontWeight: 700,
src/flows/ancillary/AncillaryFlow.jsx:1604: fontFamily: "var(--font-primary)",
src/flows/ancillary/AncillaryFlow.jsx:1605: fontWeight: 700,
src/flows/ancillary/AncillaryFlow.jsx:1762: style={{ fontFamily: "var(--font-primary)" }}
src/flows/u65/U65Script.jsx:88: fontFamily: "var(--font-primary)",
src/flows/u65/U65Script.jsx:111: fontWeight: 700,
src/flows/u65/U65Script.jsx:113: fontFamily: "var(--font-primary)",
src/main.jsx:100: fontFamily: 'var(--font-primary)',
src/main.jsx:107: fontFamily: 'var(--font-primary)',
src/main.jsx:109: fontWeight: 600,
src/styles/phone-dropdown.css:39: font-family: var(--eg-font-mono);
src/styles/phone-dropdown.css:65: font-weight: 700;
src/styles/phone-dropdown.css:72: font-weight: 700;
src/styles/phone-dropdown.css:158: font-weight: 700;
src/styles/phone-dropdown.css:265: font-weight: 700;
src/styles/phone-dropdown.css:300: font-weight: 700;
src/styles/phone-dropdown.css:349: font-family: inherit;
src/styles/phone-dropdown.css:385: font-weight: 700;
src/styles/phone-dropdown.css:403: font-weight: 600;
src/styles/phone-dropdown.css:425: font-weight: 700;
src/styles/phone-dropdown.css:477: font-family: inherit;
src/styles/phone-dropdown.css:499: font-family: inherit;
src/styles/phone-dropdown.css:540: font-weight: 700;
src/styles/phone-dropdown.css:629: font-weight: 700;
src/styles/phone-dropdown.css:666: font-family: inherit;
src/styles/phone-dropdown.css:668: font-weight: 700;
src/styles/phone-dropdown.css:713: font-family: inherit;
src/styles/phone-dropdown.css:715: font-weight: 700;
src/styles/phone-dropdown.css:737: font-family: var(--font-primary);
src/styles/phone-dropdown.css:753: font-family: inherit;
src/styles/phone-dropdown.css:755: font-weight: 700;
src/styles/phone-dropdown.css:808: font-family: var(--eg-font-mono);
src/styles/public-shell.css:3: font-family: "Formula1";
src/styles/public-shell.css:5: font-weight: 700;
src/styles/public-shell.css:22: font-family: var(--font-primary);
src/styles/public-shell.css:67: font-family: var(--eg-font-mono);
src/styles/public-shell.css:73: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:18: font-family: var(--font-primary);
src/styles/v3-overrides.css:65: font-family: "Formula1", var(--font-primary);
src/styles/v3-overrides.css:66: font-weight: 700;
src/styles/v3-overrides.css:88: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:90: font-weight: 400 !important;
src/styles/v3-overrides.css:128: font-weight: 500 !important;
src/styles/v3-overrides.css:155: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:157: font-weight: 500 !important;
src/styles/v3-overrides.css:178: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:181: font-weight: 500 !important;
src/styles/v3-overrides.css:318: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:320: font-weight: 500;
src/styles/v3-overrides.css:353: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:376: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:378: font-weight: 600;
src/styles/v3-overrides.css:481: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:488: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:490: font-weight: 500 !important;
src/styles/v3-overrides.css:496: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:514: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:555: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:593: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:605: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:607: font-weight: 500 !important;
src/styles/v3-overrides.css:649: font-family: var(--font-primary);
src/styles/v3-overrides.css:657: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:666: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:674: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:683: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:739: font-weight: 500 !important;
src/styles/v3-overrides.css:755: font-family: var(--font-primary);
src/styles/v3-overrides.css:761: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:763: font-weight: 500 !important;
src/styles/v3-overrides.css:794: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:816: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:826: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:828: font-weight: 500 !important;
src/styles/v3-overrides.css:845: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:866: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:867: font-weight: 500 !important;
src/styles/v3-overrides.css:910: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:944: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:974: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:976: font-weight: 700;
src/styles/v3-overrides.css:1021: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:1089: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1113: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1150: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:1156: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1218: font-family: var(--font-primary);
src/styles/v3-overrides.css:1228: font-weight: 500;
src/styles/v3-overrides.css:1234: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:1238: font-weight: 400 !important;
src/styles/v3-overrides.css:1245: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1261: font-family: var(--font-primary);
src/styles/v3-overrides.css:1280: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1282: font-weight: 500 !important;
src/styles/v3-overrides.css:1352: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:1361: font-family: var(--font-primary);
src/styles/v3-overrides.css:1367: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1371: font-weight: 500 !important;
src/styles/v3-overrides.css:1397: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1399: font-weight: 500 !important;
src/styles/v3-overrides.css:1470: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1472: font-weight: 500 !important;
src/styles/v3-overrides.css:1516: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1567: font-family: var(--font-primary);
src/styles/v3-overrides.css:1610: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:1615: font-weight: 400 !important;
src/styles/v3-overrides.css:1632: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1634: font-weight: 500 !important;
src/styles/v3-overrides.css:1642: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1683: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:1685: font-weight: 400;
src/styles/v3-overrides.css:1705: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:1751: font-family: var(--font-primary);
src/styles/v3-overrides.css:1791: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:1836: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1874: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1907: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1909: font-weight: 500 !important;
src/styles/v3-overrides.css:1923: font-family: var(--eg-font-mono) !important;
src/styles/v3-overrides.css:1934: font-family: var(--font-primary) !important;
src/styles/v3-overrides.css:1936: font-weight: 400 !important;
src/styles/v3-overrides.css:2519: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2566: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2574: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2576: font-weight: 500;
src/styles/v3-overrides.css:2589: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2593: font-weight: 500;
src/styles/v3-overrides.css:2613: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2617: font-weight: 500;
src/styles/v3-overrides.css:2645: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2654: font-family: var(--font-primary);
src/styles/v3-overrides.css:2656: font-weight: 600;
src/styles/v3-overrides.css:2662: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2676: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2684: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2758: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2760: font-weight: 600;
src/styles/v3-overrides.css:2778: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2780: font-weight: 600;
src/styles/v3-overrides.css:2822: font-family: var(--font-primary);
src/styles/v3-overrides.css:2860: font-family: var(--font-primary);
src/styles/v3-overrides.css:2896: font-family: var(--font-primary);
src/styles/v3-overrides.css:2898: font-weight: 500;
src/styles/v3-overrides.css:2907: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2946: .eg-mono { font-family: var(--eg-font-mono); }
src/styles/v3-overrides.css:2947: .eg-body { font-family: var(--font-primary); }
src/styles/v3-overrides.css:2948: .eg-display { font-family: var(--font-primary); }
src/styles/v3-overrides.css:2951: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2959: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:2968: font-family: var(--eg-font-mono);
src/styles/v3-overrides.css:3418: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:3428: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:3449: font-family: inherit;
src/styles/v3-overrides.css:3469: font-family: inherit;
src/styles/v3-overrides.css:3577: font-family: inherit;
src/styles/v3-overrides.css:3603: font-family: inherit;
src/styles/v3-overrides.css:3698: font-family: inherit;
src/styles/v3-overrides.css:3783: font-family: inherit;
src/styles/v3-overrides.css:3835: font-family: inherit;
src/styles/v3-overrides.css:3852: font-weight: 400;
src/styles/v3-overrides.css:3880: font-family: inherit;
src/styles/v3-overrides.css:4112: font-family: inherit;
src/styles/v3-overrides.css:4184: font-family: inherit;
src/styles/v3-overrides.css:4233: font-family: var(--font-mono);
src/styles/v3-overrides.css:4235: font-weight: 700;
src/styles/v3-overrides.css:4275: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:4377: font-family: inherit;
src/styles/v3-overrides.css:4396: font-family: inherit;
src/styles/v3-overrides.css:4432: font-family: inherit;
src/styles/v3-overrides.css:4481: font-weight: 600;
src/styles/v3-overrides.css:4684: font-family: inherit;
src/styles/v3-overrides.css:4728: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:4773: font-weight: 600;
src/styles/v3-overrides.css:4812: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:4837: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:4861: font-family: inherit;
src/styles/v3-overrides.css:4879: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:4955: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:4995: font-family: inherit;
src/styles/v3-overrides.css:5027: font-family: inherit;
src/styles/v3-overrides.css:5048: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:5054: font-family: inherit;
src/styles/v3-overrides.css:5083: font-family: inherit;
src/styles/v3-overrides.css:5136: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:5154: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:5255: font-family: inherit;
src/styles/v3-overrides.css:5290: font-family: inherit;
src/styles/v3-overrides.css:5331: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:5341: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:5356: font-family: inherit;
src/styles/v3-overrides.css:5399: font-family: inherit;
src/styles/v3-overrides.css:5524: font-family: var(--font-mono, ui-monospace, monospace);
src/styles/v3-overrides.css:5789: font-weight: 700;
src/styles/v3-overrides.css:5794: font-weight: 700;
src/styles/v3-overrides.css:5928: font-weight: 700;
src/styles.css:36: font-family: var(--eg-font-mono);
src/styles.css:38: font-weight: 500;
src/styles.css:96: font-weight: 600;
src/styles.css:116: font-family: var(--eg-font-mono);
src/styles.css:127: font-family: var(--eg-font-mono);
src/styles.css:129: font-weight: 500;
src/styles.css:189: font-family: var(--eg-font-mono);
src/styles.css:207: font-family: var(--font-primary);
src/styles.css:249: font-family: var(--eg-font-mono);
src/styles.css:334: font-weight: 700;
src/styles.css:341: font-family: var(--eg-font-mono);
src/styles.css:366: font-family: var(--eg-font-mono);
src/styles.css:379: font-family: var(--eg-font-mono);
src/styles.css:381: font-weight: 600;
src/styles.css:418: font-family: var(--eg-font-mono);
src/styles.css:493: font-family: var(--font-primary);
src/styles.css:505: font-family: var(--font-primary);
src/styles.css:506: font-weight: 400;
src/styles.css:521: font-family: var(--font-primary);
src/styles.css:522: font-weight: 600;
src/styles.css:687: font-family: var(--font-primary);
src/styles.css:689: font-weight: 800;
src/styles.css:737: font-family: var(--font-primary);
src/styles.css:739: font-weight: 800;
src/styles.css:747: font-family: var(--font-primary);
src/styles.css:749: font-weight: 700;
src/styles.css:757: font-family: var(--font-primary);
src/styles.css:759: font-weight: 600;
src/styles.css:804: font-family: var(--font-primary);
src/styles.css:806: font-weight: 800;
src/styles.css:1003: font-family: var(--font-mono);
src/styles.css:1063: font-family: var(--font-mono);
src/styles.css:1065: font-weight: 800;
src/styles.css:1102: font-family: var(--font-mono);
src/styles.css:1155: font-weight: 700;
src/styles.css:1197: font-weight: 800;
src/styles.css:1198: font-family: var(--font-mono);
src/styles.css:1214: font-weight: 700;
src/styles.css:1229: font-weight: 700;
src/styles.css:1239: font-weight: 700;
src/styles.css:1281: font-family: var(--font-mono);
src/styles.css:1283: font-weight: 700;
src/styles.css:1326: font-family: var(--font-mono);
src/styles.css:1328: font-weight: 700;
src/styles.css:1482: font-family: var(--font-mono);
src/styles.css:1605: font-family: var(--font-mono);
src/styles.css:1642: font-weight: 600;
src/styles.css:1650: font-weight: 700;
src/styles.css:1735: font-family: var(--font-primary);
src/styles.css:1742: font-weight: 800;
src/styles.css:1750: font-weight: 700;
src/styles.css:1771: font-weight: 800;
src/styles.css:1820: font-weight: 800;
src/styles.css:1823: font-family: var(--font-mono);
src/styles.css:1828: font-family: var(--font-primary);
src/styles.css:1829: font-weight: 700;
src/styles.css:1958: font-family: var(--font-mono);
src/styles.css:1972: font-family: var(--font-mono);
src/styles.css:2007: font-family: var(--font-mono) !important;
src/styles.css:2024: font-family: var(--font-mono) !important;
src/styles.css:2031: font-family: var(--font-mono) !important;
src/styles.css:2033: font-weight: 800 !important;
src/styles.css:2064: font-family: var(--font-mono) !important;
src/styles.css:2066: font-weight: 700 !important;
src/styles.css:2109: font-family: var(--font-mono) !important;
src/styles.css:2111: font-weight: 700 !important;
src/styles.css:2120: font-family: var(--font-mono) !important;
src/styles.css:2122: font-weight: 700 !important;
src/styles.css:2141: font-family: var(--font-mono) !important;
src/styles.css:2148: font-family: var(--font-mono) !important;
src/styles.css:2160: font-family: var(--font-mono) !important;
src/styles.css:2162: font-weight: 600 !important;
src/styles.css:2195: font-family: var(--font-mono) !important;
src/styles.css:2210: font-family: var(--font-mono) !important;
src/styles.css:2217: font-family: var(--font-mono) !important;
src/styles.css:2227: font-family: var(--font-mono) !important;
src/styles.css:2238: font-family: var(--font-mono) !important;
src/styles.css:2287: font-family: var(--font-mono);
src/styles.css:2306: font-weight: 800;
src/styles.css:2319: font-weight: 800;
src/styles.css:2333: font-weight: 600;
src/styles.css:2341: font-weight: 700;
src/styles.css:2383: font-family: var(--font-mono) !important;
src/styles.css:2444: font-family: var(--font-mono) !important;
src/styles.css:2453: font-family: var(--font-mono) !important;
src/styles.css:2460: font-family: var(--font-mono) !important;
src/styles.css:2495: font-family: var(--font-mono) !important;
src/styles.css:2503: font-family: var(--font-mono) !important;
src/styles.css:2510: font-family: var(--font-mono) !important;
src/styles.css:2524: font-family: var(--font-mono) !important;
src/styles.css:2531: font-family: var(--font-mono) !important;
src/styles.css:2841: font-family: var(--font-mono);
src/styles.css:2843: font-weight: 500;
src/styles.css:2849: font-family: var(--font-mono);
src/styles.css:2851: font-weight: 600;
src/styles.css:2902: font-family: var(--font-primary);
src/styles.css:2910: font-weight: 700;
src/styles.css:2915: font-family: var(--font-mono);
src/styles.css:2947: font-family: var(--font-primary);
src/styles.css:2949: font-weight: 700;
src/styles.css:2981: font-family: var(--font-mono);
src/styles.css:2983: font-weight: 800;
src/styles.css:3028: font-family: var(--font-mono);
src/styles.css:3079: font-family: var(--font-mono);
src/styles.css:3127: font-family: var(--font-mono);
src/styles.css:3143: .operations-tab button { font-family: inherit; }
src/styles.css:3167: .operations-tab .ops-command-market { color: var(--ops-amber); font-weight: 700; }
src/styles.css:3182: font-weight: 700;
src/styles.css:3187: font-weight: 700;
src/styles.css:3193: font-weight: 700;
src/styles.css:3200: font-weight: 700;
src/styles.css:3218: font-weight: 700;
src/styles.css:3236: font-family: inherit;
src/styles.css:3248: font-weight: 700;
src/styles.css:3322: font-weight: 800;
src/styles.css:3327: font-weight: 700;
src/styles.css:3333: font-weight: 800;
src/styles.css:3346: font-weight: 600;
src/styles.css:3369: font-weight: 600;
src/styles.css:3404: font-weight: 600;
src/styles.css:3415: font-weight: 500;
src/styles.css:3417: .operations-tab .ops-lb-row.is-rank-1 .name { color: var(--ops-yellow); font-weight: 600; }
src/styles.css:3420: font-weight: 600;
src/styles.css:3465: font-weight: 800;
src/styles.css:3496: font-weight: 700;
src/styles.css:3504: font-weight: 800;
src/styles.css:3544: font-weight: 700;
src/styles.css:3553: font-family: inherit;
src/styles.css:3579: font-weight: 700;
src/styles.css:3615: font-weight: 600;
src/styles.css:3619: font-weight: 600;
src/styles.css:3639: font-weight: 800;
src/styles.css:3662: font-weight: 600;
src/styles.css:3685: font-weight: 700;
src/styles.css:3737: font-weight: 600;
src/styles.css:3741: font-weight: 600;
src/styles.css:3774: font-weight: 800;
src/styles.css:3830: font-weight: 800;
src/styles.css:3833: .operations-tab .ops-out-enrolled { color: var(--ops-green); font-weight: 600; }
src/styles.css:3834: .operations-tab .ops-out-callback { color: var(--ops-yellow); font-weight: 600; }
src/styles.css:3836: .operations-tab .ops-out-incomplete { color: var(--ops-red-bright); font-weight: 600; }
src/styles.css:3838: .operations-tab .ops-ghl-ok { color: var(--ops-green); font-weight: 700; }
src/styles.css:3839: .operations-tab .ops-ghl-fail { color: var(--ops-red-bright); font-weight: 700; }
src/styles.css:3880: font-weight: 600;
src/styles.css:3896: font-weight: 600;
src/styles.css:3899: .operations-tab .ops-carrier-row .count { text-align: right; color: var(--ops-cyan); font-weight: 600; }
src/styles.css:3904: font-weight: 600;
src/styles.css:3912: font-weight: 600;
src/styles.css:3933: font-weight: 600;
src/styles.css:3937: font-weight: 600;
src/styles.css:3956: font-weight: 700;
src/styles.css:4027: font-weight: 800;
src/styles.css:4077: font-weight: 700;
src/styles.css:4185: font-weight: 700;
src/styles.css:4222: font-weight: 700;
src/styles.css:4352: font-weight: 800;
src/styles.css:4380: font-weight: 800;
src/styles.css:4501: font-weight: 700;
src/styles.css:4529: font-family: inherit;
src/styles.css:4558: font-weight: 700;
src/styles.css:4563: font-weight: 800;
src/styles.css:4609: font-weight: 600;
src/styles.css:4615: font-weight: 600;
src/styles.css:4642: font-family: inherit;
src/styles.css:4650: font-weight: 600;
src/styles.css:4668: font-weight: 600;
src/styles.css:4681: .operations-tab .ops-status-bar .center span { color: var(--ops-yellow); font-weight: 700; }
src/styles.css:4685: font-weight: 600;
src/styles.css:4695: .operations-tab .ops-status-bar .clock { color: var(--ops-yellow); font-weight: 700; }
src/styles.css:4698: font-weight: 700;
src/styles.css:4770: font-family: var(--font-mono);
src/styles.css:4772: font-weight: 700;
src/styles.css:4786: font-weight: 500;
src/styles.css:4798: font-family: var(--font-primary);
src/styles.css:4831: font-weight: 400;
src/styles.css:4842: font-family: var(--font-primary);
src/styles.css:4873: font-weight: 500;
src/styles.css:4895: font-family: var(--font-primary);
src/styles.css:4897: font-weight: 700;
src/styles.css:4936: font-weight: 400;
src/styles.css:4971: font-family: var(--font-primary);
src/styles.css:4973: font-weight: 700;
src/styles.css:5052: font-family: var(--font-primary);
src/styles.css:5054: font-weight: 700;
src/styles.css:5097: font-family: var(--font-primary);
src/styles.css:5099: font-weight: 700;
src/styles.css:5212: font-family: var(--font-primary);
src/styles.css:5214: font-weight: 600;
src/styles.css:5274: font-family: var(--font-mono);
src/styles.css:5291: font-family: var(--font-mono);
src/styles.css:5293: font-weight: 700;
src/styles.css:5324: font-family: var(--font-primary);
src/styles.css:5326: font-weight: 400;
src/styles.css:5448: font-family: var(--font-mono);
src/styles.css:5563: font-family: var(--font-primary);
src/styles.css:5565: font-weight: 700;
src/styles.css:5633: font-family: var(--font-mono);
src/styles.css:5635: font-weight: 900;
src/styles.css:5644: font-family: var(--font-mono);
src/styles.css:5646: font-weight: 800;
src/styles.css:5692: font-family: var(--font-mono);
src/styles.css:5694: font-weight: 800;
src/styles.css:5721: font-family: var(--font-primary);
src/styles.css:5736: font-family: var(--font-mono);
src/styles.css:5738: font-weight: 800;
src/styles.css:5759: font-family: var(--font-mono);
src/styles.css:5761: font-weight: 800;
src/styles.css:5842: font-family: var(--font-mono) !important;
src/styles.css:5844: font-weight: 800 !important;
src/styles.css:5855: font-family: var(--font-mono) !important;
src/styles.css:5869: font-family: var(--font-mono) !important;
src/styles.css:5887: font-family: var(--font-mono) !important;
src/styles.css:5889: font-weight: 700 !important;
src/styles.css:5931: font-family: var(--font-primary) !important;
src/styles.css:5947: font-family: var(--font-primary) !important;
src/styles.css:5990: font-family: var(--font-mono);
src/styles.css:6007: font-weight: 800;
src/styles.css:6015: font-weight: 900;
src/styles.css:6068: font-family: var(--font-mono);
src/styles.css:6085: font-weight: 800;
src/styles.css:6093: font-weight: 900;
src/styles.css:6175: font-family: var(--font-mono) !important;
src/styles.css:6186: font-family: var(--font-mono);
src/styles.css:6204: font-family: var(--font-mono);
src/styles.css:6206: font-weight: 800;
src/styles.css:6246: font-family: var(--font-mono);
src/styles.css:6290: font-family: var(--font-mono) !important;
src/styles.css:6292: font-weight: 900 !important;
src/styles.css:6337: font-family: var(--font-mono);
src/styles.css:6339: font-weight: 900;
src/styles.css:6407: font-weight: 900;
src/styles.css:6412: font-weight: 800;
src/styles.css:6417: font-family: var(--font-mono);
src/styles.css:6419: font-weight: 900;
src/styles.css:6449: font-weight: 800;
src/styles.css:6463: font-weight: 900;
src/styles.css:6487: font-family: var(--font-mono);
src/styles.css:6489: font-weight: 800;
src/styles.css:6543: font-family: var(--font-mono);
src/styles.css:6545: font-weight: 900;
src/styles.css:6617: font-family: var(--font-mono);
src/styles.css:6619: font-weight: 900;
src/styles.css:6687: font-family: var(--font-mono);
src/styles.css:6689: font-weight: 900;
src/styles.css:6724: font-weight: 900;
src/styles.css:6746: font-family: var(--font-primary);
src/styles.css:6773: font-family: var(--font-mono);
src/styles.css:6775: font-weight: 900;
src/styles.css:6804: font-weight: 800;
src/styles.css:6845: font-weight: 900;
src/styles.css:6852: font-family: var(--font-mono);
src/styles.css:6895: font-weight: 900;
src/styles.css:6924: font-family: var(--font-mono);
src/styles.css:6951: font-family: var(--font-mono);
src/styles.css:6953: font-weight: 900;
src/styles.css:6990: font-family: var(--font-mono) !important;
src/styles.css:7062: font-family: var(--font-mono) !important;
src/styles.css:7064: font-weight: 700 !important;
src/styles.css:7097: font-family: var(--font-mono) !important;
src/styles.css:7099: font-weight: 800 !important;
src/styles.css:7137: font-family: var(--font-mono) !important;
src/styles.css:7182: font-family: var(--font-mono) !important;
src/styles.css:7261: font-family: var(--font-primary);
src/styles.css:7262: font-weight: 600;
src/styles.css:7285: font-family: var(--font-primary);
src/styles.css:7287: font-weight: 700;
src/styles.css:7326: font-family: var(--font-primary);
src/styles.css:7328: font-weight: 700;
src/styles.css:7337: font-family: var(--font-primary);
src/styles.css:7339: font-weight: 700;
src/styles.css:7396: font-weight: 500;
src/styles.css:7411: font-family: var(--font-primary);
src/styles.css:7412: font-weight: 600;
src/styles.css:7429: font-family: var(--font-primary);
src/styles.css:7430: font-weight: 700;
src/styles.css:7477: font-family: var(--font-primary);
src/styles.css:7479: font-weight: 500;
src/styles.css:7548: font-family: var(--font-mono);
src/styles.css:7550: font-weight: 400;
src/styles.css:7574: font-family: var(--font-primary);
src/styles.css:7576: font-weight: 600;
src/styles.css:7582: font-family: var(--font-primary);
src/styles.css:7584: font-weight: 700;
src/styles.css:7641: font-weight: 700;
src/styles.css:7675: font-family: var(--font-primary);
src/styles.css:7677: font-weight: 700;
src/styles.css:7699: font-weight: 600;
src/styles.css:7714: font-weight: 700;
src/styles.css:7761: font-family: var(--font-mono);
src/styles.css:7828: font-family: var(--font-mono);
src/styles.css:7921: font-family: var(--font-primary);
src/styles.css:7923: font-weight: 700;
src/styles.css:8055: font-family: var(--font-primary);
src/styles.css:8057: font-weight: 700;
src/styles.css:8161: font-family: var(--font-primary);
src/styles.css:8163: font-weight: 500;
src/styles.css:8244: font-family: var(--font-primary);
src/styles.css:8245: font-weight: 700;
src/styles.css:8263: font-family: var(--font-primary);
src/styles.css:8265: font-weight: 600;
src/styles.css:8357: font-family: var(--font-primary);
src/styles.css:8359: font-weight: 600;
src/styles.css:8452: font-family: var(--font-mono);
src/styles.css:8470: font-weight: 700;
src/styles.css:8487: font-weight: 700;
src/styles.css:8493: font-family: var(--font-primary);
src/styles.css:8495: font-weight: 700;
src/styles.css:8521: font-family: var(--font-primary);
src/styles.css:8523: font-weight: 700;
src/styles.css:8549: font-family: var(--font-primary);
src/styles.css:8551: font-weight: 700;
src/styles.css:8659: font-weight: 600;
src/styles.css:8680: font-weight: 800;
src/styles.css:8685: font-family: var(--font-primary);
src/styles.css:8775: font-weight: 700;
src/styles.css:8808: font-weight: 700;
src/styles.css:8809: font-family: var(--font-primary);
src/styles.css:8888: font-family: var(--font-mono);
src/styles.css:8913: font-weight: 600;
src/styles.css:8921: font-weight: 600;
src/styles.css:8962: font-family: var(--font-primary);
src/styles.css:8963: font-weight: 700;
src/styles.css:9009: font-family: var(--font-primary) !important;
src/styles.css:9010: font-weight: 700 !important;
src/styles.css:9108: font-family: var(--font-primary);
src/styles.css:9110: font-weight: 700;
src/styles.css:9134: font-family: var(--font-mono);
src/styles.css:9136: font-weight: 600;
src/styles.css:9187: font-family: var(--font-mono);
src/styles.css:9189: font-weight: 700;
src/styles.css:9249: font-family: var(--font-primary);
src/styles.css:9255: font-weight: 700;
src/styles.css:9259: font-family: var(--font-primary);
src/styles.css:9266: font-weight: 400;
src/styles.css:9277: font-family: var(--font-mono);
src/styles.css:9286: font-weight: 600;
src/styles.css:9318: font-family: var(--font-primary);
src/styles.css:9320: font-weight: 600;
src/styles.css:9357: font-family: var(--font-primary);
src/styles.css:9359: font-weight: 600;
src/styles.css:9383: font-family: var(--font-primary);
src/styles.css:9385: font-weight: 700;
src/styles.css:9392: font-family: var(--font-mono);
src/styles.css:9394: font-weight: 700;
src/styles.css:9418: font-family: var(--font-primary);
src/styles.css:9432: font-weight: 700;
src/styles.css:9485: font-weight: 600;
src/styles.css:9542: font-family: var(--font-primary);
src/styles.css:9544: font-weight: 700;
src/styles.css:9570: font-family: var(--font-primary);
src/styles.css:9572: font-weight: 700;
src/styles.css:9589: font-weight: 600;
src/styles.css:9596: font-family: var(--font-primary);
src/styles.css:9598: font-weight: 700;
src/styles.css:9611: font-family: var(--font-primary);
src/styles.css:9613: font-weight: 700;
src/styles.css:9668: font-family: var(--font-primary);
src/styles.css:9670: font-weight: 700;
src/styles.css:9710: font-family: var(--font-primary);
src/styles.css:9712: font-weight: 700;
src/styles.css:9726: font-family: var(--font-primary);
src/styles.css:9736: font-family: var(--font-primary);
src/styles.css:9738: font-weight: 600;
src/styles.css:9774: font-family: var(--font-mono);
src/styles.css:9776: font-weight: 700;
src/styles.css:9785: font-weight: 600;
src/styles.css:9813: font-family: var(--font-primary);
src/styles.css:9815: font-weight: 700;
src/styles.css:9822: font-family: var(--font-mono);
src/styles.css:9871: font-family: var(--font-mono);
src/styles.css:9873: font-weight: 700;
src/styles.css:9878: font-family: var(--font-primary);
src/styles.css:9940: font-family: var(--font-mono);
src/styles.css:9942: font-weight: 600;
src/styles.css:10041: font-family: var(--font-primary);
src/styles.css:10065: font-family: var(--font-primary);
src/styles.css:10067: font-weight: 700;
src/styles.css:10501: font-family: var(--font-primary);
src/styles.css:10503: font-weight: 700;
src/styles.css:10595: font-family: var(--font-primary);
src/styles.css:10597: font-weight: 600;
src/styles.css:10614: font-family: var(--font-mono);
src/styles.css:10616: font-weight: 700;
src/styles.css:10836: font-family: var(--font-primary);
src/styles.css:10838: font-weight: 800;
src/styles.css:10845: font-family: var(--font-primary);
src/styles.css:10847: font-weight: 700;
src/styles.css:10886: font-family: var(--font-primary);
src/styles.css:10888: font-weight: 700;
src/styles.css:11077: font-weight: 700;
src/styles.css:11091: font-family: var(--font-primary);
src/styles.css:11093: font-weight: 800;
src/styles.css:11223: font-family: var(--font-primary);
src/styles.css:11225: font-weight: 700;
src/styles.css:11299: font-family: var(--font-primary);
src/styles.css:11301: font-weight: 700;
src/styles.css:11329: font-family: var(--font-primary);
src/styles.css:11331: font-weight: 700;
src/styles.css:11408: font-family: var(--font-primary);
src/styles.css:11410: font-weight: 700;
src/styles.css:11423: font-family: var(--font-primary);
src/styles.css:11425: font-weight: 700;
src/styles.css:11445: font-family: var(--font-primary);
src/styles.css:11447: font-weight: 800;
src/styles.css:11502: font-family: var(--font-primary);
src/styles.css:11504: font-weight: 900;
src/styles.css:11514: font-family: var(--font-mono);
src/styles.css:11539: font-family: var(--font-primary);
src/styles.css:11541: font-weight: 900;
src/styles.css:11550: font-family: var(--font-mono);
src/styles.css:11552: font-weight: 700;
src/styles.css:11569: font-family: var(--font-primary);
src/styles.css:11571: font-weight: 900;
src/styles.css:11634: font-family: var(--font-mono);
src/styles.css:11636: font-weight: 700;
src/styles.css:11646: font-family: var(--font-mono);
src/styles.css:11648: font-weight: 700;
src/styles.css:11674: font-family: var(--font-mono);
src/styles.css:11696: font-family: var(--font-primary);
src/styles.css:11698: font-weight: 800;
src/styles.css:11728: font-family: var(--font-primary);
src/styles.css:11730: font-weight: 900;
src/styles.css:11743: font-family: var(--font-mono);
src/styles.css:11777: font-family: var(--font-primary);
src/styles.css:11801: font-family: var(--font-primary);
src/styles.css:11803: font-weight: 900;
src/styles.css:11813: font-family: var(--font-mono);
src/styles.css:11845: font-family: var(--font-primary);
src/styles.css:11847: font-weight: 900;
src/styles.css:11854: font-family: var(--font-primary);
src/styles.css:11869: font-family: var(--font-mono);
src/styles.css:11871: font-weight: 700;
src/styles.css:11886: font-family: var(--font-mono);
src/styles.css:11915: font-family: var(--font-mono);
src/styles.css:11917: font-weight: 700;
src/styles.css:11960: font-family: var(--font-mono);
src/styles.css:11967: font-weight: 800;
src/styles.css:12003: font-weight: 800;
src/styles.css:12062: font-family: var(--font-primary);
src/styles.css:12064: font-weight: 900;
src/styles.css:12084: font-family: var(--font-mono);
src/styles.css:12086: font-weight: 700;
src/styles.css:12117: font-family: var(--font-mono);
src/styles.css:12254: font-family: var(--font-primary);
src/styles.css:12256: font-weight: 800;
src/styles.css:12440: font-family: var(--font-primary);
src/styles.css:12442: font-weight: 800;
src/styles.css:12461: font-family: var(--font-primary);
src/styles.css:12463: font-weight: 800;
src/styles.css:12567: font-family: var(--font-mono);
src/styles.css:12569: font-weight: 800;
src/styles.css:12576: font-family: var(--font-mono);
src/styles.css:12595: font-family: var(--font-mono);
src/styles.css:12597: font-weight: 800;
src/styles.css:12619: font-family: var(--font-mono);
src/styles.css:12634: font-weight: 800;
src/styles.css:12643: font-family: var(--font-mono);
src/styles.css:12645: font-weight: 800;
src/styles.css:12709: font-family: var(--font-mono);
src/styles.css:12711: font-weight: 800;
src/styles.css:12724: font-family: var(--font-mono);
src/styles.css:12726: font-weight: 800;
src/styles.css:12734: font-family: var(--font-mono);
src/styles.css:12767: font-weight: 800;
src/styles.css:12787: font-family: var(--font-primary);
src/styles.css:12808: font-family: var(--font-mono);
src/styles.css:12810: font-weight: 800;
src/styles.css:12830: font-weight: 800;
src/styles.css:12856: font-family: var(--font-mono);
src/styles.css:12858: font-weight: 800;
src/styles.css:12913: font-family: var(--font-mono);
src/styles.css:12915: font-weight: 800;
src/styles.css:12922: font-family: var(--font-mono);
src/styles.css:12941: font-family: var(--font-mono);
src/styles.css:12943: font-weight: 800;
src/styles.css:12976: font-family: var(--font-primary);
src/styles.css:12978: font-weight: 800;
src/styles.css:13084: font-family: var(--font-primary);
src/styles.css:13086: font-weight: 700;
src/styles.css:13103: font-family: var(--font-primary);
src/styles.css:13104: font-weight: 700;
src/styles.css:13138: font-family: var(--font-primary);
src/styles.css:13140: font-weight: 600;
src/styles.css:13183: font-family: var(--font-primary);
src/styles.css:13184: font-weight: 700;
src/styles.css:13252: font-family: var(--font-primary);
src/styles.css:13254: font-weight: 700;
src/styles.css:13281: font-weight: 700;
src/styles.css:13299: font-weight: 800;
src/styles.css:13321: font-family: var(--font-primary);
src/styles.css:13323: font-weight: 700;
src/styles.css:13359: font-family: var(--font-primary);
src/styles.css:13361: font-weight: 700;
src/styles.css:13382: font-family: var(--font-primary);
src/styles.css:13384: font-weight: 700;
src/styles.css:13428: font-family: var(--font-primary);
src/styles.css:13430: font-weight: 700;
src/styles.css:13480: font-family: var(--font-primary);
src/styles.css:13482: font-weight: 700;
src/styles.css:13490: font-weight: 700;
src/styles.css:13541: font-weight: 600;
src/styles.css:13547: font-family: var(--font-primary);
src/styles.css:13548: font-weight: 800;
src/styles.css:13562: font-family: var(--font-primary);
src/styles.css:13564: font-weight: 700;
src/styles.css:13573: font-weight: 700;
src/styles.css:13638: font-family: var(--font-primary);
src/styles.css:13640: font-weight: 700;
src/styles.css:13734: font-weight: 700;
src/styles.css:13769: font-family: var(--font-primary);
src/styles.css:13771: font-weight: 800;
src/styles.css:13778: font-family: var(--font-primary);
src/styles.css:13780: font-weight: 800;
src/styles.css:13895: font-family: var(--font-primary);
src/styles.css:13897: font-weight: 800;
src/styles.css:13919: font-family: var(--font-primary);
src/styles.css:13921: font-weight: 700;
src/styles.css:14058: font-family: var(--font-primary);
src/styles.css:14060: font-weight: 700;
src/styles.css:14073: font-family: var(--font-primary);
src/styles.css:14075: font-weight: 800;
src/styles.css:14105: font-family: var(--font-primary);
src/styles.css:14107: font-weight: 800;
src/styles.css:14196: font-family: var(--font-primary);
src/styles.css:14198: font-weight: 400;
src/styles.css:14228: font-family: var(--font-mono);
src/styles.css:14262: font-family: var(--font-mono);
src/styles.css:14264: font-weight: 800;
src/styles.css:14285: font-family: var(--font-mono);
src/styles.css:14341: font-family: var(--font-primary);
src/styles.css:14343: font-weight: 800;
src/styles.css:14397: font-family: var(--font-primary);
src/styles.css:14399: font-weight: 600;
src/styles.css:14437: font-family: var(--font-primary);
src/styles.css:14439: font-weight: 600;
src/styles.css:14474: font-family: var(--font-primary);
src/styles.css:14476: font-weight: 500;
src/styles.css:14502: font-weight: 400;
src/styles.css:14524: font-family: var(--font-primary);
src/styles.css:14526: font-weight: 800;
src/styles.css:14596: font-family: var(--font-primary);
src/styles.css:14598: font-weight: 700;
src/styles.css:14606: font-family: var(--font-primary);
src/styles.css:14608: font-weight: 800;
src/styles.css:14677: font-family: var(--font-primary);
src/styles.css:14679: font-weight: 800;
src/styles.css:14709: font-family: var(--font-primary);
src/styles.css:14711: font-weight: 800;
src/styles.css:14740: font-family: var(--font-primary);
src/styles.css:14742: font-weight: 800;
src/styles.css:14777: font-weight: 700;
src/styles.css:14810: font-family: var(--font-primary);
src/styles.css:14812: font-weight: 800;
src/styles.css:14877: font-family: var(--font-primary);
src/styles.css:14879: font-weight: 800;
src/styles.css:14892: font-family: var(--font-primary);
src/styles.css:14894: font-weight: 800;
src/styles.css:14953: font-family: var(--font-primary);
src/styles.css:14955: font-weight: 700;
src/styles.css:15016: font-family: var(--font-primary);
src/styles.css:15017: font-weight: 800;
src/styles.css:15062: font-family: var(--font-primary);
src/styles.css:15064: font-weight: 700;
src/styles.css:15077: font-weight: 600;
src/styles.css:15110: font-family: var(--font-primary);
src/styles.css:15112: font-weight: 600;
src/styles.css:15154: font-family: var(--font-primary);
src/styles.css:15156: font-weight: 500;
src/styles.css:15219: font-family: var(--font-primary);
src/styles.css:15221: font-weight: 800;
src/styles.css:15244: font-family: var(--font-primary);
src/styles.css:15246: font-weight: 800;
src/styles.css:15286: font-family: var(--font-primary);
src/styles.css:15288: font-weight: 700;
src/styles.css:15317: font-family: var(--font-primary);
src/styles.css:15319: font-weight: 800;
src/styles.css:15328: font-weight: 600;
src/styles.css:15348: font-family: var(--font-primary);
src/styles.css:15350: font-weight: 700;
src/styles.css:15463: font-family: var(--font-primary);
src/styles.css:15465: font-weight: 800;
src/styles.css:15547: font-family: var(--font-primary);
src/styles.css:15549: font-weight: 700;
src/styles.css:15565: font-family: var(--font-mono);
src/styles.css:15567: font-weight: 700;
src/styles.css:15580: font-family: var(--font-primary);
src/styles.css:15582: font-weight: 700;
src/styles.css:15598: font-weight: 700;
src/styles.css:15608: font-family: var(--font-mono);
src/styles.css:15906: font-family: var(--font-primary);
src/styles.css:15908: font-weight: 600;
src/styles.css:15922: font-family: var(--font-primary);
src/styles.css:15924: font-weight: 600;
src/styles.css:15934: font-weight: 400;
src/styles.css:15965: font-family: var(--font-primary);
src/styles.css:15967: font-weight: 700;
src/styles.css:16044: font-family: var(--font-primary);
src/styles.css:16060: font-family: var(--font-primary);
src/styles.css:16062: font-weight: 700;
src/styles.css:16086: font-family: var(--font-primary);
src/styles.css:16088: font-weight: 800;
src/styles.css:16127: font-family: var(--font-primary);
src/styles.css:16148: font-family: var(--font-primary);
src/styles.css:16150: font-weight: 700;
src/styles.css:16157: font-family: var(--font-primary);
src/styles.css:16159: font-weight: 700;
src/styles.css:16166: font-family: var(--font-primary);
src/styles.css:16208: font-family: var(--font-primary);
src/styles.css:16218: font-family: var(--font-primary);
src/styles.css:16257: font-family: var(--font-primary);
src/styles.css:16259: font-weight: 600;
src/styles.css:16302: font-family: var(--font-primary);
src/styles.css:16304: font-weight: 700;
src/styles.css:16323: font-family: var(--font-primary);
src/styles.css:16348: font-family: var(--font-primary);
src/styles.css:16350: font-weight: 600;
src/styles.css:16371: font-family: var(--font-primary);
src/styles.css:16395: font-family: var(--font-primary);
src/styles.css:16397: font-weight: 600;
src/styles.css:16403: font-family: var(--font-primary);
src/styles.css:16411: font-family: var(--font-primary);
src/styles.css:16447: font-family: var(--font-primary);
src/styles.css:16460: font-family: var(--font-primary);
src/styles.css:16470: font-family: var(--font-primary);
src/styles.css:16494: font-family: var(--font-primary);
src/styles.css:16496: font-weight: 800;
src/styles.css:16583: font-family: var(--font-mono);
src/styles.css:16618: font-family: var(--font-mono);
src/styles.css:16620: font-weight: 700;
src/styles.css:16704: font-family: var(--font-mono);
src/styles.css:16721: font-family: var(--font-mono);
src/styles.css:16723: font-weight: 700;
src/styles.css:16748: font-family: var(--font-mono);
src/styles.css:16750: font-weight: 600;
src/styles.css:16796: font-family: var(--font-mono);
src/styles.css:16798: font-weight: 700;
src/styles.css:16852: font-family: var(--font-mono);
src/styles.css:16854: font-weight: 700;
src/styles.css:16989: font-family: var(--font-mono);
src/styles.css:16991: font-weight: 700;
src/styles.css:17007: font-family: var(--font-mono);
src/styles.css:17017: font-family: var(--font-mono);
src/styles.css:17077: font-family: var(--eg-font-mono);
src/styles.css:17096: font-weight: 700;
src/styles.css:17103: font-family: var(--eg-font-mono);
src/styles.css:17105: font-weight: 700;
src/styles.css:17123: font-family: var(--eg-font-mono);
src/styles.css:17210: font-family: var(--eg-font-mono);
src/styles.css:17222: font-family: var(--eg-font-mono);
src/styles.css:17233: font-family: var(--eg-font-mono);
src/styles.css:17315: font-weight: 700;
src/styles.css:17322: .rts-agent-heading small { margin-top: 2px; color: var(--text-muted); font-size: 8px; font-weight: 500; }
src/styles.css:17329: font-weight: 600;
src/styles.css:17365: font-family: var(--eg-font-mono);
src/styles.css:17367: font-weight: 700;
src/styles.css:17388: .rts-carrier-name { color: var(--text-primary); font-weight: 650; }
src/styles.css:17406: font-family: var(--eg-font-mono);
src/styles.css:17437: font-weight: 700;
src/styles.css:17457: font-family: var(--eg-font-mono);
src/styles.css:17487: font-family: var(--eg-font-mono);
src/styles.css:17498: font-weight: 700;
src/styles.css:17552: font-family: var(--eg-font-mono);
src/styles.css:17554: font-weight: 700;
src/styles.css:17606: font-family: var(--eg-font-mono);
src/styles.css:17608: font-weight: 700;
src/styles.css:17647: font-weight: 700;
src/styles.css:17737: font-weight: 700;
src/styles.css:17792: font-family: var(--eg-font-mono);
src/styles.css:18059: background: #000; color: var(--eg-amber); font-family: var(--eg-font-mono);
src/styles.css:18069: .agent-dash-heading h1 { color: var(--eg-amber); font-size: 12px; margin: 0; font-weight: 500; letter-spacing: .06em; }
src/styles.css:18086: .agent-dash-metric strong { font-size: inherit; font-weight: 400; color: var(--eg-amber); font-variant-numeric: tabular-nums; }
src/styles.css:18092: .agent-dash-panel h2 { color: var(--eg-amber); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .06em; margin: 0; }
src/styles.css:18095: .agent-dash-chart text { fill: var(--eg-amber); font-family: var(--eg-font-mono); font-size: 10px; }
src/styles.css:18115: font-family: var(--eg-font-mono); font-size: 10px; line-height: 1.5; pointer-events: none;
src/styles.css:18117: .agent-dash-pie-tooltip strong, .agent-dash-pie-tooltip span { display: block; font-weight: 400; }
src/styles.css:18122: .agent-dash-pie-legend strong, .agent-dash-pie-legend li > span:last-child { text-align: right; font-weight: 400; font-variant-numeric: tabular-nums; }
src/styles.css:18127: .agent-dashboard th, .agent-dashboard td { color: var(--eg-amber); padding: 7px 0; border-bottom: 1px solid var(--eg-border); text-align: right; font-weight: 400; }
src/styles.css:18210: font-family: var(--font-mono);
src/styles.css:18252: font-family: var(--font-mono);
src/styles.css:18268: font-family: var(--font-mono);
src/styles.css:18294: font-family: var(--font-primary);
src/styles.css:18374: .phone-expanded__zip-block { margin-top: 10px; padding: 10px; border-radius: 6px; background: #7f1d1d; color: #fff; font-weight: 700; }
src/styles.css:18392: .crm-call-summary { padding: 12px; border-bottom: 1px solid var(--border-default); font-family: var(--font-mono); }
src/styles.css:18396: .opps-view { display: flex; flex-direction: column; gap: 16px; min-width: 0; width: 100%; max-width: none; color: var(--text-primary); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
src/styles.css:18427: .opps-column-head h3 { margin: 0 0 7px; font-size: 13px; font-weight: 700; color: inherit; overflow-wrap: anywhere; }
src/styles.css:18458: .opps-dialog { width: min(800px, 100%); max-height: calc(100dvh - 40px); display: flex; flex-direction: column; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--clay-radius, 8px); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; box-shadow: 0 16px 60px rgba(0,0,0,.5); }
src/styles.css:18535: .call-outcome.is-enrolled { color: #f5a524; font-weight: 700; }
src/styles.css:18578: .call-transcript-heading > span { color: var(--text-tertiary); font-size: 9px; letter-spacing: .5px; font-weight: 400; }
src/styles.css:18584: color: var(--text-secondary); text-align: left; font-family: inherit; font-size: 11px; line-height: 1.65; cursor: pointer;
src/styles.css:18593: .call-transcript-text { white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--font-primary); font-size: 13px; line-height: 1.6; }
src/styles.css:18600: .call-review-link { background: none; border: 0; padding: 4px 0; color: var(--eg-accent); font-family: inherit; font-size: 10px; letter-spacing: .5px; cursor: pointer; }
src/styles.css:18601: .call-notes-input { display: block; box-sizing: border-box; width: 100%; min-height: 108px; resize: vertical; padding: 10px; border: 1px solid var(--border-default); border-radius: 4px; background: var(--surface-raised); color: var(--text-primary); font-family: var(--font-primary); font-size: 12px; line-height: 1.6; }
src/styles.css:18640: .call-date-help { margin: 12px 0; color: var(--text-secondary); font-family: var(--font-primary); font-size: 12px; line-height: 1.5; }
src/styles.css:18643: .call-date-days .call-date-day { box-sizing: border-box; aspect-ratio: 1; width: 100%; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 11px; cursor: pointer; }
src/styles.css:18646: .call-date-days .call-date-day.is-endpoint { background: var(--eg-accent); color: var(--eg-surface-1); font-weight: 700; }
```

## Helper text candidates (manual review required)
```text
src/AgentTools.css:822: .at-doc-description {
src/AgentTools.css:2090: .at-modal .at-doc-description,
src/AgentTools.css:2573: html.dark .at-doc-description,
src/SEPLookupTool.css:797: .sep-map-landing-hint {
src/compliance/engine/ScorecardGenerator.js:316: description: buildCorrectiveDescription(scoreResult),
src/compliance/intents/annuity.js:5: description,
src/compliance/intents/annuity.js:18: description,
src/compliance/intents/annuity.js:42: description:
src/compliance/intents/annuity.js:59: description:
src/compliance/intents/annuity.js:76: description:
src/compliance/intents/annuity.js:93: description:
src/compliance/intents/annuity.js:110: description:
src/compliance/intents/annuity.js:127: description:
src/compliance/intents/annuity.js:145: description:
src/compliance/intents/annuity.js:157: description:
src/compliance/intents/annuity.js:170: description:
src/compliance/intents/annuity.js:183: description:
src/compliance/intents/annuity.js:196: description:
src/compliance/intents/annuity.js:209: description:
src/compliance/intents/annuity.js:222: description:
src/compliance/intents/annuity.js:235: description:
src/compliance/intents/annuity.js:248: description:
src/compliance/intents/annuity.js:261: description:
src/compliance/intents/annuity.js:273: description:
src/compliance/intents/annuity.js:286: description:
src/compliance/intents/annuity.js:297: description:
src/compliance/intents/annuity.js:308: description:
src/compliance/intents/annuity.js:319: description:
src/compliance/intents/annuity.js:330: description:
src/compliance/intents/annuity.js:341: description:
src/compliance/intents/annuity.js:352: description:
src/compliance/intents/call-opening.js:7: description:
src/compliance/intents/call-opening.js:40: description:
src/compliance/intents/call-opening.js:72: description:
src/compliance/intents/call-opening.js:104: description:
src/compliance/intents/call-opening.js:136: description:
src/compliance/intents/call-opening.js:168: description:
src/compliance/intents/call-opening.js:200: description:
src/compliance/intents/call-opening.js:233: description:
src/compliance/intents/call-opening.js:268: description:
src/compliance/intents/call-opening.js:298: description:
src/compliance/intents/call-opening.js:330: description:
src/compliance/intents/call-opening.js:362: description:
src/compliance/intents/call-opening.js:394: description:
src/compliance/intents/call-opening.js:426: description:
src/compliance/intents/call-recording.js:7: description:
src/compliance/intents/call-recording.js:38: description:
src/compliance/intents/call-recording.js:69: description:
src/compliance/intents/call-recording.js:100: description:
src/compliance/intents/call-recording.js:131: description:
src/compliance/intents/call-recording.js:163: description:
src/compliance/intents/call-recording.js:195: description:
src/compliance/intents/eligibility.js:7: description:
src/compliance/intents/eligibility.js:40: description:
src/compliance/intents/eligibility.js:72: description:
src/compliance/intents/eligibility.js:105: description:
src/compliance/intents/eligibility.js:137: description:
src/compliance/intents/eligibility.js:169: description:
src/compliance/intents/eligibility.js:202: description:
src/compliance/intents/eligibility.js:234: description:
src/compliance/intents/eligibility.js:266: description:
src/compliance/intents/eligibility.js:298: description:
src/compliance/intents/eligibility.js:330: description:
src/compliance/intents/eligibility.js:361: description:
src/compliance/intents/enrollment-closing.js:7: description:
src/compliance/intents/enrollment-closing.js:39: description:
src/compliance/intents/enrollment-closing.js:71: description:
src/compliance/intents/enrollment-closing.js:103: description:
src/compliance/intents/enrollment-closing.js:135: description:
src/compliance/intents/enrollment-closing.js:167: description:
src/compliance/intents/enrollment-closing.js:199: description:
src/compliance/intents/enrollment-closing.js:230: description:
src/compliance/intents/enrollment-closing.js:261: description:
src/compliance/intents/enrollment-closing.js:293: description:
src/compliance/intents/enrollment-closing.js:325: description:
src/compliance/intents/enrollment-closing.js:357: description:
src/compliance/intents/enrollment-closing.js:389: description:
src/compliance/intents/impact-coverage.js:7: description:
src/compliance/intents/impact-coverage.js:39: description:
src/compliance/intents/impact-coverage.js:71: description:
src/compliance/intents/impact-coverage.js:103: description:
src/compliance/intents/impact-coverage.js:135: description:
src/compliance/intents/impact-coverage.js:166: description:
src/compliance/intents/impact-coverage.js:198: description:
src/compliance/intents/impact-coverage.js:229: description:
src/compliance/intents/impact-coverage.js:261: description:
src/compliance/intents/needs-assessment.js:7: description:
src/compliance/intents/needs-assessment.js:44: description:
src/compliance/intents/needs-assessment.js:78: description:
src/compliance/intents/needs-assessment.js:113: description:
src/compliance/intents/needs-assessment.js:145: description:
src/compliance/intents/needs-assessment.js:180: description:
src/compliance/intents/needs-assessment.js:212: description:
src/compliance/intents/needs-assessment.js:244: description:
src/compliance/intents/needs-assessment.js:276: description:
src/compliance/intents/needs-assessment.js:310: description:
src/compliance/intents/needs-assessment.js:341: description:
src/compliance/intents/needs-assessment.js:375: description:
src/compliance/intents/needs-assessment.js:407: description:
src/compliance/intents/needs-assessment.js:441: description:
src/compliance/intents/needs-assessment.js:473: description:
src/compliance/intents/needs-assessment.js:507: description:
src/compliance/intents/needs-assessment.js:539: description:
src/compliance/intents/needs-assessment.js:571: description:
src/compliance/intents/needs-assessment.js:603: description:
src/compliance/intents/pecl.js:7: description:
src/compliance/intents/pecl.js:39: description:
src/compliance/intents/pecl.js:71: description:
src/compliance/intents/pecl.js:102: description:
src/compliance/intents/pecl.js:133: description:
src/compliance/intents/pecl.js:165: description:
src/compliance/intents/pecl.js:196: description:
src/compliance/intents/pecl.js:228: description:
src/compliance/intents/pecl.js:260: description:
src/compliance/intents/pecl.js:292: description:
src/compliance/intents/pecl.js:324: description:
src/compliance/intents/pecl.js:355: description:
src/compliance/intents/pecl.js:387: description:
src/compliance/intents/pecl.js:418: description:
src/compliance/intents/plan-presentation.js:7: description:
src/compliance/intents/plan-presentation.js:40: description:
src/compliance/intents/plan-presentation.js:73: description:
src/compliance/intents/plan-presentation.js:105: description:
src/compliance/intents/plan-presentation.js:138: description:
src/compliance/intents/plan-presentation.js:170: description:
src/compliance/intents/plan-presentation.js:202: description:
src/compliance/intents/plan-presentation.js:234: description:
src/compliance/intents/plan-presentation.js:266: description:
src/compliance/intents/plan-presentation.js:298: description:
src/compliance/intents/plan-presentation.js:330: description:
src/compliance/intents/plan-presentation.js:362: description:
src/compliance/intents/plan-presentation.js:394: description:
src/compliance/intents/plan-presentation.js:426: description:
src/compliance/intents/plan-presentation.js:459: description:
src/compliance/intents/plan-presentation.js:491: description:
src/compliance/intents/plan-presentation.js:523: description:
src/compliance/intents/plan-presentation.js:555: description:
src/compliance/intents/plan-presentation.js:587: description:
src/compliance/intents/plan-presentation.js:619: description:
src/compliance/intents/plan-presentation.js:651: description:
src/compliance/intents/plan-presentation.js:683: description:
src/compliance/intents/plan-presentation.js:715: description:
src/compliance/intents/plan-presentation.js:747: description:
src/compliance/intents/plan-presentation.js:779: description:
src/compliance/intents/plan-presentation.js:811: description:
src/compliance/intents/plan-presentation.js:843: description:
src/compliance/intents/plan-presentation.js:875: description:
src/compliance/intents/plan-presentation.js:907: description:
src/compliance/intents/sales-conduct.js:7: description:
src/compliance/intents/sales-conduct.js:8: 'Flag an actual pitch or description of non-health product features, benefits or pricing before or during the MA presentation. A brief post-enrollment mention of other products is allowed, with or without offering a separate appointment. Hospital indemnity is health-related; a generic services list is not a pitch.',
src/compliance/intents/sales-conduct.js:39: description:
src/compliance/intents/sales-conduct.js:71: description:
src/compliance/intents/sales-conduct.js:103: description:
src/compliance/intents/sales-conduct.js:135: description:
src/compliance/intents/sales-conduct.js:167: description:
src/compliance/intents/sales-conduct.js:199: description:
src/compliance/intents/sales-conduct.js:232: description:
src/compliance/intents/sales-conduct.js:264: description:
src/compliance/intents/sales-conduct.js:296: description:
src/compliance/intents/sales-conduct.js:328: description:
src/compliance/intents/sales-conduct.js:360: description:
src/compliance/intents/sales-conduct.js:392: description:
src/compliance/intents/sales-conduct.js:424: description:
src/compliance/intents/sales-conduct.js:456: description:
src/compliance/intents/soa-verification.js:7: description:
src/compliance/intents/soa-verification.js:39: description:
src/compliance/intents/soa-verification.js:71: description:
src/compliance/intents/soa-verification.js:100: description:
src/compliance/intents/soa-verification.js:132: description:
src/compliance/intents/soa-verification.js:164: description:
src/compliance/prompts/intent-classification.js:27: 15. Follow the supplied response schema. Risk indicators are concise text descriptions.`;
src/compliance/prompts/intent-classification.js:31: `- ${i.intent_code}: ${i.description}\n  Sample phrases: ${i.sample_phrases.slice(0, 2).join(' | ')}\n  Anti-patterns: ${(i.anti_patterns || []).slice(0, 2).join(' | ')}`
src/compliance/shared/scoringPolicy.js:41: question_text: current ? intent?.description || item.question_text : item.question_text || intent?.description,
src/components/AgentAudioSettings.jsx:71: <p className="tenant-settings-muted">Reduce background noise on your calls. Settings are saved to your user profile. Calibrate with your usual headset and room.</p>
src/components/AgentAudioSettings.jsx:82: <p className="tenant-settings-muted">Lower values keep softer speech; higher values block more room noise. Changes apply to the next call.</p>
src/components/AgentAudioSettings.jsx:88: <p className="tenant-settings-muted" role="status" aria-live="polite">{callActive ? 'Finish your call to change microphone settings.' : message}</p>
src/components/AgentStatusLog.jsx:68: <header><h2 id={`${id}-title`}>Agent Status Log</h2><div className="agent-dash-status"><span>Auto-refreshes every 30 seconds</span><button onClick={() => setVersion(value => value + 1)} disabled={current.loading}>Refresh log</button></div></header>
src/components/AgentStatusLog.jsx:74: <p className="agent-dash-note">Availability changes, newest first. Times use your local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
src/components/AgentTools.jsx:139: description: "Internal SEP script, qualifying events, and enrollment window guidance.",
src/components/AgentTools.jsx:149: { id: "u65-product-guidance", title: "U65 Product Guidance", description: "All 59 workbook variants, required statements and exact-plan Co-Pilot selection.", icon: <BookOpen size={16} /> },
src/components/AgentTools.jsx:153: description: "Practice off-market product knowledge, MedMax scenarios, and Dual / LIS SEP eligibility in one place.",
src/components/AgentTools.jsx:166: description: "Access compliance references, call history, and transcript uploads for your selected workflow.",
src/components/AgentTools.jsx:172: description: "Search carriers and plans, check eligibility and enrollment resources, and access official references and carrier portals.",
src/components/AgentTools.jsx:178: description: "ACA enrollment document reference with sample images and field lookup help.",
src/components/AgentTools.jsx:184: description: "Admin script template editor for MA, Med Sup, ACA, U65, and ancillary flows.",
src/components/AgentTools.jsx:321: <span className="at-tool-desc">{tool.description}</span>
src/components/AgentTools.jsx:361: <p className="at-modal-desc">{tool.description}</p>
src/components/AgentTools.jsx:562: <p className="at-doc-description">{reference.description}</p>
src/components/ClientQuickScripts.jsx:25: hint: "Use SEP finder",
src/components/ClientQuickScripts.jsx:42: hint: "Follow up October 15",
src/components/ClientQuickScripts.jsx:51: hint: "Review now",
src/components/ClientQuickScripts.jsx:104: hint: "Use SEP finder",
src/components/ClientQuickScripts.jsx:181: {section.hint ? (
src/components/ClientQuickScripts.jsx:182: <span className="client-quick-script-section__hint">
src/components/ClientQuickScripts.jsx:183: ({section.hint})
src/components/ClientQuickScripts.jsx:224: <span className="client-quick-script-section__hint">
src/components/ClientQuickScripts.jsx:225: ({activeBranch.hint})
src/components/ComplianceDashboard.jsx:43: /* ── Color helpers, semantic score palette ── */
src/components/ComplianceDashboard.jsx:205: {cat.description}
src/components/DailyVerse.jsx:941: <span className="dv-original-hint">
src/components/SEPLookup.jsx:113: <div className="sep-map-landing-hint">
src/components/SessionSummary.jsx:328: cat.description,
src/components/SessionSummary.jsx:414: v.evidence || v.description,
src/components/TenantSettings.jsx:508: <span className="tenant-settings-muted">Global vendor pause immediately reports unavailable and is audit logged.</span>
src/components/TenantSettings.jsx:568: <p className="tenant-settings-muted">
src/components/TenantSettings.jsx:673: <p className="tenant-settings-muted">Current wrap-up carrier list: {carrierSummary || "none"}</p>
src/components/VendorRoutingSettings.jsx:55: <p className="tenant-settings-muted">A matrix row asserts the agent is licensed in that state. Carrier checks control full and partial routing. Missing rows are ineligible.</p>
src/components/VendorRoutingSettings.jsx:59: <p className="tenant-settings-muted">Read-only call report. Rotating creates a new link and immediately invalidates the old one.</p>
src/components/VendorRoutingSettings.jsx:60: <p className="tenant-settings-muted">{data.report_token_updated_at ? `Active · rotated ${new Date(data.report_token_updated_at).toLocaleString()}` : 'No active link'}</p>
src/components/VendorRoutingSettings.jsx:72: <p className="tenant-settings-muted">Eastern Time. Accepted pings remain valid for calls arriving within 30 seconds. Existing calls continue after closing.</p>
src/components/VendorRoutingSettings.jsx:74: {counter && <p className="tenant-settings-muted">
src/components/contacts/ContactsTab.jsx:1181: <span className="contacts-muted">Details save when you leave a field or press Enter.</span>
src/components/medsup/RateComparisonPanel.jsx:96: const wlbPoint = wlbProfile?.accel_uw_description || "accelerated underwriting";
src/components/phone/ActiveCallExpanded.jsx:100: return <div className="phone-expanded__hint">No contact linked to this call yet.</div>;
src/components/phone/DialerPanel.jsx:412: <div className="phone-dialer__hint">Softphone status: {inbound?.deviceStatus || "offline"}</div>
src/components/sep/SEPCard.jsx:89: <p>{sep.description}</p>
src/context/ComplianceScorer.js:384: description: "Agent identification, recording disclosure, and consent",
src/context/ComplianceScorer.js:439: description: "TPMO disclaimer, SNP disclosures, and prohibited claims",
src/context/ComplianceScorer.js:532: description: "POA check, no-obligation statement, product scope",
src/context/ComplianceScorer.js:572: description: "Parts A/B, election period, disqualifying coverage",
src/context/ComplianceScorer.js:637: description: "Providers, medications, pharmacy, and summary recap",
src/context/ComplianceScorer.js:684: description: "Plan benefits, network, coverage impact, disclosures",
src/context/ComplianceScorer.js:751: description:
src/context/ComplianceScorer.js:804: description: "Confirmation number, carrier info, rights, next steps",
src/context/ComplianceScorer.js:861: description: "Call duration, section order, warning volume",
src/context/ComplianceScorer.js:1018: description: cat.description,
src/context/ComplianceScorer.js:1086: description: category.description,
src/context/ComplianceScorer.js:1101: description: category.description,
src/context/ComplianceScorer.js:1251: description: c.description,
src/context/InboundCallContext.jsx:278: // helper keeps the old socket alive until presence-ready arrives.
src/context/TranscriptAnalyzer.js:217: description: "Agent stated their full name",
src/context/TranscriptAnalyzer.js:245: description: "Agent identified as licensed sales agent",
src/context/TranscriptAnalyzer.js:268: description: "Agent named their agency",
src/context/TranscriptAnalyzer.js:291: description: "Agent disclosed call is being recorded",
src/context/TranscriptAnalyzer.js:317: description: "Agent obtained consent to continue on recorded line",
src/context/TranscriptAnalyzer.js:345: description: "Agent asked for beneficiary's name",
src/context/TranscriptAnalyzer.js:376: description: "Agent collected ZIP code",
src/context/TranscriptAnalyzer.js:401: description: "Agent collected callback phone number",
src/context/TranscriptAnalyzer.js:426: description:
src/context/TranscriptAnalyzer.js:482: description: "Agent stated specific org/plan counts for beneficiary's area",
src/context/TranscriptAnalyzer.js:524: description:
src/context/TranscriptAnalyzer.js:539: description:
src/context/TranscriptAnalyzer.js:565: description:
src/context/TranscriptAnalyzer.js:587: description: "Agent provided DSNP eligibility disclosure",
src/context/TranscriptAnalyzer.js:612: description: "Agent provided CSNP eligibility disclosure",
src/context/TranscriptAnalyzer.js:637: description: "No misleading or unsubstantiated claims detected",
src/context/TranscriptAnalyzer.js:695: description: "Agent checked for Power of Attorney / authorized rep",
src/context/TranscriptAnalyzer.js:724: description: "Agent stated beneficiary is not obligated to enroll",
src/context/TranscriptAnalyzer.js:756: description: "Agent listed product types to discuss",
src/context/TranscriptAnalyzer.js:794: description: "Agent obtained permission to discuss specific products",
src/context/TranscriptAnalyzer.js:825: description: "SOA was established before any plan was discussed",
src/context/TranscriptAnalyzer.js:910: description: "Agent verified Medicare Parts A and B",
src/context/TranscriptAnalyzer.js:939: description: "Agent determined valid election period",
src/context/TranscriptAnalyzer.js:972: description: "Agent checked for disqualifying coverage",
src/context/TranscriptAnalyzer.js:1003: description: "Agent obtained permission to check MARx/eligibility system",
src/context/TranscriptAnalyzer.js:1032: description: "Agent confirmed service area address",
src/context/TranscriptAnalyzer.js:1060: description: "Agent determined reason for calling/inquiring",
src/context/TranscriptAnalyzer.js:1088: description: "Agent identified beneficiary's benefit priorities",
src/context/TranscriptAnalyzer.js:1119: description: "Agent asked about doctors/providers",
src/context/TranscriptAnalyzer.js:1148: description: "Agent asked about medications (names AND dosages)",
src/context/TranscriptAnalyzer.js:1205: description: "Agent asked about hospital/facility preferences",
src/context/TranscriptAnalyzer.js:1230: description: "Agent summarized/recapped needs before recommending a plan",
src/context/TranscriptAnalyzer.js:1266: description: "Plan recommendation was connected to stated needs",
src/context/TranscriptAnalyzer.js:1296: description: "Agent reviewed specific plan benefits",
src/context/TranscriptAnalyzer.js:1357: description: "Agent offered to verify network status",
src/context/TranscriptAnalyzer.js:1386: description: "Agent explained plan replaces Original Medicare",
src/context/TranscriptAnalyzer.js:1414: description: "Agent mentioned right to cancel before effective date",
src/context/TranscriptAnalyzer.js:1439: description: "Agent mentioned Evidence of Coverage / Summary of Benefits",
src/context/TranscriptAnalyzer.js:1468: description: "Agent stated full plan name and type",
src/context/TranscriptAnalyzer.js:1506: description:
src/context/TranscriptAnalyzer.js:1565: description: "Agent obtained explicit verbal consent to enroll",
src/context/TranscriptAnalyzer.js:1600: description: "Agent provided confirmation/application number",
src/context/TranscriptAnalyzer.js:1626: description: "Agent provided carrier customer service number (and TTY)",
src/context/TranscriptAnalyzer.js:1655: description: "Agent mentioned EOC, cancellation rights, and appeal rights",
src/context/TranscriptAnalyzer.js:1687: description:
src/context/TranscriptAnalyzer.js:1733: description: "Agent provided agency callback number for future questions",
src/context/TranscriptAnalyzer.js:1761: description: "Agent mentioned Medicare star rating system",
src/context/TranscriptAnalyzer.js:1818: description: intent.description,
src/context/TranscriptAnalyzer.js:1827: description: intent.description,
src/context/TranscriptAnalyzer.js:1838: description: intent.description,
src/context/scriptReducer.js:10: /* ---- localStorage helpers for auto-fill carry-forward ---- */
src/context/scriptReducer.js:417: /* ---- Derived state helpers ---- */
src/data/bibleReference.js:97: lxx: "LXX Joshua is approximately 4–5% shorter than MT. The boundary descriptions and city lists differ in several places, and the order of certain conquest narratives varies.",
src/data/bibleReference.js:164: "Solomon's gates at Hazor, Megiddo, and Gezer match the description in 1 Kings 9:15. The Phoenician-style Temple plan parallels the 'Ain Dara temple in Syria.",
src/data/bibleReference.js:823: "The detailed Tabernacle and priestly descriptions in Hebrews align with archaeological understanding of Second Temple practices. The Copper Scroll from Qumran lists Temple treasures, illuminating the priestly context.",
src/data/maScript2027.js:52: option("continue", "Continue without helper", [
src/data/maScript2027.js:54: choice("helperRole", "Does the absent person have legal authority?", [
src/data/maScript2027.js:55: option("helper", "Informal helper", [note("Allow time to consult the helper before enrolling.")]),
src/data/sepPlanDb.js:1: /* ZIP prefix to county hints for the SEP lookup. Plans come from PY2027 Supabase data. */
src/flows/ancillary/ancillaryConstants.js:27: description: "Cash benefit positioning, rider review, and close.",
src/flows/ancillary/ancillaryConstants.js:33: description: "Senior benefit opening, health pre-qual, and 3-option close.",
src/flows/ancillary/ancillaryConstants.js:39: description: "Fact find, coverage gap build, waiting periods, and close.",
src/flows/ancillary/ancillaryConstants.js:45: description: "NAIC best-interest intake, recommendation, disclosures, and e-app.",
src/flows/u65/U65Data.js:74: const HINT = (text, tone) => ({ type: "hint", text, tone });
src/flows/u65/U65Data.js:604: if (block.type === "hint") {
src/flows/u65/U65Flow.jsx:143: ...directions.map((text) => ({ type: "hint", text })),
src/flows/u65/U65Flow.jsx:230: <div className={`flow-stage-direction u65-nepq-hint is-${tone}`}>
src/flows/u65/U65Flow.jsx:437: if (block.type === "hint") {
src/hooks/useCopilotEngine.js:173: // A vocabulary hint only; the LLM must still evaluate all speech for risks.
src/hooks/useCopilotEngine.js:263: Use these section titles and selected script paths when coaching. If this differs from older hardcoded descriptions or retrieved script requirements, this script wins. Unanswered choices are pending; do not require hidden alternative paths or infer completion from a button click.
src/lib/dualLisSep.js:40: {...base,id:'medicare-dual-lis',type:'Dual / LIS monthly PDP SEP',code:'DUAL/LIS',event:'Medicaid or Extra Help; verify eligibility and monthly use',description:DUAL_LIS_GUIDANCE,eligibleProducts:['PDP'],eligibilityStatus:rights.pdp,matchingPlans:plans.filter(plan=>plan.cat==='PDP')},
src/lib/dualLisSep.js:41: {...base,id:'medicare-integrated-care',type:'Integrated-care monthly D-SNP SEP',code:'SEP-INT',event:'Full-benefit dual with verified aligned integrated-plan enrollment',description:INTEGRATED_CARE_GUIDANCE,eligibleProducts:['D-SNP'],eligibilityStatus:rights.integrated,matchingPlans:plans.filter(isIntegratedDsnp)},
src/lib/dualLisSep.js:50: ? dualLisSepCards().map(card=>({sep_type:card.type,period:card.duration,evidence:card.description,
src/lib/phone.js:1: // Shared browser normalization; keep in sync with the database and telephony helper.
src/lib/sepCms.js:5: Prefer RPC helpers when available, but fall back to direct table queries
src/lib/sepEngine.js:30: description: `${d.id}, ${d.type} in ${d.state}. Counties: ${d.counties.join(", ")}.${
src/lib/sepEngine.js:76: description: "Currently enrolled MA beneficiaries can make ONE plan change: switch MA/MAPD plan, or drop MA and return to Original Medicare + PDP.",
src/lib/sepEngine.js:86: event: "Turning 65 / New to Medicare", description: "7-month window around 65th birthday. First chance to enroll in MA, MAPD, or Medigap.",
src/lib/sepEngine.js:90: event: "First eligible for Medicare Part A/B", description: "7-month period to sign up for Part A/B, then enroll in MA/MAPD. Late Part B enrollment may trigger penalties.",
src/lib/sepEngine.js:95: event: "Permanent move, current plan no longer available", description: "63-day SEP to enroll in a new MA/MAPD plan in new service area after permanent address change.",
src/lib/sepEngine.js:99: event: "Involuntary loss of employer/union/group coverage", description: "63-day SEP after involuntary loss of creditable coverage (employer ended, COBRA expired, etc.).",
src/lib/sepEngine.js:103: event: "Move into/out of nursing facility or institution", description: "Continuous SEP while in institution + 2 months after discharge.",
src/lib/sepEngine.js:132: description: `${d.id}, ${d.type} in ${d.state}. Counties: ${d.counties.join(", ")}.${
src/lib/sepEngine.js:182: description:
src/lib/sepEngine.js:202: description:
src/lib/sepEngine.js:220: description:
src/lib/sepEngine.js:239: description:
src/lib/sepEngine.js:262: description:
src/lib/sepEngine.js:280: description:
src/lib/sepEngine.js:298: description:
src/lib/sepEngine.js:321: description:
src/lib/sepGeo.js:3: Zip-to-state mapping, carrier availability, and date helpers.
src/services/salesForumReferenceService.js:17: "accel_uw_description",
src/styles/phone-dropdown.css:319: .phone-dialer__hint,
src/styles/phone-dropdown.css:770: .phone-expanded__hint {
src/styles/v3-overrides.css:1359: .enrollment-cta__description,
src/styles/v3-overrides.css:1360: .section-enrollment__description {
src/styles/v3-overrides.css:2448: .app-shell-modern .at-doc-description,
src/styles.css:5700: .client-quick-script-section__hint {
src/styles.css:6423: .u65-nepq-hint {
src/styles.css:6428: .u65-nepq-hint .flow-stage-text {
src/styles.css:6432: .u65-nepq-hint.is-warning {
src/styles.css:6437: .u65-nepq-hint.is-warning .flow-stage-text {
src/styles.css:6441: .u65-nepq-hint.is-danger {
src/styles.css:6446: .u65-nepq-hint.is-danger .flow-stage-text {
src/styles.css:7179: .script-start-call-hint {
src/styles.css:7221: .ancillary-helper {
src/styles.css:9315: .dv-original-hint {
src/styles.css:9325: .dv-original-hint a {
src/styles.css:9329: .dv-original-hint a:hover {
src/styles.css:10885: .sidebar-wallpaper-panel-hint {
src/styles.css:11810: .tenant-settings-muted,
```

## Phase 6 — removed strings
- `src/components/AgentAudioSettings.jsx`: Reduce background noise on your calls. Settings are saved to your user profile. Calibrate with your usual headset and room.
- `src/components/AgentAudioSettings.jsx`: Lower values keep softer speech; higher values block more room noise. Changes apply to the next call.
- `src/components/TenantSettings.jsx`: Global vendor pause immediately reports unavailable and is audit logged.

## Implementation status / review limitations

This branch is an incomplete refresh, not acceptance-ready. Phase 1 contains exhaustive pattern matches, but button roles and helper candidates still require manual classification. Only the three explicitly recorded helper sentences were removed. Shared key utility variants are introduced and settings actions adopt them; other controls are pending.

The global cascade in `src/styles.css`, `src/styles/v3-overrides.css`, and `src/styles/design-tokens.css` needs further isolation of protected surfaces before safe palette and border replacement. White palette replacement, app-wide button migration, typography normalization, and remaining helper removal are outstanding. Formula1 remains because the wordmark uses it. Adobe production verification has not been performed. No claim of WCAG conformance is made: requested button gradients also need contrast assessment.

## Per-screen QA checklist

All items below are pending interactive verification in **both** themes:

- [ ] Dashboard
- [ ] CRM Calls
- [ ] CRM Contacts (Terminal preservation)
- [ ] CRM Opportunities (pipeline color preservation)
- [ ] CRM Follow-ups
- [ ] Agent Tools
- [ ] Intelligence feed, ZIP search, maps and legends
- [ ] RTS
- [ ] Daily Verse
- [ ] MA, Med Sup, ACA, U65, annuity script flows
- [ ] SEP Finder / SEP Qualifier / SNP Routing
- [ ] Co-Pilot / live transcript / compliance
- [ ] Agency Settings and other modals
- [ ] Dropdowns, toasts, empty and loading states
- [ ] Softphone and wordmark preservation
- [ ] Logged-out landing and sign-in

Terminal default and saved light preference behavior already exist in ThemeContext and bootstrap. Bootstrap light theme-color remains the original palette until the complete white palette lands.

## Continuation — phase 2
Replaced core light surfaces, text, accent and status palettes; preserved all existing token names and the `.dark` block byte-for-byte. Light Contacts uses white clay tokens with unchanged radii. Dialer light phone tokens are frozen to their previous resolved values. White wallpaper is suppressed. Raw chart/map/pipeline color isolation still requires visual verification; this phase is not yet accepted as complete.

## Continuation — phase 3
Shared glossy utility styling now covers native buttons with explicit exclusions for tabs, dialer, map subtrees, logo, and Terminal Contacts. Known primary/destructive/go class roles map to gradient tokens. Icon action classes use the flat treatment. Dynamic and unclassified button roles remain manual QA candidates; dropdown caret geometry remains unverified.

## Continuation — phase 4
Added surface/field/table border rules with protected Contacts, phone, maps, pipeline cards/columns and badge exclusions. Inputs use filled surfaces and visible focus rings. Settings checkbox is inline. Classes outside the suffix-based surface selectors still require manual review.

## Continuation — phase 5
Fallback stack now follows the requested Avenir/Segoe stack; script-read token uses Tahoma. Added medium-weight cap outside protected surfaces and removed redundant inner Agency Settings heading. Formula1 import is retained for the logo. Adobe kit is absent; no kit identifier was supplied, so production Mac/Windows Adobe loading cannot be confirmed. Existing raw weight declarations remain beneath the override and require source cleanup after exclusion review.

## Continuation — phase 6 removed UI strings
- `src/components/VendorRoutingSettings.jsx`: `A matrix row asserts the agent is licensed in that state. Carrier checks control full and partial routing. Missing rows are ineligible.`
- `src/components/VendorRoutingSettings.jsx`: `Read-only call report. Rotating creates a new link and immediately invalidates the old one.`
- `src/components/VendorRoutingSettings.jsx`: `Eastern Time. Accepted pings remain valid for calls arriving within 30 seconds. Existing calls continue after closing.`
- `src/components/TenantSettings.jsx`: `Enter your CRM inbound webhook URL. EnrollGen sends enrollment data here after each completed call.`
- `src/components/AgentStatusLog.jsx`: `<span>Auto-refreshes every 30 seconds</span>`
- `src/components/AgentStatusLog.jsx`: `<p className="agent-dash-note">Availability changes, newest first. Times use your local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>`
- `src/components/contacts/ContactsTab.jsx`: `<span className="contacts-muted">Details save when you leave a field or press Enter.</span>`
- `src/components/AgentTools.jsx`: `<span className="at-tool-desc">{tool.description}</span>`
- `src/components/AgentTools.jsx`: `<p className="at-modal-desc">{tool.description}</p>`

Ambiguous script guidance, compliance descriptions, map notes and document reference descriptions remain intact pending content review. Dynamic tool descriptions are no longer rendered; underlying data is unchanged.

## Continuation — phase 7
Terminal remains the explicit default in both bootstrap and ThemeProvider. Saved light preference still selects light without migration. Bootstrap white theme-color now matches the new page token; ThemeProvider continues syncing the meta tag on toggles. No persistence or API changes.

## Select treatment correction
All native selects and combobox/listbox filter triggers use flat filled backgrounds, no border/shadows/gradient, 4px radius and 28px caret padding. Phone controls remain excluded. The header product trigger stays glossy. Pressed gloss has zero-blur vertical-only inset shadows.

## Phase 8 — verification and genuine environment blocker

- PASS: `npm test`: 728 passed, 0 failed, 0 skipped (84.0 seconds).
- PASS: production Vite build after select correction (5.46 seconds).
- PASS: Dashboard inspected in Terminal and white; corrected hardcoded white-mode header/dashboard surfaces and chart grid/text/series. Confirmed white screenshot after correction.
- PASS: shared button utilities now load on logged-out pages as well as authenticated pages.
- BLOCKED: populated-data QA. Vite alone returns HTML for API requests. Started local Netlify function server at port 8888 without deployment; protected endpoints then return HTTP 500 with `Clerk auth is enabled but no backend signing key is set`. No authentication bypass or backend change was made.
- BLOCKED: Adobe production Mac/Windows verification: no Adobe kit configured or supplied, and no Windows QA surface available.

### Screen QA disposition (not acceptance sign-off)

| Screen | Terminal | White | Remaining verification |
| --- | --- | --- | --- |
| Dashboard | Inspected empty/error state | Inspected and corrected | Populated data, tooltips |
| CRM Calls | Pending | Inspected empty/error state | Populated rows and recordings blocked by authentication configuration |
| CRM Contacts | Pending | Pending | Data/API-dependent states blocked |
| CRM Opportunities | Pending | Pending | Data/API-dependent stages and cards blocked |
| CRM Follow-ups | Pending | Pending | Data/API-dependent states blocked |
| Agency Settings | Pending | Pending | Protected API configuration blocked |
| Agent Tools | Pending | Pending | Interactive walkthrough outstanding |
| Intelligence feed/ZIP/maps | Pending | Pending | Interactive walkthrough outstanding |
| RTS / Daily Verse | Pending | Pending | Interactive walkthrough outstanding |
| All script flows / SEP / SNP | Pending | Pending | Interactive walkthrough outstanding |
| Co-Pilot / transcript / compliance | Pending | Pending | Interactive walkthrough outstanding |
| Other modals / dropdowns / toasts | Pending | Pending | Interactive walkthrough outstanding |
| Landing / sign-in | Pending | Pending | Shared CSS wired; visual verification outstanding |

The overall refresh is **not complete**. Broad style coverage has been added, but the source audit still contains unclassified button roles, raw colors, legacy borders/weights beneath overrides, and ambiguous descriptions. Those are not silently certified. Dropdown flat-field correction is implemented; caret geometry and button role coverage still need per-screen inspection. Resolve local backend signing-key configuration through the normal environment setup (do not put credentials in this audit) before accepting populated-screen QA.

## Revision — phase 2 roles
White local script/rail/operations terminal palettes now resolve neutral labels/data instead of orange. Script bars explicitly use blue/white; reading text uses primary text, cues secondary text. Genuine warning/pending semantic tokens remain amber. Dashboard data labels are neutral. Source scan includes components and flows; protected map colors, emoji labels, and exported PDF score colors are retained.

## Button role classification — revision

| File:line | Label/class evidence | Role |
|---|---|---|
| src/App.jsx:258 | className="flow-select-trigger" | secondary |
| src/App.jsx:276 | className={`flow-select-option${active ? " is-active" : ""}`} | secondary |
| src/App.jsx:300 | className="flow-select-option" | secondary |
| src/App.jsx:382 | Retry | secondary |
| src/App.jsx:835 | className="left-rail-handle left-rail-handle-launcher" | secondary |
| src/App.jsx:917 | className="top-panel-close" | icon |
| src/App.jsx:951 | Refresh and return to the main page | preserve |
| src/App.jsx:965 | className={`top-bar-tab${activeTabId === tab.id ? " is-active" : ""}`} | preserve |
| src/App.jsx:1001 | className="top-bar-settings-button top-bar-theme-button" | secondary |
| src/App.jsx:1011 | className={`top-bar-settings-button${openPanel === "settings" ? " is-active" : ""}`} | secondary |
| src/App.jsx:1034 | RETURN TO CALL | secondary |
| src/App.jsx:1364 | Sign in | secondary |
| src/components/ACAIntelligence.jsx:335 |  | secondary |
| src/components/ACAIntelligence.jsx:398 | REJECT | secondary |
| src/components/ACAIntelligence.jsx:406 | APPROVE | secondary |
| src/components/AgentAudioSettings.jsx:82 | Save audio settings | primary |
| src/components/AgentAudioSettings.jsx:83 | Calibrate | secondary |
| src/components/AgentAudioSettings.jsx:84 | Cancel | secondary |
| src/components/AgentAvailabilityToggle.jsx:51 | className={`agent-availability-btn${ option.value === selectedStatus ? " is-active" : "" }`} | secondary |
| src/components/AgentDashboard.jsx:167 | ↗ | secondary |
| src/components/AgentDashboard.jsx:167 | Refresh | secondary |
| src/components/AgentDashboard.jsx:179 |  | secondary |
| src/components/AgentStatusLog.jsx:68 | Refresh log | secondary |
| src/components/AgentStatusLog.jsx:80 | Previous | secondary |
| src/components/AgentStatusLog.jsx:80 | Next | secondary |
| src/components/AgentTools.jsx:301 | className="at-tool-card" | secondary |
| src/components/AgentTools.jsx:344 | Close | icon |
| src/components/AgentTools.jsx:494 | Back | secondary |
| src/components/AgentTools.jsx:567 | className={`at-doc-status-btn${status.status === currentStatus.status ? " is-active" : ""}`} | secondary |
| src/components/AgentTools.jsx:594 | className="at-doc-card" | secondary |
| src/components/AgentTools.jsx:639 | className={`at-filter-tab${activeSection === section.id ? " is-active" : ""}`} | preserve |
| src/components/AgentToolsProductQuiz.jsx:103 | Retake Quiz | secondary |
| src/components/AgentToolsProductQuiz.jsx:177 | className={`at-quiz-choice${stateClass}`} | secondary |
| src/components/AgentToolsProductQuiz.jsx:202 | className="at-quiz-next-btn" | secondary |
| src/components/AppToast.jsx:53 | × | secondary |
| src/components/AskCopilotMini.jsx:100 | Send | secondary |
| src/components/AvailabilityStrip.jsx:71 | className="availability-strip" | secondary |
| src/components/AvailabilityStrip.jsx:95 | className={`availability-menu__option${active ? " is-active" : ""}`} | secondary |
| src/components/BillingSettings.jsx:110 | className="billing-icon-button" | icon |
| src/components/BillingSettings.jsx:170 | Manage Billing | secondary |
| src/components/BillingSettings.jsx:188 | className="billing-button" | secondary |
| src/components/BillingSettings.jsx:208 | className="billing-button is-primary" | secondary |
| src/components/CarrierQuickRef.jsx:80 | className={`carrier-quickref-filter-pill${ productFilter === filter.id ? " is-active" : "" }`} | secondary |
| src/components/CarrierQuickRef.jsx:136 | className="carrier-quickref-plan-trigger" | secondary |
| src/components/CarrierRef.jsx:111 |  | secondary |
| src/components/CarrierRef.jsx:320 | ✕ | secondary |
| src/components/CarrierRef.jsx:705 |  | secondary |
| src/components/CarrierRef.jsx:1115 | ✕ | secondary |
| src/components/CenterTimerBar.jsx:28 | className={`eg-audio-share-button${audioSharing ? " is-active" : ""}`} | secondary |
| src/components/ClientQuickScripts.jsx:165 | className="client-quick-script-panel__close" | icon |
| src/components/ClientQuickScripts.jsx:206 | className={`client-quick-script-branch-button client-quick-script-branch-button--${branch.id}${ activeBranchId === branch.id ? " i | secondary |
| src/components/CompactCopilotRail.jsx:86 | className={`copilot-pill-button copilot-pill-button--listen${ listening ? " is-listening" : "" }`} | secondary |
| src/components/CompactCopilotRail.jsx:98 | CLEAR | secondary |
| src/components/CompactCopilotRail.jsx:104 | className="copilot-pill-button copilot-pill-button--analyze" | secondary |
| src/components/CompactCopilotRail.jsx:252 | Expand co-pilot rail | secondary |
| src/components/CompactCopilotRail.jsx:271 | Minimize co-pilot rail | secondary |
| src/components/CompactCopilotRail.jsx:287 | className="right-rail-toggle" | secondary |
| src/components/CompactCopilotRail.jsx:311 | Minimize co-pilot rail | secondary |
| src/components/ComplianceDashboard.jsx:676 |  | secondary |
| src/components/ComplianceIntentAccordion.jsx:58 | className="ops-intent-accordion-trigger" | secondary |
| src/components/DailyVerse.jsx:651 | Pick by theme | secondary |
| src/components/DailyVerse.jsx:678 | className={`dv-icon-btn${parallelMode ? " is-active" : ""}`} | icon |
| src/components/DailyVerse.jsx:688 | className={`dv-icon-btn${favoritesOpen ? " is-active" : ""}`} | icon |
| src/components/DailyVerse.jsx:698 | className="dv-translation-btn" | secondary |
| src/components/DailyVerse.jsx:728 | Refresh verse | secondary |
| src/components/DailyVerse.jsx:759 | className="dv-favorites-load" | secondary |
| src/components/DailyVerse.jsx:779 | Save | primary |
| src/components/DailyVerse.jsx:786 | Cancel | secondary |
| src/components/DailyVerse.jsx:801 | className="dv-favorites-mini" | secondary |
| src/components/DailyVerse.jsx:810 | Remove | secondary |
| src/components/DailyVerse.jsx:854 | className="dv-translation-btn dv-translation-btn--mini" | secondary |
| src/components/DailyVerse.jsx:969 | className={`dv-action${speaking ? " is-active" : ""}`} | secondary |
| src/components/DailyVerse.jsx:978 | className={`dv-action${copied ? " is-done" : ""}`} | secondary |
| src/components/DailyVerse.jsx:987 | className={`dv-action${ imageStatus === "copied" // imageStatus === "downloaded" ? " is-done" : "" }${imageGenerating ? " is-loadi | icon |
| src/components/DailyVerse.jsx:1013 | className={`dv-action${isFavorited ? " is-active" : ""}`} | secondary |
| src/components/DailyVerse.jsx:1025 | className={`dv-action${contextOpen ? " is-active" : ""}`} | secondary |
| src/components/DailyVerse.jsx:1034 | className={`dv-action${crossRefsOpen ? " is-active" : ""}`} | secondary |
| src/components/DailyVerse.jsx:1080 | className="dv-crossrefs-item" | secondary |
| src/components/DailyVerse.jsx:1114 | className={`dv-commentary-toggle${ commentaryOpen ? " open" : "" }`} | secondary |
| src/components/DtmfKeypad.jsx:17 | Toggle keypad | secondary |
| src/components/DtmfKeypad.jsx:29 | className="dtmf-keypad-key" | secondary |
| src/components/MAScriptBranches.jsx:59 | className="script-start-call-button" | primary |
| src/components/MAScriptBranches.jsx:72 | className={`script-start-call-button ma-script-option${node.selected === option.value ? " is-active" : ""}`} | primary |
| src/components/MedSupFlow.jsx:72 | className="check flow-gate-check" | secondary |
| src/components/MedSupFlow.jsx:277 | New Call | secondary |
| src/components/MedSupFlow.jsx:405 | START | primary |
| src/components/MiniLiveTranscript.jsx:209 | Jump to latest | secondary |
| src/components/Onboarding.jsx:205 | className="billing-icon-button" | icon |
| src/components/Onboarding.jsx:215 | Add Agent | primary |
| src/components/Onboarding.jsx:259 | Start Starter | primary |
| src/components/Onboarding.jsx:269 | Start Pro | primary |
| src/components/Onboarding.jsx:274 | Save setup and choose billing later | primary |
| src/components/Onboarding.jsx:285 | Enter EnrollGen | secondary |
| src/components/Onboarding.jsx:294 | Back | secondary |
| src/components/Onboarding.jsx:302 | Continue | secondary |
| src/components/PlaybookModal.jsx:13 | Close Private Plan Playbook | icon |
| src/components/PreloadRecoveryNotice.jsx:13 | Reload | secondary |
| src/components/PreloadRecoveryNotice.jsx:15 | Dismiss | secondary |
| src/components/PrivatePlanCard.jsx:5 | className={`private-plan-card${selected ? " is-selected" : ""}`} | secondary |
| src/components/PrivatePlanPanel.jsx:13 | Open Full Playbook | secondary |
| src/components/ProfileMenu.jsx:36 | className="top-bar-profile-trigger" | secondary |
| src/components/ProfileMenu.jsx:45 | Sign Out | secondary |
| src/components/ProgressDots.jsx:18 | className={`progress-dot is-${status}${isActive ? " is-active" : ""}`} | secondary |
| src/components/RTSIngestionPanel.jsx:295 | Import RTS | secondary |
| src/components/RTSIngestionPanel.jsx:313 | Close RTS ingestion | icon |
| src/components/RTSIngestionPanel.jsx:347 | Select file | secondary |
| src/components/RTSIngestionPanel.jsx:562 | Start over | primary |
| src/components/RTSIngestionPanel.jsx:565 | className="rts-primary-button" | secondary |
| src/components/RTSIngestionPanel.jsx:590 | Done | secondary |
| src/components/RTSTab.jsx:170 | className={`rts-cell-value${allowed ? " is-editable" : " is-locked"}${ saving ? " is-saving" : "" }${saved ? " is-saved" : ""}`} | preserve |
| src/components/RTSTab.jsx:193 | className={active ? "is-active" : ""} | secondary |
| src/components/RTSTab.jsx:494 | Retry | secondary |
| src/components/RTSTab.jsx:560 |  | secondary |
| src/components/SEPFinder.jsx:91 | Show Available SEPs | secondary |
| src/components/SEPFinder.jsx:100 | Refresh SEP lookup | secondary |
| src/components/SEPGuide2026.jsx:414 |  | secondary |
| src/components/SEPGuide2026.jsx:621 | className="at-training-section-toggle" | secondary |
| src/components/SEPGuide2026.jsx:731 |  | secondary |
| src/components/SEPLookup.jsx:98 | Reset | secondary |
| src/components/SEPLookup.jsx:162 | Plans ( ) | preserve |
| src/components/SEPLookup.jsx:170 | SEPs ( ) | preserve |
| src/components/SEPLookup.jsx:257 | Clear | secondary |
| src/components/SEPResultsModal.jsx:42 | × | secondary |
| src/components/SEPResultsModal.jsx:64 | Close | secondary |
| src/components/SEPResultsPanel.jsx:162 | Refresh SEP lookup | secondary |
| src/components/SEPResultsPanel.jsx:226 | className="sep-finder-card-detail-trigger" | secondary |
| src/components/ScriptEditor.jsx:219 | Revert to Default | secondary |
| src/components/ScriptEditor.jsx:222 | className="primary" | secondary |
| src/components/ScriptEditor.jsx:230 | className={flow === id ? "is-active" : ""} | secondary |
| src/components/ScriptEditor.jsx:260 |  | secondary |
| src/components/ScriptEditor.jsx:263 |  | secondary |
| src/components/ScriptEditor.jsx:266 |  | secondary |
| src/components/ScriptEditor.jsx:325 | Add Section | secondary |
| src/components/ScriptFlow.jsx:222 | className={`copilot-pill-button copilot-pill-button--listen${ listening ? " is-listening" : "" }`} | secondary |
| src/components/ScriptFlow.jsx:239 | CLEAR | secondary |
| src/components/ScriptFlow.jsx:245 | className="copilot-pill-button copilot-pill-button--analyze" | secondary |
| src/components/ScriptFlow.jsx:386 | Expand Co-Pilot rail | secondary |
| src/components/ScriptFlow.jsx:408 | Minimize Co-Pilot rail | secondary |
| src/components/ScriptFlow.jsx:426 | className="right-rail-toggle" | secondary |
| src/components/ScriptFlow.jsx:448 | Minimize Co-Pilot rail | secondary |
| src/components/ScriptFlow.jsx:1057 | className="script-start-call-button" | primary |
| src/components/ScriptFlow.jsx:1073 | Go to previous card | secondary |
| src/components/ScriptSection.jsx:76 | No Enrollment - Wrap Up | secondary |
| src/components/SessionLockOverlay.jsx:52 | I've verified my identity — continue | secondary |
| src/components/SessionSummary.jsx:626 | Copy Summary | secondary |
| src/components/SessionSummary.jsx:629 | className="btn-clay" | secondary |
| src/components/SharedUI.jsx:72 | className={`copy-btn script-action-btn ${isEditing ? "is-active" : ""}`} | secondary |
| src/components/SharedUI.jsx:85 | Copy script text | secondary |
| src/components/SharedUI.jsx:199 | className="primary section-complete-btn" | secondary |
| src/components/SmsToastHost.jsx:74 | ✕ | secondary |
| src/components/TenantSettings.jsx:495 | className="eg-key eg-key--primary billing-button is-primary" | secondary |
| src/components/TenantSettings.jsx:507 | className={`eg-key billing-button${vendorPaused ? " is-primary" : ""}`} | secondary |
| src/components/TenantSettings.jsx:555 | className="billing-icon-button" | icon |
| src/components/TenantSettings.jsx:596 | className="billing-icon-button" | icon |
| src/components/TenantSettings.jsx:623 | Add Agent | primary |
| src/components/TenantSettings.jsx:644 | className="billing-icon-button" | icon |
| src/components/TenantSettings.jsx:657 | className="billing-icon-button" | icon |
| src/components/TenantSettings.jsx:695 | className="billing-icon-button" | icon |
| src/components/TenantSettings.jsx:705 | Add Rate | secondary |
| src/components/TenantSettings.jsx:718 | className="billing-icon-button" | icon |
| src/components/TranscriptUpload.jsx:363 | className="primary" | secondary |
| src/components/UnderwritingChecker.jsx:5 | Acknowledge | secondary |
| src/components/VendorRoutingSettings.jsx:63 | className="billing-button is-primary" | secondary |
| src/components/VendorRoutingSettings.jsx:64 | Revoke report link | destructive |
| src/components/VendorRoutingSettings.jsx:88 | Save hours and billing | primary |
| src/components/VendorRoutingSettings.jsx:97 | Save routing settings | primary |
| src/components/VendorRoutingSettings.jsx:113 | Remove | destructive |
| src/components/VendorRoutingSettings.jsx:118 | Add licensed state | secondary |
| src/components/aca/AcaFfmSepFinder.jsx:36 | className="aca-ffm-sep-category__trigger" | secondary |
| src/components/aca/AcaFfmSepFinder.jsx:79 | className="aca-ffm-sep-category__proceed" | secondary |
| src/components/ancillary/AncillaryPopup.jsx:69 | className="ancillary-popup-dismiss" | icon |
| src/components/ancillary/AncillaryPopupManager.jsx:151 | className={`ancillary-popup-chip${ active ? " is-active" : "" }`} | preserve |
| src/components/ancillary/AncillaryPopupManager.jsx:207 | className="ancillary-popup-link" | secondary |
| src/components/ancillary/AncillaryPopupManager.jsx:285 | Mark Complete | secondary |
| src/components/ancillary/CarrierReferencePopupManager.jsx:63 | className="ancillary-popup-accordion-toggle" | secondary |
| src/components/ancillary/MOHRiderBundle.jsx:131 | Select Bundle | secondary |
| src/components/callDetail/CallDetailPanel.jsx:72 | className={activeTab === tab ? "is-active" : ""} | preserve |
| src/components/callDetail/CallDetailPanel.jsx:357 | Combine with… | secondary |
| src/components/callDetail/ComplianceReviewModal.jsx:96 | className="compliance-review-category-head" | secondary |
| src/components/callDetail/ComplianceReviewModal.jsx:112 | className={`compliance-review-flag ${status.className}${activeItemId === item.id ? " is-active" : ""}`} | secondary |
| src/components/callDetail/ComplianceReviewModal.jsx:279 | CLOSE | secondary |
| src/components/callDetail/MergedRecordingPlayer.jsx:69 | className="contacts-mini-btn" | secondary |
| src/components/callDetail/RecordingPanel.jsx:71 | REFRESH | secondary |
| src/components/callDetail/RecordingPanel.jsx:83 | PLAY | secondary |
| src/components/callDetail/RecordingPanel.jsx:84 | DOWNLOAD WAV | secondary |
| src/components/callDetail/RecordingPanel.jsx:85 | DOWNLOAD TWILIO COPY | secondary |
| src/components/callDetail/RecordingPanel.jsx:87 | COPY CONVERSLY LINK (WAV) | secondary |
| src/components/callDetail/RecordingPanel.jsx:88 | COPY CONVERSLY LINK (MP3) | secondary |
| src/components/callDetail/RecordingPanel.jsx:92 | RETRY COPY | secondary |
| src/components/callLog/CallDateRangePicker.jsx:67 | className={`contacts-mini-btn call-log-toolbar-icon call-date-trigger${from ? ' is-active' : ''}`} | icon |
| src/components/callLog/CallDateRangePicker.jsx:74 | Previous month | secondary |
| src/components/callLog/CallDateRangePicker.jsx:76 | Next month | secondary |
| src/components/callLog/CallDateRangePicker.jsx:87 | className={`call-date-day${inRange ? ' is-in-range' : ''}${endpoint ? ' is-endpoint' : ''}${key === today ? ' is-today' : ''}`} | secondary |
| src/components/callLog/CallDateRangePicker.jsx:97 | CLEAR | secondary |
| src/components/callLog/CallDateRangePicker.jsx:98 | DONE | secondary |
| src/components/callLog/CallLogTab.jsx:110 | Enrollment intake / save disposition | primary |
| src/components/callLog/CallLogTab.jsx:114 | Save disposition and codes | primary |
| src/components/callLog/CallLogTab.jsx:132 | className="contacts-mini-btn" | secondary |
| src/components/callLog/CallLogTab.jsx:201 | Combine with… | secondary |
| src/components/callLog/CallLogTab.jsx:202 | Enrollment Intake | secondary |
| src/components/callLog/CallLogTab.jsx:204 | className="contacts-mini-btn" | secondary |
| src/components/callLog/CallLogTab.jsx:208 | Compliance Review | secondary |
| src/components/callLog/CallLogTab.jsx:216 | RETRY | secondary |
| src/components/callLog/CallLogTab.jsx:238 | REVIEW → | secondary |
| src/components/callLog/CallLogTab.jsx:378 | Combine Calls | secondary |
| src/components/callLog/CallLogTab.jsx:395 | Recordings | secondary |
| src/components/callLog/CallLogTab.jsx:396 | Refresh calls | secondary |
| src/components/callLog/CallLogTab.jsx:397 | className="contacts-mini-btn call-log-toolbar-icon" | icon |
| src/components/callLog/CallLogTab.jsx:456 | ← PREV | secondary |
| src/components/callLog/CallLogTab.jsx:465 | NEXT → | secondary |
| src/components/callLog/CallLogTab.jsx:521 | Combine with… | secondary |
| src/components/callLog/CallLogTab.jsx:522 | className="call-expand-toggle" | secondary |
| src/components/callLog/CallNotesEditor.jsx:37 | RETRY | secondary |
| src/components/callLog/CallRecordDetailsEditor.jsx:30 | Edit notes and details | secondary |
| src/components/callLog/CallRecordDetailsEditor.jsx:37 | className="contacts-mini-btn" | secondary |
| src/components/callLog/CallRecordDetailsEditor.jsx:38 | Cancel | secondary |
| src/components/callLog/CallRecordings.jsx:29 | RETRY | secondary |
| src/components/callLog/CallRecordings.jsx:39 | className="contacts-mini-btn call-log-toolbar-icon" | icon |
| src/components/callLog/CallRecordings.jsx:43 | ← PREV | secondary |
| src/components/callLog/CallRecordings.jsx:45 | NEXT → | secondary |
| src/components/callLog/CallRecordings.jsx:49 | Close recording details | icon |
| src/components/callLog/CallRecordings.jsx:59 | Refresh recordings | secondary |
| src/components/callLog/CallRecordings.jsx:61 | AVAILABLE | secondary |
| src/components/callLog/CallRecordings.jsx:62 | MISSING | secondary |
| src/components/callLog/CallRowParts.jsx:63 | className="contacts-mini-btn call-recording-icon" | icon |
| src/components/callLog/CallRowParts.jsx:64 | Download recording | icon |
| src/components/callLog/CallTranscriptPlayer.jsx:82 | className="contacts-mini-btn call-recording-icon" | icon |
| src/components/callLog/CallTranscriptPlayer.jsx:85 | x | secondary |
| src/components/callLog/CallTranscriptPlayer.jsx:105 | className={`call-transcript-line${active === index ? ' is-current' : ''}`} | secondary |
| src/components/callLog/CombineCallsModal.jsx:47 | Reload calls | secondary |
| src/components/callLog/CombineCallsModal.jsx:51 | · · · | secondary |
| src/components/callLog/CombineCallsModal.jsx:74 | className="contacts-mini-btn" | secondary |
| src/components/callLog/CombinedCalls.jsx:40 | Retry | secondary |
| src/components/callLog/CombinedCalls.jsx:44 | className="contacts-mini-btn" | secondary |
| src/components/callLog/ComplianceUploads.jsx:40 | Refresh | secondary |
| src/components/callLog/ComplianceUploads.jsx:44 | className="contacts-mini-btn" | secondary |
| src/components/callLog/ComplianceUploads.jsx:57 | Save codes | primary |
| src/components/callLog/MissingRecordings.jsx:23 | Refresh missing recordings | secondary |
| src/components/callLog/MissingRecordings.jsx:29 | VIEW RECORDINGS | secondary |
| src/components/callLog/MissingRecordings.jsx:33 | PREV | secondary |
| src/components/callLog/MissingRecordings.jsx:34 | NEXT | secondary |
| src/components/contacts/ComposePickers.jsx:57 |  | secondary |
| src/components/contacts/ComposePickers.jsx:59 | Emoji picker | secondary |
| src/components/contacts/ComposePickers.jsx:60 | GIF picker | secondary |
| src/components/contacts/ComposePickers.jsx:62 | × | secondary |
| src/components/contacts/ComposePickers.jsx:66 | className={category === name ? "is-active" : ""} | secondary |
| src/components/contacts/ComposePickers.jsx:70 | 🍌 FEATURED: MINIONS | secondary |
| src/components/contacts/ComposePickers.jsx:74 |  | secondary |
| src/components/contacts/ContactsTab.jsx:310 | className="contacts-accordion-head" | secondary |
| src/components/contacts/ContactsTab.jsx:349 | className={filter === item ? "is-active" : ""} | secondary |
| src/components/contacts/ContactsTab.jsx:367 | className={`contacts-conv-row${selectedContactId === contact.id ? " is-selected" : ""}`} | secondary |
| src/components/contacts/ContactsTab.jsx:411 |  | secondary |
| src/components/contacts/ContactsTab.jsx:414 |  | secondary |
| src/components/contacts/ContactsTab.jsx:417 |  | secondary |
| src/components/contacts/ContactsTab.jsx:473 | className="contacts-mini-btn" | secondary |
| src/components/contacts/ContactsTab.jsx:487 | ADD NOTE | secondary |
| src/components/contacts/ContactsTab.jsx:667 | SAVE CHANGES | primary |
| src/components/contacts/ContactsTab.jsx:704 | DETAILS | secondary |
| src/components/contacts/ContactsTab.jsx:716 | COLLAPSE | secondary |
| src/components/contacts/ContactsTab.jsx:736 | className={rightTab === tab ? "is-active" : ""} | preserve |
| src/components/contacts/ContactsTab.jsx:861 | ADD FOLLOW-UP | secondary |
| src/components/contacts/ContactsTab.jsx:1180 | + ADD CONTACT | secondary |
| src/components/contacts/ContactsTab.jsx:1197 | SAVE CONTACT | primary |
| src/components/contacts/ContactsTab.jsx:1198 | OPEN EXISTING CONTACT | secondary |
| src/components/contacts/ContactsTab.jsx:1199 | CANCEL | secondary |
| src/components/contacts/ContactsTab.jsx:1203 | MERGE CONTACTS | secondary |
| src/components/contacts/ContactsTab.jsx:1209 | CANCEL | secondary |
| src/components/contacts/ContactsTab.jsx:1232 | className={centerTab === tab ? "is-active" : ""} | preserve |
| src/components/contacts/ContactsTab.jsx:1244 | RETRY CALLS | secondary |
| src/components/contacts/ContactsTab.jsx:1326 | Calls | secondary |
| src/components/contacts/ContactsTab.jsx:1327 | Contacts | secondary |
| src/components/contacts/ContactsTab.jsx:1328 | Opportunities | secondary |
| src/components/contacts/ContactsTab.jsx:1329 | Follow-ups | secondary |
| src/components/contacts/FollowUpsView.jsx:19 | OPEN CONTACT | secondary |
| src/components/contacts/FollowUpsView.jsx:21 | MARK COMPLETE | secondary |
| src/components/contacts/FollowUpsView.jsx:22 | RESCHEDULE | secondary |
| src/components/contacts/FollowUpsView.jsx:25 | SAVE | primary |
| src/components/contacts/FollowUpsView.jsx:26 | CANCEL | secondary |
| src/components/contacts/FollowUpsView.jsx:49 | REFRESH | secondary |
| src/components/contacts/MessagesThread.jsx:214 | REMOVE GIF | destructive |
| src/components/contacts/MessagesThread.jsx:238 | className="msg-send-btn" | secondary |
| src/components/copilot/CrossSellTrigger.jsx:277 | Present to Client | secondary |
| src/components/copilot/CrossSellTrigger.jsx:308 | Client Declined All | secondary |
| src/components/enrollment/EnrollmentIntake.jsx:94 | className="contacts-mini-btn" | secondary |
| src/components/leftRail/ClientInfoCard.jsx:329 | className={`eg-rail-card__save-contact eg-rail-card__save-contact--icon is-${saveState}`} | icon |
| src/components/leftRail/GLP1BridgeGuide.jsx:22 | className="glp1-bridge-guide__trigger" | secondary |
| src/components/leftRail/GLP1BridgeGuide.jsx:38 | Close GLP-1 Bridge guidance | icon |
| src/components/leftRail/LeftRailManager.jsx:323 | className={`left-rail-handle${item.isAttention ? " is-attention" : ""}`} | secondary |
| src/components/leftRail/LeftRailManager.jsx:369 | className="rail-minimize-btn left-rail-minimize left-rail-minimize--external" | secondary |
| src/components/leftRail/PlanContextCard.jsx:99 | Search plans | primary |
| src/components/leftRail/PlanContextCard.jsx:115 | Clear selected plan | secondary |
| src/components/leftRail/PlanContextCard.jsx:145 | className="eg-plan-lookup__result" | secondary |
| src/components/leftRail/SEPQualifier.jsx:160 | className="sep-state-section-trigger" | secondary |
| src/components/leftRail/SEPQualifier.jsx:397 | Reset | secondary |
| src/components/leftRail/SEPQualifier.jsx:401 | Minimize | secondary |
| src/components/leftRail/SEPQualifier.jsx:431 | className={`left-rail-tool-btn left-rail-tool-btn--finder${activeTool === "finder" ? " is-active" : ""}`} | secondary |
| src/components/leftRail/SEPQualifier.jsx:441 | className={`left-rail-tool-btn left-rail-tool-btn--qualifier${activeTool === "qualifier" ? " is-active" : ""}`} | secondary |
| src/components/leftRail/SEPQualifier.jsx:451 | className={`left-rail-tool-btn left-rail-tool-btn--snp${activeTool === "snp" ? " is-active" : ""}`} | secondary |
| src/components/leftRail/SEPQualifier.jsx:474 | START SEP QUALIFICATION | primary |
| src/components/leftRail/SEPQualifier.jsx:481 | Minimize Rail | secondary |
| src/components/leftRail/SEPQualifier.jsx:520 | CONTINUE - VERIFY A & B | secondary |
| src/components/leftRail/SEPQualifier.jsx:537 | YES | secondary |
| src/components/leftRail/SEPQualifier.jsx:547 | NO | secondary |
| src/components/leftRail/SEPQualifier.jsx:601 | className="sep-qualifier-shortcut-card" | secondary |
| src/components/leftRail/SEPQualifier.jsx:627 | SELECT SEP CATEGORY | secondary |
| src/components/leftRail/SEPQualifier.jsx:642 | NONE OF THESE APPLY | secondary |
| src/components/leftRail/SEPQualifier.jsx:662 | className="sep-qualifier-category-card" | secondary |
| src/components/leftRail/SEPQualifier.jsx:688 | Back | secondary |
| src/components/leftRail/SEPQualifier.jsx:706 | className="sep-qualifier-subtype-card" | secondary |
| src/components/leftRail/SEPQualifier.jsx:778 | New Qualification | secondary |
| src/components/leftRail/SEPQualifier.jsx:781 | PROCEED TO ENROLLMENT | secondary |
| src/components/leftRail/SNPRoutingWidget.jsx:37 | className="snp-routing-subsection-trigger" | secondary |
| src/components/medsup/RateComparisonPanel.jsx:237 | className="sf-icon-button" | icon |
| src/components/opportunities/ContactOpportunities.jsx:15 | className="contacts-mini-btn" | secondary |
| src/components/opportunities/ContactOpportunities.jsx:27 | RETRY | secondary |
| src/components/opportunities/ContactOpportunities.jsx:27 | className="opps-contact-opportunity" | secondary |
| src/components/opportunities/ContactTagsPopover.jsx:33 | Close tags | icon |
| src/components/opportunities/ContactTagsPopover.jsx:34 |  | secondary |
| src/components/opportunities/ContactTagsPopover.jsx:37 | RETRY | secondary |
| src/components/opportunities/ContactTagsPopover.jsx:38 | Add tag | secondary |
| src/components/opportunities/DeleteOpportunityDialog.jsx:23 | className="contacts-mini-btn opps-danger" | secondary |
| src/components/opportunities/DeleteOpportunityDialog.jsx:24 | CANCEL | secondary |
| src/components/opportunities/OpportunitiesView.jsx:21 | className="opps-card-action" | secondary |
| src/components/opportunities/OpportunitiesView.jsx:56 |  | secondary |
| src/components/opportunities/OpportunitiesView.jsx:148 | Board view | secondary |
| src/components/opportunities/OpportunitiesView.jsx:148 | List view | secondary |
| src/components/opportunities/OpportunitiesView.jsx:149 | Pipeline settings | secondary |
| src/components/opportunities/OpportunitiesView.jsx:150 | NEW OPPORTUNITY | secondary |
| src/components/opportunities/OpportunitiesView.jsx:159 | CLEAR | secondary |
| src/components/opportunities/OpportunitiesView.jsx:160 | REFRESH | secondary |
| src/components/opportunities/OpportunitiesView.jsx:173 |  | secondary |
| src/components/opportunities/OpportunitiesView.jsx:174 | className="opps-contact-link" | secondary |
| src/components/opportunities/OpportunitiesView.jsx:175 | className="contacts-mini-btn" | secondary |
| src/components/opportunities/OpportunityDialog.jsx:31 | Close | icon |
| src/components/opportunities/OpportunityDrawer.jsx:52 | OPEN CONTACT | secondary |
| src/components/opportunities/OpportunityDrawer.jsx:53 | DELETE | destructive |
| src/components/opportunities/OpportunityDrawer.jsx:57 | RETRY | secondary |
| src/components/opportunities/OpportunityDrawer.jsx:70 | className="contacts-mini-btn" | secondary |
| src/components/opportunities/OpportunityEditor.jsx:81 | USE EXISTING CONTACT | secondary |
| src/components/opportunities/OpportunityEditor.jsx:85 | Existing contact | primary |
| src/components/opportunities/OpportunityEditor.jsx:86 | Create contact | primary |
| src/components/opportunities/OpportunityEditor.jsx:125 | className="contacts-mini-btn opps-primary" | secondary |
| src/components/opportunities/OpportunityEditor.jsx:132 | RETRY | secondary |
| src/components/opportunities/OpportunityRowMenu.jsx:36 | Open opportunity | secondary |
| src/components/opportunities/OpportunityRowMenu.jsx:37 | Delete opportunity | destructive |
| src/components/opportunities/PipelineSettings.jsx:12 | className="contacts-mini-btn opps-drag-handle" | secondary |
| src/components/opportunities/PipelineSettings.jsx:16 | className="contacts-mini-btn" | secondary |
| src/components/opportunities/PipelineSettings.jsx:16 | className="contacts-mini-btn" | secondary |
| src/components/opportunities/PipelineSettings.jsx:16 | DELETE | destructive |
| src/components/opportunities/PipelineSettings.jsx:61 | + ADD STAGE | secondary |
| src/components/opportunities/PipelineSettings.jsx:65 | className="contacts-mini-btn" | secondary |
| src/components/opportunities/PipelineSettings.jsx:69 | CANCEL | secondary |
| src/components/opportunities/PipelineSettings.jsx:73 | className="contacts-mini-btn opps-primary" | secondary |
| src/components/opportunities/PipelineSettings.jsx:82 | + NEW PIPELINE | secondary |
| src/components/sep/CountyGrid.jsx:46 | className={`sep-cg-tile${isActive ? " active" : ""}`} | secondary |
| src/components/sep/CountyPenetration.jsx:31 | MA penetration | preserve |
| src/components/sep/CountyPenetration.jsx:32 | Counties | preserve |
| src/components/sep/FemaFeed.jsx:93 | className="fema-feed-item-header" | secondary |
| src/components/sep/FemaFeed.jsx:200 | className="fema-feed-item-header" | secondary |
| src/components/sep/FemaFeed.jsx:254 | className="fema-feed-show-all" | secondary |
| src/components/sep/FemaFeed.jsx:267 | Live News | preserve |
| src/components/sep/FemaFeed.jsx:277 | Bulletins | preserve |
| src/components/sep/FemaFeed.jsx:303 | className="fema-feed-show-all" | secondary |
| src/components/sep/FemaFeed.jsx:347 | className="fema-feed-show-all" | secondary |
| src/components/sep/PlanTable.jsx:87 | Clear | secondary |
| src/components/sep/SearchBar.jsx:17 | Search | secondary |
| src/components/sep/SearchBar.jsx:27 | className="sep-quick-zip-btn" | secondary |
| src/components/sep/StatsBar.jsx:47 | className={`tab${activeTab === k ? " active" : ""}`} | preserve |
| src/flows/aca/ACAFlow.jsx:101 | className="check flow-gate-check" | secondary |
| src/flows/aca/ACAFlow.jsx:285 |  | secondary |
| src/flows/aca/ACAFlow.jsx:593 | New Call | secondary |
| src/flows/aca/ACAFlow.jsx:657 | START | primary |
| src/flows/aca/ACAScript.jsx:68 |  | secondary |
| src/flows/aca/StateACAFlow.jsx:105 | className="check flow-gate-check" | secondary |
| src/flows/aca/StateACAFlow.jsx:379 | START | primary |
| src/flows/aca/StateACAFlow.jsx:484 | New Call | secondary |
| src/flows/ancillary/AncillaryFlow.jsx:749 | className="ancillary-product-button" | secondary |
| src/flows/ancillary/AncillaryFlow.jsx:819 | className={`at-filter-tab${mode === value ? " is-active" : ""}`} | preserve |
| src/flows/ancillary/AncillaryFlow.jsx:1293 | className="check flow-gate-check" | secondary |
| src/flows/ancillary/AncillaryFlow.jsx:1484 | New Call | secondary |
| src/flows/ancillary/AncillaryFlow.jsx:1522 |  | secondary |
| src/flows/ancillary/AncillaryFlow.jsx:1598 | START | primary |
| src/flows/u65/U65Flow.jsx:269 | className={`u65-nepq-choice${selected === variant.id ? " is-selected" : ""}`} | secondary |
| src/flows/u65/U65Flow.jsx:306 | className="u65-nepq-callout__toggle" | secondary |
| src/flows/u65/U65Flow.jsx:362 | className="u65-nepq-branch__header" | secondary |
| src/flows/u65/U65Flow.jsx:394 | Switch to Med Supp script | secondary |
| src/flows/u65/U65Flow.jsx:517 | className="u65-nepq-group__toggle" | secondary |
| src/flows/u65/U65Flow.jsx:605 | Close objections | icon |
| src/flows/u65/U65Flow.jsx:762 | Objections | secondary |
| src/flows/u65/U65Flow.jsx:802 | Back | secondary |
| src/flows/u65/U65Flow.jsx:814 | className="u65-nepq-nav__button is-next" | secondary |
| src/flows/u65/U65Flow.jsx:840 | Back to | secondary |
| src/flows/u65/U65Flow.jsx:849 | New Call | secondary |
| src/flows/u65/U65Script.jsx:73 |  | secondary |

## Revision — phase 3
Explicit presentation-only button role attributes document action classifications. Top-nav tabs now adopt secondary glossy keys and pressed active state without underlines, per updated request. Main script START is primary/lg. Native selects remain flat, and icon-only actions remain flat. No event handlers or data requests changed during classification.

## Revision — phase 4
Container borders removed with explicit protected-subtree exclusions. Fields are flat in all states, with accent outline only on focus. Panel headers are flat. Inline errors stay in flow within their owner, bounded to 420px; global errors use the shared toast stack. Phone controls, map objects, pipeline columns/cards, and outlined badges remain excluded.

## Revision — phase 5
Removed high-weight declarations from non-protected CSS; logo's Formula1 remains isolated. Reading selectors cover MA ScriptBox/branches, Med Sup, ACA/state ACA, U65, and ancillary/annuity shared flow text. Windows no longer overrides the script font with Avenir. Avenir kit is absent, so the explicitly requested fallback stack is used; no claim of Adobe-hosted font delivery is made.

## Revision — phase 6 removed strings
- `src/components/AgentTools.jsx:562`: <p className="at-doc-description">{reference.description}</p>
- `src/components/BillingSettings.jsx:187`: <p>Script flows, compliance scoring, call records, and basic analytics.</p>
- `src/components/BillingSettings.jsx:207`: <p>Everything in Starter plus Co-Pilot, transcription, CRM sync, and advanced analytics.</p>
- `src/components/FplCalculatorPanel.jsx:356`: <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}> Use this as a reference point before pivoting away from ACA. </div>
- `src/components/Onboarding.jsx:258`: <p>Script flows, compliance scoring, call records, and basic analytics.</p>
- `src/components/Onboarding.jsx:268`: <p>Live Co-Pilot, transcription, CRM integration, and advanced analytics.</p>
- `src/components/RTSIngestionPanel.jsx:365`: <p>Detecting columns, matching agents and carriers, and parsing appointment details.</p>
- `src/components/SEPLookup.jsx:113`: <div className="sep-map-landing-hint"> Or enter a zip code above for carrier & SEP data </div>
- `src/components/SectionWrapUp.jsx:11`: <p className="sf-status-text">After the call, save its disposition in the dialer. Notes, contact details and opportunities are optional and can be edited later in Calls.</p>
- `src/components/callLog/CallRecordDetailsEditor.jsx:31`: <p className="contacts-muted">All fields are optional. These edits do not rerun scoring.</p>
- `src/components/callLog/CombineCallsModal.jsx:45`: <p>Keep both recordings and transcripts as separate call segments in one panel. The primary keeps its contact, agent, and disposition.</p>
- `src/components/callLog/CombineCallsModal.jsx:69`: <p className="contacts-muted">Primary: longer recording, then measured talk time, then earlier call. Existing linked calls move into the same panel.</p>
- `src/components/contacts/FollowUpsView.jsx:50`: <span className="contacts-muted">Create follow-ups from a contact’s detail panel.</span>
- `src/components/opportunities/PipelineSettings.jsx:55`: <p className="contacts-muted">Drag stages or use the arrows to reorder. Colors apply to headers, cards, and badges.</p>

Retained as ambiguous/required: underwriting and carrier eligibility guidance, merge/delete consequence confirmations, source/map explanations, upload limits, access restrictions, compliance instructions, scripture/context content and empty-state lines. These are content or safety/validation information rather than decorative UI descriptions.

## Decorative warm-color remapping inventory
- src/styles.css:53 `.sf-dot--amber`: background → var(--bg-surface)
- src/styles.css:291 `.sf-savings-callout.is-negative`: color → var(--text-secondary)
- src/styles.css:299 `.sf-empty-state, .sf-inline-lock`: color → var(--text-secondary)
- src/styles.css:1002 `.ancillary-popup-card`: color → var(--text-secondary)
- src/styles.css:1032 `.ancillary-popup-dismiss:hover`: color → var(--text-secondary)
- src/styles.css:1050 `.ancillary-popup-icon`: background → var(--bg-surface)
- src/styles.css:1062 `.ancillary-popup-title`: color → var(--text-secondary)
- src/styles.css:1084 `.ancillary-popup-copy, .ancillary-popup-note, .ancillary-popup-footnote, .ancillary-popup-followup-summary, .ancillary-popup-recap-meta, .ancillary-popup-link-detail`: color → var(--text-secondary)
- src/styles.css:1091 `.ancillary-popup-followup-summary`: color → var(--text-secondary)
- src/styles.css:1140 `.ancillary-popup-chip`: color → var(--text-secondary)
- src/styles.css:1174 `.ancillary-popup-link`: color → var(--text-secondary)
- src/styles.css:1194 `.ancillary-popup-link-num, .ancillary-popup-recap-index`: background → var(--bg-surface)
- src/styles.css:1212 `.ancillary-popup-link-title, .ancillary-popup-recap-title`: color → var(--text-secondary)
- src/styles.css:1227 `.ancillary-popup-total`: color → var(--text-secondary)
- src/styles.css:1236 `.ancillary-popup-complete-btn`: background → var(--bg-surface)
- src/styles.css:1247 `.ancillary-popup-complete-btn:hover`: background → var(--bg-surface)
- src/styles.css:1248 `.ancillary-popup-complete-btn:hover`: border-color → var(--chart-grid)
- src/styles.css:1262 `.ancillary-popup-pill`: color → var(--text-secondary)
- src/styles.css:1313 `.ancillary-popup-accordion-toggle`: color → var(--text-secondary)
- src/styles.css:1325 `.ancillary-popup-accordion-title`: color → var(--text-secondary)
- src/styles.css:1337 `.ancillary-popup-accordion-arrow`: color → var(--text-secondary)
- src/styles.css:1481 `.copilot-feed-mini`: color → var(--text-secondary)
- src/styles.css:1580 `.copilot-feed-mini__entry`: color → var(--text-secondary)
- src/styles.css:1608 `.copilot-msg`: color → var(--text-secondary)
- src/styles.css:1625 `.copilot-msg--info`: color → var(--text-secondary)
- src/styles.css:1633 `.copilot-msg--remind`: color → var(--text-secondary)
- src/styles.css:1851 `.rail-minimize-btn`: color → var(--text-secondary)
- src/styles.css:1957 `.right-rail-full, .right-rail-overlay, .right-rail-toggle, .left-rail-footer, .top-panel-overlay--tools`: color → var(--text-secondary)
- src/styles.css:1973 `.right-rail-full > .right-rail-scroll, .right-rail-overlay`: color → var(--text-secondary)
- src/styles.css:1995 `.right-rail-scroll::-webkit-scrollbar-thumb:hover, .right-rail-overlay::-webkit-scrollbar-thumb:hover`: background → var(--bg-surface)
- src/styles.css:2006 `.right-rail-widget-shell, .right-rail-control-panel, .agent-availability-panel`: color → var(--text-secondary)
- src/styles.css:2017 `.right-rail-widget-header`: background → var(--accent)
- src/styles.css:2046 `.right-rail-widget-content`: color → var(--text-secondary)
- src/styles.css:2063 `.right-rail-control-panel .copilot-pill-button`: color → var(--text-secondary)
- src/styles.css:2091 `.right-rail-control-panel .copilot-pill-button--analyze:not(:disabled)`: color → var(--text-secondary)
- src/styles.css:2140 `.ask-copilot-mini`: color → var(--text-secondary)
- src/styles.css:2171 `.ask-copilot-mini__send`: background → var(--bg-surface)
- src/styles.css:2194 `.mini-live-transcript, .copilot-feed-mini, .compliance-mini`: color → var(--text-secondary)
- src/styles.css:2209 `.mini-live-transcript__text`: color → var(--text-secondary)
- src/styles.css:2237 `.copilot-feed-mini__entry, .copilot-msg`: color → var(--text-secondary)
- src/styles.css:2253 `.copilot-msg--remind`: color → var(--text-secondary)
- src/styles.css:2283 `.copilot-floating-alert`: color → var(--text-secondary)
- src/styles.css:2331 `.copilot-floating-alert__text`: color → var(--text-secondary)
- src/styles.css:2369 `.panel-empty--input .panel-empty-dot, .panel-empty--ai .panel-empty-dot`: background → var(--bg-surface)
- src/styles.css:2412 `.agent-availability-btn`: color → var(--text-secondary)
- src/styles.css:2452 `.compliance-mini .section-timer--inline`: color → var(--text-secondary)
- src/styles.css:2494 `.compliance-mini__category-name`: color → var(--text-secondary)
- src/styles.css:2537 `.right-rail-toggle svg`: color → var(--text-secondary)
- src/styles.css:2538 `.right-rail-toggle svg`: stroke → var(--chart-grid)
- src/styles.css:3167 `.operations-tab .ops-command-market`: color → var(--text-secondary)
- src/styles.css:3180 `.operations-tab .ops-tab-amber`: background → var(--bg-surface)
- src/styles.css:3216 `.operations-tab .ops-filter-label`: background → var(--bg-surface)
- src/styles.css:3270 `.operations-tab .ops-ticker`: color → var(--text-secondary)
- src/styles.css:3278 `.operations-tab .ops-ticker-item`: color → var(--text-secondary)
- src/styles.css:3285 `.operations-tab .ops-ticker-item.is-callback .icon`: color → var(--text-secondary)
- src/styles.css:3320 `.operations-tab .ops-section-head`: background → var(--bg-surface)
- src/styles.css:3325 `.operations-tab .ops-section-head .ops-cmd`: color → var(--text-secondary)
- src/styles.css:3362 `.operations-tab .ops-window-toggle button`: color → var(--text-secondary)
- src/styles.css:3373 `.operations-tab .ops-window-toggle button:hover`: color → var(--text-secondary)
- src/styles.css:3408 `.operations-tab .ops-lb-row .name`: color → var(--text-secondary)
- src/styles.css:3417 `.operations-tab .ops-lb-row.is-rank-1 .name`: color → var(--text-secondary)
- src/styles.css:3422 `.operations-tab .ops-lb-row .value`: color → var(--text-secondary)
- src/styles.css:3424 `.operations-tab .ops-lb-row.is-rank-1 .value`: color → var(--text-secondary)
- src/styles.css:3431 `.operations-tab .ops-lb-row .bar`: background → var(--bg-surface)
- src/styles.css:3433 `.operations-tab .ops-lb-row .bar.amber`: background → var(--bg-surface)
- src/styles.css:3458 `.operations-tab .ops-agent-detail-toggle`: background → var(--bg-surface)
- src/styles.css:3501 `.operations-tab .ops-agent-detail-grid strong`: color → var(--text-secondary)
- src/styles.css:3552 `.operations-tab .ops-control select, .operations-tab .ops-custom-range input`: color → var(--text-secondary)
- src/styles.css:3574 `.operations-tab .ops-date-buttons button`: color → var(--text-secondary)
- src/styles.css:3620 `.operations-tab .ops-metric-value`: color → var(--text-secondary)
- src/styles.css:3634 `.operations-tab .ops-export-btn`: color → var(--text-secondary)
- src/styles.css:3691 `.operations-tab .ops-sort-th button:hover, .operations-tab .ops-sort-th.is-active button`: color → var(--text-secondary)
- src/styles.css:3698 `.operations-tab .ops-sort-th.is-active .ops-sort-indicator`: color → var(--text-secondary)
- src/styles.css:3723 `.operations-tab .ops-table tbody td`: color → var(--text-secondary)
- src/styles.css:3743 `.operations-tab .ops-table tbody td.num`: color → var(--text-secondary)
- src/styles.css:3812 `.operations-tab .ops-time-cell`: color → var(--text-secondary)
- src/styles.css:3834 `.operations-tab .ops-out-callback`: color → var(--text-secondary)
- src/styles.css:3847 `.operations-tab .ops-table tbody tr.is-selected .ops-out-callback`: color → var(--text-secondary)
- src/styles.css:3886 `.operations-tab .ops-carrier-row .name`: color → var(--text-secondary)
- src/styles.css:3893 `.operations-tab .ops-carrier-row .bar`: background → var(--bg-surface)
- src/styles.css:3897 `.operations-tab .ops-carrier-row .pct`: color → var(--text-secondary)
- src/styles.css:3936 `.operations-tab .ops-compliance-row .val`: color → var(--text-secondary)
- src/styles.css:3945 `.operations-tab .ops-inline-empty`: color → var(--text-secondary)
- src/styles.css:3985 `.operations-tab .ops-briefing-card strong`: color → var(--text-secondary)
- src/styles.css:3990 `.operations-tab .ops-briefing-card span`: color → var(--text-secondary)
- src/styles.css:4022 `.operations-tab .ops-collapsible-head`: background → var(--bg-surface)
- src/styles.css:4035 `.operations-tab .ops-agent-name`: color → var(--text-secondary)
- src/styles.css:4061 `.operations-tab .ops-agent-stat-grid strong`: color → var(--text-secondary)
- src/styles.css:4088 `.operations-tab .ops-coaching-summary p`: color → var(--text-secondary)
- src/styles.css:4106 `.operations-tab .ops-agent-rank .name`: color → var(--text-secondary)
- src/styles.css:4113 `.operations-tab .ops-agent-rank strong`: color → var(--text-secondary)
- src/styles.css:4137 `.operations-tab .ops-detail-tabs button`: color → var(--text-secondary)
- src/styles.css:4162 `.operations-tab .ops-summary-box p, .operations-tab .ops-coaching-priority p, .operations-tab .ops-beneficiary-box p`: color → var(--text-secondary)
- src/styles.css:4192 `.operations-tab .ops-utterance p`: color → var(--text-secondary)
- src/styles.css:4251 `.operations-tab .ops-wpm-head strong, .operations-tab .ops-kpi-pair strong, .operations-tab .ops-beneficiary-row strong`: color → var(--text-secondary)
- src/styles.css:4273 `.operations-tab .ops-wpm-track .marker`: background → var(--bg-surface)
- src/styles.css:4300 `.operations-tab .ops-sentiment-chart polyline`: stroke → var(--chart-grid)
- src/styles.css:4351 `.operations-tab .ops-gauge .ring span`: color → var(--text-secondary)
- src/styles.css:4363 `.operations-tab .ops-list-block p`: color → var(--text-secondary)
- src/styles.css:4384 `.operations-tab .ops-risk-badge.medium`: background → var(--bg-surface)
- src/styles.css:4400 `.operations-tab .ops-compliance-overview strong`: color → var(--text-secondary)
- src/styles.css:4424 `.operations-tab .ops-category-row strong`: color → var(--text-secondary)
- src/styles.css:4479 `.operations-tab .ops-followup-filters button`: color → var(--text-secondary)
- src/styles.css:4500 `.operations-tab .ops-followup-row .customer`: color → var(--text-secondary)
- src/styles.css:4527 `.operations-tab .ops-followup-row select`: color → var(--text-secondary)
- src/styles.css:4561 `.operations-tab .ops-pipeline-cell .val`: color → var(--text-secondary)
- src/styles.css:4568 `.operations-tab .ops-pipeline-cell .val.is-amber`: color → var(--text-secondary)
- src/styles.css:4602 `.operations-tab .ops-tracker-row.due .dot`: color → var(--text-secondary)
- src/styles.css:4612 `.operations-tab .ops-tracker-row.due .date`: color → var(--text-secondary)
- src/styles.css:4614 `.operations-tab .ops-tracker-row .customer`: color → var(--text-secondary)
- src/styles.css:4624 `.operations-tab .ops-tracker-row .meta`: color → var(--text-secondary)
- src/styles.css:4717 `.operations-tab .ops-cursor`: background → var(--bg-surface)
- src/styles.css:5092 `.secondary`: color → var(--text-secondary)
- src/styles.css:5273 `.agent-reminder-label`: color → var(--text-secondary)
- src/styles.css:5289 `.part-b-toggle .part-b-premium-trigger`: color → var(--text-secondary)
- src/styles.css:5461 `.flow-main .active-card, .card.active-card, .flow-script-card.active-card`: color → var(--text-secondary)
- src/styles.css:5614 `.client-quick-script-panel`: color → var(--text-secondary)
- src/styles.css:5626 `.client-quick-script-panel__header`: background → var(--accent)
- src/styles.css:5720 `.client-quick-script-section__lines p`: color → var(--text-secondary)
- src/styles.css:5839 `.flow-script-card.active-card > div:first-child, .card.active-card > h2`: background → var(--accent)
- src/styles.css:5868 `.script-box`: color → var(--text-secondary)
- src/styles.css:5876 `.script-box.verbatim, .script-box.verbatim *`: color → var(--text-secondary)
- src/styles.css:5909 `.script-box .copy-btn, .active-card .copy-btn`: color → var(--text-secondary)
- src/styles.css:5930 `.script-box-editor`: color → var(--text-secondary)
- src/styles.css:5946 `.flow-script-text`: color → var(--text-secondary)
- src/styles.css:6220 `.u65-voicemail-section.is-open .u65-voicemail-toggle`: color → var(--text-secondary)
- src/styles.css:6380 `.u65-nepq-group.is-open .u65-nepq-group__state`: color → var(--text-secondary)
- src/styles.css:6406 `.u65-nepq-interpolation`: color → var(--text-secondary)
- src/styles.css:6510 `.u65-nepq-choice.is-selected`: border-color → var(--chart-grid)
- src/styles.css:6512 `.u65-nepq-choice.is-selected`: color → var(--text-secondary)
- src/styles.css:6561 `.u65-nepq-callout.is-open .u65-nepq-callout__toggle`: color → var(--text-secondary)
- src/styles.css:6711 `.u65-nepq-capture:focus-within`: border-color → var(--chart-grid)
- src/styles.css:6745 `.u65-nepq-capture__input`: color → var(--text-secondary)
- src/styles.css:7060 `.section-next-action .no-enrollment-wrapup-btn`: color → var(--text-secondary)
- src/styles.css:7077 `.section-next-action .no-enrollment-wrapup-btn:hover:not(:disabled)`: border-color → var(--chart-grid)
- src/styles.css:7079 `.section-next-action .no-enrollment-wrapup-btn:hover:not(:disabled)`: color → var(--text-secondary)
- src/styles.css:7639 `.sep-reference-badge`: color → var(--text-secondary)
- src/styles.css:8695 `.prompter-interim`: color → var(--text-secondary)
- src/styles.css:11054 `.copilot-setup-popup-shell .ancillary-popup-icon`: background → var(--bg-surface)
- src/styles.css:11060 `.copilot-setup-popup-shell .ancillary-popup-title`: color → var(--text-secondary)
- src/styles.css:11076 `.copilot-setup-popup-note strong`: color → var(--text-secondary)
- src/styles.css:12566 `.aca-client-sidebar__summary strong`: color → var(--text-secondary)
- src/styles.css:12618 `.aca-ffm-sep-finder`: color → var(--text-secondary)
- src/styles.css:12642 `.aca-ffm-sep-finder__header h2`: color → var(--text-secondary)
- src/styles.css:12653 `.aca-ffm-sep-finder__header p`: color → var(--text-secondary)
- src/styles.css:12685 `.aca-ffm-sep-category__trigger`: color → var(--text-secondary)
- src/styles.css:12698 `.aca-ffm-sep-category.is-expanded .aca-ffm-sep-category__trigger`: background → var(--bg-surface)
- src/styles.css:12786 `.aca-ffm-sep-category__questions li`: color → var(--text-secondary)
- src/styles.css:12837 `.aca-ffm-sep-category__notes dd`: color → var(--text-secondary)
- src/styles.css:14227 `.agent-notes-widget`: color → var(--text-secondary)
- src/styles.css:14238 `.agent-notes-widget-header`: background → var(--accent)
- src/styles.css:14284 `.agent-notes-widget-input`: color → var(--text-secondary)
- src/styles.css:16795 `.left-rail-panel-shell--sep-qualifier .left-rail-tool-btn`: color → var(--text-secondary)
- src/styles.css:16818 `.left-rail-panel-shell--sep-qualifier :is(   .left-rail-tool-btn.is-active,   .left-rail-tool-btn--finder.is-active,   .left-rail-tool-btn--qualifier.is-active,   .left-rail-tool-btn--snp.is-active )`: background → var(--accent)
- src/styles.css:16830 `.left-rail-panel-shell--sep-qualifier .left-rail-tool-prompt`: color → var(--text-secondary)
- src/styles.css:16850 `.left-rail-panel-shell--sep-qualifier :is(   .sep-qualifier-action,   .sep-qualifier-secondary,   .sep-qualifier-back,   .sep-qualifier-primary,   .sep-qualifier-toggle,   .left-rail-tool-start-btn,   .left-rail-tool-minimize,   .sep-finder-trigger-btn,   .sep-finder-trigger-refresh,   .sep-finder-refresh,   .sep-finder-card-detail-trigger,   .snp-routing-subsection-trigger )`: color → var(--text-secondary)
- src/styles.css:16894 `.left-rail-panel-shell--sep-qualifier .sep-qualifier-primary, .left-rail-panel-shell--sep-qualifier .left-rail-tool-start-btn, .left-rail-panel-shell--sep-qualifier .sep-finder-trigger-btn`: background → var(--bg-surface)
- src/styles.css:17035 `.left-rail-panel-shell--sep-qualifier .snp-routing-progress-fill`: background → var(--bg-surface)
- src/styles.css:17047 `.left-rail-panel-shell--sep-qualifier .snp-routing-recommendation-badge`: color → var(--text-secondary)
- src/styles.css:17054 `.left-rail-panel-shell--sep-qualifier .snp-routing-alert.is-conditional, .left-rail-panel-shell--sep-qualifier .sep-state-card-fema`: color → var(--text-secondary)
- src/styles.css:18059 `.agent-dashboard`: color → var(--text-secondary)
- src/styles.css:18064 `.agent-dash-range-row`: color → var(--text-secondary)
- src/styles.css:18067 `.agent-dash-scope select`: color → var(--text-secondary)
- src/styles.css:18069 `.agent-dash-heading h1`: color → var(--text-secondary)
- src/styles.css:18072 `.agent-dashboard button`: color → var(--text-secondary)
- src/styles.css:18073 `.agent-dashboard button:hover, .agent-dashboard button[aria-pressed="true"]`: color → var(--text-secondary)
- src/styles.css:18073 `.agent-dashboard button:hover, .agent-dashboard button[aria-pressed="true"]`: border-color → var(--chart-grid)
- src/styles.css:18082 `.agent-dash-metric`: color → var(--text-secondary)
- src/styles.css:18086 `.agent-dash-metric strong`: color → var(--text-secondary)
- src/styles.css:18092 `.agent-dash-panel h2`: color → var(--text-secondary)
- src/styles.css:18095 `.agent-dash-chart text`: fill → var(--accent)
- src/styles.css:18097 `.agent-dash-call-bar`: fill → var(--accent)
- src/styles.css:18100 `.agent-dash-reference line`: stroke → var(--chart-grid)
- src/styles.css:18101 `.agent-dash-reference text`: fill → var(--accent)
- src/styles.css:18105 `.agent-dash-empty, .agent-dash-note`: color → var(--text-secondary)
- src/styles.css:18110 `.agent-dash-pie-slice:focus-visible`: stroke → var(--chart-grid)
- src/styles.css:18114 `.agent-dash-pie-tooltip`: color → var(--text-secondary)
- src/styles.css:18127 `.agent-dashboard th, .agent-dashboard td`: color → var(--text-secondary)
- src/styles.css:18129 `.agent-dashboard thead`: color → var(--text-secondary)
- src/styles.css:18130 `.agent-dashboard td:nth-child(2)`: color → var(--text-secondary)
- src/styles.css:18209 `.ma-script-direction-select`: color → var(--text-secondary)
- src/styles.css:18230 `.ma-script-direction-caret`: color → var(--text-secondary)
- src/styles.css:18303 `.ma-script-line::before`: color → var(--text-secondary)
- src/styles.css:18343 `.eg-audio-share-button`: color → var(--text-secondary)
- src/styles/v3-overrides.css:928 `.left-rail-handle-pip`: background → var(--bg-surface)
- src/styles/v3-overrides.css:1255 `.compliance-note, .callout-compliance`: background → var(--bg-surface)
- src/styles/v3-overrides.css:1260 `.compliance-note, .callout-compliance`: color → var(--text-secondary)
- src/styles/v3-overrides.css:1273 `.compliance-note::before`: background → var(--bg-surface)
- src/styles/v3-overrides.css:1285 `.compliance-note__label, .compliance-note-label`: color → var(--text-secondary)
- src/styles/v3-overrides.css:1324 `.progress-dot__pill.is-active`: background → var(--accent)
- src/styles/v3-overrides.css:1628 `.subscription-banner`: background → var(--bg-surface)
- src/styles/v3-overrides.css:1631 `.subscription-banner`: color → var(--text-secondary)
- src/SEPLookupTool.css:358 `.sep-snp-badge`: color → var(--text-secondary)
- src/SEPLookupTool.css:387 `.sep-product-badge.pdp`: color → var(--text-secondary)
- src/SEPLookupTool.css:407 `.sep-product-badge.csnp`: color → var(--text-secondary)
- src/SEPLookupTool.css:504 `.sep-urgency-pill.medium`: color → var(--text-secondary)
- src/SEPLookupTool.css:927 `.sep-select-county-title`: color → var(--text-secondary)
- src/SEPLookupTool.css:1466 `.fema-feed-type.pa`: color → var(--text-secondary)
- src/AgentTools.css:907 `.at-doc-note-label`: color → var(--text-secondary)
- src/AgentTools.css:1016 `.at-doc-field-alias`: color → var(--text-secondary)
- src/AgentTools.css:1210 `.at-training-subheading.is-minor`: color → var(--text-secondary)
- src/AgentTools.css:1287 `.at-training-alert.is-note .at-training-alert-label`: color → var(--text-secondary)
- src/AgentTools.css:1855 `.top-panel-overlay--tools`: color → var(--text-secondary)
- src/AgentTools.css:1870 `.top-panel-overlay--tools .top-panel-header`: background → var(--accent)
- src/AgentTools.css:1897 `.top-panel-overlay--tools .top-panel-close:hover`: background → var(--bg-surface)
- src/AgentTools.css:1908 `.top-panel-overlay--tools .at-root`: color → var(--text-secondary)
- src/AgentTools.css:1929 `.top-panel-overlay--tools .at-tool-card`: color → var(--text-secondary)
- src/AgentTools.css:1949 `.top-panel-overlay--tools .at-tool-icon-badge, .top-panel-overlay--tools .at-tool-icon-badge-large`: color → var(--text-secondary)
- src/AgentTools.css:1963 `.top-panel-overlay--tools .at-tool-title`: color → var(--text-secondary)
- src/AgentTools.css:1994 `.at-modal`: color → var(--text-secondary)
- src/AgentTools.css:2012 `.at-modal-title`: color → var(--text-secondary)
- src/AgentTools.css:2029 `.at-modal-close`: color → var(--text-secondary)
- src/AgentTools.css:2085 `.at-modal .at-link-name, .at-modal .at-carrier-name, .at-modal .at-doc-title, .at-modal .at-doc-detail-title, .at-modal .at-doc-card-title, .at-modal .at-doc-field-name, .at-modal .at-sep-ref-header h4, .at-modal .at-sep-ask`: color → var(--text-secondary)
- src/AgentTools.css:2144 `.at-quiz-shell`: color → var(--text-secondary)
- src/AgentTools.css:2181 `.at-quiz-stat strong`: color → var(--text-secondary)
- src/AgentTools.css:2216 `.at-quiz-question-card h4`: color → var(--text-secondary)
- src/AgentTools.css:2236 `.at-quiz-choice`: color → var(--text-secondary)
- src/AgentTools.css:2334 `.at-quiz-feedback p, .at-quiz-missed-card p`: color → var(--text-secondary)
- src/AgentTools.css:2350 `.at-quiz-next-btn, .at-quiz-secondary-btn`: color → var(--text-secondary)
- src/AgentTools.css:2382 `.at-quiz-final-main strong`: color → var(--text-secondary)
- src/AgentTools.css:2427 `.at-quiz-section-title span`: color → var(--text-secondary)
- src/AgentTools.css:2446 `.at-quiz-missed-question`: color → var(--text-secondary)

## 2026-10-31 — latest contrast correction
Normal white-theme labels/data/checklist items use primary text. Caller fields use white fill against the F7F8FA parent panel; white-surface fields retain F1F3F6. Blue-filled headers and selected SEP tools use white text/icons. Button gradient top stops were darkened from the originally specified colors where white labels could not meet 4.5:1; Terminal destructive gradient was also darkened. This resolves the conflict in favor of the latest explicit AA requirement.

## Softphone follow-up — white-only palette
White phone tokens now use elevated white surfaces, primary text, blue accent and subtle dividers. Answer/call uses semantic green, end uses red, active mute/hold uses a pale blue surface with blue icon/text. No gradients or glossy shadows inside the panel. Only CSS changed; component markup, geometry, event handlers, telephony and conference logic remain untouched. `.dark` phone tokens and rules are unchanged.

## Complete removed JSX text ledger against main

Literal text segments removed or shortened during the refresh (dynamic expression removals are listed separately above):
- `src/App.jsx`: days. Upgrade to continue uninterrupted.
- `src/App.jsx`: Starter plan active. Co-Pilot, transcription, CRM sync, and advanced analytics require Pro.
- `src/components/AgentAudioSettings.jsx`: Reduce background noise on your calls. Settings are saved to your user profile. Calibrate with your usual headset and room.
- `src/components/AgentAudioSettings.jsx`: Lower values keep softer speech; higher values block more room noise. Changes apply to the next call.
- `src/components/AgentStatusLog.jsx`: Auto-refreshes every 30 seconds
- `src/components/AgentStatusLog.jsx`: Availability changes, newest first. Times use your local time zone (
- `src/components/AgentStatusLog.jsx`: ).
- `src/components/BillingSettings.jsx`: Script flows, compliance scoring, call records, and basic analytics.
- `src/components/BillingSettings.jsx`: Everything in Starter plus Co-Pilot, transcription, CRM sync, and advanced analytics.
- `src/components/ContactToast.jsx`: ×
- `src/components/FplCalculatorPanel.jsx`: Use this as a reference point before pivoting away from ACA.
- `src/components/Onboarding.jsx`: Script flows, compliance scoring, call records, and basic analytics.
- `src/components/Onboarding.jsx`: Live Co-Pilot, transcription, CRM integration, and advanced analytics.
- `src/components/RTSIngestionPanel.jsx`: Detecting columns, matching agents and carriers, and parsing appointment details.
- `src/components/SEPLookup.jsx`: Or enter a zip code above for carrier & SEP data
- `src/components/SectionWrapUp.jsx`: After the call, save its disposition in the dialer. Notes, contact details and opportunities are optional and can be edited later in Calls.
- `src/components/SmsToastHost.jsx`: ✕
- `src/components/TenantSettings.jsx`: Agency Settings
- `src/components/TenantSettings.jsx`: Global vendor pause immediately reports unavailable and is audit logged.
- `src/components/TenantSettings.jsx`: Enter your CRM inbound webhook URL. EnrollGen sends enrollment data here after each completed call.
- `src/components/VendorRoutingSettings.jsx`: A matrix row asserts the agent is licensed in that state. Carrier checks control full and partial routing. Missing rows are ineligible.
- `src/components/VendorRoutingSettings.jsx`: Read-only call report. Rotating creates a new link and immediately invalidates the old one.
- `src/components/VendorRoutingSettings.jsx`: Eastern Time. Accepted pings remain valid for calls arriving within 30 seconds. Existing calls continue after closing.
- `src/components/callLog/CallRecordDetailsEditor.jsx`: All fields are optional. These edits do not rerun scoring.
- `src/components/callLog/CombineCallsModal.jsx`: Keep both recordings and transcripts as separate call segments in one panel. The primary keeps its contact, agent, and disposition.
- `src/components/callLog/CombineCallsModal.jsx`: Primary: longer recording, then measured talk time, then earlier call. Existing linked calls move into the same panel.
- `src/components/contacts/ContactsTab.jsx`: Details save when you leave a field or press Enter.
- `src/components/contacts/FollowUpsView.jsx`: Create follow-ups from a contact’s detail panel.
- `src/components/opportunities/PipelineSettings.jsx`: Drag stages or use the arrows to reorder. Colors apply to headers, cards, and badges.

# Final verification record — 2026-10-31

This section supersedes the earlier in-progress status notes. Verification methods are explicit: source review is not a claim of screenshot verification.

## Phase disposition

| Phase | Implementation | Verification / exception |
|---|---|---|
| 2 White theme | Implemented | Core tokens and local script/rail/ops palettes converted; genuine status, map and pipeline colors exempt. Light wordmark now blue by follow-up request. |
| 3 Keys | Implemented | Shared gradients, role inventory, disabled/focus/pressed variants, glossy top nav, primary main START. Form selects are flat per follow-up. Protected controls and ambiguous badge roles retained. |
| 4 Borders/fields | Implemented | Background steps, flat fields/selects, table row dividers. Protected Contacts/map/pipeline shapes remain. White-only phone palette added by follow-up. |
| 5 Typography | Implemented with specified fallback | Tahoma reading selectors and Windows token corrected; Formula1 retained for logo. Adobe kit absent, so requested Avenir/Avenir Next/Segoe fallback used. Adobe-hosted Windows/Mac delivery is not asserted. |
| 6 Prose | Implemented with documented safe-retention exceptions | Removed-string ledgers above include every removed literal segment and dynamic render expression. Ambiguous compliance/source/confirmation content retained per original rule. |
| 7 Default | Complete | Explicit dark default in bootstrap and provider; saved light retained; theme-color synchronized. |

## Full screen checklist and evidence

| Screen / state | Source check | Browser evidence | Data-dependent follow-up |
|---|---|---|---|
| Dashboard, charts, status log | Reviewed theme roles, empty/error branches and chart colors | Dark and white empty/error screenshots; hardcoded backgrounds corrected | Populated tooltips and series values pending |
| CRM Calls | Reviewed fields, filters, row actions, errors and recording containers | White loading/error/empty table screenshot; tabs remain unobscured | Populated rows/recording playback pending |
| CRM Contacts | Reviewed protected subtree exclusions | White and Terminal empty workspace screenshots; charcoal shapes retained | Populated detail panes pending |
| CRM Opportunities | Reviewed stages/card exclusions, filters, dialogs and action roles | Terminal loading and white empty/error/filter screenshots | Populated stages/cards and drag overlay pending |
| CRM Follow-ups | Reviewed filters/table/empty branches | White empty/error accessibility state | Populated follow-ups pending |
| Agent Tools / tool dialogs | Reviewed shared key/field/modal rules and helper removals | Tool launcher accessibility state | Server-provided document payloads pending |
| Intelligence feed / ZIP / maps / legends | Reviewed map exclusions and feed roles | White loading/feed/ZIP/map accessibility state and screenshot; feed backdrop corrected | ZIP-specific carrier/county payloads pending |
| RTS | Reviewed table/form/empty/loading/error source branches and shared styles | No screenshot sign-off recorded | Populated appointment data pending |
| Daily Verse | Reviewed content/font/key rules; scripture/context retained | No screenshot sign-off recorded | Remote passage failures depend on service availability |
| MA script | Reviewed ScriptBox/branch reading selectors, section bars, cues, START | White script screenshot and repaired shell accessibility state | Live call-derived transcript/scoring pending |
| Med Sup / ACA / state ACA / U65 | Reviewed shared flow-script-text paths, sizes/line heights unchanged | No screenshot sign-off recorded | Call-derived content pending |
| Annuity / ancillary flows | Reviewed shared AncillaryFlow reading paths | No screenshot sign-off recorded | Call-derived content pending |
| SEP Finder / Qualifier / SNP | Reviewed labels, filled active headers and excluded maps | MA shell accessibility state; SEP helper removal JSX repaired | Live ZIP eligibility content pending |
| Co-Pilot / transcript / compliance | Reviewed waiting/error states, text colors, headers and control roles | MA waiting-state screenshot/accessibility state | Live transcript and analysis pending |
| Agency Settings / audio / routing / billing | Reviewed fields, sliders, titles, checkbox and helper removals | White screenshot and both-theme accessibility states; invisible heading/stacked checkbox/range bevel found and corrected | Remote save and routing payloads pending |
| Other modals / dropdowns / toasts | Reviewed shared rules and AppToast lifecycle/stack positioning | Settings and Intelligence overlays; source tests cover recovery dismissal/reload | Data-created dialogs pending |
| Softphone | White-only phone token and active-state CSS reviewed; no logic/markup edit | No screenshot sign-off recorded | Active call states pending |
| Landing / sign-in | Reviewed shared public CSS, dark bootstrap, logo and fields | No screenshot sign-off recorded | Account-specific hosted auth states pending |

## Checks

- All JSX source files parsed after empty-conditional repair; no further syntax errors found.
- Recovery notice test: 5/5 passing, including disabled reload during a call and explicit dismissal.
- Full suite: **728/728 passing**, no skipped tests (116.6 seconds).
- Production build passed; subsequent CSS-only corrections were rebuilt.
- `docs/UHC_IX_Integration_Spec.md` remains untracked and unstaged.
- No merge, production deployment, API/data/authentication/telephony logic change was made. The notification lifecycle changes were explicitly requested.

Runtime screenshot QA is not exhaustive: rows explicitly marked “No screenshot sign-off recorded” must not be represented as visually certified. Their shared styling and component source were reviewed. Data-dependent checks above remain pending and are not an implementation blocker.

## 2026-10-31 — ancillary prompt and rail header follow-up
- Fixed collapsed ancillary prompts: labeled keys can fit/wrap their label, while floating icon-only prompts retain a centered 38px circle. Fixed-size/global key styles no longer squeeze the label.
- White popup copy, quotes, notes and recap text use primary text; title uses accent and metadata uses secondary text. Expanded and collapsed MA prompt were checked in the white browser preview.
- Co-Pilot and Live Transcript fill-widget shells extend across the rail gutters, with body insets preserved. Removed the inherited max-width constraint that clipped the extension.
- Header icons have a 16px left inset; header color bars extend to the rail edges.
- CSS-only changes. Production build passed before the final max-width/icon-inset correction; rebuilt below.

## 2026-10-31 — Intelligence map backgrounds
Removed white-mode background gradients from the state map wrappers, county map panel, county grid and carrier-reference geographic panel. Flat elevated white replaces the decorative background only. SVG state/county fills, penetration shading, legends, interactions and all Terminal backgrounds remain unchanged.

## 2026-10-31 — remove sample ZIP suggestions
Removed the Intelligence search suggestion row from `src/components/sep/SearchBar.jsx`: “Try:” and sample ZIP buttons “33601”, “77002”, “28801”, “40502”, “90001”. Removed its unused constant/prop. ZIP entry and search behavior are unchanged.

## 2026-10-31 — blue state and county maps
White-mode state map base fill increased from 8% red to 28% corporate blue; hover uses darker blue and selection uses pressed blue, both with white labels. County map uses the same blue palette, higher base opacity, darker hover and selected county. Penetration rates, missing-data handling and shade ordering remain unchanged. Terminal uses the original fallback colors/opacity. Changes remain local until the user finishes the batch.
- Removed the dark background/shadow from the white-mode MA Penetration / Counties selector strip; buttons sit directly on the map panel.

## 2026-10-31 — plan search icon
Made the left-rail plan-name search Lucide glyph (and loading spinner) white. No search behavior or button geometry changes. Held locally per the current no-push instruction.

## 2026-10-31 — glossy script section headers
Script section bars (including Introduction & Recording) now use the primary button's theme-specific gradient, foreground, 4px corners, top highlight, bottom shade and small drop shadow. White mode uses blue/white; Terminal uses amber/black. Header geometry and script wording remain unchanged. Static headers do not receive interactive button states. Local commit only; pushes are held.

## 2026-10-31 — countdown/completed section green
Healthy MA and ancillary countdown color and completed main-flow progress dots now use the requested #00FF00 in both themes. Warning/expired countdown states and active/pending progress colors retain their existing roles. Local commit; no push.

## 2026-10-31 — right-rail action spacing
Set the START / CLEAR / ANALYZE flex-row gap to 2px in both themes, overriding the legacy zero-gap rule. Local commit; no push.

## 2026-10-31 — smaller rail minimize controls
Halved both rails' minimize buttons from 22×22px to 11×11px and their chevrons from 12×12px to 6×6px, including the compact right-rail overlay control. Positioning and minimize behavior remain unchanged. Local commit only.

## 2026-10-31 — Terminal plan search key
Dark-mode plan search now uses the shared graphite secondary-key gradient with an amber Lucide glyph/spinner. Existing hover, pressed, disabled and focus treatments still apply. Light-mode blue key and white icon are unchanged. Local commit only.

## 2026-10-31 — compact main START and single direction caret
Main-flow START buttons now size to their existing text with 6px vertical/10px horizontal padding, no forced minimum width, and left alignment. Terminal main START uses graphite/amber secondary-key colors; light mode remains blue/white. Removed the browser-native select arrow from the inbound/outbound control, retaining only its custom accent-colored caret. No flow/direction event handlers changed. Local commit only.

## 2026-10-31 — centered idle controls and full direction labels
Restored centered alignment for the main START/direction control group. The inbound/outbound selector now reserves eight text characters plus 48px for letter spacing and caret padding so both labels fit without truncation. Retains the single custom caret and compact START sizing. Local commit only.

## 2026-10-31 — uniform START/direction dimensions
Replaced font-dependent selector width with shared 120×32px dimensions for the direction control and main START. Selector reserves 28px on the caret side, leaving sufficient room for the full INBOUND/OUTBOUND strings. Group remains centered in both themes. Local commit only.

## 2026-10-31 — Bible white-theme styling
Replaced decorative gold text, borders, highlights and parchment effects in Daily Verse with corporate blue/neutral roles in light mode. Scripture and reference text use primary text, interactive accents use blue, metadata uses secondary text, surfaces follow the shared white palette and existing action keys keep their shared gloss. Removed the decorative left border. Scripture, translations, study content and Terminal colors are unchanged. Local commit only.
