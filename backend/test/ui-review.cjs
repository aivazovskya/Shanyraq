/* Real HTTP + PostgreSQL + Redis + S3 acceptance, isolated from .env and existing data. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') {
  throw new Error('Run with DATABASE_URL unset and outside production. This runner owns its isolated configuration.');
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://dispatcher_e2e:local-disposable-e2e-only@127.0.0.1:55432/shanyraq_dispatcher_e2e?schema=public',
  REDIS_HOST: '127.0.0.1', REDIS_PORT: '56379', REDIS_PASSWORD: '',
  S3_ENDPOINT: '127.0.0.1', S3_PORT: '59000', S3_USE_SSL: 'false', S3_PUBLIC_BASE_URL: 'http://127.0.0.1:59000',
  S3_ACCESS_KEY: 'dispatcher_e2e', S3_SECRET_KEY: 'local-disposable-e2e-only',
  S3_BUCKET_MEDIA: 'dispatcher-e2e-media', S3_BUCKET_DOCS: 'dispatcher-e2e-documents',
  JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'), VOTE_SIGNING_KEY: crypto.randomBytes(32).toString('hex'),
  PII_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), PII_HASH_KEY: crypto.randomBytes(32).toString('base64'),
});
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.pathname, '/shanyraq_dispatcher_e2e');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../dist/app.module');
const { validationExceptionFactory } = require('../dist/common/pipes/validation-exception.factory');
const prisma = new PrismaClient();
let app;
let base;

// Only synthetic accounts in the same explicitly isolated database as the HTTP acceptance runner.
async function main() {
  execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:'pipe',timeout:60000});
  const suffix=crypto.randomBytes(3).toString('hex');
  const tenant=await prisma.tenant.create({data:{name:'Тестовый ЖК «Шаңырақ Парк»',address:'Синтетический адрес для проверки интерфейса'}});
  const building=await prisma.building.create({data:{tenantId:tenant.id,blockName:'Корпус А · подъезд 2'}});
  const unit=await prisma.unit.create({data:{buildingId:building.id,unitNumber:'128',area:72}});
  await prisma.personalAccount.create({data:{unitId:unit.id,accountNumber:'UI-'+suffix,balance:0}});
  const password=crypto.randomBytes(15).toString('base64url');
  const passwordHash=await bcrypt.hash(password,10);
  const createUser=(role,name,lastName)=>prisma.user.create({data:{phone:'+7'+crypto.randomInt(1000000000,9999999999),email:'ui-'+role.toLowerCase()+'-'+suffix+'@example.test',firstName:name,lastName,passwordHash,tenantId:tenant.id,role,isActive:true,isVerified:true}});
  const resident=await createUser('RESIDENT_OWNER','Айгерим','Тестовая');
  const security=await createUser('SECURITY','Руслан','Дежурный');
  const dispatcher=await createUser('DISPATCHER','Динара','Диспетчер');
  const manager=await createUser('HOA_ADMIN','Ерлан','Управляющий');
  await prisma.unitOwnership.create({data:{userId:resident.id,unitId:unit.id,isVerified:true}});
  const statuses=['PENDING','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','REJECTED'];
  for (let index=0;index<statuses.length;index++) {
    const status=statuses[index];
    const request=await prisma.serviceRequest.create({data:{tenantId:tenant.id,unitId:unit.id,creatorId:resident.id,
      assigneeId:status==='PENDING'?null:dispatcher.id,status,priority:index===0?'EMERGENCY':index===1?'HIGH':'MEDIUM',category:'PLUMBING',
      title:index===0?'Протечка стояка в подъезде: вода поступает в коридор и помещение электрощитовой':'Проверка освещения и инженерного оборудования · '+status,
      description:'Тестовые данные для визуальной приёмки. Нужно проверить помещение и устранить причину.\nКонтакт с жителем через карточку заявки.',
      createdAt:new Date(Date.now()-96*3600000),updatedAt:new Date(Date.now()-90*3600000)}});
    await prisma.requestComment.create({data:{requestId:request.id,authorId:dispatcher.id,text:'Сотрудник принял обращение.\nПроверяем расположение оборудования и согласуем доступ. '+('Подробный комментарий для проверки переносов. '.repeat(4))}});
  }
  await prisma.sosAlert.create({data:{tenantId:tenant.id,unitId:unit.id,triggeredById:resident.id,latitude:51.128,longitude:71.43,createdAt:new Date(Date.now()-7*60000)}});
  await prisma.sosAlert.create({data:{tenantId:tenant.id,unitId:unit.id,triggeredById:resident.id,acceptedById:security.id,acceptedAt:new Date(Date.now()-3*60000),createdAt:new Date(Date.now()-12*60000)}});
  await prisma.sosAlert.create({data:{tenantId:tenant.id,unitId:unit.id,triggeredById:resident.id,status:'RESOLVED',resolvedById:security.id,resolvedAt:new Date(),resolutionNote:'Охрана прибыла на место, помощь оказана.\n'+('Подробный результат обработки для проверки длинного текста. '.repeat(7))}});
  for (const [name,type] of [['Главный въезд со стороны проспекта','BARRIER'],['Камера внутреннего двора','CAMERA']]) await prisma.accessPoint.create({data:{tenantId:tenant.id,name,type,controllerType:'MOCK'}});
  await prisma.shiftHandoverNote.create({data:{tenantId:tenant.id,authorId:security.id,content:'Тестовая передача смены.\nПроверить незавершённый вызов и инженерные работы в корпусе А.'}});
  app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');
  app.enableCors({origin:['http://127.0.0.1:3001','http://localhost:3001'],credentials:true});
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,exceptionFactory:validationExceptionFactory}));
  await app.listen(4001,'127.0.0.1');
  console.log(JSON.stringify({syntheticOnly:true,tenant:tenant.id,accounts:[security,dispatcher,manager].map(u=>({role:u.role,email:u.email})),password}));
}
const shutdown=async()=>{if(app)await app.close();await prisma.$disconnect();process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
main().catch(async error=>{console.error(error.message);if(app)await app.close();await prisma.$disconnect();process.exitCode=1;});
