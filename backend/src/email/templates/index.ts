import type { BookingEmailData, PaymentReceiptData, DriverAssignmentData, JobUpdateEmailData } from '../email.service.js';

const baseStyle = `
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f4f4f7; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
  .header { background: #1a1a2e; color: #ffffff; padding: 24px 32px; text-align: center; }
  .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
  .header p { margin: 4px 0 0; font-size: 13px; color: #a0a0b8; }
  .body { padding: 32px; }
  .body h2 { color: #1a1a2e; font-size: 18px; margin: 0 0 16px; }
  .body p { color: #4a4a68; font-size: 14px; line-height: 1.6; margin: 0 0 12px; }
  .details { background: #f8f8fc; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
  .details table { width: 100%; border-collapse: collapse; }
  .details td { padding: 6px 0; font-size: 14px; color: #4a4a68; }
  .details td:first-child { font-weight: 600; color: #1a1a2e; width: 40%; }
  .total { background: #1a1a2e; color: #ffffff; border-radius: 6px; padding: 12px 20px; margin: 16px 0; text-align: center; font-size: 18px; font-weight: 600; }
  .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #a0a0b8; border-top: 1px solid #eee; }
`;

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${baseStyle}</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>iTour Transport & Traffic</h1>
    <p>Your trusted transfer partner</p>
  </div>
  ${content}
  <div class="footer">
    <p>iTour Transport & Traffic &copy; ${new Date().getFullYear()}</p>
    <p>If you have questions, contact us at support@itour.local</p>
  </div>
</div>
</body>
</html>`;
}

export function bookingConfirmationTemplate(data: BookingEmailData): string {
  return wrap(`
  <div class="body">
    <h2>Booking Confirmed!</h2>
    <p>Dear ${data.guestName},</p>
    <p>Your transfer booking has been confirmed. Here are the details:</p>
    <div class="details">
      <table>
        <tr><td>Booking Ref</td><td>${data.bookingRef}</td></tr>
        <tr><td>Service</td><td>${data.serviceType}</td></tr>
        <tr><td>Date</td><td>${data.jobDate}</td></tr>
        ${data.pickupTime ? `<tr><td>Pickup Time</td><td>${data.pickupTime}</td></tr>` : ''}
        <tr><td>From</td><td>${data.fromZone}</td></tr>
        <tr><td>To</td><td>${data.toZone}</td></tr>
        ${data.hotel ? `<tr><td>Hotel</td><td>${data.hotel}</td></tr>` : ''}
        ${data.flightNo ? `<tr><td>Flight</td><td>${data.flightNo}</td></tr>` : ''}
        <tr><td>Passengers</td><td>${data.paxCount}</td></tr>
        <tr><td>Vehicle</td><td>${data.vehicleType}</td></tr>
        <tr><td>Payment</td><td>${data.paymentMethod === 'PAY_ON_ARRIVAL' ? 'Pay on Arrival' : 'Online Payment'}</td></tr>
      </table>
    </div>
    <div class="total">${data.currency} ${data.total.toFixed(2)}</div>
    <p>We look forward to serving you!</p>
  </div>`);
}

export function paymentReceiptTemplate(data: PaymentReceiptData): string {
  return wrap(`
  <div class="body">
    <h2>Payment Received</h2>
    <p>Dear ${data.guestName},</p>
    <p>We have received your payment. Here is your receipt:</p>
    <div class="details">
      <table>
        <tr><td>Booking Ref</td><td>${data.bookingRef}</td></tr>
        <tr><td>Amount</td><td>${data.currency} ${data.amount.toFixed(2)}</td></tr>
        <tr><td>Gateway</td><td>${data.gateway}</td></tr>
        <tr><td>Transaction ID</td><td>${data.transactionId}</td></tr>
        <tr><td>Date</td><td>${data.paidAt}</td></tr>
      </table>
    </div>
    <p>Thank you for your payment!</p>
  </div>`);
}

export function bookingCancellationTemplate(data: BookingEmailData): string {
  return wrap(`
  <div class="body">
    <h2>Booking Cancelled</h2>
    <p>Dear ${data.guestName},</p>
    <p>Your booking <strong>${data.bookingRef}</strong> has been cancelled.</p>
    <div class="details">
      <table>
        <tr><td>Booking Ref</td><td>${data.bookingRef}</td></tr>
        <tr><td>Service</td><td>${data.serviceType}</td></tr>
        <tr><td>Date</td><td>${data.jobDate}</td></tr>
        <tr><td>From</td><td>${data.fromZone}</td></tr>
        <tr><td>To</td><td>${data.toZone}</td></tr>
      </table>
    </div>
    <p>If this was a mistake or you need assistance, please contact our support team.</p>
  </div>`);
}

export function driverAssignmentTemplate(data: DriverAssignmentData): string {
  return wrap(`
  <div class="body">
    <h2>Driver Assigned</h2>
    <p>Dear ${data.guestName},</p>
    <p>A driver has been assigned to your booking <strong>${data.bookingRef}</strong>.</p>
    <div class="details">
      <table>
        <tr><td>Driver Name</td><td>${data.driverName}</td></tr>
        <tr><td>Driver Phone</td><td>${data.driverPhone}</td></tr>
        <tr><td>Vehicle</td><td>${data.vehicleType}${data.vehicleColor ? ` (${data.vehicleColor})` : ''}</td></tr>
        <tr><td>Plate Number</td><td>${data.vehiclePlate}</td></tr>
      </table>
    </div>
    <p>Your driver will be waiting for you. Have a great trip!</p>
  </div>`);
}

export function jobUpdateNotificationTemplate(data: JobUpdateEmailData): string {
  const hl = (field: string) => data.changedFields.includes(field) ? 'background:#FFFF00;' : '';
  return wrap(`
  <div class="body">
    <h2>Traffic Job Updated</h2>
    <p>Job <strong>${data.internalRef}</strong> has been updated by <strong>${data.updatedBy}</strong>.</p>
    <div class="details">
      <table>
        <tr style="${hl('bookingStatus')}"><td>Booking Status</td><td>${data.bookingStatus}</td></tr>
        <tr style="${hl('status')}"><td>Job Status</td><td>${data.jobStatus}</td></tr>
        <tr><td>Internal Ref</td><td>${data.internalRef}</td></tr>
        <tr><td>Channel</td><td>${data.bookingChannel}</td></tr>
        ${data.agentName ? `<tr style="${hl('agentId')}"><td>Agent</td><td>${data.agentName}</td></tr>` : ''}
        ${data.agentRef ? `<tr style="${hl('agentRef')}"><td>Agent Ref</td><td>${data.agentRef}</td></tr>` : ''}
        ${data.customerName ? `<tr style="${hl('customerId')}"><td>Customer</td><td>${data.customerName}</td></tr>` : ''}
        <tr style="${hl('serviceType')}"><td>Service Type</td><td>${data.serviceType}</td></tr>
        <tr style="${hl('jobDate')}"><td>Service Date</td><td>${data.jobDate}</td></tr>
        ${data.pickUpTime ? `<tr style="${hl('pickUpTime')}"><td>Pick-up Time</td><td>${data.pickUpTime}</td></tr>` : ''}
        <tr style="${hl('adultCount')}${hl('childCount')}"><td>Passengers</td><td>${data.paxCount} (${data.adultCount}A${data.childCount > 0 ? `+${data.childCount}C` : ''})</td></tr>
        ${data.clientName ? `<tr style="${hl('clientName')}"><td>Client Name</td><td>${data.clientName}</td></tr>` : ''}
        ${data.clientMobile ? `<tr style="${hl('clientMobile')}"><td>Client Mobile</td><td>${data.clientMobile}</td></tr>` : ''}
        ${data.originLocation ? `<tr style="${hl('originAirportId')}${hl('originZoneId')}${hl('originHotelId')}"><td>Origin</td><td>${data.originLocation}</td></tr>` : ''}
        ${data.destinationLocation ? `<tr style="${hl('destinationAirportId')}${hl('destinationZoneId')}${hl('destinationHotelId')}"><td>Destination</td><td>${data.destinationLocation}</td></tr>` : ''}
        ${data.flightNo ? `<tr style="${hl('flight')}"><td>Flight</td><td>${data.flightNo}</td></tr>` : ''}
        ${data.notes ? `<tr style="${hl('notes')}"><td>Notes</td><td>${data.notes}</td></tr>` : ''}
        <tr><td>Updated At</td><td>${data.updatedAt}</td></tr>
      </table>
    </div>
    ${data.changedFields.length > 0 ? '<p style="font-size:12px;color:#888;">Fields highlighted in <span style="background:#FFFF00;padding:2px 6px;">yellow</span> were changed in this update.</p>' : ''}
  </div>`);
}
