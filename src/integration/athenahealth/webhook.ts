import crypto from 'crypto';

export interface AthenaWebhookEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  patientId?: string;
  appointmentId?: string;
  data: Record<string, unknown>;
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export class WebhookProcessor {
  constructor(
    private webhookSecret: string,
    private processedEvents: Set<string> = new Set()
  ) {}

  async processEvent(event: AthenaWebhookEvent): Promise<void> {
    if (this.processedEvents.has(event.eventId)) {
      console.log(`Webhook ${event.eventId} already processed — skipping`);
      return;
    }

    switch (event.eventType) {
      case 'appointment.created':
      case 'appointment.updated':
        await this.processAppointmentEvent(event);
        break;
      case 'patient.created':
      case 'patient.updated':
        await this.processPatientEvent(event);
        break;
      default:
        console.log(`Unknown event type: ${event.eventType}`);
    }

    this.processedEvents.add(event.eventId);
  }

  async processAppointmentEvent(event: AthenaWebhookEvent): Promise<void> {
    // In production: update Appointment table via Prisma, sync via FHIRMapping
    console.log(`Processing appointment event: ${event.eventId}, appointmentId: ${event.appointmentId}`);
  }

  async processPatientEvent(event: AthenaWebhookEvent): Promise<void> {
    // In production: create/update Patient record, create FHIRMapping entry
    console.log(`Processing patient event: ${event.eventId}, patientId: ${event.patientId}`);
  }
}
