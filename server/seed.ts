import { db, schema } from './db';

async function seed() {
  console.log('[Seed] Starting database seed...');

  try {
    // Seed Providers
    console.log('[Seed] Creating providers...');

    const providers = await db
      .insert(schema.providers)
      .values([
        {
          name: 'Charles Maddix',
          npi: '1234567890',
          workingHours: JSON.stringify({
            monday: { start: '10:30', end: '18:00' },
            tuesday: { start: '10:30', end: '18:00' },
            wednesday: { start: '10:30', end: '18:00' },
            thursday: { start: '10:30', end: '18:00' },
          }),
          appointmentTypes: JSON.stringify(['comprehensive_evaluation', 'follow_up', 'ketamine_consultation']),
          followUpOnly: false,
          active: true,
        },
        {
          name: 'Ava Suleiman',
          npi: '1234567891',
          workingHours: JSON.stringify({
            tuesday: { start: '10:30', end: '18:00' },
          }),
          appointmentTypes: JSON.stringify(['comprehensive_evaluation', 'follow_up', 'ketamine_consultation']),
          followUpOnly: false,
          active: true,
        },
        {
          name: 'Dr. Soto',
          npi: '1234567892',
          workingHours: JSON.stringify({
            monday: { start: '16:00', end: '18:00' },
            tuesday: { start: '16:00', end: '18:00' },
            wednesday: { start: '16:00', end: '18:00' },
            thursday: { start: '16:00', end: '18:00' },
          }),
          appointmentTypes: JSON.stringify(['follow_up']),
          followUpOnly: true,
          active: true,
        },
      ])
      .returning();

    console.log(`[Seed] Created ${providers.length} providers`);

    // Optional: Seed a test client
    console.log('[Seed] Creating test client...');

    const [testClient] = await db
      .insert(schema.clients)
      .values({
        name: 'John Doe',
        phone: '(904) 555-0123',
        dob: '1985-06-15',
        email: 'john.doe@example.com',
        address: '123 Main St',
        city: 'Jacksonville',
        state: 'FL',
        zipCode: '32207',
        insuranceCompany: 'Florida Blue',
        insurancePolicyNumber: 'ABC123456789',
        insuranceGroupNumber: 'GRP001',
        phoneVerified: true,
        dobVerified: true,
      })
      .returning();

    console.log(`[Seed] Created test client: ${testClient.name}`);

    console.log('[Seed] ✅ Database seeded successfully!');
  } catch (error) {
    console.error('[Seed] Error seeding database:', error);
    throw error;
  }
}

seed()
  .then(() => {
    console.log('[Seed] Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Seed] Failed:', error);
    process.exit(1);
  });