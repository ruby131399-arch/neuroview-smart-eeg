import { PatientInfo } from '../types';
import Client from 'fhirclient/lib/Client';

/**
 * Fetches patient demographics and latest vitals (Height, Weight) from a FHIR server
 * using the initialized SMART on FHIR client.
 */
export const fetchPatientData = async (client: Client): Promise<PatientInfo> => {
  try {
    // 1. Fetch Patient Resource
    // client.patient.read() automatically fetches the patient in context
    const patient: any = await client.patient.read();

    // Helper: Extract Name
    let name = 'Unknown';
    if (patient.name && patient.name.length > 0) {
      const n = patient.name[0];
      const given = n.given ? n.given.join(' ') : '';
      const family = n.family || '';
      name = `${given} ${family}`.trim();
    }

    // Helper: Extract Age
    let age = '';
    if (patient.birthDate) {
      const birthDate = new Date(patient.birthDate);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      age = calculatedAge.toString();
    }

    // 2. Fetch Height (LOINC 8302-2)
    // We request the most recent observation sorted by date
    // Use client.request to make authenticated requests
    let height = '';
    try {
      const heightRes: any = await client.request(`Observation?patient=${patient.id}&code=8302-2&_sort=-date&_count=1`);
      const entry = heightRes.entry?.[0]?.resource;
      if (entry && entry.valueQuantity) {
        height = `${entry.valueQuantity.value.toFixed(1)} ${entry.valueQuantity.unit || 'cm'}`;
      }
    } catch (e) {
      console.warn("Could not fetch height", e);
    }

    // 3. Fetch Weight (LOINC 29463-7)
    let weight = '';
    try {
      const weightRes: any = await client.request(`Observation?patient=${patient.id}&code=29463-7&_sort=-date&_count=1`);
      const entry = weightRes.entry?.[0]?.resource;
      if (entry && entry.valueQuantity) {
        weight = `${entry.valueQuantity.value.toFixed(1)} ${entry.valueQuantity.unit || 'kg'}`;
      }
    } catch (e) {
      console.warn("Could not fetch weight", e);
    }

    return {
      id: patient.id,
      name,
      age,
      dob: patient.birthDate || '',
      gender: patient.gender || '',
      height,
      weight
    };

  } catch (error) {
    console.error("FHIR Fetch Error:", error);
    throw error;
  }
};
