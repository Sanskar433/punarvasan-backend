const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'punarvasan-workflow-'));
process.env.SQLITE_DB_PATH = path.join(testDirectory, 'workflow-test.db');
process.env.UPLOADS_DIR = path.join(testDirectory, 'uploads');
process.env.NODE_ENV = 'test';

const {
  validateResidentVerification,
  validateContractorVerification,
  buildAdminQueue,
  applyVerificationDecision,
  normalizeLoginPhone,
  setOtpAuthForTests,
} = require('./server');
const database = require('./database');

const requestedTestPhones = new Set();
setOtpAuthForTests({
  async signInWithOtp({ phone }) {
    requestedTestPhones.add(phone);
    return { error: null };
  },
  async verifyOtp({ phone, token }) {
    if (token !== '123456' || !requestedTestPhones.has(phone)) {
      return { data: { user: null }, error: new Error('Invalid test OTP.') };
    }
    requestedTestPhones.delete(phone);
    return { data: { user: { phone } }, error: null };
  },
});

test('login phone numbers normalize to Indian E.164 format', () => {
  assert.deepEqual(normalizeLoginPhone('9876543210'), {
    phone: '+919876543210',
    mobile: '9876543210',
  });
  assert.deepEqual(normalizeLoginPhone('+91 98765 43210'), {
    phone: '+919876543210',
    mobile: '9876543210',
  });
  assert.equal(normalizeLoginPhone('12345'), null);
});

test('resident verification passes and waits for admin approval', () => {
  const result = validateResidentVerification({
    fullName: 'Asha D. Waghmare',
    aadhaarNumber: '123456789012',
    landDocumentNumber: 'MH-21-TR-10429',
    surveyNumber: '48/2A',
    documentProof: 'title deed copy'
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'Pending');
  assert.match(result.message, /admin verification/i);
});

test('contractor verification passes and waits for admin approval', () => {
  const result = validateContractorVerification({
    companyName: 'Apex Urban Infra Pvt. Ltd.',
    licenseNumber: 'MUM/CC/2024/1178',
    gstNumber: '27AABCA1234F1Z3',
    registrationNumber: 'RC-4217',
    documentProof: 'trade license and GST copy'
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'Pending');
  assert.match(result.message, /admin verification/i);
});

test('resident verification accepts the simplified form without surveyNumber', () => {
  const result = validateResidentVerification({
    fullName: 'Vedant Sudhakar Mohite',
    aadhaarNumber: '345667896789',
    documentProof: 'aadhaar and proof.pdf'
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'Pending');
});

test('admin queue groups pending resident and contractor verification records', () => {
  const records = {
    residents: [
      { id: 1, fullName: 'Asha', verificationStatus: 'Pending', documentProof: 'title deed' },
    ],
    contractors: [
      { id: 7, companyName: 'Apex Build', verificationStatus: 'Pending', documentProof: 'GST copy' },
    ],
  };

  const queue = buildAdminQueue(records);

  assert.equal(queue.length, 2);
  assert.equal(queue[0].type, 'resident');
  assert.equal(queue[1].type, 'contractor');
});

test('verification decision updates status and stores admin action', () => {
  const updated = applyVerificationDecision('resident', 15, 'Approved', 'Admin approved resident document');

  assert.equal(updated.status, 'Approved');
  assert.equal(updated.message, 'Admin approved resident document');
  assert.equal(updated.type, 'resident');
});

test('role workflows persist complaints, evidence, rejected and approved progress, reports, and notices', async () => {
  const httpServer = require('./server').app.listen(0);
  await new Promise((resolve) => httpServer.once('listening', resolve));
  const address = httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const request = async (url, { token, method = 'GET', body, headers = {} } = {}) => {
    const requestHeaders = { ...headers };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined && !Buffer.isBuffer(body)) {
      requestHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${url}`, { method, headers: requestHeaders, body });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    return { response, payload };
  };

  const login = async (role, mobile) => {
    const requested = await request('/api/auth/request-otp', {
      method: 'POST',
      body: { role, mobile },
    });
    assert.equal(requested.response.status, 200);
    assert.equal(requested.payload.message, 'Verification code sent.');
    assert.equal(Object.hasOwn(requested.payload, 'developmentCode'), false);
    const verified = await request('/api/auth/verify-otp', {
      method: 'POST',
      body: { role, mobile, code: '123456' },
    });
    assert.equal(verified.response.status, 200);
    return verified.payload.token;
  };

  try {
    const residentToken = await login('resident', '9000000001');
    const residentProjects = await request('/api/projects', { token: residentToken });
    assert.deepEqual(residentProjects.payload.projects.map((item) => item.id), ['PUN-23-101']);
    assert.match(residentProjects.payload.projects[0].unit, /Wing B, Flat 402/i);
    assert.equal(residentProjects.payload.projects[0].scheme_type, 'SRA');

    const submittedComplaint = await request('/api/complaints', {
      token: residentToken,
      method: 'POST',
      body: { projectId: 'PUN-23-101', issue: 'Construction access is blocked.' },
    });
    assert.equal(submittedComplaint.response.status, 201);
    assert.equal(submittedComplaint.payload.complaint.status, 'Submitted');

    const contractorToken = await login('contractor', '9000000002');
    const uploaded = await request('/api/uploads', {
      token: contractorToken,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Project-Id': 'PUN-23-101',
        'X-File-Category': 'photo',
        'X-File-Name': encodeURIComponent('site-photo.png'),
        'X-Geotag': encodeURIComponent('Bandra East Site · Sector 3'),
        'X-Latitude': '19.0607',
        'X-Longitude': '72.8525',
      },
      body: Buffer.from('test photo bytes'),
    });
    assert.equal(uploaded.response.status, 201);
    assert.equal(uploaded.payload.upload.file_name, 'site-photo.png');
    assert.equal(uploaded.payload.upload.geotag, 'Bandra East Site · Sector 3');
    assert.equal(uploaded.payload.upload.latitude, 19.0607);
    assert.equal(uploaded.payload.upload.longitude, 72.8525);

    const qualityReport = await request('/api/uploads', {
      token: contractorToken,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Project-Id': 'PUN-23-101',
        'X-File-Category': 'quality-report',
        'X-File-Name': encodeURIComponent('quality.pdf'),
      },
      body: Buffer.from('quality report bytes'),
    });
    assert.equal(qualityReport.response.status, 201);

    const safetyReport = await request('/api/uploads', {
      token: contractorToken,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Project-Id': 'PUN-23-101',
        'X-File-Category': 'safety-report',
        'X-File-Name': encodeURIComponent('safety.pdf'),
      },
      body: Buffer.from('safety report bytes'),
    });
    assert.equal(safetyReport.response.status, 201);

    const dailyReport = await request('/api/daily-reports', {
      token: contractorToken,
      method: 'POST',
      body: {
        projectId: 'PUN-23-101',
        material: 'Cement and steel',
        labour: '18 workers',
        workDone: 'Reinforcement for floor 10',
      },
    });
    assert.equal(dailyReport.response.status, 201);
    const progressSubmission = await request('/api/progress', {
      token: contractorToken,
      method: 'POST',
      body: {
        projectId: 'PUN-23-101',
        dailyReportId: dailyReport.payload.report.id,
        stage: 'Structure — Floor-wise (shows floor number out of total)',
        progress: 70,
        floorNumber: 10,
        floorsTotal: 14,
        notes: 'Floor 10 work submitted for review.',
      },
    });
    assert.equal(progressSubmission.response.status, 201);
    const updateId = progressSubmission.payload.update.id;

    const governmentToken = await login('government', '9000000003');
    const submittedEvidence = await request(`/api/projects/PUN-23-101/uploads`, { token: governmentToken });
    assert.equal(submittedEvidence.response.status, 200);
    assert.equal(submittedEvidence.payload.uploads.length, 3);

    const rejected = await request(`/api/progress/${updateId}/decision`, {
      token: governmentToken,
      method: 'POST',
      body: { status: 'Rejected', feedback: 'Add the missing inspection record.' },
    });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.payload.update.status, 'Rejected');
    let publicProject = await request('/api/projects', { token: residentToken });
    assert.equal(publicProject.payload.projects[0].progress, 62);

    const contractorFeedback = await request('/api/notifications', { token: contractorToken });
    assert.ok(contractorFeedback.payload.notifications.some((item) => /missing inspection record/.test(item.message)));
    const issueResolution = await request(`/api/progress/${updateId}/resolve`, {
      token: contractorToken,
      method: 'POST',
      body: { resolution: 'Inspection record attached and checked.' },
    });
    assert.equal(issueResolution.response.status, 200);
    const resubmitted = await request(`/api/progress/${updateId}/resubmit`, {
      token: contractorToken,
      method: 'POST',
      body: {
        stage: 'Structure — Floor-wise (shows floor number out of total)',
        progress: 72,
        floorNumber: 10,
        floorsTotal: 14,
        notes: 'Updated evidence attached.',
      },
    });
    assert.equal(resubmitted.response.status, 200);
    assert.equal(resubmitted.payload.update.status, 'Pending review');

    const approved = await request(`/api/progress/${updateId}/decision`, {
      token: governmentToken,
      method: 'POST',
      body: { status: 'Approved', feedback: 'Evidence verified.' },
    });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.update.status, 'Approved');
    publicProject = await request('/api/projects', { token: residentToken });
    assert.equal(publicProject.payload.projects[0].progress, 72);

    const publicEvidence = await request('/api/projects/PUN-23-101/uploads', { token: residentToken });
    assert.equal(publicEvidence.payload.uploads.length, 1);
    const downloadedPhoto = await request(`/api/uploads/${publicEvidence.payload.uploads[0].id}/download`, { token: residentToken });
    assert.equal(downloadedPhoto.response.status, 200);
    assert.equal(downloadedPhoto.payload, 'test photo bytes');

    const reviewedComplaint = await request(`/api/complaints/${submittedComplaint.payload.complaint.id}`, {
      token: governmentToken,
      method: 'PATCH',
      body: { status: 'In review', response: 'A ward officer is reviewing this report.' },
    });
    assert.equal(reviewedComplaint.response.status, 200);
    const residentComplaints = await request('/api/complaints', { token: residentToken });
    assert.equal(residentComplaints.payload.complaints[0].status, 'In review');

    const govProjects = await request('/api/projects', { token: governmentToken });
    const delayedProject = govProjects.payload.projects.find((p) => p.id === 'PUN-23-118');
    assert.ok(delayedProject);
    assert.equal(delayedProject.is_delayed, true);
    assert.ok(delayedProject.days_inactive >= 30);
    assert.equal(delayedProject.scheme_type, 'MHADA');

    const report = await request('/api/reports', {
      token: governmentToken,
      method: 'POST',
      body: { scope: 'project', target: 'PUN-23-101' },
    });
    assert.equal(report.response.status, 201);
    assert.match(report.payload.report.content, /72/);
    assert.match(report.payload.report.content, /Scheme Type/);
    assert.match(report.payload.report.content, /Floor Details/);
    assert.match(report.payload.report.content, /Inactivity Status/);
    assert.match(report.payload.report.content, /Days Inactive/);
    const noticeSent = await request('/api/notifications/send', {
      token: governmentToken,
      method: 'POST',
      body: {
        reportId: report.payload.report.id,
        title: 'Project progress notice',
        message: 'Approved progress and report are now available.',
      },
    });
    assert.equal(noticeSent.response.status, 200);
    assert.equal(noticeSent.payload.projectsNotified, 1);

    const notices = await request('/api/notices', { token: residentToken });
    assert.equal(notices.payload.notices.length, 1);
    const noticeDocument = await request(`/api/notices/${notices.payload.notices[0].id}/download`, { token: residentToken });
    assert.equal(noticeDocument.response.status, 200);
    assert.match(noticeDocument.payload, /Project ID/);

    const roleDenied = await request('/api/government/progress', { token: residentToken });
    assert.equal(roleDenied.response.status, 403);
    const loggedOut = await request('/api/auth/logout', { token: residentToken, method: 'POST' });
    assert.equal(loggedOut.response.status, 200);
    const sessionDenied = await request('/api/projects', { token: residentToken });
    assert.equal(sessionDenied.response.status, 401);
  } finally {
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    database.db.close((error) => error ? reject(error) : resolve());
  });
  fs.rmSync(testDirectory, { recursive: true, force: true });
});
