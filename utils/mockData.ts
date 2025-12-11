
// MOCK PATIENT DATABASE
// In a real app, this would be an API call to a FHIR server
export const MOCK_PATIENT_DB: Record<string, { age: string; dob: string; name: string; gender: string; height: string; weight: string }> = {
    'P12345': { 
        age: '45', 
        dob: '1978-05-12', 
        name: 'James Thompson', 
        gender: 'Male',
        height: '180 cm',
        weight: '82 kg'
    },
    'P67890': { 
        age: '29', 
        dob: '1995-10-30', 
        name: 'Sarah Connor',
        gender: 'Female',
        height: '165 cm',
        weight: '58 kg'
    },
    'P00001': { 
        age: '72', 
        dob: '1952-01-01', 
        name: 'Robert Smith',
        gender: 'Male',
        height: '175 cm',
        weight: '70 kg'
    },
    'TEST': { 
        age: '25', 
        dob: '1999-01-01', 
        name: 'Test Patient',
        gender: 'Other',
        height: '170 cm',
        weight: '65 kg'
    }
};