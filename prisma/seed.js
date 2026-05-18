const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Admin
  const adminPass = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@atomquest.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@atomquest.com',
      password: adminPass,
      role: 'ADMIN',
      department: 'HR',
    },
  });

  // Create Manager
  const managerPass = await bcrypt.hash('Manager@123', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@atomquest.com' },
    update: {},
    create: {
      name: 'Rahul Sharma',
      email: 'manager@atomquest.com',
      password: managerPass,
      role: 'MANAGER',
      department: 'Engineering',
    },
  });

  // Create Employee
  const empPass = await bcrypt.hash('Employee@123', 10);
  const employee = await prisma.user.upsert({
    where: { email: 'employee@atomquest.com' },
    update: {},
    create: {
      name: 'Priya Patel',
      email: 'employee@atomquest.com',
      password: empPass,
      role: 'EMPLOYEE',
      department: 'Engineering',
      managerId: manager.id,
    },
  });

  // Extra employees
  for (let i = 1; i <= 3; i++) {
    const p = await bcrypt.hash(`Pass${i}@123`, 10);
    await prisma.user.upsert({
      where: { email: `employee${i}@atomquest.com` },
      update: {},
      create: {
        name: `Employee ${i}`,
        email: `employee${i}@atomquest.com`,
        password: p,
        role: 'EMPLOYEE',
        department: 'Engineering',
        managerId: manager.id,
      },
    });
  }

  // Thrust Areas
  const thrustAreas = [
    { name: 'Revenue Growth', description: 'Goals related to increasing revenue' },
    { name: 'Customer Satisfaction', description: 'Goals around customer NPS and CSAT' },
    { name: 'Operational Efficiency', description: 'Process improvement and cost reduction' },
    { name: 'People Development', description: 'Training, hiring, and team growth' },
    { name: 'Innovation', description: 'New products, features, and R&D' },
    { name: 'Quality & Compliance', description: 'Quality metrics, audits, and regulatory compliance' },
    { name: 'Digital Transformation', description: 'Technology adoption and digital initiatives' },
  ];

  for (const ta of thrustAreas) {
    await prisma.thrustArea.upsert({
      where: { name: ta.name },
      update: {},
      create: ta,
    });
  }

  // Active Goal Cycle
  const now = new Date();
  await prisma.goalCycle.upsert({
    where: { id: 'fy-2025-26-goal-setting' },
    update: { isActive: true },
    create: {
      id: 'fy-2025-26-goal-setting',
      name: 'FY 2025-26',
      phase: 'GOAL_SETTING',
      startDate: new Date('2025-05-01'),
      endDate: new Date('2025-06-30'),
      isActive: true,
    },
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Demo Credentials:');
  console.log('  Admin:    admin@atomquest.com     / Admin@123');
  console.log('  Manager:  manager@atomquest.com   / Manager@123');
  console.log('  Employee: employee@atomquest.com  / Employee@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
