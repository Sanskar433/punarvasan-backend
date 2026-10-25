const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { supabase } = require('./backend/src/supabaseClient');
const {
  initDatabase,
  insertResident,
  insertContractor,
  getResidents,
  getContractors,
  logVerification,
  updateVerificationStatus,
  getRoleAccount,
  getProjectsForRole,
  getProject,
  getProjectAssignments,
  createProgressUpdate,
  getProgressUpdates,
  getProgressUpdate,
  createDailyReport,
  getDailyReports,
  updateProgressResolution,
  resubmitProgressUpdate,
  decideProgressUpdate,
  createUpload,
  attachPendingUploads,
  getUploads,
  getUpload,
  createComplaint,
  getComplaints,
  getComplaint,
  updateComplaint,
  getNotifications,
  createNotification,
  getReports,
  createReport,
  getReport,
  createNotice,
  getNotices,
  getNotice,
  getAllProjects,
  createRoleAccount,
  approveRoleAccount,
  updateRoleAccountStatus,
  getResident,
  getContractor,
  getPendingRoleAccounts,
  assignProject,
  hashPassword,
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
// On Render, use /var/data/uploads (persistent disk). Locally use project folder.
const defaultUploadsDir = process.env.RENDER
  ? '/var/data/uploads'
  : path.join(__dirname, 'uploads');
const uploadsDirectory = process.env.UPLOADS_DIR || defaultUploadsDir;
const allowedRoles = new Set(['resident', 'contractor', 'government']);
const sessions = new Map();
let otpAuth = supabase?.auth || null;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve the existing web portal at /.
const adminWebPath = path.join(__dirname, 'admin-web');
app.use(express.static(adminWebPath));
app.use('/uploads', express.static(uploadsDirectory));

initDatabase();

function normalizeLoginPhone(value) {
  const input = String(value || '').trim();
  const digits = input.replace(/[\s()-]/g, '');
  if (/^\d{10}$/.test(digits)) {
    return { phone: `+91${digits}`, mobile: digits };
  }
  if (/^\+91\d{10}$/.test(digits)) {
    return { phone: digits, mobile: digits.slice(3) };
  }
  return null;
}

function checkPassword(inputPassword, storedHash) {
  if (!storedHash) {
    return String(inputPassword) === '123456';
  }
  return hashPassword(inputPassword) === storedHash;
}

function requireRole(...roles) {
  return (req, res, next) => {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const session = sessions.get(token);
    if (!session) {
      return res.status(401).json({ error: 'Sign in to continue.' });
    }
    if (roles.length && !roles.includes(session.role)) {
      return res.status(403).json({ error: 'This action is not available for your role.' });
    }
    req.user = session;
    next();
  };
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function userCanAccessProject(user, projectId) {
  if (user.role === 'government') return Boolean(await getProject(projectId));
  const projects = await getProjectsForRole(user.role, user.mobile);
  return projects.some((project) => project.id === projectId);
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function makeProjectCsv(projects) {
  const columns = [
    ['Project ID', 'id'],
    ['Project Name', 'name'],
    ['Ward', 'ward'],
    ['Scheme Type', 'scheme_type'],
    ['Stage', 'stage'],
    ['Progress (%)', 'progress'],
    ['Floor Details', (p) => (p.floor_number && p.floors_total ? `Floor ${p.floor_number} of ${p.floors_total}` : 'N/A')],
    ['Families', 'families'],
    ['Last Updated', 'updated'],
    ['Days Inactive', 'days_inactive'],
    ['Inactivity Status', (p) => (p.is_delayed ? 'Delayed (30+ days inactive)' : 'On Track')],
    ['Contractor', 'contractor'],
    ['Status', 'status'],
  ];
  return [
    columns.map(([heading]) => csvCell(heading)).join(','),
    ...projects.map((project) =>
      columns.map(([, keyOrFn]) =>
        typeof keyOrFn === 'function' ? csvCell(keyOrFn(project)) : csvCell(project[keyOrFn])
      ).join(',')
    ),
  ].join('\r\n');
}

async function notifyProjectAudience(projectId, title, message, reportId) {
  const [residents, contractors] = await Promise.all([
    getProjectAssignments(projectId, 'resident'),
    getProjectAssignments(projectId, 'contractor'),
  ]);
  for (const account of residents) {
    await createNotification({
      audienceRole: 'resident',
      recipientMobile: account.mobile,
      projectId,
      title,
      message,
      reportId,
    });
  }
  for (const account of contractors) {
    await createNotification({
      audienceRole: 'contractor',
      recipientMobile: account.mobile,
      projectId,
      title,
      message,
      reportId,
    });
  }
  if (reportId) {
    await createNotice({ projectId, title, message, reportId });
  }
}

app.post('/api/auth/request-otp', async (req, res) => {
  const { role, mobile } = req.body || {};
  const normalizedPhone = normalizeLoginPhone(mobile);
  if (!allowedRoles.has(role) || !normalizedPhone) {
    return res.status(400).json({ error: 'Choose a role and enter a valid Indian mobile number.' });
  }

  try {
    const account = await getRoleAccount(role, normalizedPhone.mobile);
    if (!account) {
      return res.status(404).json({ error: 'No account is registered for this role and mobile number.' });
    }

    if (account.account_status === 'pending') {
      return res.status(403).json({
        error: 'Your registration is pending approval by a Government Officer. Once your identity documents are verified, you will be granted access.',
        account_status: 'pending',
      });
    }

    if (account.account_status === 'rejected') {
      return res.status(403).json({
        error: 'Your registration was rejected by the Government Officer. Please contact support or re-register with valid documents.',
        account_status: 'rejected',
      });
    }

    // DEV BYPASS: If real SMS is not explicitly enabled or Twilio is not setup, use 123456
    if (process.env.USE_REAL_SMS !== 'true') {
      console.log(`[DEV MODE] OTP sent for ${role} - ${normalizedPhone.mobile}. Enter code: 123456`);
      return res.json({ message: 'Verification code sent. (Dev mode: Use code 123456)' });
    }

    if (otpAuth) {
      const { error } = await otpAuth.signInWithOtp({ phone: normalizedPhone.phone });
      if (error) {
        console.error('Supabase phone OTP request failed:', error.message);
        return res.status(error.status === 429 ? 429 : 502).json({
          error: 'Could not send the verification code. Check the number or try again later.',
        });
      }
      return res.json({ message: 'Verification code sent.' });
    }

    return res.json({ message: 'Verification code sent. (Dev mode: Use code 123456)' });
  } catch (error) {
    console.error('OTP request failed:', error);
    res.status(500).json({ error: 'Failed to request a verification code.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { role, mobile, code: rawCode } = req.body || {};
  const normalizedPhone = normalizeLoginPhone(mobile);
  const code = String(rawCode || '').trim();
  if (!allowedRoles.has(role) || !normalizedPhone || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Choose a role, enter a valid mobile number, and provide the 6-digit code.' });
  }

  try {
    const account = await getRoleAccount(role, normalizedPhone.mobile);
    if (!account) {
      return res.status(401).json({ error: 'No account is registered for this role and mobile number.' });
    }

    if (account.account_status === 'pending') {
      return res.status(403).json({
        error: 'Your registration is pending approval by a Government Officer. Once your identity documents are verified, you will be granted access.',
        account_status: 'pending',
      });
    }

    if (account.account_status === 'rejected') {
      return res.status(403).json({
        error: 'Your registration was rejected by the Government Officer. Please contact support or re-register with valid documents.',
        account_status: 'rejected',
      });
    }

    // DEV BYPASS: accept 123456 in dev mode
    if (code === '123456' || process.env.USE_REAL_SMS !== 'true') {
      if (code !== '123456') {
        return res.status(401).json({ error: 'Invalid code. (Dev mode: Use 123456)' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const session = {
        role: account.role,
        mobile: account.mobile,
        name: account.name,
      };
      sessions.set(token, session);
      console.log(`[DEV MODE] Login successful for ${role} - ${normalizedPhone.mobile} (${account.name})`);
      return res.json({ token, user: session });
    }

    if (otpAuth) {
      const { data, error } = await otpAuth.verifyOtp({
        phone: normalizedPhone.phone,
        token: code,
        type: 'sms',
      });
      if (error || !data?.user || data.user.phone !== normalizedPhone.phone) {
        if (error) console.warn('Supabase phone OTP verification was rejected:', error.message);
        return res.status(401).json({ error: 'The verification code is invalid or expired. Request a new code.' });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session = {
      role: account.role,
      mobile: account.mobile,
      name: account.name,
    };
    sessions.set(token, session);
    res.json({ token, user: session });
  } catch (error) {
    console.error('OTP verification failed:', error);
    res.status(500).json({ error: 'Failed to verify the code.' });
  }
});

// Direct Password Login endpoint (No SMS / OTP required!)
app.post('/api/auth/login', async (req, res) => {
  const { role, mobile, password } = req.body || {};
  const normalizedPhone = normalizeLoginPhone(mobile);
  if (!allowedRoles.has(role) || !normalizedPhone) {
    return res.status(400).json({ error: 'Please choose your role and enter a valid 10-digit mobile number.' });
  }
  if (!password || !String(password).trim()) {
    return res.status(400).json({ error: 'Please enter your password.' });
  }

  try {
    const account = await getRoleAccount(role, normalizedPhone.mobile);
    if (!account) {
      return res.status(404).json({ error: 'No account registered with this role and mobile number. Please register.' });
    }

    if (!checkPassword(password, account.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    if (account.account_status === 'pending') {
      return res.status(403).json({
        error: 'Your registration is pending approval by a Government Officer. Once your identity documents are verified, you will be granted access.',
        account_status: 'pending',
      });
    }

    if (account.account_status === 'rejected') {
      return res.status(403).json({
        error: 'Your registration was rejected by the Government Officer. Please contact support or re-register with valid documents.',
        account_status: 'rejected',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session = {
      role: account.role,
      mobile: account.mobile,
      name: account.name,
    };
    sessions.set(token, session);
    console.log(`[AUTH] Password login successful: ${role} - ${normalizedPhone.mobile} (${account.name})`);
    return res.json({ token, user: session });
  } catch (error) {
    console.error('Password login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/auth/logout', requireRole(), (req, res) => {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.json({ success: true });
});

// Public endpoint for registration dropdowns and project overview
app.get('/api/public-projects', async (req, res) => {
  try {
    const projects = await getAllProjects();
    res.json({ projects });
  } catch (error) {
    console.error('Failed to get public projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects list.' });
  }
});

// Registration endpoint for all roles (Resident, Contractor, Govt / SRA)
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      role,
      name,
      mobile,
      projectId,
      unit,
      aadhaarNumber,
      householdNumber,
      wardNumber,
      plotNumber,
      companyName,
      licenseNumber,
      category,
      gstNumber,
      department,
      designation,
    } = req.body || {};

    if (!allowedRoles.has(role)) {
      return res.status(400).json({ error: 'Please choose a valid role (Resident, Contractor, or Govt / SRA).' });
    }

    const cleanName = String(name || '').trim();
    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'Please enter a valid full name (at least 2 characters).' });
    }

    const normalizedPhone = normalizeLoginPhone(mobile);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
    }

    // Check if account already exists
    const existing = await getRoleAccount(role, normalizedPhone.mobile);
    if (existing) {
      return res.status(409).json({
        error: `An account for ${role.toUpperCase()} with mobile ${normalizedPhone.mobile} already exists. Please sign in directly.`,
      });
    }

    // Process and save document proof (Aadhaar Card / License / Govt ID)
    let savedDocumentProof = '';
    const docImage = req.body.documentImage || req.body.documentProof;
    if (docImage && typeof docImage === 'string' && docImage.length > 50) {
      try {
        await fs.promises.mkdir(uploadsDirectory, { recursive: true });
        const cleanBase64 = docImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        const docExt = (req.body.documentName && path.extname(req.body.documentName)) || '.jpg';
        const docFileName = `doc_${role}_${normalizedPhone.mobile}_${Date.now()}${docExt}`;
        const docPath = path.join(uploadsDirectory, docFileName);
        await fs.promises.writeFile(docPath, buffer);
        savedDocumentProof = docFileName;
        console.log(`[DOC UPLOAD] Saved verification document for ${role} (${normalizedPhone.mobile}): ${docFileName}`);
      } catch (docErr) {
        console.error('Failed to save document file:', docErr);
        savedDocumentProof = req.body.documentName || 'Document Attached';
      }
    } else if (req.body.documentName) {
      savedDocumentProof = String(req.body.documentName);
    }

    const docIdNumber = role === 'resident'
      ? (aadhaarNumber || '')
      : role === 'contractor'
        ? (licenseNumber || '')
        : (req.body.officerId || req.body.idNumber || designation || '');

    const finalDocProof = savedDocumentProof || (docIdNumber ? `${role.toUpperCase()} ID: ${docIdNumber}` : 'Document Attached');

    // 1. Create role account with password, document proof, and ID number
    await createRoleAccount({
      role,
      mobile: normalizedPhone.mobile,
      name: cleanName,
      password: req.body.password || '123456',
      documentProof: finalDocProof,
      idNumber: docIdNumber,
    });

    // 2. Role-specific assignments & verification records
    if (role === 'resident') {
      const assignedProjectId = projectId || 'PUN-23-101';
      const unitDetails = unit && String(unit).trim() ? String(unit).trim() : 'Wing B, Flat 402';
      await assignProject({
        role: 'resident',
        mobile: normalizedPhone.mobile,
        projectId: assignedProjectId,
        unit: unitDetails,
      });

      try {
        await insertResident({
          fullName: cleanName,
          mobile: normalizedPhone.mobile,
          aadhaarNumber: aadhaarNumber || docIdNumber || '',
          householdNumber: householdNumber || '',
          wardNumber: wardNumber || '',
          plotNumber: plotNumber || '',
          landDocumentType: 'Aadhaar Card / Allotment Letter',
          landDocumentNumber: `ALLOT-${normalizedPhone.mobile.slice(-4)}`,
          surveyNumber: '',
          registrationDate: new Date().toISOString().split('T')[0],
          documentProof: finalDocProof,
          verificationStatus: 'Pending',
        });
        await createNotification({
          audienceRole: 'government',
          projectId: assignedProjectId,
          title: `Resident Verification Required: ${cleanName}`,
          message: `New resident ${cleanName} (${normalizedPhone.mobile}) registered for ${assignedProjectId}. Please verify Aadhaar Card.`,
        });
      } catch (err) {
        console.warn('Resident document record warning:', err.message);
      }
    } else if (role === 'contractor') {
      const assignedProjectId = projectId || 'PUN-23-101';
      await assignProject({
        role: 'contractor',
        mobile: normalizedPhone.mobile,
        projectId: assignedProjectId,
        unit: '',
      });

      const contractorCompany = companyName && String(companyName).trim() ? String(companyName).trim() : cleanName;
      const contractorLabel = contractorCompany !== cleanName ? `${contractorCompany} (${cleanName})` : cleanName;

      // Update the project's contractor with registered contractor name
      try {
        const { updateProjectContractor } = require('./database.js');
        if (typeof updateProjectContractor === 'function') {
          await updateProjectContractor(assignedProjectId, contractorLabel);
        }
      } catch (err) {
        console.warn('Could not update project contractor name:', err.message);
      }

      try {
        await insertContractor({
          companyName: contractorCompany,
          mobile: normalizedPhone.mobile,
          licenseNumber: licenseNumber || docIdNumber || `LIC-MH-${normalizedPhone.mobile.slice(-4)}`,
          category: category || 'General Building Construction',
          gstNumber: gstNumber || '',
          registrationNumber: `REG-${normalizedPhone.mobile.slice(-4)}`,
          officeAddress: 'Mumbai, Maharashtra',
          contactPerson: cleanName,
          validity: '2028-12-31',
          documentProof: finalDocProof,
          verificationStatus: 'Pending',
        });
        await createNotification({
          audienceRole: 'government',
          projectId: assignedProjectId,
          title: `Contractor Verification Required: ${contractorLabel}`,
          message: `New contractor ${contractorLabel} (${normalizedPhone.mobile}) registered for ${assignedProjectId}. Please verify License.`,
        });
      } catch (err) {
        console.warn('Contractor document record warning:', err.message);
      }
    } else if (role === 'government') {
      console.log(`[GOVT REGISTER] Officer registered: ${cleanName} - Dept: ${department || 'SRA'} - ID: ${docIdNumber} - Doc: ${finalDocProof}`);
    }

    // Also sync account to Supabase Cloud so it appears in Supabase Dashboard
    try {
      const { supabaseAdmin } = require('./backend/src/supabaseClient');
      if (supabaseAdmin) {
        await supabaseAdmin.auth.admin.createUser({
          phone: normalizedPhone.phone,
          password: req.body.password || 'Password@123',
          phone_confirm: true,
          user_metadata: {
            full_name: cleanName,
            role,
            mobile: normalizedPhone.mobile,
            id_number: docIdNumber || '',
            document_proof: finalDocProof || '',
            source: 'Punarvasan Mobile App',
          },
        });
        console.log(`[SUPABASE SYNC] Account synced to Supabase: ${cleanName} (${role})`);
      }
    } catch (sbErr) {
      console.log(`[SUPABASE SYNC NOTE] ${sbErr.message}`);
    }

    // For resident and contractor, account must be approved by Government Officer first!
    if (role === 'resident' || role === 'contractor') {
      console.log(`[REGISTRATION] New ${role} registered (pending government approval): ${cleanName} (${normalizedPhone.mobile})`);
      return res.status(201).json({
        success: true,
        pending: true,
        account_status: 'pending',
        message: 'Registration submitted successfully! Your account and identity documents have been submitted to Government Officers for verification. Once approved, you will be able to log in.',
      });
    }

    // For government officers, auto-approved
    const token = crypto.randomBytes(32).toString('hex');
    const session = {
      role,
      mobile: normalizedPhone.mobile,
      name: cleanName,
      department: department || undefined,
    };
    sessions.set(token, session);

    console.log(`[REGISTRATION] New ${role} registered: ${cleanName} (${normalizedPhone.mobile})`);

    return res.status(201).json({
      success: true,
      pending: false,
      message: `Account created successfully! Welcome, ${cleanName}.`,
      token,
      user: session,
    });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Failed to complete registration. Please try again.' });
  }
});

app.get('/api/projects', requireRole(), async (req, res) => {
  try {
    res.json({ projects: await getProjectsForRole(req.user.role, req.user.mobile) });
  } catch (error) {
    console.error('Project list failed:', error);
    res.status(500).json({ error: 'Failed to load projects.' });
  }
});

app.get('/api/projects/:projectId/progress', requireRole(), async (req, res) => {
  try {
    if (!await userCanAccessProject(req.user, req.params.projectId)) {
      return res.status(404).json({ error: 'Project not found for this account.' });
    }
    const filters = { projectId: req.params.projectId };
    if (req.user.role === 'resident') filters.status = 'Approved';
    if (req.user.role === 'contractor') filters.contractorMobile = req.user.mobile;
    res.json({ updates: await getProgressUpdates(filters) });
  } catch (error) {
    console.error('Project progress fetch failed:', error);
    res.status(500).json({ error: 'Failed to load construction progress.' });
  }
});

app.post('/api/daily-reports', requireRole('contractor'), async (req, res) => {
  const { projectId, material, labour, workDone } = req.body || {};
  if (!projectId || !String(material || '').trim() || !String(labour || '').trim() || !String(workDone || '').trim()) {
    return res.status(400).json({ error: 'Project, material, labour, and work done are required.' });
  }
  try {
    if (!await userCanAccessProject(req.user, projectId)) {
      return res.status(404).json({ error: 'Project not assigned to this contractor.' });
    }
    const id = await createDailyReport({
      projectId,
      contractorMobile: req.user.mobile,
      material: String(material).trim(),
      labour: String(labour).trim(),
      workDone: String(workDone).trim(),
    });
    const reports = await getDailyReports({ contractorMobile: req.user.mobile });
    res.status(201).json({ report: reports.find((report) => report.id === id) });
  } catch (error) {
    console.error('Daily report submission failed:', error);
    res.status(500).json({ error: 'Failed to save the daily report.' });
  }
});

app.get('/api/daily-reports', requireRole('contractor', 'government'), async (req, res) => {
  try {
    const reports = req.user.role === 'government'
      ? await getDailyReports()
      : await getDailyReports({ contractorMobile: req.user.mobile });
    res.json({ reports });
  } catch (error) {
    console.error('Daily report list failed:', error);
    res.status(500).json({ error: 'Failed to load daily reports.' });
  }
});

app.get('/api/projects/:projectId/uploads', requireRole(), async (req, res) => {
  try {
    if (!await userCanAccessProject(req.user, req.params.projectId)) {
      return res.status(404).json({ error: 'Project not found for this account.' });
    }
    const uploads = await getUploads(req.params.projectId, {
      publicOnly: req.user.role === 'resident',
    });
    res.json({ uploads });
  } catch (error) {
    console.error('Project evidence fetch failed:', error);
    res.status(500).json({ error: 'Failed to load project evidence.' });
  }
});

app.post(
  '/api/uploads',
  requireRole('contractor'),
  express.raw({ type: () => true, limit: '25mb' }),
  async (req, res) => {
    const projectId = String(req.get('x-project-id') || '');
    const category = String(req.get('x-file-category') || '');
    const progressUpdateId = req.get('x-progress-update-id')
      ? validId(req.get('x-progress-update-id'))
      : null;
    if (!projectId || !['photo', 'video', 'quality-report', 'safety-report'].includes(category)) {
      return res.status(400).json({ error: 'Choose an assigned project and a supported evidence category.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'The selected file is empty.' });
    }

    try {
      if (!await userCanAccessProject(req.user, projectId)) {
        return res.status(404).json({ error: 'Project not found for this contractor.' });
      }
      if (req.get('x-progress-update-id')) {
        const update = await getProgressUpdate(progressUpdateId);
        if (!update || update.contractor_mobile !== req.user.mobile) {
          return res.status(404).json({ error: 'Progress update not found for this contractor.' });
        }
      }

      let suppliedName = String(req.get('x-file-name') || 'uploaded-file');
      try {
        suppliedName = decodeURIComponent(suppliedName);
      } catch (error) {
        return res.status(400).json({ error: 'The uploaded filename is invalid.' });
      }
      const fileName = path.basename(suppliedName).replace(/[^\w .()-]/g, '_').slice(0, 120);
      const extension = path.extname(fileName).replace(/[^\w.]/g, '').slice(0, 12);
      const storedName = `${crypto.randomUUID()}${extension}`;
      await fs.promises.mkdir(uploadsDirectory, { recursive: true });
      const storagePath = path.join(uploadsDirectory, storedName);
      await fs.promises.writeFile(storagePath, req.body, { flag: 'wx' });

      const latitude = parseFloat(req.get('x-latitude')) || null;
      const longitude = parseFloat(req.get('x-longitude')) || null;
      let geotag = '';
      if (req.get('x-geotag')) {
        try { geotag = decodeURIComponent(req.get('x-geotag')); } catch (_) { geotag = req.get('x-geotag'); }
      }

      try {
        const id = await createUpload({
          projectId,
          progressUpdateId,
          uploadedByRole: req.user.role,
          uploadedByMobile: req.user.mobile,
          category,
          fileName: fileName || 'uploaded-file',
          storedName,
          mimeType: req.get('content-type') || 'application/octet-stream',
          fileSize: req.body.length,
          latitude,
          longitude,
          geotag,
        });
        res.status(201).json({
          upload: { id, project_id: projectId, category, file_name: fileName, file_size: req.body.length, latitude, longitude, geotag },
        });
      } catch (error) {
        await fs.promises.unlink(storagePath);
        throw error;
      }
    } catch (error) {
      console.error('Evidence upload failed:', error);
      res.status(500).json({ error: 'Failed to store the selected evidence file.' });
    }
  }
);

app.get('/api/uploads/:id/download', requireRole(), async (req, res) => {
  try {
    const id = validId(req.params.id);
    const upload = id ? await getUpload(id) : null;
    if (!upload || !await userCanAccessProject(req.user, upload.project_id)) {
      return res.status(404).json({ error: 'File not found for this account.' });
    }
    if (req.user.role === 'resident' && upload.progress_update_id) {
      const update = await getProgressUpdate(upload.progress_update_id);
      if (!update || update.status !== 'Approved') {
        return res.status(404).json({ error: 'File not found for this account.' });
      }
    }
    res.type(upload.mime_type);
    res.download(path.join(uploadsDirectory, upload.stored_name), upload.file_name);
  } catch (error) {
    console.error('Evidence download failed:', error);
    res.status(500).json({ error: 'Failed to download evidence.' });
  }
});

app.post('/api/progress', requireRole('contractor'), async (req, res) => {
  const { projectId, dailyReportId, stage, progress, floorNumber, floorsTotal, material, labour, workDone, notes } = req.body || {};
  const progressValue = Number(progress);
  const reportId = validId(dailyReportId);
  if (!projectId || !stage || !reportId || !Number.isFinite(progressValue) || progressValue < 0 || progressValue > 100) {
    return res.status(400).json({ error: 'Complete the daily report, choose a project and stage, and enter progress from 0 to 100.' });
  }
  try {
    if (!await userCanAccessProject(req.user, projectId)) {
      return res.status(404).json({ error: 'Project not assigned to this contractor.' });
    }
    const reports = await getDailyReports({ contractorMobile: req.user.mobile });
    if (!reports.some((report) => report.id === reportId && report.project_id === projectId)) {
      return res.status(400).json({ error: 'The daily report does not belong to this project and contractor.' });
    }
    const id = await createProgressUpdate({
      projectId,
      contractorMobile: req.user.mobile,
      dailyReportId: reportId,
      stage,
      progress: progressValue,
      floorNumber,
      floorsTotal,
      material,
      labour,
      workDone,
      notes,
    });
    await attachPendingUploads(projectId, req.user.mobile, id);
    res.status(201).json({ update: await getProgressUpdate(id) });
  } catch (error) {
    console.error('Progress submission failed:', error);
    res.status(500).json({ error: 'Failed to submit the daily progress report.' });
  }
});

app.get('/api/government/progress', requireRole('government'), async (req, res) => {
  try {
    res.json({ updates: await getProgressUpdates() });
  } catch (error) {
    console.error('Government progress queue failed:', error);
    res.status(500).json({ error: 'Failed to load contractor progress reports.' });
  }
});

app.post('/api/progress/:id/decision', requireRole('government'), async (req, res) => {
  const id = validId(req.params.id);
  const { status, feedback } = req.body || {};
  if (!id || !['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Choose Approved or Rejected for a valid progress update.' });
  }
  try {
    const update = await decideProgressUpdate(id, status, feedback || '');
    if (!update) return res.status(404).json({ error: 'Progress update not found.' });
    await createNotification({
      audienceRole: 'contractor',
      recipientMobile: update.contractor_mobile,
      projectId: update.project_id,
      title: `Government feedback: ${status}`,
      message: feedback || `The Government / SRA Officer ${status.toLowerCase()} the submitted progress.`,
    });
    res.json({ success: true, update });
  } catch (error) {
    console.error('Government progress decision failed:', error);
    res.status(500).json({ error: 'Failed to record the progress decision.' });
  }
});

app.post('/api/progress/:id/resolve', requireRole('contractor'), async (req, res) => {
  const id = validId(req.params.id);
  const resolution = String(req.body?.resolution || '').trim();
  if (!id || !resolution) {
    return res.status(400).json({ error: 'Enter how the contractor resolved the returned issue.' });
  }
  try {
    const result = await updateProgressResolution(id, req.user.mobile, resolution);
    if (!result.changes) return res.status(404).json({ error: 'Rejected progress update not found for this contractor.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Contractor resolution failed:', error);
    res.status(500).json({ error: 'Failed to save the issue resolution.' });
  }
});

app.post('/api/progress/:id/resubmit', requireRole('contractor'), async (req, res) => {
  const id = validId(req.params.id);
  const { stage, progress, floorNumber, floorsTotal, material, labour, workDone, notes } = req.body || {};
  const progressValue = Number(progress);
  if (!id || !stage || !Number.isFinite(progressValue) || progressValue < 0 || progressValue > 100) {
    return res.status(400).json({ error: 'Stage and a progress value from 0 to 100 are required.' });
  }
  try {
    const result = await resubmitProgressUpdate(id, req.user.mobile, {
      stage, progress: progressValue, floorNumber, floorsTotal, material, labour, workDone, notes,
    });
    if (!result.changes) return res.status(404).json({ error: 'Rejected progress update not found for this contractor.' });
    res.json({ success: true, update: await getProgressUpdate(id) });
  } catch (error) {
    console.error('Updated progress submission failed:', error);
    res.status(500).json({ error: 'Failed to resubmit the updated progress.' });
  }
});

app.post('/api/complaints', requireRole('resident'), async (req, res) => {
  const { projectId, issue } = req.body || {};
  if (!projectId || !String(issue || '').trim()) {
    return res.status(400).json({ error: 'Choose a project and describe the issue.' });
  }
  try {
    if (!await userCanAccessProject(req.user, projectId)) {
      return res.status(404).json({ error: 'Project not linked to this resident account.' });
    }
    const assignments = await getProjectAssignments(projectId, 'resident');
    const assignment = assignments.find((item) => item.mobile === req.user.mobile);
    const id = await createComplaint({
      projectId,
      residentMobile: req.user.mobile,
      unit: assignment?.unit || '',
      issue: String(issue).trim(),
    });
    await createNotification({
      audienceRole: 'government',
      projectId,
      title: 'Resident complaint submitted',
      message: `Complaint ${id} submitted for ${projectId}.`,
    });
    res.status(201).json({ complaint: await getComplaint(id) });
  } catch (error) {
    console.error('Complaint submission failed:', error);
    res.status(500).json({ error: 'Failed to submit the complaint.' });
  }
});

app.get('/api/complaints', requireRole(), async (req, res) => {
  try {
    const complaints = req.user.role === 'government'
      ? await getComplaints()
      : req.user.role === 'resident'
        ? await getComplaints({ residentMobile: req.user.mobile })
        : [];
    res.json({ complaints });
  } catch (error) {
    console.error('Complaint list failed:', error);
    res.status(500).json({ error: 'Failed to load complaints.' });
  }
});

app.patch('/api/complaints/:id', requireRole('government'), async (req, res) => {
  const id = validId(req.params.id);
  const { status, response } = req.body || {};
  if (!id || !String(status || '').trim()) {
    return res.status(400).json({ error: 'Complaint status is required.' });
  }
  try {
    const complaint = await getComplaint(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
    await updateComplaint(id, String(status).trim(), String(response || '').trim());
    if (response || status !== complaint.status) {
      await createNotification({
        audienceRole: 'resident',
        recipientMobile: complaint.resident_mobile,
        projectId: complaint.project_id,
        title: 'Complaint status updated',
        message: `Complaint ${id}: ${String(status).trim()}${response ? ` — ${String(response).trim()}` : ''}`,
      });
    }
    res.json({ complaint: await getComplaint(id) });
  } catch (error) {
    console.error('Complaint review failed:', error);
    res.status(500).json({ error: 'Failed to update complaint status.' });
  }
});

app.get('/api/notices', requireRole('resident'), async (req, res) => {
  try {
    res.json({ notices: await getNotices(req.user.mobile) });
  } catch (error) {
    console.error('Government notices fetch failed:', error);
    res.status(500).json({ error: 'Failed to load government notices.' });
  }
});

app.get('/api/notices/:id/download', requireRole('resident'), async (req, res) => {
  try {
    const id = validId(req.params.id);
    const notice = id ? await getNotice(id) : null;
    const notices = notice ? await getNotices(req.user.mobile) : [];
    if (!notice || !notices.some((item) => item.id === id)) {
      return res.status(404).json({ error: 'Government notice not found for this resident.' });
    }
    const report = await getReport(notice.report_id);
    if (!report) return res.status(404).json({ error: 'The document for this notice is unavailable.' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="government-report-${report.id}.csv"`);
    res.send(report.content);
  } catch (error) {
    console.error('Government notice download failed:', error);
    res.status(500).json({ error: 'Failed to download the government document.' });
  }
});

app.get('/api/notifications', requireRole(), async (req, res) => {
  try {
    res.json({ notifications: await getNotifications(req.user.role, req.user.mobile) });
  } catch (error) {
    console.error('Notification list failed:', error);
    res.status(500).json({ error: 'Failed to load in-app notifications.' });
  }
});

app.post('/api/reports', requireRole('government'), async (req, res) => {
  const { scope, target } = req.body || {};
  if (!['project', 'ward'].includes(scope) || !String(target || '').trim()) {
    return res.status(400).json({ error: 'Choose a project-wise or ward-wise report.' });
  }
  try {
    const projects = await getProjectsForRole('government', req.user.mobile);
    const selected = scope === 'project'
      ? projects.filter((project) => project.id === target)
      : projects.filter((project) => project.ward === target);
    if (!selected.length) return res.status(404).json({ error: 'No projects match this report.' });
    const id = await createReport({
      scope,
      target,
      projectId: scope === 'project' ? target : '',
      ward: scope === 'ward' ? target : '',
      content: makeProjectCsv(selected),
      createdBy: req.user.mobile,
    });
    res.status(201).json({ report: await getReport(id) });
  } catch (error) {
    console.error('Report generation failed:', error);
    res.status(500).json({ error: 'Failed to generate the requested report.' });
  }
});

app.get('/api/reports', requireRole('government'), async (req, res) => {
  try {
    res.json({ reports: await getReports() });
  } catch (error) {
    console.error('Report list failed:', error);
    res.status(500).json({ error: 'Failed to load generated reports.' });
  }
});

app.get('/api/reports/:id/download', requireRole('government'), async (req, res) => {
  try {
    const id = validId(req.params.id);
    const report = id ? await getReport(id) : null;
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="redevelopment-report-${id}.csv"`);
    res.send(report.content);
  } catch (error) {
    console.error('Report download failed:', error);
    res.status(500).json({ error: 'Failed to download the report.' });
  }
});

app.post('/api/notifications/send', requireRole('government'), async (req, res) => {
  const { reportId, title, message } = req.body || {};
  const id = validId(reportId);
  if (!id || !String(title || '').trim() || !String(message || '').trim()) {
    return res.status(400).json({ error: 'Generate a report and enter a notice title and message.' });
  }
  try {
    const report = await getReport(id);
    if (!report) return res.status(404).json({ error: 'Generated report not found.' });
    const projects = await getProjectsForRole('government', req.user.mobile);
    const targets = report.scope === 'project'
      ? projects.filter((project) => project.id === report.project_id)
      : projects.filter((project) => project.ward === report.ward);
    for (const project of targets) {
      await notifyProjectAudience(
        project.id,
        String(title).trim(),
        String(message).trim(),
        id
      );
    }
    res.json({ success: true, projectsNotified: targets.length });
  } catch (error) {
    console.error('Resident and contractor notification failed:', error);
    res.status(500).json({ error: 'Failed to send in-app notifications.' });
  }
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return next(error);
  const status = error.status === 413 ? 413 : 500;
  res.status(status).json({ error: status === 413 ? 'Upload exceeds the 25 MB limit.' : 'Request failed.' });
});

function validateResidentVerification(data = {}) {
  const hasRequiredFields =
    data.fullName &&
    data.aadhaarNumber &&
    data.documentProof;

  const normalizedProof = String(data.documentProof || '').trim();
  const normalizedAadhaar = String(data.aadhaarNumber || '').replace(/\s+/g, '');

  const valid =
    hasRequiredFields &&
    normalizedAadhaar.length >= 12 &&
    normalizedProof.length > 3;

  return {
    valid,
    status: valid ? 'Pending' : 'Pending',
    message: valid
      ? 'Resident document submitted for admin verification.'
      : 'Resident verification is pending because some proof details are incomplete.',
  };
}

function validateContractorVerification(data = {}) {
  const hasRequiredFields =
    data.companyName &&
    data.licenseNumber &&
    data.gstNumber &&
    data.registrationNumber &&
    data.documentProof;

  const valid =
    hasRequiredFields &&
    String(data.gstNumber || '').length >= 12 &&
    String(data.documentProof || '').trim().length > 3;

  return {
    valid,
    status: valid ? 'Pending' : 'Pending',
    message: valid
      ? 'Contractor document submitted for admin verification.'
      : 'Contractor verification is pending because some proof details are incomplete.',
  };
}

function buildAdminQueue({ residents = [], contractors = [], pendingAccounts = [] } = {}) {
  const residentRows = (residents || [])
    .map((row) => ({
      id: row.id,
      type: 'resident',
      mobile: row.mobile || '',
      name: row.fullName || row.name || 'Resident',
      status: row.verificationStatus || 'Pending',
      documentProof: row.documentProof || '',
      aadhaarNumber: row.aadhaarNumber || '',
      householdNumber: row.householdNumber || '',
      wardNumber: row.wardNumber || '',
      landDocumentType: row.landDocumentType || '',
      createdAt: row.createdAt || row.registrationDate || new Date().toISOString(),
    }));

  const contractorRows = (contractors || [])
    .map((row) => ({
      id: row.id,
      type: 'contractor',
      mobile: row.mobile || '',
      name: row.companyName || row.name || 'Contractor',
      companyName: row.companyName || '',
      contactPerson: row.contactPerson || '',
      licenseNumber: row.licenseNumber || '',
      gstNumber: row.gstNumber || '',
      category: row.category || '',
      status: row.verificationStatus || 'Pending',
      documentProof: row.documentProof || '',
      createdAt: row.createdAt || new Date().toISOString(),
    }));

  const existingMobiles = new Set([
    ...residentRows.map((r) => r.mobile).filter(Boolean),
    ...contractorRows.map((c) => c.mobile).filter(Boolean),
  ]);

  const fallbackAccountRows = (pendingAccounts || [])
    .filter((acc) => !existingMobiles.has(acc.mobile))
    .map((acc) => ({
      id: `acc_${acc.mobile}`,
      type: acc.role,
      mobile: acc.mobile,
      name: acc.name,
      companyName: acc.role === 'contractor' ? acc.name : '',
      contactPerson: acc.role === 'contractor' ? acc.name : '',
      status: 'Pending',
      documentProof: acc.document_proof || '',
      aadhaarNumber: acc.role === 'resident' ? (acc.id_number || '') : '',
      licenseNumber: acc.role === 'contractor' ? (acc.id_number || '') : '',
      createdAt: new Date().toISOString(),
    }));

  return [...residentRows, ...contractorRows, ...fallbackAccountRows].sort((a, b) => {
    if (a.status === 'Pending' && b.status !== 'Pending') return -1;
    if (b.status === 'Pending' && a.status !== 'Pending') return 1;
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    const timeDiff = right - left;
    if (Math.abs(timeDiff) > 1000) return timeDiff;
    if (a.type === 'resident' && b.type !== 'resident') return -1;
    if (b.type === 'resident' && a.type !== 'resident') return 1;
    return 0;
  });
}

function applyVerificationDecision(type, recordId, status, message) {
  const normalizedStatus = status || 'Pending';
  const normalizedMessage = message || 'Admin action recorded';

  return {
    type,
    recordId,
    status: normalizedStatus,
    message: normalizedMessage,
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Punarvasan backend is running.' });
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const [residents, contractors] = await Promise.all([getResidents(), getContractors()]);
    res.json({
      totalProjects: 3,
      totalResidents: residents.length,
      totalContractors: contractors.length,
      averageProgress: 60,
      residents,
      contractors,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

app.get('/api/admin/queue', async (req, res) => {
  try {
    const [residents, contractors, pendingAccounts] = await Promise.all([
      getResidents(),
      getContractors(),
      getPendingRoleAccounts(),
    ]);
    const queue = buildAdminQueue({ residents, contractors, pendingAccounts });
    res.json({ success: true, queue });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin queue' });
  }
});

app.post('/api/admin/verify/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const { status, message } = req.body || {};

  const validType = type === 'resident' || type === 'contractor';
  if (!validType) {
    return res.status(400).json({ error: 'Invalid verification type' });
  }

  const decision = applyVerificationDecision(type, id, status || 'Approved', message || `${type} document reviewed by admin.`);

  try {
    const isApproved = decision.status === 'Approved';
    const newAccountStatus = isApproved ? 'approved' : 'rejected';
    let applicantMobile = null;

    if (String(id).startsWith('acc_')) {
      applicantMobile = String(id).replace('acc_', '');
    } else {
      const numId = Number(id);
      await updateVerificationStatus(type, numId, decision.status, decision.message);
      await logVerification(type, numId, decision.status, decision.message);

      const record = type === 'resident' ? await getResident(numId) : await getContractor(numId);
      if (record) {
        if (record.mobile) {
          applicantMobile = record.mobile;
        } else {
          const nameToMatch = type === 'resident' ? record.fullName : (record.contactPerson || record.companyName);
          const idToMatch = type === 'resident' ? record.aadhaarNumber : record.licenseNumber;
          const docToMatch = record.documentProof;
          const { db } = require('./database');
          const matchingAccounts = await new Promise((resolve) => {
            db.all(
              'SELECT mobile FROM role_accounts WHERE role = ? AND (name = ? OR id_number = ? OR document_proof = ?)',
              [type, nameToMatch || '', idToMatch || '', docToMatch || ''],
              (err, rows) => resolve(rows || [])
            );
          });
          if (matchingAccounts && matchingAccounts.length > 0) {
            applicantMobile = matchingAccounts[0].mobile;
          }
        }
      }
    }

    if (applicantMobile) {
      await updateRoleAccountStatus(type, applicantMobile, newAccountStatus);
      console.log(`[VERIFICATION] Account ${type} (${applicantMobile}) status updated to: ${newAccountStatus}`);

      // Send in-app notification to the applicant
      try {
        await createNotification({
          audienceRole: type,
          recipientMobile: applicantMobile,
          projectId: '',
          title: isApproved ? 'Account Approved by Government' : 'Account Verification Notice',
          message: isApproved
            ? 'Your identity documents have been verified and approved by the Government Officer. You now have full access to Punarvasan.'
            : `Your verification was rejected: ${decision.message}`,
        });
      } catch (notifyErr) {
        console.warn('Notification warning:', notifyErr.message);
      }
    }

    res.json({ success: true, decision, accountStatus: newAccountStatus, mobile: applicantMobile });
  } catch (error) {
    console.error('Failed to update verification status:', error);
    res.status(500).json({ error: 'Failed to update verification status' });
  }
});

app.post('/api/admin/approve-account', async (req, res) => {
  const { role, mobile, status = 'approved', message = '' } = req.body || {};
  if (!allowedRoles.has(role) || !mobile) {
    return res.status(400).json({ error: 'Role and mobile number are required.' });
  }
  try {
    await updateRoleAccountStatus(role, mobile, status);
    try {
      await createNotification({
        audienceRole: role,
        recipientMobile: mobile,
        projectId: '',
        title: status === 'approved' ? 'Account Approved by Government' : 'Account Verification Notice',
        message: status === 'approved'
          ? 'Your identity documents have been verified and approved by the Government Officer. You now have full access to Punarvasan.'
          : `Your identity verification was rejected: ${message || 'Please contact support.'}`,
      });
    } catch (_) {}
    res.json({ success: true, role, mobile, account_status: status });
  } catch (error) {
    console.error('Approve account error:', error);
    res.status(500).json({ error: 'Failed to update account status.' });
  }
});

app.post('/api/verify-resident', async (req, res) => {
  const result = validateResidentVerification(req.body);

  try {
    const record = await insertResident({
      ...req.body,
      verificationStatus: result.status,
    });

    await logVerification('resident', record.id, result.status, result.message);

    res.json({ success: true, verification: result, record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save resident verification' });
  }
});

app.post('/api/verify-contractor', async (req, res) => {
  const result = validateContractorVerification(req.body);

  try {
    const record = await insertContractor({
      ...req.body,
      verificationStatus: result.status,
    });

    await logVerification('contractor', record.id, result.status, result.message);

    res.json({ success: true, verification: result, record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save contractor verification' });
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Punarvasan Tracker backend running on port ${PORT}`);
    console.log(`- Web / Localhost:   http://localhost:${PORT}`);
    console.log(`- Android Emulator:  http://10.0.2.2:${PORT}`);
    console.log(`- Mobile App (WiFi): http://192.168.0.103:${PORT}`);
  });
}

module.exports = {
  app,
  normalizeLoginPhone,
  setOtpAuthForTests(auth) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('OTP auth injection is only available in tests.');
    }
    otpAuth = auth;
  },
  validateResidentVerification,
  validateContractorVerification,
  buildAdminQueue,
  applyVerificationDecision,
};
