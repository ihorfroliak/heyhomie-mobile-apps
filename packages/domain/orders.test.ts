/** Run with: npx -y tsx packages/domain/orders.test.ts */
import { isValidNip, normalizeNip, formatNip, validateBilling } from './billing';
import { frequenciesFor, isLeadService, CLEANING_FREQUENCIES, DELIVERY_FREQUENCIES, serviceById } from './catalog';
import { nextOccurrence, generateOccurrences, shiftSeries, moveOccurrence, skipOccurrence, cancellationFee, isLateCancellation, hoursUntil, ARRIVAL_SLOTS, arrivalSlot, arrivalStartIso, bookableDates, BOOKING_HORIZON_DAYS, BOOKING_LEAD_DAYS } from './scheduling';
import { ACCESS_METHODS, accessMethod, formatVisitSite, validateVisitSite, VISIT_NOTES_MAX } from './visitSite';
import { channelsFor, buildNotifications, renderNotification, type NotificationRecipient } from './notifications';
import { validateDelivery, DELIVERY_SLOTS, type DeliveryDetails } from './delivery';
import { createPaymentIntent, markDue, runCharge, markPaid, isPaid, nextChargeAt, duePayments, payLaterLink, paymentStatusTone, paymentMethodLabel } from './payment';
import { serviceDetail } from './catalog';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

// ---- billing / NIP ----
ok('valid NIP passes checksum', isValidNip('5252248481')); // real valid NIP
ok('valid NIP with dashes', isValidNip('123-456-32-18'));
ok('PL prefix + spaces normalized', isValidNip('PL 525-224-84-81'));
ok('bad checksum rejected', !isValidNip('5252248480'));
ok('wrong length rejected', !isValidNip('12345'));
eq('normalizeNip strips', normalizeNip('PL 525-224-84-81'), '5252248481');
eq('formatNip groups', formatNip('5252248481'), '525-224-84-81');
eq('billing missing fields flagged', validateBilling({ companyName: 'Acme' }).missing.includes('nip'), true);
ok('billing valid when complete', validateBilling({ companyName: 'Acme', nip: '5252248481', line1: 'ul. X 1', zipCode: '31-000', city: 'krakow' }).valid);
ok('billing invalid on bad nip', !validateBilling({ companyName: 'Acme', nip: '5252248480', line1: 'ul. X 1', zipCode: '31-000', city: 'krakow' }).valid);

// ---- catalog frequencies ----
eq('cleaning has 4 cyclicities', frequenciesFor('standard_cleaning'), CLEANING_FREQUENCIES);
eq('general cleaning too', frequenciesFor('general_cleaning'), CLEANING_FREQUENCIES);
eq('window cleaning is one-off only', frequenciesFor('window_cleaning'), ['once']);
eq('flower delivery has delivery cadences', frequenciesFor('flower_delivery'), DELIVERY_FREQUENCIES);
eq('office cleaning has no in-app cadence', frequenciesFor('office_cleaning'), []);
ok('office cleaning is a lead service', isLeadService('office_cleaning') && isLeadService('post_renovation'));
ok('standard cleaning is not a lead', !isLeadService('standard_cleaning'));
ok('new services exist', !!serviceById('office_cleaning') && !!serviceById('post_renovation'));

// ---- scheduling: stepping ----
eq('weekly +7d', nextOccurrence('2025-05-05T10:00:00.000Z', 'weekly'), '2025-05-12T10:00:00.000Z');
eq('biweekly +14d', nextOccurrence('2025-05-05T10:00:00.000Z', 'biweekly'), '2025-05-19T10:00:00.000Z');
eq('monthly +1 month', nextOccurrence('2025-05-05T10:00:00.000Z', 'monthly'), '2025-06-05T10:00:00.000Z');
// Day-overflow clamping: a series anchored on the 31st must not drift into the next month.
eq('monthly Jan 31 clamps to Feb 28', nextOccurrence('2025-01-31T10:00:00.000Z', 'monthly'), '2025-02-28T10:00:00.000Z');
eq('monthly Jan 31 leap year clamps to Feb 29', nextOccurrence('2024-01-31T10:00:00.000Z', 'monthly'), '2024-02-29T10:00:00.000Z');
eq('monthly May 31 clamps to Jun 30', nextOccurrence('2025-05-31T10:00:00.000Z', 'monthly'), '2025-06-30T10:00:00.000Z');
eq('every other day +2', nextOccurrence('2025-05-05T10:00:00.000Z', 'every_other_day'), '2025-05-07T10:00:00.000Z');
eq('once has no next', nextOccurrence('2025-05-05T10:00:00.000Z', 'once'), null);
// 2025-05-09 is a Friday → next workday is Monday 2025-05-12
eq('every_workday skips the weekend', nextOccurrence('2025-05-09T10:00:00.000Z', 'every_workday'), '2025-05-12T10:00:00.000Z');
eq('generate 3 biweekly', generateOccurrences('2025-05-05T10:00:00.000Z', 'biweekly', 3), ['2025-05-05T10:00:00.000Z', '2025-05-19T10:00:00.000Z', '2025-06-02T10:00:00.000Z']);

// ---- reschedule modes ----
const series = generateOccurrences('2025-05-05T10:00:00.000Z', 'biweekly', 4); // 05-05, 05-19, 06-02, 06-16
// A. shift: move index 1 (05-19) forward a week → 05-26, and re-sync +14 from there
eq('shiftSeries re-syncs cadence', shiftSeries(series, 1, '2025-05-26T10:00:00.000Z', 'biweekly'), [
    '2025-05-05T10:00:00.000Z',
    '2025-05-26T10:00:00.000Z',
    '2025-06-09T10:00:00.000Z',
    '2025-06-23T10:00:00.000Z',
]);
// B. move only index 1 by an hour; the rest stay on the original cadence
eq('moveOccurrence touches one visit only', moveOccurrence(series, 1, '2025-05-19T11:00:00.000Z'), [
    '2025-05-05T10:00:00.000Z',
    '2025-05-19T11:00:00.000Z',
    '2025-06-02T10:00:00.000Z',
    '2025-06-16T10:00:00.000Z',
]);
// skip: cancel the 3rd visit (…on, on, off, on)
eq('skipOccurrence drops one visit', skipOccurrence(series, 2), ['2025-05-05T10:00:00.000Z', '2025-05-19T10:00:00.000Z', '2025-06-16T10:00:00.000Z']);

// ---- cancellation penalty ----
const start = '2025-05-20T10:00:00.000Z';
eq('hoursUntil', hoursUntil(start, '2025-05-19T10:00:00.000Z'), 24);
ok('>24h is not late', !isLateCancellation(start, '2025-05-19T09:59:00.000Z'));
ok('<24h is late', isLateCancellation(start, '2025-05-19T12:00:00.000Z'));
eq('late full cancel = 50%', cancellationFee(start, '2025-05-19T20:00:00.000Z', 200), 100);
eq('early cancel = 0', cancellationFee(start, '2025-05-10T10:00:00.000Z', 200), 0);
eq('within-cycle reschedule is exempt', cancellationFee(start, '2025-05-19T20:00:00.000Z', 200, { isReschedule: true }), 0);

// ---- notifications ----
eq('invoice goes by email only', channelsFor('invoice_issued'), ['email']);
eq('reschedule goes email+push', channelsFor('visit_rescheduled'), ['email', 'push']);
eq('callback confirmation is phone-first', channelsFor('callback_received'), ['sms', 'email']);
ok('callback body names the service', renderNotification({ kind: 'callback_received', serviceLabel: 'Office cleaning' }).body.includes('Office cleaning'));
const admin = renderNotification({ kind: 'visit_rescheduled', actor: 'admin', scheduledAt: '2025-05-20T10:00', newScheduledAt: '2025-05-21T10:00' });
ok('admin reschedule says "We moved"', admin.body.startsWith('We moved'));
const client = renderNotification({ kind: 'visit_rescheduled', actor: 'client', scheduledAt: '2025-05-20T10:00', newScheduledAt: '2025-05-21T10:00' });
ok('client reschedule says "You moved"', client.body.startsWith('You moved'));
const recipient: NotificationRecipient = { email: 'a@b.pl', pushToken: 'x' }; // no phone
eq('build limits to receivable channels', buildNotifications({ kind: 'visit_rescheduled', actor: 'admin' }, recipient).map(m => m.channel), ['email', 'push']);
eq('invoice email carries a subject', buildNotifications({ kind: 'invoice_issued', invoiceNumber: 'FV/1', amount: 246, currency: 'PLN' }, recipient)[0].subject, 'Invoice FV/1');
eq('sms-only recipient skips push/email for reschedule', buildNotifications({ kind: 'visit_rescheduled' }, { phone: '+48500' }).map(m => m.channel), []);

// ---- flower delivery ----
const goodDelivery: DeliveryDetails = { recipientName: 'Anna K.', line1: 'ul. Floriańska 3', city: 'krakow', date: '2025-06-01', slot: 'afternoon' };
ok('three delivery slots defined', DELIVERY_SLOTS.length === 3);
ok('valid delivery passes', validateDelivery(goodDelivery).valid);
eq('missing recipient flagged', validateDelivery({ ...goodDelivery, recipientName: ' ' }).missing, ['recipientName']);
eq('bad date format flagged', validateDelivery({ ...goodDelivery, date: '01.06.2025' }).missing, ['date']);
ok('phone optional', validateDelivery(goodDelivery).phoneValid);
ok('bad phone rejected when given', !validateDelivery({ ...goodDelivery, recipientPhone: '123' }).valid);
ok('valid PL phone accepted', validateDelivery({ ...goodDelivery, recipientPhone: '501 234 567' }).valid);

// ---- payment (settled AFTER the mission, via a 03:00 next-day job) ----
const cardPay = createPaymentIntent({ orderId: 'o1', method: 'card', amount: 200 });
eq('nothing due at booking', cardPay.status, 'awaiting_completion');
eq('provider is stripe', cardPay.provider, 'stripe');
ok('no charge scheduled yet', !cardPay.chargeAt);
// 03:00 Europe/Warsaw the day AFTER completion — asserted in Warsaw time (the
// prod TZ), independent of the machine running the test.
const chargeWarsaw = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(nextChargeAt('2025-06-01T20:30:00.000Z'))) // 22:30 Warsaw (CEST)
        .map(p => [p.type, p.value]),
) as Record<string, string>;
ok('charge is at 03:00 Warsaw', chargeWarsaw.hour === '03' && chargeWarsaw.minute === '00');
ok('charge is the next calendar day (Warsaw)', chargeWarsaw.year === '2025' && chargeWarsaw.month === '06' && chargeWarsaw.day === '02');
// Card on file → mission done → due → auto-charged.
const cardDue = markDue(cardPay, '2025-06-01T14:00:00.000Z');
eq('completion makes it due', cardDue.status, 'due');
ok('due sets a chargeAt', !!cardDue.chargeAt);
eq('nothing due before its chargeAt', duePayments([cardDue], '2025-06-01T23:00:00.000Z').length, 0);
eq('due once the time passes', duePayments([cardDue], '2025-06-02T03:00:00.000Z').length, 1);
const cardCharged = runCharge(cardDue, '2025-06-02T03:00:00.000Z');
ok('card auto-charges to paid via Stripe', isPaid(cardCharged) && cardCharged.stripeRef === 'pi_o1');
// No card → mission done → link emailed → client pays.
const later = markDue(createPaymentIntent({ orderId: 'o2', method: 'pay_later', email: 'a@b.pl' }), '2025-06-01T14:00:00.000Z');
const linked = runCharge(later, '2025-06-02T03:00:00.000Z');
eq('card-less run emails a link', linked.status, 'link_sent');
eq('link is the hosted url', linked.linkUrl, payLaterLink('o2'));
eq('link remembers the address', linked.linkSentTo, 'a@b.pl');
ok('client settles the link', isPaid(markPaid(linked, '2025-06-02T09:00:00.000Z')));
eq('awaiting tone is neutral', paymentStatusTone('awaiting_completion'), 'neutral');
eq('due tone is warning', paymentStatusTone('due'), 'warning');
eq('paid tone is success', paymentStatusTone('paid'), 'success');
eq('method label localizes', paymentMethodLabel('pay_later', 'uk'), 'Оплатити пізніше');
eq('payment_link goes by email', channelsFor('payment_link'), ['email']);
eq('payment_charged goes by email', channelsFor('payment_charged'), ['email']);
ok('charged receipt shows the amount', renderNotification({ kind: 'payment_charged', amount: 200, currency: 'PLN' }).body.includes('200'));

// ---- booking a visit: arrival windows + open days ----
eq('four arrival windows', ARRIVAL_SLOTS.length, 4);
ok('windows are contiguous 08–20', ARRIVAL_SLOTS.every((s, i) => s.endHour === s.startHour + 3 && (i === 0 || s.startHour === ARRIVAL_SLOTS[i - 1].endHour)));
ok('every window is localized', ARRIVAL_SLOTS.every(s => !!s.label.pl && !!s.label.en && !!s.label.uk));
eq('lookup by id', arrivalSlot('midday')?.startHour, 11);
eq('unknown slot id is undefined', arrivalSlot('night'), undefined);
eq('calendar opens tomorrow', bookableDates('2026-08-05')[0], '2026-08-06');
eq('calendar runs a fortnight', bookableDates('2026-08-05').length, BOOKING_HORIZON_DAYS);
eq('calendar ends 14 days out', bookableDates('2026-08-05')[13], '2026-08-19');
eq('lead days are honoured', bookableDates('2026-08-05', 1, 3)[0], '2026-08-08');
eq('default lead is one day', BOOKING_LEAD_DAYS, 1);
eq('month rolls over', bookableDates('2026-08-30', 3)[2], '2026-09-02');
eq('leap day is a real day', bookableDates('2028-02-28', 1)[0], '2028-02-29');
eq('a broken date yields no days', bookableDates('not-a-date').length, 0);
eq('start lands on the window hour', new Date(arrivalStartIso('2026-08-06', 'morning')!).getHours(), 8);
eq('evening starts at 17', new Date(arrivalStartIso('2026-08-06', 'evening')!).getHours(), 17);
eq('start keeps the calendar day', new Date(arrivalStartIso('2026-08-06', 'midday')!).getDate(), 6);
eq('unknown slot has no start', arrivalStartIso('2026-08-06', 'night'), undefined);
eq('unparseable day has no start', arrivalStartIso('x', 'morning'), undefined);
ok('a booked visit is not a late cancellation on the day it is made', !isLateCancellation(arrivalStartIso('2026-08-07', 'morning')!, '2026-08-05T10:00:00.000Z'));

// ---- where the visit happens, and how the homie gets in ----
eq('three ways in', ACCESS_METHODS.length, 3);
ok('every access method is localized', ACCESS_METHODS.every(a => !!a.label.pl && !!a.label.en && !!a.label.uk && !!a.hint.pl));
eq('only the code option needs a code', ACCESS_METHODS.filter(a => a.requiresCode).map(a => a.id), ['code']);
eq('unknown access id is undefined', accessMethod('drone'), undefined);
ok('street with a number is a location', validateVisitSite({ line1: 'ul. Karmelicka 14', access: 'meet' }).valid);
ok('a street with no number is not', !validateVisitSite({ line1: 'ul. Karmelicka', access: 'meet' }).line1Valid);
ok('a bare number is not either', !validateVisitSite({ line1: '14', access: 'meet' }).line1Valid);
ok('missing address blocks', !validateVisitSite({ access: 'meet' }).valid);
ok('the code option demands a code', validateVisitSite({ line1: 'ul. Długa 5', access: 'code' }).codeMissing);
ok('…and passes once given', validateVisitSite({ line1: 'ul. Długa 5', access: 'code', entryCode: '1234' }).valid);
ok('whitespace is not a code', validateVisitSite({ line1: 'ul. Długa 5', access: 'code', entryCode: '  ' }).codeMissing);
ok('concierge keys need no code', validateVisitSite({ line1: 'ul. Długa 5', access: 'keys' }).valid);
ok('an over-long note blocks', !validateVisitSite({ line1: 'ul. Długa 5', access: 'meet', notes: 'x'.repeat(VISIT_NOTES_MAX + 1) }).notesValid);
ok('a note at the cap is fine', validateVisitSite({ line1: 'ul. Długa 5', access: 'meet', notes: 'x'.repeat(VISIT_NOTES_MAX) }).valid);
eq('summary keeps flat and floor', formatVisitSite({ line1: 'ul. Karmelicka 14', flat: '3', floor: '2', city: 'Kraków' }), 'ul. Karmelicka 14, flat 3, floor 2 · Kraków');
eq('summary drops what is empty', formatVisitSite({ line1: 'ul. Karmelicka 14', flat: '  ' }), 'ul. Karmelicka 14');

// ---- service details ----
ok('every catalog service has details', ['standard_cleaning', 'general_cleaning', 'window_cleaning', 'flower_delivery', 'office_cleaning', 'post_renovation'].every(id => !!serviceDetail(id)));
ok('details localized in 3 langs', (() => { const d = serviceDetail('flower_delivery')!; return !!d.description.pl && !!d.description.en && !!d.description.uk; })());
ok('highlights are non-empty lists', serviceDetail('general_cleaning')!.highlights.en.length > 0);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All orders tests passed.');
