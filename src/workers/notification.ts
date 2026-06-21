import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface AppointmentReminder {
  appointmentId: string;
  patientEmail: string;
  patientPhone?: string;
  providerName: string;
  appointmentTime: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const command = new SendEmailCommand({
    Source: process.env.NOTIFICATION_EMAIL || 'noreply@medportal.com',
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: body } },
    },
  });
  await ses.send(command);
}

export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  const command = new PublishCommand({
    PhoneNumber: phoneNumber,
    Message: message,
  });
  await sns.send(command);
}

export async function sendAppointmentReminder(reminder: AppointmentReminder): Promise<void> {
  const { appointmentId, patientEmail, patientPhone, providerName, appointmentTime } = reminder;
  const subject = `Appointment Reminder - ${appointmentTime}`;
  const body = `Your appointment with ${providerName} is scheduled for ${appointmentTime}.\n\nAppointment ID: ${appointmentId}\n\nMedPortal`;

  await sendEmail(patientEmail, subject, body);

  if (patientPhone) {
    await sendSMS(patientPhone, `MedPortal: Reminder - appointment with ${providerName} at ${appointmentTime}`);
  }
}

export async function sendProviderNotification(
  providerEmail: string,
  patientName: string,
  appointmentTime: string
): Promise<void> {
  const subject = `New Appointment Scheduled`;
  const body = `A new appointment has been scheduled.\n\nPatient: ${patientName}\nTime: ${appointmentTime}\n\nMedPortal`;
  await sendEmail(providerEmail, subject, body);
}
