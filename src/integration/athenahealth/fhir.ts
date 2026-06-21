import https from 'https';

export interface FHIRBundle {
  resourceType: 'Bundle';
  entry: { resource: unknown }[];
}

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  name: { given: string[]; family: string }[];
  birthDate: string;
  telecom: { system: string; value: string }[];
}

export interface FHIRAppointment {
  resourceType: 'Appointment';
  id: string;
  status: string;
  start: string;
  end: string;
  participant: { actor: { reference: string } }[];
}

export class AthenaFHIRClient {
  constructor(
    private accessToken: string,
    private practiceId: string
  ) {}

  private async request<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.athenahealth.com',
        path: `/fhir/r4${path}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`FHIR parse error: ${data}`)); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  async getPatient(patientId: string): Promise<FHIRPatient> {
    return this.request<FHIRPatient>(`/Patient/${patientId}`);
  }

  async searchPatients(params: Record<string, string>): Promise<FHIRBundle> {
    const qs = new URLSearchParams(params).toString();
    return this.request<FHIRBundle>(`/Patient?${qs}`);
  }

  async getAppointment(appointmentId: string): Promise<FHIRAppointment> {
    return this.request<FHIRAppointment>(`/Appointment/${appointmentId}`);
  }

  async getAppointmentsForPatient(patientId: string): Promise<FHIRBundle> {
    return this.request<FHIRBundle>(`/Appointment?patient=${patientId}`);
  }

  async getCondition(patientId: string): Promise<FHIRBundle> {
    return this.request<FHIRBundle>(`/Condition?patient=${patientId}`);
  }

  async getMedicationRequest(patientId: string): Promise<FHIRBundle> {
    return this.request<FHIRBundle>(`/MedicationRequest?patient=${patientId}`);
  }

  async getObservation(patientId: string): Promise<FHIRBundle> {
    return this.request<FHIRBundle>(`/Observation?patient=${patientId}&category=laboratory`);
  }

  async createAppointment(appointment: Record<string, unknown>): Promise<FHIRAppointment> {
    // POST /Appointment — implementation in Phase 7
    return appointment as FHIRAppointment;
  }
}
