/**
 * Postgres-backed PayoutRepo — tenant-scoped, optimistic-concurrency (version CAS).
 * Mirrors pgRepo.ts; every query is pinned to the tenant and the update is an atomic
 * compare-and-swap, so concurrent approve/pay calls can't lose a write.
 */
import type { Pool } from 'pg';
import { ConflictError, type PayoutRepo, type ServerPayout } from '@heyhomie/api';

interface Row {
    id: string;
    tenant_id: string;
    version: number;
    worker_id: string;
    worker_type: ServerPayout['workerType'];
    order_id: string | null;
    kind: ServerPayout['kind'];
    amount: number;
    period: string;
    status: ServerPayout['status'];
    note: string | null;
    created_at: string | Date;
    approved_at: string | Date | null;
    paid_at: string | Date | null;
}

const iso = (v: string | Date | null): string | undefined => (v ? new Date(v).toISOString() : undefined);

const rowToPayout = (r: Row): ServerPayout => ({
    id: r.id,
    tenantId: r.tenant_id,
    version: Number(r.version),
    workerId: r.worker_id,
    workerType: r.worker_type,
    orderId: r.order_id ?? undefined,
    kind: r.kind,
    amount: Number(r.amount),
    period: r.period,
    status: r.status,
    note: r.note ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    approvedAt: iso(r.approved_at),
    paidAt: iso(r.paid_at),
});

const COLS = 'id, tenant_id, version, worker_id, worker_type, order_id, kind, amount, period, status, note, created_at, approved_at, paid_at';

export function pgPayoutRepo(pool: Pool): PayoutRepo {
    return {
        async get(id, tenantId) {
            const r = await pool.query<Row>(`SELECT ${COLS} FROM payouts WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
            return r.rows[0] ? rowToPayout(r.rows[0]) : undefined;
        },

        async insert(p) {
            try {
                await pool.query(
                    `INSERT INTO payouts (id, tenant_id, version, worker_id, worker_type, order_id, kind, amount, period, status, note, created_at, approved_at, paid_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                    [p.id, p.tenantId, p.version, p.workerId, p.workerType, p.orderId ?? null, p.kind, p.amount, p.period, p.status, p.note ?? null, p.createdAt, p.approvedAt ?? null, p.paidAt ?? null],
                );
            } catch (e) {
                // The partial unique index (one live payout per order) is the DB-level
                // double-pay guard; surface it as the same conflict the service raises.
                if ((e as { code?: string }).code === '23505') throw new ConflictError('this order already has a payout');
                throw e;
            }
        },

        async update(p, expectedVersion) {
            // Atomic CAS: the row must still be at expectedVersion AND in this tenant.
            const r = await pool.query<Row>(
                `UPDATE payouts
                    SET status = $1, amount = $2, note = $3, approved_at = $4, paid_at = $5, version = version + 1
                  WHERE id = $6 AND tenant_id = $7 AND version = $8
              RETURNING ${COLS}`,
                [p.status, p.amount, p.note ?? null, p.approvedAt ?? null, p.paidAt ?? null, p.id, p.tenantId, expectedVersion],
            );
            if (r.rowCount === 0) throw new ConflictError('version conflict');
            return rowToPayout(r.rows[0]);
        },

        async list(tenantId) {
            const r = await pool.query<Row>(`SELECT ${COLS} FROM payouts WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]);
            return r.rows.map(rowToPayout);
        },

        async findByOrder(orderId, tenantId) {
            const r = await pool.query<Row>(
                `SELECT ${COLS} FROM payouts WHERE tenant_id = $1 AND order_id = $2 AND status <> 'canceled' LIMIT 1`,
                [tenantId, orderId],
            );
            return r.rows[0] ? rowToPayout(r.rows[0]) : undefined;
        },
    };
}
