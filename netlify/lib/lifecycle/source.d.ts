/** Adapters run only on the server after the core deployment/contact scope check.
 * No feed adapter is registered by this feature. Fetching a carrier requires a
 * separately reviewed feature gate and transport. Persist in its canonical ledger.
 */
export interface LifecycleEvidence { table: string; id: string; time: string; }
export interface LifecycleEvent {
 key: string; type: string; time: string; staff: string | null;
 summary: string; status: string; evidence: LifecycleEvidence[];
 details: Record<string, string | number | boolean | null>;
}
export interface ConsumerLifecycleSource {
 readonly id: string;
 read(context: Readonly<{ tenantId: string; consumerId: string; actorId: string;
  asOf: string; after: { time: string; key: string } | null; limit: number }>): Promise<readonly LifecycleEvent[]>;
}
