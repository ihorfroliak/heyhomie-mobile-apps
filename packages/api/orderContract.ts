/**
 * The order contract — the only stable API surface. UI, the Local adapter, the Http
 * adapter and the backend all agree on these types. Nothing here knows about storage
 * or transport. (Build 04: extracted from orderGateway.ts so the server can share the
 * exact Order shape without importing an adapter.)
 *
 * ── v2 (authorized versioned change) ─────────────────────────────────────────
 * v1 could not say WHEN a visit happens or WHERE. `scheduledAt` went in on
 * `submitOrder` and was never projected back, so every screen had to read
 * `updatedAt` — the moment the order was placed — and present it as the visit. That
 * produced three separate user-visible defects (a success screen naming the wrong
 * day, a cancellation fee computed against a past timestamp, and the wrong order
 * opening from "Track my order"). The visit site had nowhere to live at all, so the
 * booking flow collected an address and dropped it.
 *
 * v2 adds two OPTIONAL fields to `Order` — `scheduledAt` and `site`. Additive and
 * backwards compatible on purpose: a v1 backend simply omits them and every consumer
 * must still render without them (they are `?`, and the screens treat absence as
 * "not known", never as a default). Both adapters project them identically; the
 * parity test in gateway.test.ts asserts the round trip through each.
 *
 * The 8 primitives are UNCHANGED. Widening the Order projection is the whole of v2 —
 * do not take it as licence to add methods without another version.
 */
import type { PaymentIntent, DeliveryDetails, VisitSite } from '../domain';
import type { SubmitBookingInput, SubmitBookingResult, SubmitLeadInput } from './bookingStore';
import type { KeyValueStore } from './preferences';
import type { Lead } from '../domain';

/** Bumped only by an authorized versioned build. See the header for what v2 added. */
export const ORDER_CONTRACT_VERSION = 2;

export type SubmitOrderInput = SubmitBookingInput;
export type SubmitOrderResult = SubmitBookingResult;
export type LeadInput = SubmitLeadInput;

/** Canonical order status (contract). Backends map their internal states to this. */
export type OrderStatus = 'confirmed' | 'completed' | 'canceled' | 'paid';

/** Backend-agnostic projection of an order. Same shape a real API returns. */
export interface Order {
    id: string;
    clientId?: string;
    serviceId?: string;
    cityId?: string;
    contact?: { phone?: string; email?: string };
    delivery?: DeliveryDetails;
    /** When the order last changed — NOT when the visit happens. See `scheduledAt`. */
    updatedAt: string;
    /**
     * v2. ISO instant the visit starts (the opening of the arrival window the client
     * picked). Absent when the backend does not know one — a lead, a service quoted
     * by hand, or a v1 backend — and a consumer must render that absence, never
     * substitute `updatedAt`.
     */
    scheduledAt?: string;
    /** v2. Where the visit happens and how the homie gets in. Absent if not collected. */
    site?: VisitSite;
    status: OrderStatus;
    payment?: PaymentIntent;
}

export interface OrderGateway {
    /** Composition root injects storage/transport here (called once at startup). */
    init(kv: KeyValueStore): Promise<void>;
    /** Subscribe to state changes (for useSyncExternalStore). */
    subscribe(listener: () => void): () => void;

    // ── the 8 canonical primitives ──
    submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult>;
    getOrder(id: string): Order | undefined;
    listOrders(): Order[];
    confirmOrder(id: string): Order | undefined;
    completeOrder(id: string, completedAt?: string): Order | undefined;
    cancelOrder(id: string): Order | undefined;
    settleOrder(id: string, now?: string): Promise<Order | undefined>;
    markPaid(id: string): Order | undefined;

    // ── reactive read models (stable snapshots) ──
    ordersSnapshot(): Order[];
    leadsSnapshot(): Lead[];

    // ── adjacent funnel op (lead capture) ──
    captureLead(input: LeadInput): Promise<Lead>;
}
