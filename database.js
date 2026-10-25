const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config();

function hashPassword(password) {
  if (!password) return '';
  const salt = 'punarvasan_salt_2026';
  return crypto.pbkdf2Sync(String(password), salt, 1000, 32, 'sha256').toString('hex');
}

// On Render, use /var/data (persistent disk). Locally use project root.
const defaultDbPath = process.env.RENDER
  ? '/var/data/punarvasan.db'
  : path.join(__dirname, 'punarvasan.db');
const dbPath = process.env.SQLITE_DB_PATH || defaultDbPath;
const sqliteDb = new sqlite3.Database(dbPath);
const postgresConnectionString = process.env.DATABASE_URL || '';

let postgresClient = null;

function getPostgresClient() {
  if (!postgresConnectionString) return null;

  if (!postgresClient) {
    postgresClient = new Client({ connectionString: postgresConnectionString });
  }

  return postgresClient;
}

function getDatabaseMode() {
  return postgresConnectionString ? 'postgres' : 'sqlite';
}

async function ensurePostgresConnected() {
  const client = getPostgresClient();
  if (!client) return false;

  if (!client._connected) {
    await client.connect();
    client._connected = true;
  }

  return true;
}

function initDatabase() {
  if (getDatabaseMode() === 'postgres') {
    return initPostgresDatabase();
  }

  return initSqliteDatabase();
}

function initSqliteDatabase() {
  sqliteDb.serialize(() => {
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT,
        aadhaarNumber TEXT,
        householdNumber TEXT,
        wardNumber TEXT,
        plotNumber TEXT,
        landDocumentType TEXT,
        landDocumentNumber TEXT,
        surveyNumber TEXT,
        registrationDate TEXT,
        documentProof TEXT,
        verificationStatus TEXT DEFAULT 'Pending',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sqliteDb.run('ALTER TABLE residents ADD COLUMN mobile TEXT', () => {});

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS contractors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyName TEXT,
        licenseNumber TEXT,
        category TEXT,
        gstNumber TEXT,
        registrationNumber TEXT,
        officeAddress TEXT,
        contactPerson TEXT,
        validity TEXT,
        documentProof TEXT,
        verificationStatus TEXT DEFAULT 'Pending',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sqliteDb.run('ALTER TABLE contractors ADD COLUMN mobile TEXT', () => {});

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS verification_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userType TEXT,
        recordId INTEGER,
        status TEXT,
        message TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ward TEXT NOT NULL,
        stage TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        families INTEGER NOT NULL DEFAULT 0,
        updated TEXT NOT NULL,
        contractor TEXT NOT NULL,
        site_area TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'In progress',
        next_milestone TEXT NOT NULL DEFAULT '',
        alert TEXT NOT NULL DEFAULT '',
        floor_number INTEGER,
        floors_total INTEGER
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS role_accounts (
        role TEXT NOT NULL,
        mobile TEXT NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT,
        PRIMARY KEY (role, mobile)
      )
    `);
    sqliteDb.run('ALTER TABLE role_accounts ADD COLUMN password_hash TEXT', () => {});
    sqliteDb.run('ALTER TABLE role_accounts ADD COLUMN document_proof TEXT', () => {});
    sqliteDb.run('ALTER TABLE role_accounts ADD COLUMN id_number TEXT', () => {});
    sqliteDb.run("ALTER TABLE role_accounts ADD COLUMN account_status TEXT NOT NULL DEFAULT 'approved'", () => {});

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS project_assignments (
        role TEXT NOT NULL,
        mobile TEXT NOT NULL,
        project_id TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (role, mobile, project_id)
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS progress_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        contractor_mobile TEXT NOT NULL,
        daily_report_id INTEGER,
        stage TEXT NOT NULL,
        progress INTEGER NOT NULL,
        floor_number INTEGER,
        floors_total INTEGER,
        material TEXT NOT NULL DEFAULT '',
        labour TEXT NOT NULL DEFAULT '',
        work_done TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Pending review',
        feedback TEXT NOT NULL DEFAULT '',
        resolution TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sqliteDb.run(
      'ALTER TABLE progress_updates ADD COLUMN daily_report_id INTEGER',
      (error) => {
        if (error && !/duplicate column name/i.test(error.message)) {
          console.error('Failed to migrate progress_updates:', error);
        }
      }
    );

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        contractor_mobile TEXT NOT NULL,
        material TEXT NOT NULL,
        labour TEXT NOT NULL,
        work_done TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        progress_update_id INTEGER,
        uploaded_by_role TEXT NOT NULL,
        uploaded_by_mobile TEXT NOT NULL,
        category TEXT NOT NULL,
        file_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        latitude REAL,
        longitude REAL,
        geotag TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sqliteDb.run('ALTER TABLE projects ADD COLUMN latitude REAL', () => {});
    sqliteDb.run('ALTER TABLE projects ADD COLUMN longitude REAL', () => {});
    sqliteDb.run('ALTER TABLE projects ADD COLUMN scheme_type TEXT DEFAULT "SRA"', () => {});
    sqliteDb.run('ALTER TABLE uploads ADD COLUMN latitude REAL', () => {});
    sqliteDb.run('ALTER TABLE uploads ADD COLUMN longitude REAL', () => {});
    sqliteDb.run('ALTER TABLE uploads ADD COLUMN geotag TEXT', () => {});

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        resident_mobile TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        issue TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Submitted',
        response TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        target TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT '',
        ward TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audience_role TEXT NOT NULL,
        recipient_mobile TEXT NOT NULL DEFAULT '',
        project_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        report_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        report_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    seedSqliteWorkflowData();
  });
}

const workflowProjectSeeds = [
  {
    id: 'PUN-23-101',
    name: 'Sanjay Nagar Rehabilitation Scheme',
    ward: 'Ward 21, Mumbai',
    stage: 'Structure — Floor-wise (shows floor number out of total)',
    progress: 62,
    families: 312,
    updated: '2026-10-11',
    contractor: 'Sanskar',
    site_area: '3.4 acres',
    status: 'Approved',
    next_milestone: 'Floor 9 of 14 complete',
    alert: 'No critical issue',
    floor_number: 9,
    floors_total: 14,
    latitude: 19.0607,
    longitude: 72.8525,
    scheme_type: 'SRA',
  },
  {
    id: 'PUN-23-104',
    name: 'Bharat Colony Redevelopment',
    ward: 'Ward 18, Mumbai',
    stage: 'Foundation Complete',
    progress: 31,
    families: 268,
    updated: '2026-10-09',
    contractor: 'Pending contractor assignment',
    site_area: '2.9 acres',
    status: 'Monitoring',
    next_milestone: 'Column reinforcement inspection',
    alert: 'Awaiting structural review',
    floor_number: null,
    floors_total: null,
    latitude: 19.0416,
    longitude: 72.8550,
    scheme_type: 'DRP',
  },
  {
    id: 'PUN-23-118',
    name: 'Gokhale Nagar Housing Project',
    ward: 'Ward 12, Mumbai',
    stage: 'Plumbing, Electrical & Finishing',
    progress: 86,
    families: 198,
    updated: '2026-08-15',
    contractor: 'more construction (sahil bhagatsing more)',
    site_area: '2.1 acres',
    status: 'Handover review',
    next_milestone: 'Final finishing checklist',
    alert: 'No milestone update for 60 days',
    floor_number: null,
    floors_total: null,
    latitude: 19.0726,
    longitude: 72.8790,
    scheme_type: 'MHADA',
  },
];

function seedSqliteWorkflowData() {
  workflowProjectSeeds.forEach((project) => {
    sqliteDb.run(
      `INSERT OR IGNORE INTO projects
       (id, name, ward, stage, progress, families, updated, contractor, site_area, status, next_milestone, alert, floor_number, floors_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.name,
        project.ward,
        project.stage,
        project.progress,
        project.families,
        project.updated,
        project.contractor,
        project.site_area,
        project.status,
        project.next_milestone,
        project.alert,
        project.floor_number,
        project.floors_total,
      ]
    );

    sqliteDb.run(
      `UPDATE projects
       SET latitude = ?, longitude = ?, scheme_type = ?, updated = ?
       WHERE id = ?`,
      [project.latitude, project.longitude, project.scheme_type, project.updated, project.id]
    );
  });

  // Removed legacy demo assignment
}

async function initPostgresDatabase() {
  const connected = await ensurePostgresConnected();
  if (!connected) return;

  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS residents (
      id SERIAL PRIMARY KEY,
      "fullName" TEXT,
      "aadhaarNumber" TEXT,
      "householdNumber" TEXT,
      "wardNumber" TEXT,
      "plotNumber" TEXT,
      "landDocumentType" TEXT,
      "landDocumentNumber" TEXT,
      "surveyNumber" TEXT,
      "registrationDate" TEXT,
      "documentProof" TEXT,
      "verificationStatus" TEXT DEFAULT 'Pending',
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS contractors (
      id SERIAL PRIMARY KEY,
      "companyName" TEXT,
      "licenseNumber" TEXT,
      "category" TEXT,
      "gstNumber" TEXT,
      "registrationNumber" TEXT,
      "officeAddress" TEXT,
      "contactPerson" TEXT,
      "validity" TEXT,
      "documentProof" TEXT,
      "verificationStatus" TEXT DEFAULT 'Pending',
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgresClient.query('ALTER TABLE residents ADD COLUMN IF NOT EXISTS mobile TEXT');
  await postgresClient.query('ALTER TABLE contractors ADD COLUMN IF NOT EXISTS mobile TEXT');

  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS verification_logs (
      id SERIAL PRIMARY KEY,
      "userType" TEXT,
      "recordId" INTEGER,
      status TEXT,
      message TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ward TEXT NOT NULL,
      stage TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      families INTEGER NOT NULL DEFAULT 0,
      updated TEXT NOT NULL,
      contractor TEXT NOT NULL,
      site_area TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'In progress',
      next_milestone TEXT NOT NULL DEFAULT '',
      alert TEXT NOT NULL DEFAULT '',
      floor_number INTEGER,
      floors_total INTEGER
    )
  `);
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS role_accounts (
      role TEXT NOT NULL,
      mobile TEXT NOT NULL,
      name TEXT NOT NULL,
      account_status TEXT NOT NULL DEFAULT 'approved',
      PRIMARY KEY (role, mobile)
    )
  `);
  await postgresClient.query("ALTER TABLE role_accounts ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'approved'");
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS project_assignments (
      role TEXT NOT NULL,
      mobile TEXT NOT NULL,
      project_id TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (role, mobile, project_id)
    )
  `);
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS progress_updates (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      contractor_mobile TEXT NOT NULL,
      daily_report_id INTEGER,
      stage TEXT NOT NULL,
      progress INTEGER NOT NULL,
      floor_number INTEGER,
      floors_total INTEGER,
      material TEXT NOT NULL DEFAULT '',
      labour TEXT NOT NULL DEFAULT '',
      work_done TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending review',
      feedback TEXT NOT NULL DEFAULT '',
      resolution TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgresClient.query(
    'ALTER TABLE progress_updates ADD COLUMN IF NOT EXISTS daily_report_id INTEGER'
  );
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      contractor_mobile TEXT NOT NULL,
      material TEXT NOT NULL,
      labour TEXT NOT NULL,
      work_done TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      progress_update_id INTEGER,
      uploaded_by_role TEXT NOT NULL,
      uploaded_by_mobile TEXT NOT NULL,
      category TEXT NOT NULL,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS complaints (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      resident_mobile TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      issue TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Submitted',
      response TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      scope TEXT NOT NULL,
      target TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT '',
      ward TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      audience_role TEXT NOT NULL,
      recipient_mobile TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      report_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgresClient.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      report_id INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const project of workflowProjectSeeds) {
    await postgresClient.query(
      `INSERT INTO projects
       (id, name, ward, stage, progress, families, updated, contractor, site_area, status, next_milestone, alert, floor_number, floors_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING`,
      Object.values(project)
    );
  }
  await postgresClient.query(
    `INSERT INTO role_accounts (role, mobile, name) VALUES
      ('resident', '9000000001', 'Demo Resident'),
      ('contractor', '9000000002', 'Demo Contractor'),
      ('government', '9000000003', 'Demo Government / SRA Officer')
     ON CONFLICT (role, mobile) DO NOTHING`
  );
  await postgresClient.query(
    `INSERT INTO project_assignments (role, mobile, project_id, unit)
     VALUES ('resident', '9000000001', 'PUN-23-101', 'Flat 12/B')
     ON CONFLICT (role, mobile, project_id) DO NOTHING`
  );
  for (const project of workflowProjectSeeds) {
    await postgresClient.query(
      `INSERT INTO project_assignments (role, mobile, project_id, unit)
       VALUES ('contractor', '9000000002', $1, '')
       ON CONFLICT (role, mobile, project_id) DO NOTHING`,
      [project.id]
    );
  }
}

function insertResident(data) {
  if (getDatabaseMode() === 'postgres') {
    return insertResidentPostgres(data);
  }

  return insertResidentSqlite(data);
}

function insertResidentSqlite(data) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(
      `INSERT INTO residents (fullName, mobile, aadhaarNumber, householdNumber, wardNumber, plotNumber, landDocumentType, landDocumentNumber, surveyNumber, registrationDate, documentProof, verificationStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.fullName,
        data.mobile || '',
        data.aadhaarNumber,
        data.householdNumber || '',
        data.wardNumber || '',
        data.plotNumber || '',
        data.landDocumentType || 'Title deed',
        data.landDocumentNumber || '',
        data.surveyNumber || '',
        data.registrationDate || new Date().toISOString().slice(0, 10),
        data.documentProof || '',
        data.verificationStatus || 'Pending',
      ],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...data, verificationStatus: data.verificationStatus || 'Pending' });
      }
    );
  });
}

async function insertResidentPostgres(data) {
  const client = await ensurePostgresConnected();
  if (!client) throw new Error('PostgreSQL connection not configured');

  const result = await postgresClient.query(
    `INSERT INTO residents ("fullName", mobile, "aadhaarNumber", "householdNumber", "wardNumber", "plotNumber", "landDocumentType", "landDocumentNumber", "surveyNumber", "registrationDate", "documentProof", "verificationStatus")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      data.fullName,
      data.mobile || '',
      data.aadhaarNumber,
      data.householdNumber || '',
      data.wardNumber || '',
      data.plotNumber || '',
      data.landDocumentType || 'Title deed',
      data.landDocumentNumber || '',
      data.surveyNumber || '',
      data.registrationDate || new Date().toISOString().slice(0, 10),
      data.documentProof || '',
      data.verificationStatus || 'Pending',
    ]
  );

  return result.rows[0];
}

function insertContractor(data) {
  if (getDatabaseMode() === 'postgres') {
    return insertContractorPostgres(data);
  }

  return insertContractorSqlite(data);
}

function insertContractorSqlite(data) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(
      `INSERT INTO contractors (companyName, mobile, licenseNumber, category, gstNumber, registrationNumber, officeAddress, contactPerson, validity, documentProof, verificationStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.companyName,
        data.mobile || '',
        data.licenseNumber,
        data.category || 'Class A',
        data.gstNumber,
        data.registrationNumber,
        data.officeAddress || '',
        data.contactPerson || '',
        data.validity || '',
        data.documentProof || '',
        data.verificationStatus || 'Pending',
      ],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...data, verificationStatus: data.verificationStatus || 'Pending' });
      }
    );
  });
}

async function insertContractorPostgres(data) {
  const client = await ensurePostgresConnected();
  if (!client) throw new Error('PostgreSQL connection not configured');

  const result = await postgresClient.query(
    `INSERT INTO contractors ("companyName", mobile, "licenseNumber", category, "gstNumber", "registrationNumber", "officeAddress", "contactPerson", validity, "documentProof", "verificationStatus")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      data.companyName,
      data.mobile || '',
      data.licenseNumber,
      data.category || 'Class A',
      data.gstNumber,
      data.registrationNumber,
      data.officeAddress || '',
      data.contactPerson || '',
      data.validity || '',
      data.documentProof || '',
      data.verificationStatus || 'Pending',
    ]
  );

  return result.rows[0];
}

function getResidents() {
  if (getDatabaseMode() === 'postgres') {
    return getResidentsPostgres();
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all('SELECT * FROM residents ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function getResidentsPostgres() {
  const client = await ensurePostgresConnected();
  if (!client) throw new Error('PostgreSQL connection not configured');

  const result = await postgresClient.query('SELECT * FROM residents ORDER BY id DESC');
  return result.rows;
}

function getContractors() {
  if (getDatabaseMode() === 'postgres') {
    return getContractorsPostgres();
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all('SELECT * FROM contractors ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function getContractorsPostgres() {
  const client = await ensurePostgresConnected();
  if (!client) throw new Error('PostgreSQL connection not configured');

  const result = await postgresClient.query('SELECT * FROM contractors ORDER BY id DESC');
  return result.rows;
}

async function updateVerificationStatus(userType, recordId, status, message) {
  if (userType === 'resident') {
    if (getDatabaseMode() === 'postgres') {
      const result = await postgresClient.query(
        'UPDATE residents SET "verificationStatus" = $1 WHERE id = $2 RETURNING *',
        [status, recordId]
      );
      return result.rows[0];
    }

    return new Promise((resolve, reject) => {
      sqliteDb.run(
        'UPDATE residents SET verificationStatus = ? WHERE id = ?',
        [status, recordId],
        function (err) {
          if (err) return reject(err);
          resolve({ id: recordId, verificationStatus: status, message });
        }
      );
    });
  }

  if (getDatabaseMode() === 'postgres') {
    const result = await postgresClient.query(
      'UPDATE contractors SET "verificationStatus" = $1 WHERE id = $2 RETURNING *',
      [status, recordId]
    );
    return result.rows[0];
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(
      'UPDATE contractors SET verificationStatus = ? WHERE id = ?',
      [status, recordId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: recordId, verificationStatus: status, message });
      }
    );
  });
}

function logVerification(userType, recordId, status, message) {
  if (getDatabaseMode() === 'postgres') {
    return logVerificationPostgres(userType, recordId, status, message);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(
      `INSERT INTO verification_logs (userType, recordId, status, message) VALUES (?, ?, ?, ?)`,
      [userType, recordId, status, message],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

async function logVerificationPostgres(userType, recordId, status, message) {
  const client = await ensurePostgresConnected();
  if (!client) throw new Error('PostgreSQL connection not configured');

  const result = await postgresClient.query(
    'INSERT INTO verification_logs ("userType", "recordId", status, message) VALUES ($1, $2, $3, $4) RETURNING id',
    [userType, recordId, status, message]
  );

  return result.rows[0].id;
}

function workflowSql(sql) {
  let parameterIndex = 0;
  return sql.replace(/\?/g, () => `$${++parameterIndex}`);
}

async function workflowAll(sql, params = []) {
  if (getDatabaseMode() === 'postgres') {
    await ensurePostgresConnected();
    const result = await postgresClient.query(workflowSql(sql), params);
    return result.rows;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

async function workflowRun(sql, params = []) {
  if (getDatabaseMode() === 'postgres') {
    await ensurePostgresConnected();
    const result = await postgresClient.query(workflowSql(sql), params);
    return { changes: result.rowCount, rows: result.rows };
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

async function workflowInsert(sql, params = []) {
  if (getDatabaseMode() === 'postgres') {
    await ensurePostgresConnected();
    const result = await postgresClient.query(`${workflowSql(sql)} RETURNING id`, params);
    return result.rows[0].id;
  }

  const result = await workflowRun(sql, params);
  return result.id;
}

async function getRoleAccount(role, mobile) {
  const rows = await workflowAll(
    'SELECT role, mobile, name, password_hash, account_status FROM role_accounts WHERE role = ? AND mobile = ?',
    [role, mobile]
  );
  return rows[0] || null;
}

async function approveRoleAccount(role, mobile) {
  return updateRoleAccountStatus(role, mobile, 'approved');
}

async function updateRoleAccountStatus(role, mobile, status) {
  await workflowRun(
    'UPDATE role_accounts SET account_status = ? WHERE role = ? AND mobile = ?',
    [status, role, mobile]
  );
  return { role, mobile, account_status: status };
}

async function getResident(id) {
  const rows = await workflowAll('SELECT * FROM residents WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getContractor(id) {
  const rows = await workflowAll('SELECT * FROM contractors WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getPendingRoleAccounts() {
  return workflowAll(
    "SELECT role, mobile, name, document_proof, id_number, account_status FROM role_accounts WHERE account_status = 'pending'"
  );
}

const PROJECT_SELECT_FIELDS = `
  p.*,
  (SELECT GROUP_CONCAT(DISTINCT CASE 
      WHEN c.companyName IS NOT NULL AND c.companyName != '' AND c.companyName != r.name 
      THEN c.companyName || ' (' || r.name || ')' 
      ELSE r.name 
    END)
   FROM project_assignments pa
   JOIN role_accounts r ON r.mobile = pa.mobile AND r.role = 'contractor'
   LEFT JOIN contractors c ON c.contactPerson = r.name
   WHERE pa.project_id = p.id AND pa.role = 'contractor') AS reg_contractor,
  (SELECT GROUP_CONCAT(DISTINCT r2.name || CASE 
      WHEN pa2.unit IS NOT NULL AND pa2.unit != '' 
      THEN ' (' || pa2.unit || ')' 
      ELSE '' 
    END)
   FROM project_assignments pa2
   JOIN role_accounts r2 ON r2.mobile = pa2.mobile AND r2.role = 'resident'
   WHERE pa2.project_id = p.id AND pa2.role = 'resident') AS reg_residents
`;

function enrichProjectData(project) {
  if (!project) return project;
  const updatedDate = project.updated ? new Date(project.updated) : new Date();
  const now = new Date();
  const diffTime = Math.max(0, now.getTime() - updatedDate.getTime());
  const daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const isDelayed = daysInactive >= 30;

  // Use the verified registered contractor, or fall back to assigned contractor or pending status
  const resolvedContractor = project.reg_contractor || project.contractor || 'Pending contractor assignment';
  const resolvedResidents = project.reg_residents || 'No residents registered yet';

  return {
    ...project,
    contractor: resolvedContractor,
    registered_contractor: resolvedContractor,
    registered_residents: resolvedResidents,
    latitude: project.latitude || (project.id === 'PUN-23-101' ? 19.0607 : project.id === 'PUN-23-104' ? 19.0416 : 19.0726),
    longitude: project.longitude || (project.id === 'PUN-23-101' ? 72.8525 : project.id === 'PUN-23-104' ? 72.8550 : 72.8790),
    scheme_type: project.scheme_type || (project.id === 'PUN-23-101' ? 'SRA' : project.id === 'PUN-23-104' ? 'DRP' : 'MHADA'),
    days_inactive: daysInactive,
    is_delayed: isDelayed,
    delay_status: isDelayed ? 'Delayed (30+ days inactive)' : 'On Track',
    alert: isDelayed && (!project.alert || project.alert === 'No critical issue')
      ? 'Alert: No milestone update for 30+ days'
      : (project.alert || 'No critical issue'),
  };
}

async function getProjectsForRole(role, mobile) {
  let rows;
  if (role === 'government') {
    rows = await workflowAll(`SELECT ${PROJECT_SELECT_FIELDS} FROM projects p ORDER BY p.ward, p.name`);
  } else {
    rows = await workflowAll(
      `SELECT ${PROJECT_SELECT_FIELDS}, a.unit
       FROM projects p
       JOIN project_assignments a ON a.project_id = p.id
       WHERE a.role = ? AND a.mobile = ?
       ORDER BY p.name`,
      [role, mobile]
    );
  }
  return rows.map(enrichProjectData);
}

async function getProject(projectId) {
  const rows = await workflowAll(`SELECT ${PROJECT_SELECT_FIELDS} FROM projects p WHERE p.id = ?`, [projectId]);
  return rows[0] ? enrichProjectData(rows[0]) : null;
}

async function getProjectAssignments(projectId, role) {
  return workflowAll(
    'SELECT role, mobile, unit FROM project_assignments WHERE project_id = ? AND role = ?',
    [projectId, role]
  );
}

async function getAllProjects() {
  const rows = await workflowAll(`SELECT ${PROJECT_SELECT_FIELDS} FROM projects p ORDER BY p.ward, p.name`);
  return rows.map(enrichProjectData);
}

async function createRoleAccount({ role, mobile, name, password, documentProof = '', idNumber = '' }) {
  const passwordHash = password ? hashPassword(password) : hashPassword('123456');
  // Government officers are auto-approved. Residents and contractors start as 'pending'
  // and must be verified by a government officer before they can log in.
  const accountStatus = role === 'government' ? 'approved' : 'pending';
  await workflowRun(
    'INSERT OR REPLACE INTO role_accounts (role, mobile, name, password_hash, document_proof, id_number, account_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [role, mobile, name, passwordHash, documentProof, idNumber, accountStatus]
  );
  return { role, mobile, name, documentProof, idNumber, accountStatus };
}

async function assignProject({ role, mobile, projectId, unit = '' }) {
  await workflowRun(
    'INSERT OR REPLACE INTO project_assignments (role, mobile, project_id, unit) VALUES (?, ?, ?, ?)',
    [role, mobile, projectId, unit]
  );
  return { role, mobile, projectId, unit };
}

async function updateProjectContractor(projectId, contractorName) {
  return workflowRun(
    'UPDATE projects SET contractor = ? WHERE id = ?',
    [contractorName, projectId]
  );
}

async function createProgressUpdate(data) {
  return workflowInsert(
    `INSERT INTO progress_updates
      (project_id, contractor_mobile, daily_report_id, stage, progress, floor_number, floors_total, material, labour, work_done, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.projectId,
      data.contractorMobile,
      data.dailyReportId || null,
      data.stage,
      data.progress,
      data.floorNumber || null,
      data.floorsTotal || null,
      data.material || '',
      data.labour || '',
      data.workDone || '',
      data.notes || '',
    ]
  );
}

async function getProgressUpdates({ projectId, status, contractorMobile } = {}) {
  const filters = [];
  const params = [];
  if (projectId) {
    filters.push('project_id = ?');
    params.push(projectId);
  }
  if (status) {
    filters.push('status = ?');
    params.push(status);
  }
  if (contractorMobile) {
    filters.push('contractor_mobile = ?');
    params.push(contractorMobile);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return workflowAll(
    `SELECT * FROM progress_updates ${where} ORDER BY created_at DESC, id DESC`,
    params
  );
}

async function getProgressUpdate(id) {
  const rows = await workflowAll('SELECT * FROM progress_updates WHERE id = ?', [id]);
  return rows[0] || null;
}

async function createDailyReport(data) {
  return workflowInsert(
    `INSERT INTO daily_reports (project_id, contractor_mobile, material, labour, work_done)
     VALUES (?, ?, ?, ?, ?)`,
    [data.projectId, data.contractorMobile, data.material, data.labour, data.workDone]
  );
}

async function getDailyReports({ contractorMobile } = {}) {
  if (contractorMobile) {
    return workflowAll(
      `SELECT * FROM daily_reports WHERE contractor_mobile = ?
       ORDER BY created_at DESC, id DESC`,
      [contractorMobile]
    );
  }
  return workflowAll('SELECT * FROM daily_reports ORDER BY created_at DESC, id DESC');
}

async function updateProgressResolution(id, contractorMobile, resolution) {
  return workflowRun(
    `UPDATE progress_updates SET resolution = ?
     WHERE id = ? AND contractor_mobile = ? AND status = 'Rejected'`,
    [resolution, id, contractorMobile]
  );
}

async function resubmitProgressUpdate(id, contractorMobile, data) {
  return workflowRun(
    `UPDATE progress_updates
     SET stage = ?, progress = ?, floor_number = ?, floors_total = ?,
         material = ?, labour = ?, work_done = ?, notes = ?,
         status = 'Pending review', feedback = '', created_at = CURRENT_TIMESTAMP
     WHERE id = ? AND contractor_mobile = ? AND status = 'Rejected'`,
    [
      data.stage,
      data.progress,
      data.floorNumber || null,
      data.floorsTotal || null,
      data.material || '',
      data.labour || '',
      data.workDone || '',
      data.notes || '',
      id,
      contractorMobile,
    ]
  );
}

async function decideProgressUpdate(id, status, feedback) {
  if (getDatabaseMode() === 'postgres') {
    await ensurePostgresConnected();
    await postgresClient.query('BEGIN');
    try {
      const update = await postgresClient.query(
        `UPDATE progress_updates SET status = $1, feedback = $2
         WHERE id = $3 RETURNING *`,
        [status, feedback || '', id]
      );
      if (!update.rows[0]) {
        await postgresClient.query('ROLLBACK');
        return null;
      }
      if (status === 'Approved') {
        await postgresClient.query(
          `UPDATE projects SET stage = $1, progress = $2, updated = CURRENT_DATE::TEXT,
             floor_number = $3, floors_total = $4, next_milestone = $5
           WHERE id = $6`,
          [
            update.rows[0].stage,
            update.rows[0].progress,
            update.rows[0].floor_number,
            update.rows[0].floors_total,
            update.rows[0].stage,
            update.rows[0].project_id,
          ]
        );
      }
      await postgresClient.query('COMMIT');
      return update.rows[0];
    } catch (error) {
      await postgresClient.query('ROLLBACK');
      throw error;
    }
  }

  return new Promise((resolve, reject) => {
    sqliteDb.serialize(() => {
      sqliteDb.run('BEGIN IMMEDIATE');
      sqliteDb.run(
        'UPDATE progress_updates SET status = ?, feedback = ? WHERE id = ?',
        [status, feedback || '', id],
        function (updateError) {
          if (updateError) {
            sqliteDb.run('ROLLBACK');
            reject(updateError);
            return;
          }
          if (this.changes === 0) {
            sqliteDb.run('ROLLBACK', () => resolve(null));
            return;
          }
          sqliteDb.get('SELECT * FROM progress_updates WHERE id = ?', [id], (readError, update) => {
            if (readError) {
              sqliteDb.run('ROLLBACK');
              reject(readError);
              return;
            }
            const finish = () => sqliteDb.run('COMMIT', (commitError) => {
              if (commitError) return reject(commitError);
              resolve(update);
            });
            if (status !== 'Approved') {
              finish();
              return;
            }
            sqliteDb.run(
              `UPDATE projects SET stage = ?, progress = ?, updated = date('now'),
                 floor_number = ?, floors_total = ?, next_milestone = ?
               WHERE id = ?`,
              [
                update.stage,
                update.progress,
                update.floor_number,
                update.floors_total,
                update.stage,
                update.project_id,
              ],
              (projectError) => {
                if (projectError) {
                  sqliteDb.run('ROLLBACK');
                  reject(projectError);
                  return;
                }
                finish();
              }
            );
          });
        }
      );
    });
  });
}

async function createUpload(data) {
  return workflowInsert(
    `INSERT INTO uploads
      (project_id, progress_update_id, uploaded_by_role, uploaded_by_mobile, category, file_name, stored_name, mime_type, file_size, latitude, longitude, geotag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.projectId,
      data.progressUpdateId || null,
      data.uploadedByRole,
      data.uploadedByMobile,
      data.category,
      data.fileName,
      data.storedName,
      data.mimeType,
      data.fileSize,
      data.latitude || null,
      data.longitude || null,
      data.geotag || '',
    ]
  );
}

async function attachPendingUploads(projectId, contractorMobile, progressUpdateId) {
  return workflowRun(
    `UPDATE uploads SET progress_update_id = ?
     WHERE project_id = ? AND uploaded_by_mobile = ? AND progress_update_id IS NULL`,
    [progressUpdateId, projectId, contractorMobile]
  );
}

async function getUploads(projectId, { publicOnly = false } = {}) {
  const publicClause = publicOnly
    ? `AND category IN ('photo', 'video')
       AND progress_update_id IN
         (SELECT id FROM progress_updates WHERE status = 'Approved')`
    : '';
  return workflowAll(
    `SELECT * FROM uploads WHERE project_id = ? ${publicClause} ORDER BY created_at DESC, id DESC`,
    [projectId]
  );
}

async function getUpload(id) {
  const rows = await workflowAll('SELECT * FROM uploads WHERE id = ?', [id]);
  return rows[0] || null;
}

async function createComplaint(data) {
  return workflowInsert(
    'INSERT INTO complaints (project_id, resident_mobile, unit, issue) VALUES (?, ?, ?, ?)',
    [data.projectId, data.residentMobile, data.unit || '', data.issue]
  );
}

async function getComplaints({ residentMobile } = {}) {
  const sql = `
    SELECT c.*,
           COALESCE(r.name, c.resident_mobile) AS resident_name,
           p.name AS project_name
    FROM complaints c
    LEFT JOIN role_accounts r ON r.mobile = c.resident_mobile AND r.role = 'resident'
    LEFT JOIN projects p ON p.id = c.project_id
    \${residentMobile ? 'WHERE c.resident_mobile = ?' : ''}
    ORDER BY c.created_at DESC, c.id DESC
  `;
  if (residentMobile) {
    return workflowAll('SELECT c.*, COALESCE(r.name, c.resident_mobile) AS resident_name, p.name AS project_name FROM complaints c LEFT JOIN role_accounts r ON r.mobile = c.resident_mobile AND r.role = \'resident\' LEFT JOIN projects p ON p.id = c.project_id WHERE c.resident_mobile = ? ORDER BY c.created_at DESC, c.id DESC', [residentMobile]);
  }
  return workflowAll('SELECT c.*, COALESCE(r.name, c.resident_mobile) AS resident_name, p.name AS project_name FROM complaints c LEFT JOIN role_accounts r ON r.mobile = c.resident_mobile AND r.role = \'resident\' LEFT JOIN projects p ON p.id = c.project_id ORDER BY c.created_at DESC, c.id DESC');
}

async function getComplaint(id) {
  const rows = await workflowAll('SELECT * FROM complaints WHERE id = ?', [id]);
  return rows[0] || null;
}

async function updateComplaint(id, status, response) {
  return workflowRun(
    'UPDATE complaints SET status = ?, response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, response || '', id]
  );
}

async function getNotifications(role, mobile) {
  return workflowAll(
    `SELECT * FROM notifications
     WHERE audience_role = ? AND (recipient_mobile = '' OR recipient_mobile = ?)
     ORDER BY created_at DESC, id DESC`,
    [role, mobile]
  );
}

async function createNotification(data) {
  return workflowInsert(
    `INSERT INTO notifications
      (audience_role, recipient_mobile, project_id, title, message, report_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.audienceRole,
      data.recipientMobile || '',
      data.projectId || '',
      data.title,
      data.message,
      data.reportId || null,
    ]
  );
}

async function getReports() {
  return workflowAll('SELECT id, scope, target, project_id, ward, created_by, created_at FROM reports ORDER BY id DESC');
}

async function createReport(data) {
  return workflowInsert(
    `INSERT INTO reports (scope, target, project_id, ward, content, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.scope, data.target, data.projectId || '', data.ward || '', data.content, data.createdBy]
  );
}

async function getReport(id) {
  const rows = await workflowAll('SELECT * FROM reports WHERE id = ?', [id]);
  return rows[0] || null;
}

async function createNotice(data) {
  return workflowInsert(
    'INSERT INTO notices (project_id, title, message, report_id) VALUES (?, ?, ?, ?)',
    [data.projectId, data.title, data.message, data.reportId]
  );
}

async function getNotices(mobile) {
  return workflowAll(
    `SELECT n.*, r.scope, r.target
     FROM notices n JOIN reports r ON r.id = n.report_id
     JOIN project_assignments a ON a.project_id = n.project_id
     WHERE a.role = 'resident' AND a.mobile = ?
     ORDER BY n.created_at DESC, n.id DESC`,
    [mobile]
  );
}

async function getNotice(id) {
  const rows = await workflowAll('SELECT * FROM notices WHERE id = ?', [id]);
  return rows[0] || null;
}

module.exports = {
  db: sqliteDb,
  initDatabase,
  insertResident,
  insertContractor,
  getResidents,
  getContractors,
  logVerification,
  updateVerificationStatus,
  getDatabaseMode,
  getPostgresClient,
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
  updateProjectContractor,
  hashPassword,
};
