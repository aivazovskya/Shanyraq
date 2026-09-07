import { PrismaClient, UserRole, UnitType, OwnershipType, RequestCategory, RequestStatus, RequestPriority, MeetingStatus, DecisionType, VoteChoice, AccessPointType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Начинаем наполнение базы данных демо-данными для ЖК «Шаңырақ Премиум»...');

  // 1. Очистка старых данных
  await prisma.vote.deleteMany();
  await prisma.agendaItem.deleteMany();
  await prisma.meetingProtocol.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.requestAttachment.deleteMany();
  await prisma.requestComment.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.accessLog.deleteMany();
  await prisma.guestPass.deleteMany();
  await prisma.accessPoint.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.unitOwnership.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.building.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const defaultPasswordHash = await bcrypt.hash('Shanyraq2026!', 10);

  // 2. Создание жилого комплекса (Tenant)
  const tenant = await prisma.tenant.create({
    data: {
      name: 'ЖК «Шаңырақ Премиум»',
      address: 'ул. Достык, д. 15/1',
      city: 'Астана',
      totalArea: 12500.0, // Общая площадь всех жилых и коммерческих помещений
      totalUnitsCount: 140,
    },
  });

  console.log(`✅ Создан ЖК: ${tenant.name} (ID: ${tenant.id})`);

  // 3. Создание блоков/домов
  const blockA = await prisma.building.create({
    data: {
      tenantId: tenant.id,
      blockName: 'Блок А (Подъезды 1-2)',
      floorsCount: 12,
      entrancesCount: 2,
      totalArea: 6500.0,
    },
  });

  const blockB = await prisma.building.create({
    data: {
      tenantId: tenant.id,
      blockName: 'Блок Б (Подъезды 3-4)',
      floorsCount: 12,
      entrancesCount: 2,
      totalArea: 6000.0,
    },
  });

  // 4. Создание типовых квартир с точными площадями
  const apt101 = await prisma.unit.create({
    data: {
      buildingId: blockA.id,
      unitNumber: '101',
      floor: 2,
      entrance: 1,
      type: UnitType.APARTMENT,
      area: 68.5, // 68.5 кв.м
      cadastralNumber: '21:320:135:101',
    },
  });

  const apt102 = await prisma.unit.create({
    data: {
      buildingId: blockA.id,
      unitNumber: '102',
      floor: 2,
      entrance: 1,
      type: UnitType.APARTMENT,
      area: 92.4, // 92.4 кв.м
      cadastralNumber: '21:320:135:102',
    },
  });

  const apt205 = await prisma.unit.create({
    data: {
      buildingId: blockB.id,
      unitNumber: '205',
      floor: 5,
      entrance: 3,
      type: UnitType.APARTMENT,
      area: 124.0, // 124.0 кв.м
      cadastralNumber: '21:320:135:205',
    },
  });

  // 5. Создание пользователей с ролями
  const adminUser = await prisma.user.create({
    data: {
      phone: '+77001000001',
      email: 'admin@shanyraq.kz',
      passwordHash: defaultPasswordHash,
      firstName: 'Алихан',
      lastName: 'Бокейханов',
      iin: '850101300111',
      role: UserRole.HOA_ADMIN,
      tenantId: tenant.id,
      isVerified: true,
    },
  });

  const chairmanUser = await prisma.user.create({
    data: {
      phone: '+77001000002',
      email: 'chairman@shanyraq.kz',
      passwordHash: defaultPasswordHash,
      firstName: 'Нурсултан',
      lastName: 'Касымов',
      iin: '880315350222',
      role: UserRole.HOA_CHAIRMAN,
      tenantId: tenant.id,
      isVerified: true,
    },
  });

  const dispatcherUser = await prisma.user.create({
    data: {
      phone: '+77001000003',
      email: 'dispatcher@shanyraq.kz',
      passwordHash: defaultPasswordHash,
      firstName: 'Айгерим',
      lastName: 'Серикова',
      role: UserRole.DISPATCHER,
      tenantId: tenant.id,
      isVerified: true,
    },
  });

  const securityUser = await prisma.user.create({
    data: {
      phone: '+77001000004',
      firstName: 'Ерлан',
      lastName: 'Бауыржанулы',
      role: UserRole.SECURITY,
      tenantId: tenant.id,
      isVerified: true,
    },
  });

  // Собственник кв 101
  const residentOwner1 = await prisma.user.create({
    data: {
      phone: '+77015550101',
      email: 'resident101@mail.kz',
      passwordHash: defaultPasswordHash,
      firstName: 'Арман',
      lastName: 'Жумабаев',
      iin: '920620300444',
      role: UserRole.RESIDENT_OWNER,
      tenantId: tenant.id,
      isVerified: true,
    },
  });

  // Собственник кв 102
  const residentOwner2 = await prisma.user.create({
    data: {
      phone: '+77015550102',
      email: 'resident102@mail.kz',
      passwordHash: defaultPasswordHash,
      firstName: 'Динара',
      lastName: 'Ахметова',
      iin: '940812400555',
      role: UserRole.RESIDENT_OWNER,
      tenantId: tenant.id,
      isVerified: true,
    },
  });

  // Арендатор кв 205
  const residentTenant = await prisma.user.create({
    data: {
      phone: '+77015550205',
      firstName: 'Мурат',
      lastName: 'Искаков',
      role: UserRole.RESIDENT_TENANT,
      tenantId: tenant.id,
      isVerified: true,
    },
  });

  // 6. Привязка прав собственности / владения
  await prisma.unitOwnership.create({
    data: {
      userId: residentOwner1.id,
      unitId: apt101.id,
      ownershipType: OwnershipType.OWNER,
      sharePercent: 100.0,
      isVerified: true,
      verifiedAt: new Date(),
    },
  });

  await prisma.unitOwnership.create({
    data: {
      userId: residentOwner2.id,
      unitId: apt102.id,
      ownershipType: OwnershipType.OWNER,
      sharePercent: 100.0,
      isVerified: true,
      verifiedAt: new Date(),
    },
  });

  await prisma.unitOwnership.create({
    data: {
      userId: residentTenant.id,
      unitId: apt205.id,
      ownershipType: OwnershipType.TENANT,
      sharePercent: 0.0,
      isVerified: true,
      verifiedAt: new Date(),
    },
  });

  // 7. Точки доступа (Шлагбаум и камеры)
  const barrier = await prisma.accessPoint.create({
    data: {
      tenantId: tenant.id,
      name: 'Шлагбаум — Главный въезд с ул. Достык',
      type: AccessPointType.BARRIER,
      controllerType: 'PAL_ES',
      endpointUrl: 'https://api.pal-es.com/v1/devices/shanyraq-barrier-01/open',
      isActive: true,
    },
  });

  const courtyardCamera = await prisma.accessPoint.create({
    data: {
      tenantId: tenant.id,
      name: 'Камера — Детская площадка и парковка Блока А',
      type: AccessPointType.CAMERA,
      controllerType: 'RTSP_CAMERA',
      rtspStreamUrl: 'rtsp://admin:CameraPass2026@192.168.1.100:554/live/ch0',
      isActive: true,
    },
  });

  // 8. Пример заявки в Service Desk
  const sampleRequest = await prisma.serviceRequest.create({
    data: {
      tenantId: tenant.id,
      unitId: apt101.id,
      creatorId: residentOwner1.id,
      title: 'Слабый напор горячей воды в ванной',
      description: 'Второй день подряд температура горячей воды не превышает 35 градусов, напор слабый.',
      category: RequestCategory.PLUMBING,
      status: RequestStatus.IN_PROGRESS,
      priority: RequestPriority.HIGH,
      assigneeId: dispatcherUser.id,
    },
  });

  await prisma.requestComment.create({
    data: {
      requestId: sampleRequest.id,
      authorId: dispatcherUser.id,
      text: 'Заявка передана дежурному сантехнику. Ожидайте визита сегодня с 15:00 до 17:00.',
      isInternal: false,
    },
  });

  // 9. Пример общего собрания собственников (ОСС)
  const now = new Date();
  const meetingEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 дней на голосование по закону

  const meeting = await prisma.meeting.create({
    data: {
      tenantId: tenant.id,
      title: 'Годовое общее собрание собственников: смета расходов ОСИ на 2026–2027 гг.',
      description: 'Утверждение размера тарифа на управление и содержание дома, а также целевой сбор на модернизацию СКУД.',
      startDate: now,
      endDate: meetingEnd,
      status: MeetingStatus.ACTIVE,
      totalEligibleArea: 12500.0,
      quorumThresholdPercent: 50.0,
    },
  });

  const agendaItem1 = await prisma.agendaItem.create({
    data: {
      meetingId: meeting.id,
      orderIndex: 1,
      question: 'Утвердить тариф на управление и содержание общего имущества в размере 110 тенге за 1 кв. метр.',
      description: 'В тариф входит ежедневная уборка, круглосуточная диспетчерская служба, техобслуживание лифтов и ИТП.',
      decisionType: DecisionType.SIMPLE_MAJORITY,
    },
  });

  const agendaItem2 = await prisma.agendaItem.create({
    data: {
      meetingId: meeting.id,
      orderIndex: 2,
      question: 'Утвердить установку автоматического шлагбаума со считыванием госномеров и интеграцией в мобильное приложение Shanyraq.',
      description: 'Финансирование за счет статьи текущего ремонта без дополнительных целевых сборов.',
      decisionType: DecisionType.SIMPLE_MAJORITY,
    },
  });

  // 10. Пример голоса с расчетом веса площади и хэшем
  const voteHash1 = crypto
    .createHash('sha256')
    .update(`${residentOwner1.id}:${meeting.id}:${agendaItem1.id}:FOR:${apt101.area}`)
    .digest('hex');

  await prisma.vote.create({
    data: {
      agendaItemId: agendaItem1.id,
      userId: residentOwner1.id,
      unitId: apt101.id,
      choice: VoteChoice.FOR,
      areaWeight: apt101.area, // 68.5 м²
      voteHash: voteHash1,
      otpVerified: true,
      ipAddress: '95.59.120.44',
      userAgent: 'Shanyraq-Mobile/1.0.0 (iPhone; iOS 17.4)',
    },
  });

  // 11. Пример новостного объявления
  await prisma.announcement.create({
    data: {
      tenantId: tenant.id,
      authorId: adminUser.id,
      title: 'Плановая промывка отопительной системы ЖК',
      content: 'Уважаемые жильцы! 15 октября с 09:00 до 18:00 будет производиться опрессовка системы отопления. Просим проверить краны Маевского.',
      isUrgent: true,
    },
  });

  console.log('✅ База данных успешно наполнена тестовыми данными ЖК «Шаңырақ Премиум»!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при сидировании БД:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
