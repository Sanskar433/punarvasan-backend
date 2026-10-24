const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const db = new sqlite3.Database('punarvasan.db');

function hashPassword(password) {
  const salt = 'punarvasan_salt_2026';
  return crypto.pbkdf2Sync(String(password), salt, 1000, 32, 'sha256').toString('hex');
}

const defaultHash = hashPassword('123456');

db.serialize(() => {
  // Ensure column exists
  db.run('ALTER TABLE role_accounts ADD COLUMN password_hash TEXT', () => {});

  // Add accounts for all roles with default password '123456'
  db.run(`INSERT OR REPLACE INTO role_accounts (role, mobile, name, password_hash) VALUES ('resident', '8828390911', 'Sanskar', ?)`, [defaultHash]);
  db.run(`INSERT OR REPLACE INTO role_accounts (role, mobile, name, password_hash) VALUES ('contractor', '8828390911', 'Sanskar', ?)`, [defaultHash]);
  db.run(`INSERT OR REPLACE INTO role_accounts (role, mobile, name, password_hash) VALUES ('government', '8828390911', 'Sanskar', ?)`, [defaultHash]);


  // Assign projects so dashboard shows data
  db.run(`INSERT OR REPLACE INTO project_assignments (role, mobile, project_id, unit) VALUES ('resident', '8828390911', 'PUN-23-101', 'Wing B, Flat 402 · SRA Allotment #SRA-BE-8821')`);
  db.run(`INSERT OR REPLACE INTO project_assignments (role, mobile, project_id, unit) VALUES ('contractor', '8828390911', 'PUN-23-101', '')`);

  console.log('✅ Accounts updated with password support! Password for all accounts is: 123456');
  db.close();
});
