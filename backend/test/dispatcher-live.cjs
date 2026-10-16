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
const checks = [];
const checkpoint = (name) => { checks.push(name); console.log(`PASS ${name}`); };
async function api(route, token, method = 'GET', body, expected = 200) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + route, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!multipart && body ? {'Content-Type': 'application/json'} : {}) },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined, signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: expected ${expected}, got ${response.status} (${result.code || 'no error code'})`);
  return result;
}

async function main() {
  // This dedicated Redis container is disposable and is never the project's Redis.
  const Redis = require('ioredis');
  const redis = new Redis({ host: '127.0.0.1', port: 56379, maxRetriesPerRequest: 1 });
  try { await redis.flushdb(); } finally { await redis.quit(); }
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'pipe', timeout: 60000,
  });
  checkpoint('migrations on isolated PostgreSQL');
  const suffix = crypto.randomBytes(5).toString('hex');
  const tenant = await prisma.tenant.create({ data: { name: `E2E ${suffix}`, address: 'Synthetic test address' } });
  const otherTenant = await prisma.tenant.create({ data: { name: `Other E2E ${suffix}`, address: 'Synthetic test address' } });
  const building = await prisma.building.create({ data: { tenantId: tenant.id, blockName: 'E2E' } });
  const unit = await prisma.unit.create({ data: { buildingId: building.id, unitNumber: '1', area: 50 } });
  const password = crypto.randomBytes(20).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);
  const phone = () => `+7${crypto.randomInt(1000000000, 9999999999)}`;
  const employee = (role, complex = tenant.id) => prisma.user.create({ data: {
    phone: phone(), email: `${crypto.randomUUID()}@example.test`, firstName: 'E2E', lastName: role,
    passwordHash, role, tenantId: complex, isActive: true, isVerified: true,
  } });
  const resident = await employee('RESIDENT_OWNER');
  const dispatcher = await employee('DISPATCHER');
  const assignee = await employee('DISPATCHER');
  const foreign = await employee('DISPATCHER', otherTenant.id);
  const chairman = await employee('HOA_CHAIRMAN');
  await prisma.unitOwnership.create({ data: { userId: resident.id, unitId: unit.id, isVerified: true } });
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }));
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  const login = async (user) => (await api('/auth/login-password', null, 'POST', { login: user.email, password }, 200)).accessToken;
  const dispatcherToken = await login(dispatcher);
  const assigneeToken = await login(assignee);
  const foreignToken = await login(foreign);
  const chairmanToken = await login(chairman);
  // Real auth/Redis, test-only OTP transport; no external SMS is sent.
  const otp = await api('/auth/request-otp', null, 'POST', { phone: resident.phone }, 200);
  const residentToken = (await api('/auth/verify-otp', null, 'POST', { phone: resident.phone, code: otp.devCode }, 200)).accessToken;
  assert.ok(dispatcherToken && assigneeToken && residentToken);
  checkpoint('staff password login and resident OTP over real Redis');
  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1UAAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.append('file', new Blob([photo], { type: 'image/png' }), 'e2e.png');
  const uploaded = await api('/uploads?category=media', residentToken, 'POST', form, 201);
  const request = await api('/service-requests', residentToken, 'POST', {
    unitId: unit.id, title: 'E2E leaking pipe', description: 'Synthetic dispatcher acceptance test', category: 'PLUMBING', priority: 'HIGH', attachmentUrls: [uploaded.url],
  }, 201);
  checkpoint('photo upload to real S3 and request creation by verified resident');
  const route = `/service-requests/${request.id}`;
  const eligible = await api(route + '/assignees', dispatcherToken);
  assert.ok(eligible.some((person) => person.id === assignee.id));
  assert.ok(!eligible.some((person) => person.id === foreign.id));
  await api(route + '/assignees', foreignToken, 'GET', undefined, 403);
  await api(route + '/status', chairmanToken, 'PATCH', { status: 'IN_PROGRESS' }, 403);
  await api(route + '/status', dispatcherToken, 'PATCH', { status: 'ASSIGNED', assigneeId: foreign.id }, 400);
  checkpoint('same-tenant assignees and cross-tenant/read-only access control');
  let detail = await api(route, dispatcherToken);
  const stale = detail.updatedAt;
  await api(route + '/status', dispatcherToken, 'PATCH', { status: 'ASSIGNED', assigneeId: assignee.id, expectedUpdatedAt: detail.updatedAt });
  await api(route + '/status', assigneeToken, 'PATCH', { status: 'IN_PROGRESS', expectedUpdatedAt: stale }, 409);
  detail = await api(route, assigneeToken);
  await api(route + '/status', assigneeToken, 'PATCH', { status: 'IN_PROGRESS', expectedUpdatedAt: detail.updatedAt });
  await api(route + '/comments', assigneeToken, 'POST', { text: 'E2E public reply', isInternal: false }, 201);
  await api(route + '/comments', dispatcherToken, 'POST', { text: 'E2E internal note', isInternal: true }, 201);
  const residentDetail = await api(route, residentToken);
  assert.ok(residentDetail.comments.some((comment) => comment.text === 'E2E public reply'));
  assert.ok(!residentDetail.comments.some((comment) => comment.text === 'E2E internal note'));
  const notifications = await api('/notifications?take=20', residentToken);
  assert.ok(notifications.some((item) => item.data?.requestId === request.id));
  checkpoint('assignment, work, stale-card conflict, public reply and private internal note');
  checkpoint('resident notification persisted in real PostgreSQL');
  detail = await api(route, dispatcherToken);
  await api(route + '/status', dispatcherToken, 'PATCH', { status: 'RESOLVED', expectedUpdatedAt: detail.updatedAt });
  detail = await api(route, dispatcherToken);
  await api(route + '/status', dispatcherToken, 'PATCH', { status: 'CLOSED', expectedUpdatedAt: detail.updatedAt });
  detail = await api(route, residentToken);
  assert.equal(detail.status, 'CLOSED');
  assert.equal(detail.assigneeId, assignee.id);
  assert.deepEqual(detail.history.map((event) => event.metadata.toStatus), ['ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED']);
  assert.equal(detail.attachments.length, 1);
  checkpoint('resolved → closed; full assignment/status history visible to resident');
  const fileRoute = route + '/attachments/' + detail.attachments[0].id;
  const media = await fetch(base + fileRoute, { headers: { Authorization: `Bearer ${assigneeToken}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(media.status, 200, 'Authorized second client must read private attachment');
  assert.equal(media.headers.get('content-type'), 'image/png');
  assert.match(media.headers.get('cache-control'), /private/);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), photo);
  const residentMedia = await fetch(base + fileRoute, { headers: { Authorization: `Bearer ${residentToken}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(residentMedia.status, 200);
  assert.deepEqual(Buffer.from(await residentMedia.arrayBuffer()), photo);
  await api(fileRoute, foreignToken, 'GET', undefined, 403);
  await api(fileRoute, null, 'GET', undefined, 401);
  const direct = await fetch(detail.attachments[0].fileUrl, { signal: AbortSignal.timeout(10000) });
  assert.equal(direct.status, 403, 'Bucket must remain private');
  checkpoint('resident and second dispatcher read identical photo bytes; anonymous/foreign access denied; bucket private');
  const foreignForm = new FormData();
  foreignForm.append('file', new Blob([photo], {type:'image/png'}), 'foreign.png');
  const foreignUpload = await api('/uploads?category=media', foreignToken, 'POST', foreignForm, 201);
  const forged = await api('/service-requests', residentToken, 'POST', {
    unitId: unit.id, title: 'E2E forged attachment', description: 'Must not expose another uploader object', category:'OTHER',priority:'LOW',attachmentUrls:[foreignUpload.url],
  }, 201);
  await api(`/service-requests/${forged.id}/attachments/${forged.attachments[0].id}`, residentToken, 'GET', undefined, 404);
  checkpoint('copying a foreign private object URL into an owned request does not grant file access');
  const security = await employee('SECURITY');
  const security2 = await employee('SECURITY');
  const securityToken = await login(security);
  // Keep password logins within the real IP limit; the second guard uses the supported OTP route.
  const securityOtp = await api('/auth/request-otp',null,'POST',{phone:security2.phone},200);
  const security2Token = (await api('/auth/verify-otp',null,'POST',{phone:security2.phone,code:securityOtp.devCode},200)).accessToken;
  let sos = await api('/sos',residentToken,'POST',{},201);
  const sosRoute = '/sos/' + sos.id;
  await api(sosRoute + '/accept',residentToken,'PATCH',undefined,403);
  await api(sosRoute + '/accept',chairmanToken,'PATCH',undefined,403);
  await api(sosRoute + '/accept',foreignToken,'PATCH',undefined,403);
  const concurrent = async (route,tokens,body) => Promise.all(tokens.map(async token => {
    const response = await fetch(base + route,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined,signal:AbortSignal.timeout(15000)});
    return {status:response.status,body:await response.json(),token};
  }));
  const claims = await concurrent(sosRoute+'/accept',[securityToken,security2Token]);
  assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
  const winner = claims.find(r=>r.status===200);
  const loser = claims.find(r=>r.status===409);
  assert.ok(winner.body.acceptedAt && winner.body.acceptedBy.id);
  const ownerToken = winner.token;
  await api(sosRoute+'/accept',ownerToken,'PATCH'); // Idempotent retry
  assert.equal(await prisma.auditLog.count({where:{targetId:sos.id,action:'SOS_ACCEPTED'}}),1);
  await api(sosRoute+'/resolve',loser.token,'PATCH',{status:'RESOLVED',note:'Other operator'},409);
  await api(sosRoute+'/resolve',ownerToken,'PATCH',{status:'ACTIVE'},400);
  await api(sosRoute+'/resolve',ownerToken,'PATCH',{status:'RESOLVED',note:'x'.repeat(1601)},400);
  checkpoint('SOS: one concurrent claimant, idempotent retry, tenant/role/owner protection, terminal-status validation');
  // Force a journal write failure on this disposable database to verify real rollback.
  await prisma.$executeRawUnsafe(`ALTER TABLE "shift_handover_notes" ADD CONSTRAINT "e2e_journal_failure" CHECK (content NOT LIKE '%E2E_FAIL_JOURNAL%')`);
  try {
    await api(sosRoute+'/resolve',ownerToken,'PATCH',{status:'RESOLVED',note:'E2E_FAIL_JOURNAL'},500);
    const retained = await prisma.sosAlert.findUnique({where:{id:sos.id}});
    assert.equal(retained.status,'ACTIVE');
    assert.equal(retained.resolvedAt,null);
    assert.equal(await prisma.auditLog.count({where:{targetId:sos.id,action:'SOS_RESOLVED'}}),0);
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "shift_handover_notes" DROP CONSTRAINT "e2e_journal_failure"');
  }
  checkpoint('SOS: failed journal write rolls back closure and audit on real PostgreSQL');
  const closures = await concurrent(sosRoute+'/resolve',[ownerToken,ownerToken],{status:'RESOLVED',note:'E2E assistance provided'});
  assert.equal(closures.filter(r=>r.status===200).length,1);
  assert.ok(closures.some(r=>[400,409].includes(r.status)));
  assert.equal(await prisma.auditLog.count({where:{targetId:sos.id,action:'SOS_RESOLVED'}}),1);
  const journal = await api('/shift-handover/tenants/'+tenant.id+'/notes',securityToken);
  const incidentNotes = journal.filter(n=>n.content.includes(sos.id));
  assert.equal(incidentNotes.length,1);
  assert.match(incidentNotes[0].content,/E2E assistance provided/);
  assert.equal(incidentNotes[0].authorId,winner.body.acceptedById);
  const residentSos = await api('/sos/my',residentToken);
  assert.equal(residentSos.find(item=>item.id===sos.id).status,'RESOLVED');
  await api('/shift-handover/tenants/'+tenant.id+'/notes',foreignToken,'GET',undefined,403);
  checkpoint('SOS: concurrent completion creates exactly one result, audit and shift journal entry; resident sees closure');
  const falseAlarm = await api('/sos',residentToken,'POST',{},201);
  await api('/sos/'+falseAlarm.id+'/accept',securityToken,'PATCH');
  await api('/sos/'+falseAlarm.id+'/resolve',securityToken,'PATCH',{status:'FALSE_ALARM',note:'E2E accidental tap'});
  assert.equal(await prisma.shiftHandoverNote.count({where:{tenantId:tenant.id,content:{contains:falseAlarm.id}}}),1);
  checkpoint('SOS: false alarm also records its explanation in the shift journal');
  console.log(JSON.stringify({ result: 'PASS', checks: checks.length, externalSms: false, realInfrastructure: true }));
}
main().catch((error) => { console.error(`FAIL ${error.message}`); process.exitCode = 1; })
  .finally(async () => { if (app) await app.close(); await prisma.$disconnect(); });
