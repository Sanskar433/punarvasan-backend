import React, { useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const GREEN = "#16794B";
const DARK = "#17332A";
const MUTED = "#718078";
const BG = "#F4F7F4";
const STAGES = [
  "Survey & Eligibility Confirmed",
  "Demolition / Site Cleared",
  "Foundation Complete",
  "Structure — Floor-wise (shows floor number out of total)",
  "Plumbing, Electrical & Finishing",
  "Possession Ready / Handover",
];
const ROLES = [
  { id: "resident", title: "Resident", mobile: "9000000001" },
  { id: "contractor", title: "Contractor", mobile: "9000000002" },
  { id: "government", title: "Government / SRA Officer", mobile: "9000000003" },
];
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://localhost:3001");

const I18N = {
  en: {
    brandSubtitle: "Real-Time Slum Redevelopment Progress App",
    resident: "Resident",
    contractor: "Contractor",
    government: "Government / SRA Officer",
    residentDashboard: "Resident Dashboard",
    contractorDashboard: "Contractor Dashboard",
    govDashboard: "Government Dashboard",
    viewStatus: "A. View Project Status · View Photos & Videos",
    viewProgress: "B. Construction Progress · View Timeline (% Complete)",
    govNotices: "C. Government Notices · Download Documents",
    anyIssue: "Any Issue?",
    raiseComplaint: "Raise Complaint",
    trackComplaint: "Track Complaint Status",
    notifications: "Notifications",
    logout: "Logout",
    mandatoryProof: "📸 Geotagged photo proof mandatory for Stage 2+",
  },
  mr: {
    brandSubtitle: "झोपडपट्टी पुनर्विकास प्रगती ट्रॅकर",
    resident: "रहिवासी (Resident)",
    contractor: "कंत्राटदार (Contractor)",
    government: "शासकीय / एसआरए अधिकारी",
    residentDashboard: "रहिवासी डॅशबोर्ड",
    contractorDashboard: "कंत्राटदार डॅशबोर्ड",
    govDashboard: "शासकीय डॅशबोर्ड",
    viewStatus: "अ. प्रकल्पाची स्थिती · फोटो व व्हिडिओ पाहा",
    viewProgress: "ब. बांधकाम प्रगती · टाइमलाइन पाहा (% पूर्ण)",
    govNotices: "क. शासकीय सूचना · दस्तऐवज डाउनलोड करा",
    anyIssue: "काही अडचण?",
    raiseComplaint: "तक्रार नोंदवा",
    trackComplaint: "तक्रार स्थिती मागोवा घ्या",
    notifications: "सूचना",
    logout: "लॉगआउट",
    mandatoryProof: "📸 टप्पा २+ साठी जिओटॅग केलेला फोटो पुरावा अनिवार्य आहे",
  },
  hi: {
    brandSubtitle: "झुग्गी पुनर्विकास प्रगति ट्रैकर",
    resident: "निवासी (Resident)",
    contractor: "ठेकेदार (Contractor)",
    government: "सरकारी / एसआरए अधिकारी",
    residentDashboard: "निवासी डैशबोर्ड",
    contractorDashboard: "ठेकेदार डैशबोर्ड",
    govDashboard: "सरकारी डैशबोर्ड",
    viewStatus: "क. परियोजना स्थिति · फोटो और वीडियो देखें",
    viewProgress: "ख. निर्माण प्रगति · टाइमलाइन देखें (% पूर्ण)",
    govNotices: "ग. सरकारी सूचनाएं · दस्तावेज डाउनलोड करें",
    anyIssue: "कोई समस्या?",
    raiseComplaint: "शिकायत दर्ज करें",
    trackComplaint: "शिकायत स्थिति ट्रैक करें",
    notifications: "सूचनाएं",
    logout: "लॉगआउट",
    mandatoryProof: "📸 चरण २+ के लिए जियोटैग्ड फोटो प्रमाण अनिवार्य है",
  },
};

async function apiRequest(path, session, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

async function saveProtectedFile(path, session, fileName, open = false) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Download failed (${response.status}).`);
  }

  if (Platform.OS === "web") {
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.target = open ? "_blank" : "_self";
    link.rel = "noopener noreferrer";
    if (!open) link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const safeName = fileName.replace(/[^\w.-]/g, "_");
  const file = new File(Paths.document, `${Date.now()}-${safeName}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(await response.arrayBuffer()));
  await Sharing.shareAsync(file.uri);
}

async function uploadProjectFile(session, projectId, category, customMeta = {}) {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  let fileBody;
  if (Platform.OS === "web") {
    if (asset.file) {
      fileBody = asset.file;
    } else {
      const source = await fetch(asset.uri);
      if (!source.ok) throw new Error("Could not read the selected file.");
      fileBody = await source.blob();
    }
  } else {
    fileBody = new File(asset.uri);
  }

  const headers = {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": asset.mimeType || "application/octet-stream",
    "X-Project-Id": projectId,
    "X-File-Category": category,
    "X-File-Name": encodeURIComponent(asset.name || "uploaded-file"),
    "X-Geotag": encodeURIComponent(customMeta.geotag || "Bandra East Site · Lat 19.0607, Lon 72.8525"),
    "X-Latitude": String(customMeta.latitude || 19.0607),
    "X-Longitude": String(customMeta.longitude || 72.8525),
  };

  const response = await expoFetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    headers,
    body: fileBody,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Upload failed (${response.status}).`);
  return data.upload;
}

function Button({ children, onPress, kind = "primary", disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === "secondary" && styles.secondaryButton,
        kind === "danger" && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, kind === "secondary" && styles.secondaryButtonText]}>
        {children}
      </Text>
    </Pressable>
  );
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="sentences"
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#87938C"
        style={[styles.field, multiline && styles.multilineField]}
        value={value}
      />
    </View>
  );
}

function Chips({ label, items, value, onChange }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {items.map((item) => {
          const itemValue = typeof item === "string" ? item : item.value;
          const itemLabel = typeof item === "string" ? item : item.label;
          const selected = itemValue === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={itemValue}
              onPress={() => onChange(itemValue)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{itemLabel}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PageTitle({ eyebrow, title, description }) {
  return (
    <View style={styles.pageTitle}>
      {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
      <Text style={styles.title}>{title}</Text>
      {!!description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

function Notice({ children, kind = "info" }) {
  return (
    <View style={[styles.notice, kind === "error" && styles.errorNotice, kind === "success" && styles.successNotice]}>
      <Text style={[styles.noticeText, kind === "error" && styles.errorText]}>{children}</Text>
    </View>
  );
}

function ProjectSummary({ project, unit }) {
  const isDelayed = Boolean(project.is_delayed || (project.days_inactive && project.days_inactive >= 30));
  const displayUnit = unit || project.unit;
  return (
    <Card style={isDelayed ? styles.delayedCard : null}>
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.cardTitle, styles.flex]}>{project.name}</Text>
        {project.scheme_type ? (
          <View style={styles.schemeBadge}>
            <Text style={styles.schemeBadgeText}>{project.scheme_type}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.muted}>
        {project.id} · {project.ward}{displayUnit ? ` · ${displayUnit}` : ""}
      </Text>
      {isDelayed ? (
        <View style={styles.delayBadgeContainer}>
          <Text style={styles.delayBadgeText}>
            ⚠️ Delayed · {project.days_inactive ? `${project.days_inactive} days inactive` : "No milestone update for 30+ days"}
          </Text>
        </View>
      ) : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Number(project.progress) || 0}%` }]} />
      </View>
      <Text style={styles.bodyText}>{project.progress}% complete · {project.stage}</Text>
      <Text style={styles.muted}>Contractor: {project.contractor} · Last update: {project.updated}</Text>
    </Card>
  );
}

function ProjectChips({ projects, projectId, onChange }) {
  return (
    <Chips
      label="Project"
      items={projects.map((project) => ({ value: project.id, label: project.id }))}
      value={projectId}
      onChange={onChange}
    />
  );
}

function FileList({ files, session, emptyText = "No files are available yet." }) {
  const [error, setError] = useState("");
  if (!files.length) return <Text style={styles.muted}>{emptyText}</Text>;
  return (
    <>
      {files.map((file) => (
        <View key={file.id} style={styles.listRow}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{file.file_name}</Text>
            <Text style={styles.muted}>
              {file.category} · {file.mime_type} · {new Date(file.created_at).toLocaleString()}
            </Text>
            {file.geotag ? (
              <Text style={styles.geotagBadge}>📍 {file.geotag}</Text>
            ) : null}
          </View>
          <Button
            kind="secondary"
            onPress={() => saveProtectedFile(`/api/uploads/${file.id}/download`, session, file.file_name, true).catch((openError) => setError(openError.message))}
          >
            View
          </Button>
        </View>
      ))}
      {error ? <Notice kind="error">{error}</Notice> : null}
    </>
  );
}

function Notifications({ notifications }) {
  if (!notifications.length) return <Text style={styles.muted}>No in-app notifications yet.</Text>;
  return notifications.map((item) => (
    <View key={item.id} style={styles.listItem}>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.bodyText}>{item.message}</Text>
      <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
    </View>
  ));
}

export default function WorkflowApp() {
  const [role, setRole] = useState(null);
  const [loginStage, setLoginStage] = useState("role");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState("en");
  const t = (key) => I18N[lang]?.[key] || I18N.en[key] || key;

  const requestOtp = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/request-otp", null, {
        method: "POST",
        body: { role: role.id, mobile: mobile.trim() },
      });
      setOtp("");
      setLoginStage("otp");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await apiRequest("/api/auth/verify-otp", null, {
        method: "POST",
        body: { role: role.id, mobile: mobile.trim(), code: otp.trim() },
      });
      setSession({ ...data.user, token: data.token });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/logout", session, { method: "POST" });
      setSession(null);
      setRole(null);
      setLoginStage("role");
      setMobile("");
      setOtp("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <View style={styles.header}>
        <View style={styles.logo}><Text style={styles.logoText}>P</Text></View>
        <View style={styles.flex}>
          <Text style={styles.brand}>Punarvasan Tracker</Text>
          <Text style={styles.headerSubtitle}>{t("brandSubtitle")}</Text>
        </View>
        <View style={styles.langSelector}>
          {["en", "mr", "hi"].map((l) => (
            <Pressable
              key={l}
              accessibilityRole="button"
              accessibilityLabel={`Select ${l === "en" ? "English" : l === "mr" ? "Marathi" : "Hindi"}`}
              onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnActive]}
            >
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextActive]}>
                {l === "en" ? "EN" : l === "mr" ? "मराठी" : "हिंदी"}
              </Text>
            </Pressable>
          ))}
        </View>
        {session && <Text style={styles.roleTag}>{session.name}</Text>}
      </View>

      {session ? (
        <RoleWorkflow key={session.token} session={session} onLogout={logout} lang={lang} t={t} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {loginStage === "role" ? (
            <>
              <PageTitle
                eyebrow="SYSTEM"
                title="Choose your role"
                description="Sign in to the resident, contractor, or Government / SRA Officer workflow."
              />
              {ROLES.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setRole(item);
                    setMobile("");
                    setError("");
                    setLoginStage("mobile");
                  }}
                  style={({ pressed }) => [styles.roleCard, pressed && styles.pressed]}
                >
                  <Text style={styles.cardTitle}>{item.title}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <PageTitle
                eyebrow={role?.title.toUpperCase()}
                title={loginStage === "mobile" ? `${role?.title} Login` : "Enter OTP"}
                description={
                  loginStage === "mobile"
                    ? "Enter your mobile number to receive a verification code."
                    : "Enter the one-time code sent to your mobile number."
                }
              />
              {loginStage === "mobile" ? (
                <>
                  <Field label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="10-digit number or +91 number" />
                  <Button disabled={busy || !mobile.trim()} onPress={requestOtp}>
                    {busy ? "Requesting…" : "Request OTP"}
                  </Button>
                </>
              ) : (
                <>
                  <Notice kind="success">A verification code was sent to your mobile number.</Notice>
                  <Field label="One-time password" value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholder="Enter the 6-digit code" />
                  <Button disabled={busy || !otp.trim()} onPress={verifyOtp}>
                    {busy ? "Verifying…" : "Verify OTP"}
                  </Button>
                </>
              )}
              <Button
                kind="secondary"
                onPress={() => {
                  setLoginStage("role");
                  setOtp("");
                  setError("");
                }}
              >
                Back to roles
              </Button>
            </>
          )}
          {error ? <Notice kind="error">{error}</Notice> : null}
        </ScrollView>
      )}
      {busy && <ActivityIndicator color={GREEN} style={styles.loader} />}
    </SafeAreaView>
  );
}

function RoleWorkflow({ session, onLogout, lang, t = (k) => k }) {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadProjects = async () => {
    try {
      const data = await apiRequest("/api/projects", session);
      setProjects(data.projects);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  React.useEffect(() => { loadProjects(); }, [session.token]);

  const runAction = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await loadProjects();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const getDashboardTitle = () => {
    if (session.role === "government") return t("govDashboard");
    if (session.role === "contractor") return t("contractorDashboard");
    return t("residentDashboard");
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.roleHeading}>
          <PageTitle
            eyebrow={session.role === "government" ? "GOVERNMENT / SRA OFFICER" : session.role.toUpperCase()}
            title={getDashboardTitle()}
            description={`Signed in as ${session.name} · ${session.mobile}`}
          />
          <Button kind="secondary" disabled={busy} onPress={onLogout}>{t("logout")}</Button>
        </View>
        {error ? <Notice kind="error">{error}</Notice> : null}
        {busy ? <ActivityIndicator color={GREEN} /> : null}
        {session.role === "resident" ? (
          <ResidentWorkflow session={session} projects={projects} runAction={runAction} onLogout={onLogout} lang={lang} t={t} />
        ) : session.role === "contractor" ? (
          <ContractorWorkflow session={session} projects={projects} runAction={runAction} onLogout={onLogout} lang={lang} t={t} />
        ) : (
          <GovernmentWorkflow session={session} projects={projects} runAction={runAction} onLogout={onLogout} lang={lang} t={t} />
        )}
      </ScrollView>
    </View>
  );
}

function ResidentWorkflow({ session, projects, runAction, onLogout, lang, t = (k) => k }) {
  const [branch, setBranch] = useState("dashboard");
  const [projectId, setProjectId] = useState("");
  const [updates, setUpdates] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [notices, setNotices] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [issue, setIssue] = useState("");
  const [success, setSuccess] = useState("");
  const project = projects.find((item) => item.id === (projectId || projects[0]?.id));

  const refresh = async (selectedProjectId = project?.id) => {
    const [noticeData, complaintData, notificationData] = await Promise.all([
      apiRequest("/api/notices", session),
      apiRequest("/api/complaints", session),
      apiRequest("/api/notifications", session),
    ]);
    setNotices(noticeData.notices);
    setComplaints(complaintData.complaints);
    setNotifications(notificationData.notifications);
    if (selectedProjectId) {
      const [progressData, uploadData] = await Promise.all([
        apiRequest(`/api/projects/${encodeURIComponent(selectedProjectId)}/progress`, session),
        apiRequest(`/api/projects/${encodeURIComponent(selectedProjectId)}/uploads`, session),
      ]);
      setUpdates(progressData.updates);
      setUploads(uploadData.uploads);
    }
  };

  React.useEffect(() => {
    refresh().then(() => setLoadError("")).catch((loadRequestError) => setLoadError(loadRequestError.message));
  }, [session.token, project?.id]);

  const submitComplaint = () => runAction(async () => {
    if (!project || !issue.trim()) throw new Error("Choose your linked project and describe the issue.");
    await apiRequest("/api/complaints", session, {
      method: "POST",
      body: { projectId: project.id, issue },
    });
    await refresh(project.id);
    setIssue("");
    setSuccess("Complaint Submitted. Track its status below; Government responses appear in your in-app notifications.");
    setBranch("track");
  });

  const selectBranch = (next) => {
    setSuccess("");
    setBranch(next);
    refresh().then(() => setLoadError("")).catch((loadRequestError) => setLoadError(loadRequestError.message));
  };

  if (!projects.length) {
    return <Notice>{`No project is linked to ${session.mobile}. The local pilot resident is linked to project PUN-23-101.`}</Notice>;
  }

  if (branch === "dashboard") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <PageTitle title={t("residentDashboard")} description="Your assigned redevelopment project and its current status." />
        {projects.length > 1 && <ProjectChips projects={projects} projectId={project?.id} onChange={setProjectId} />}
        {project && <ProjectSummary project={project} unit={project.unit} />}
        <Card>
          <Text style={styles.sectionTitle}>{t("viewStatus")}</Text>
          <Text style={styles.muted}>Project stage, approved photos and videos.</Text>
          <Button kind="secondary" onPress={() => selectBranch("status")}>View Project Status · View Photos & Videos</Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>{t("viewProgress")}</Text>
          <Text style={styles.muted}>Six-stage timeline and percentage complete.</Text>
          <Button kind="secondary" onPress={() => selectBranch("progress")}>View Construction Progress · View Timeline (% Complete)</Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>{t("govNotices")}</Text>
          <Text style={styles.muted}>Government notices and downloadable documents.</Text>
          <Button kind="secondary" onPress={() => selectBranch("notices")}>View Government Notices · Download Documents</Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>{t("anyIssue")}</Text>
          <View style={styles.buttonRow}>
            <Button kind="secondary" onPress={() => { setSuccess(""); setBranch("dashboard"); setSuccess("No → Continue Using App"); }}>No</Button>
            <Button onPress={() => { setIssue(""); setSuccess(""); setBranch("complaint"); }}>Yes</Button>
          </View>
          {success ? <Notice kind="success">{success}</Notice> : null}
        </Card>
        <Button kind="secondary" onPress={onLogout}>{t("logout")} · End</Button>
      </>
    );
  }

  if (branch === "status") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Resident Dashboard</Button>
        <PageTitle title="View Project Status" description="Current public project status and evidence approved by Government." />
        {project && <ProjectSummary project={project} unit={project.unit} />}
        <Card>
          <Text style={styles.sectionTitle}>View Photos & Videos</Text>
          <FileList files={uploads} session={session} emptyText="No approved project photos or videos are available yet." />
        </Card>
      </>
    );
  }

  if (branch === "progress") {
    const currentStage = STAGES.indexOf(project?.stage);
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Resident Dashboard</Button>
        <PageTitle title="View Construction Progress" description={`View Timeline (${project?.progress ?? 0}% Complete)`} />
        {project && <ProjectSummary project={project} unit={project.unit} />}
        <Card>
          {STAGES.map((stage, index) => (
            <View key={stage} style={styles.timelineItem}>
              <Text style={[styles.timelineMark, index <= currentStage && styles.timelineMarkActive]}>{index < currentStage ? "✓" : index + 1}</Text>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{stage}</Text>
                <Text style={styles.muted}>{index < currentStage ? "Completed" : index === currentStage ? `${project?.progress ?? 0}% complete · Current stage` : "Upcoming"}</Text>
              </View>
            </View>
          ))}
        </Card>
        {updates.map((update) => (
          <Card key={update.id}>
            <Text style={styles.cardTitle}>{update.stage} · {update.progress}%</Text>
            <Text style={styles.muted}>{update.status} · {new Date(update.created_at).toLocaleString()}</Text>
            <Text style={styles.bodyText}>{update.notes || update.work_done}</Text>
          </Card>
        ))}
      </>
    );
  }

  if (branch === "notices") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Resident Dashboard</Button>
        <PageTitle title="Government Notices" description="In-app Government notices with downloadable project/ward reports." />
        {notices.length ? notices.map((notice) => (
          <Card key={notice.id}>
            <Text style={styles.cardTitle}>{notice.title}</Text>
            <Text style={styles.bodyText}>{notice.message}</Text>
            <Text style={styles.muted}>{notice.target} · {new Date(notice.created_at).toLocaleString()}</Text>
            <Button kind="secondary" onPress={() => runAction(() => saveProtectedFile(`/api/notices/${notice.id}/download`, session, `government-report-${notice.report_id}.csv`))}>
              Download Documents · CSV report
            </Button>
          </Card>
        )) : <Notice>No Government notices have been issued to your project yet.</Notice>}
      </>
    );
  }

  if (branch === "complaint") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Resident Dashboard</Button>
        <PageTitle title="Raise Complaint" description="Submit an issue linked to your assigned project and unit." />
        {project && <ProjectSummary project={project} unit={project.unit} />}
        <Field label="Issue" value={issue} onChangeText={setIssue} placeholder="Describe the issue" multiline />
        <Button disabled={!issue.trim()} onPress={submitComplaint}>Raise Complaint</Button>
        {success ? <Notice kind="success">{success}</Notice> : null}
      </>
    );
  }

  return (
    <>
      {loadError ? <Notice kind="error">{loadError}</Notice> : null}
      <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Resident Dashboard</Button>
      <PageTitle title="Track Complaint Status" description="Complaint Submitted → Track Complaint Status → Receive Notifications." />
      {success ? <Notice kind="success">{success}</Notice> : null}
      {complaints.length ? complaints.map((complaint) => (
        <Card key={complaint.id}>
          <Text style={styles.cardTitle}>Complaint {complaint.id} · {complaint.status}</Text>
          <Text style={styles.bodyText}>{complaint.issue}</Text>
          <Text style={styles.muted}>{complaint.project_id} · {complaint.unit} · {new Date(complaint.created_at).toLocaleString()}</Text>
          {complaint.response ? <Text style={styles.bodyText}>Government response: {complaint.response}</Text> : null}
        </Card>
      )) : <Notice>No complaints have been submitted for this account.</Notice>}
      <Card>
        <Text style={styles.sectionTitle}>Receive Notifications</Text>
        <Notifications notifications={notifications} />
      </Card>
      <Button kind="secondary" onPress={onLogout}>Logout · End</Button>
    </>
  );
}

function ContractorWorkflow({ session, projects, runAction, onLogout, lang, t = (k) => k }) {
  const [branch, setBranch] = useState("dashboard");
  const [projectId, setProjectId] = useState("");
  const [step, setStep] = useState(1);
  const [dailyReport, setDailyReport] = useState(null);
  const [dailyReports, setDailyReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [material, setMaterial] = useState("");
  const [labour, setLabour] = useState("");
  const [workDone, setWorkDone] = useState("");
  const [stage, setStage] = useState(STAGES[0]);
  const [progress, setProgress] = useState("0");
  const [floorNumber, setFloorNumber] = useState("");
  const [floorsTotal, setFloorsTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [resolutions, setResolutions] = useState({});
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const project = projects.find((item) => item.id === (projectId || projects[0]?.id));
  const rejected = updates.filter((item) => item.status === "Rejected");
  const uploadedCategories = new Set(uploads.map((item) => item.category));

  const refresh = async () => {
    const [reportData, notificationData] = await Promise.all([
      apiRequest("/api/daily-reports", session),
      apiRequest("/api/notifications", session),
    ]);
    setDailyReports(reportData.reports);
    setNotifications(notificationData.notifications);
    if (project) {
      const [uploadData, updateData] = await Promise.all([
        apiRequest(`/api/projects/${encodeURIComponent(project.id)}/uploads`, session),
        apiRequest(`/api/projects/${encodeURIComponent(project.id)}/progress`, session),
      ]);
      setUploads(uploadData.uploads);
      setUpdates(updateData.updates);
    }
  };
  React.useEffect(() => {
    refresh().then(() => setLoadError("")).catch((loadRequestError) => setLoadError(loadRequestError.message));
  }, [session.token, project?.id]);

  const upload = (category) => runAction(async () => {
    if (!project) throw new Error("Select an assigned project first.");
    const uploaded = await uploadProjectFile(session, project.id, category);
    if (!uploaded) return;
    await refresh();
    setMessage(`${uploaded.file_name} was uploaded to the local backend.`);
  });

  const submitDailyReport = () => runAction(async () => {
    if (!project || !material.trim() || !labour.trim() || !workDone.trim()) {
      throw new Error("Enter material, labour, and work done for the daily report.");
    }
    const data = await apiRequest("/api/daily-reports", session, {
      method: "POST",
      body: { projectId: project.id, material, labour, workDone },
    });
    setDailyReport(data.report);
    await refresh();
    setStep(2);
    setMessage("Daily Report saved in the project database.");
  });

  const reviewFeedback = () => runAction(async () => {
    await refresh();
    setStep(4);
  });

  const saveResolution = (update) => runAction(async () => {
    const resolution = String(resolutions[update.id] || "").trim();
    if (!resolution) throw new Error("Describe how the returned issue was resolved.");
    await apiRequest(`/api/progress/${update.id}/resolve`, session, {
      method: "POST",
      body: { resolution },
    });
    await refresh();
    setResolutions((current) => ({ ...current, [`saved-${update.id}`]: true }));
  });

  const submitProgress = () => runAction(async () => {
    if (!project || !dailyReport) throw new Error("Complete the daily report first.");
    const body = {
      projectId: project.id,
      dailyReportId: dailyReport.id,
      stage,
      progress: Number(progress),
      floorNumber: floorNumber ? Number(floorNumber) : null,
      floorsTotal: floorsTotal ? Number(floorsTotal) : null,
      material: dailyReport.material,
      labour: dailyReport.labour,
      workDone: dailyReport.work_done,
      notes,
    };
    await apiRequest("/api/progress", session, { method: "POST", body });
    await refresh();
    setStep(6);
    setMessage("Updated progress submitted to Government for evidence review.");
  });

  if (!projects.length) return <Notice>No projects are assigned to this contractor account.</Notice>;

  if (branch === "assigned") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Contractor Dashboard</Button>
        <PageTitle title="Assigned Projects" />
        {projects.map((item) => <ProjectSummary key={item.id} project={item} />)}
      </>
    );
  }
  if (branch === "progress") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Contractor Dashboard</Button>
        <PageTitle title="Update Stage Progress" description="Current stage and submitted progress for your assigned project." />
        <ProjectChips projects={projects} projectId={project?.id} onChange={setProjectId} />
        {project && <ProjectSummary project={project} />}
        {updates.map((item) => <Card key={item.id}><Text style={styles.cardTitle}>{item.stage} · {item.progress}% · {item.status}</Text><Text style={styles.muted}>{item.feedback}</Text></Card>)}
      </>
    );
  }
  if (branch === "media") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Contractor Dashboard</Button>
        <PageTitle title="Upload Photos & Videos" description="Selected files are stored on this local backend with their category and upload timestamp." />
        <ProjectChips projects={projects} projectId={project?.id} onChange={setProjectId} />
        <View style={styles.buttonRow}>
          <Button onPress={() => upload("photo")}>Upload Photo</Button>
          <Button onPress={() => upload("video")}>Upload Video</Button>
        </View>
        {message ? <Notice kind="success">{message}</Notice> : null}
        <Card><FileList files={uploads.filter((file) => ["photo", "video"].includes(file.category))} session={session} /></Card>
      </>
    );
  }

  if (branch === "dashboard") {
    return (
      <>
        {loadError ? <Notice kind="error">{loadError}</Notice> : null}
        <Card>
          <Text style={styles.sectionTitle}>Contractor Dashboard</Text>
          <ProjectChips projects={projects} projectId={project?.id} onChange={setProjectId} />
          {project && <ProjectSummary project={project} />}
          <Button kind="secondary" onPress={() => setBranch("assigned")}>Assigned Projects</Button>
          <Button kind="secondary" onPress={() => setBranch("progress")}>Update Stage Progress</Button>
          <Button kind="secondary" onPress={() => setBranch("media")}>Upload Photos & Videos</Button>
        </Card>
        <PageTitle title="Contractor Workflow" description="Complete each step in order after the dashboard branches." />
        <Card>
          <Text style={styles.sectionTitle}>1. Upload Daily Report (Material, Labour, Work Done)</Text>
          <Field label="Material" value={material} onChangeText={setMaterial} placeholder="Material used" />
          <Field label="Labour" value={labour} onChangeText={setLabour} placeholder="Labour on site" />
          <Field label="Work done" value={workDone} onChangeText={setWorkDone} placeholder="Work completed today" multiline />
          <Button disabled={step !== 1} onPress={submitDailyReport}>
            {dailyReport ? "Daily report saved · Continue" : "Save Daily Report"}
          </Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>2. Upload Documents (Quality Reports, Safety Reports)</Text>
          <Button kind="secondary" disabled={step < 2} onPress={() => upload("quality-report")}>Upload Quality Report</Button>
          <Button kind="secondary" disabled={step < 2} onPress={() => upload("safety-report")}>Upload Safety Report</Button>
          <Text style={styles.muted}>
            Quality: {uploadedCategories.has("quality-report") ? "uploaded" : "not uploaded"} · Safety: {uploadedCategories.has("safety-report") ? "uploaded" : "not uploaded"}
          </Text>
          <Button
            disabled={step !== 2 || !uploadedCategories.has("quality-report") || !uploadedCategories.has("safety-report")}
            onPress={() => setStep(3)}
          >
            Continue to Government Feedback
          </Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>3. Receive Govt Feedback</Text>
          <Notifications notifications={notifications} />
          <Button kind="secondary" disabled={step !== 3} onPress={reviewFeedback}>View Feedback · Continue</Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>4. Resolve Issues</Text>
          {rejected.length ? rejected.map((item) => (
            <View key={item.id} style={styles.listItem}>
              <Text style={styles.cardTitle}>Returned progress {item.id}: {item.feedback || "Government feedback received."}</Text>
              <Field
                label="Resolution"
                value={resolutions[item.id] || ""}
                onChangeText={(value) => setResolutions((current) => ({ ...current, [item.id]: value }))}
                placeholder="Describe the resolution"
                multiline
              />
              <Button disabled={step !== 4 || Boolean(resolutions[`saved-${item.id}`])} onPress={() => saveResolution(item)}>
                {resolutions[`saved-${item.id}`] ? "Resolution saved" : "Save resolution"}
              </Button>
            </View>
          )) : <Text style={styles.muted}>No rejected progress issues require resolution.</Text>}
          <Button
            kind="secondary"
            disabled={step !== 4 || rejected.some((item) => !resolutions[`saved-${item.id}`] && !item.resolution)}
            onPress={() => setStep(5)}
          >
            Continue to Updated Progress
          </Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>5. Submit Updated Progress</Text>
          <Chips label="Construction stage" items={STAGES} value={stage} onChange={setStage} />
          {stage !== STAGES[0] ? (
            <View style={styles.mandatoryNotice}>
              <Text style={styles.mandatoryNoticeText}>{t("mandatoryProof")}</Text>
            </View>
          ) : null}
          <Field label="Progress (%)" value={progress} onChangeText={setProgress} keyboardType="number-pad" placeholder="0-100" />
          {stage === STAGES[3] ? (
            <View style={styles.buttonRow}>
              <Field label="Current floor" value={floorNumber} onChangeText={setFloorNumber} keyboardType="number-pad" placeholder="Floor" />
              <Field label="Total floors" value={floorsTotal} onChangeText={setFloorsTotal} keyboardType="number-pad" placeholder="Total" />
            </View>
          ) : null}
          <Field label="Contractor note" value={notes} onChangeText={setNotes} placeholder="Optional note" multiline />
          <Button disabled={step !== 5 || !dailyReport} onPress={submitProgress}>Submit Updated Progress</Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>6. Residents Receive Updates</Text>
          <Text style={styles.muted}>Residents see approved progress and photos after the Government decision and in-app notification.</Text>
          {message ? <Notice kind="success">{message}</Notice> : null}
          <Notifications notifications={notifications} />
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>7. Logout · End</Text>
          <Button kind="secondary" disabled={step < 6} onPress={onLogout}>{t("logout")}</Button>
        </Card>
      </>
    );
  }

  return null;
}

function GovernmentWorkflow({ session, projects, runAction, onLogout, lang, t = (k) => k }) {
  const [branch, setBranch] = useState("dashboard");
  const [step, setStep] = useState(1);
  const [updates, setUpdates] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [scope, setScope] = useState("project");
  const [target, setTarget] = useState("");
  const [feedback, setFeedback] = useState({});
  const [complaintEdits, setComplaintEdits] = useState({});
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const selectedReport = reports.find((item) => String(item.id) === String(selectedReportId));

  const refresh = async () => {
    const [progressData, dailyData, complaintData, reportData] = await Promise.all([
      apiRequest("/api/government/progress", session),
      apiRequest("/api/daily-reports", session),
      apiRequest("/api/complaints", session),
      apiRequest("/api/reports", session),
    ]);
    setUpdates(progressData.updates);
    setDailyReports(dailyData.reports);
    setComplaints(complaintData.complaints);
    setReports(reportData.reports);
    const uploadResults = await Promise.all(projects.map(async (project) => {
      const data = await apiRequest(`/api/projects/${encodeURIComponent(project.id)}/uploads`, session);
      return data.uploads;
    }));
    setUploads(uploadResults.flat());
  };
  React.useEffect(() => { refresh().catch((requestError) => setError(requestError.message)); }, [session.token, projects.length]);

  const decision = (update, status) => runAction(async () => {
    await apiRequest(`/api/progress/${update.id}/decision`, session, {
      method: "POST",
      body: { status, feedback: feedback[update.id] || "" },
    });
    await refresh();
    setStep(3);
    setSuccess(`Progress ${status.toLowerCase()}. ${status === "Rejected" ? "Government feedback was sent to the contractor." : "Approved progress is now public."}`);
    setBranch("workflow");
  });

  const reviewComplaint = (complaint) => runAction(async () => {
    const edit = complaintEdits[complaint.id] || {};
    await apiRequest(`/api/complaints/${complaint.id}`, session, {
      method: "PATCH",
      body: { status: edit.status || complaint.status, response: edit.response || "" },
    });
    await refresh();
    setSuccess(`Complaint ${complaint.id} reviewed.`);
  });

  const generateReport = () => runAction(async () => {
    if (!target) throw new Error("Select a project or ward.");
    const data = await apiRequest("/api/reports", session, {
      method: "POST",
      body: { scope, target },
    });
    const nextReports = [data.report, ...reports];
    setReports(nextReports);
    setSelectedReportId(String(data.report.id));
    setNoticeTitle(`${scope === "project" ? "Project" : "Ward"} redevelopment progress notice`);
    setNoticeMessage(`The latest ${scope}-wise redevelopment progress report is available for ${target}.`);
    setStep(4);
    setSuccess("Report generated and saved. Continue to send in-app notifications.");
  });

  const sendNotifications = () => runAction(async () => {
    if (!selectedReport) throw new Error("Generate or choose a report first.");
    const data = await apiRequest("/api/notifications/send", session, {
      method: "POST",
      body: { reportId: selectedReport.id, title: noticeTitle, message: noticeMessage },
    });
    setStep(5);
    setSuccess(`In-app notices sent to assigned residents and contractors across ${data.projectsNotified} project(s). No SMS or push message was sent.`);
    await refresh();
  });

  if (branch === "monitor") {
    return (
      <>
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Government Dashboard</Button>
        <PageTitle title="Monitor Projects" description="Project progress in your Government jurisdiction." />
        {projects.map((project) => <ProjectSummary key={project.id} project={project} />)}
      </>
    );
  }
  if (branch === "complaints") {
    return (
      <>
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Government Dashboard</Button>
        <PageTitle title="Review Complaints" />
        {complaints.length ? complaints.map((complaint) => {
          const edit = complaintEdits[complaint.id] || {};
          return (
            <Card key={complaint.id}>
              <Text style={styles.cardTitle}>Complaint {complaint.id} · {complaint.status}</Text>
              <Text style={styles.bodyText}>{complaint.issue}</Text>
              <Text style={styles.muted}>{complaint.project_id} · {complaint.unit} · {complaint.resident_mobile}</Text>
              <Field label="Status" value={edit.status ?? complaint.status} onChangeText={(value) => setComplaintEdits((current) => ({ ...current, [complaint.id]: { ...current[complaint.id], status: value } }))} placeholder="Complaint status" />
              <Field label="Government response" value={edit.response ?? complaint.response} onChangeText={(value) => setComplaintEdits((current) => ({ ...current, [complaint.id]: { ...current[complaint.id], response: value } }))} placeholder="Response to resident" multiline />
              <Button onPress={() => reviewComplaint(complaint)}>Save Complaint Review</Button>
            </Card>
          );
        }) : <Notice>No complaints have been submitted.</Notice>}
      </>
    );
  }
  if (branch === "contractor-reports") {
    return (
      <>
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Government Dashboard</Button>
        <PageTitle title="Review Contractor Reports" description="Daily reports and progress submitted for Government review." />
        {dailyReports.map((item) => (
          <Card key={`daily-${item.id}`}>
            <Text style={styles.cardTitle}>Daily Report {item.id} · {item.project_id}</Text>
            <Text style={styles.bodyText}>Material: {item.material}</Text>
            <Text style={styles.bodyText}>Labour: {item.labour}</Text>
            <Text style={styles.bodyText}>Work done: {item.work_done}</Text>
          </Card>
        ))}
        {updates.map((item) => (
          <Card key={`progress-${item.id}`}>
            <Text style={styles.cardTitle}>Progress {item.id} · {item.status}</Text>
            <Text style={styles.bodyText}>{item.stage} · {item.progress}%</Text>
            <Text style={styles.muted}>{item.feedback}</Text>
          </Card>
        ))}
        <FileList files={uploads} session={session} emptyText="No uploaded evidence yet." />
      </>
    );
  }
  if (branch === "workflow") {
    const pending = updates.filter((item) => item.status === "Pending review");
    const reportTargets = scope === "project"
      ? projects.map((item) => ({ value: item.id, label: item.id }))
      : [...new Set(projects.map((item) => item.ward))].map((ward) => ({ value: ward, label: ward }));
    return (
      <>
        <Button kind="secondary" onPress={() => setBranch("dashboard")}>‹ Government Dashboard</Button>
        <PageTitle title="Government Workflow" description="Verify evidence → Approve or reject progress → Generate report → Notify residents and contractor." />
        <Card>
          <Text style={styles.sectionTitle}>1. Verify Uploaded Evidence (Photos, Documents)</Text>
          <FileList files={uploads} session={session} emptyText="No evidence has been uploaded." />
          <Button kind="secondary" disabled={step !== 1} onPress={() => setStep(2)}>Continue to Approve / Reject Progress</Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>2. Approve / Reject Progress</Text>
          {pending.length ? pending.map((update) => (
            <View key={update.id} style={styles.listItem}>
              <Text style={styles.cardTitle}>{update.project_id} · {update.stage} · {update.progress}%</Text>
              <Text style={styles.bodyText}>Material: {update.material} · Labour: {update.labour}</Text>
              <Text style={styles.bodyText}>Work done: {update.work_done}</Text>
              <Text style={styles.muted}>{update.notes}</Text>
              <Field label="Government feedback" value={feedback[update.id] || ""} onChangeText={(value) => setFeedback((current) => ({ ...current, [update.id]: value }))} placeholder="Feedback for contractor" multiline />
              <View style={styles.buttonRow}>
                <Button disabled={step !== 2} onPress={() => decision(update, "Approved")}>Approve Progress</Button>
                <Button kind="danger" disabled={step !== 2} onPress={() => decision(update, "Rejected")}>Reject · Send Back to Contractor</Button>
              </View>
            </View>
          )) : <Text style={styles.muted}>No progress updates are waiting for a decision.</Text>}
        </Card>
        {step >= 3 ? (
          <>
            <Card>
              <Text style={styles.sectionTitle}>3. Generate Reports (Project-wise / Ward-wise)</Text>
              <Chips label="Report scope" items={["project", "ward"]} value={scope} onChange={(value) => { setScope(value); setTarget(""); }} />
              <Chips label={scope === "project" ? "Project" : "Ward"} items={reportTargets} value={target} onChange={setTarget} />
              <Button disabled={step !== 3 || !target} onPress={generateReport}>Generate Report</Button>
              {reports.map((report) => (
                <View key={report.id} style={styles.listRow}>
                  <View style={styles.flex}><Text style={styles.cardTitle}>{report.scope} · {report.target}</Text><Text style={styles.muted}>Report {report.id}</Text></View>
                  <Button kind="secondary" onPress={() => saveProtectedFile(`/api/reports/${report.id}/download`, session, `redevelopment-report-${report.id}.csv`)}>Download</Button>
                </View>
              ))}
            </Card>
            {step >= 4 ? (
              <Card>
                <Text style={styles.sectionTitle}>4. Send Notifications to Residents & Contractor</Text>
                <Text style={styles.muted}>These are persisted in-app notices. The local pilot does not send SMS or push notifications.</Text>
                <Chips label="Report to attach" items={reports.map((item) => ({ value: String(item.id), label: `Report ${item.id} · ${item.target}` }))} value={selectedReportId} onChange={setSelectedReportId} />
                <Field label="Notice title" value={noticeTitle} onChangeText={setNoticeTitle} placeholder="Notice title" />
                <Field label="Notice message" value={noticeMessage} onChangeText={setNoticeMessage} placeholder="Message for residents and contractor" multiline />
                <Button disabled={step !== 4 || !selectedReportId || !noticeTitle.trim() || !noticeMessage.trim()} onPress={sendNotifications}>Send Notifications</Button>
              </Card>
            ) : null}
          </>
        ) : null}
        {step === 5 ? (
          <Card>
            <Text style={styles.sectionTitle}>5. Logout · End</Text>
            {success ? <Notice kind="success">{success}</Notice> : null}
            <Button kind="secondary" onPress={onLogout}>Logout</Button>
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageTitle title="Government Dashboard" description="Monitor projects, review complaints, and review contractor reports." />
      <Card>
        <Text style={styles.sectionTitle}>Government Dashboard</Text>
        <Button kind="secondary" onPress={() => setBranch("monitor")}>Monitor Projects</Button>
        <Button kind="secondary" onPress={() => setBranch("complaints")}>Review Complaints</Button>
        <Button kind="secondary" onPress={() => setBranch("contractor-reports")}>Review Contractor Reports</Button>
      </Card>
      <Card>
        <Text style={styles.sectionTitle}>Government Workflow</Text>
        <Text style={styles.muted}>1. Verify uploaded evidence · 2. Approve / Reject progress · 3. Generate reports · 4. Notify residents and contractor · 5. Logout</Text>
        <Button onPress={() => { setStep(1); setSuccess(""); setBranch("workflow"); refresh().catch((requestError) => setError(requestError.message)); }}>Start Government Workflow</Button>
      </Card>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}
      <Card>
        <Text style={styles.sectionTitle}>Project monitoring</Text>
        {projects.map((project) => <ProjectSummary key={project.id} project={project} />)}
      </Card>
      <Button kind="secondary" onPress={onLogout}>{t("logout")} · End</Button>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  content: { width: "100%", maxWidth: 920, alignSelf: "center", padding: 18, paddingBottom: 36 },
  header: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E2EAE5", padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  brand: { color: DARK, fontSize: 16, fontWeight: "800" },
  headerSubtitle: { color: MUTED, fontSize: 11, lineHeight: 15 },
  langSelector: { flexDirection: "row", gap: 4, alignItems: "center" },
  langBtn: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "#DDE9E1", backgroundColor: "#F8FBF9" },
  langBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  langBtnText: { color: MUTED, fontSize: 10, fontWeight: "700" },
  langBtnTextActive: { color: "#FFFFFF" },
  roleTag: { maxWidth: 170, color: GREEN, fontSize: 11, fontWeight: "700" },
  pageTitle: { marginBottom: 14, marginTop: 8 },
  eyebrow: { color: GREEN, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: DARK, fontSize: 25, fontWeight: "800", marginTop: 5 },
  description: { color: MUTED, fontSize: 13, lineHeight: 19, marginTop: 6 },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2EAE5", borderRadius: 15, padding: 15, marginBottom: 12 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  schemeBadge: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  schemeBadgeText: { color: "#1D4ED8", fontSize: 10, fontWeight: "800" },
  delayedCard: { borderColor: "#FCA5A5", borderWidth: 1.5 },
  delayBadgeContainer: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#F87171", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6, alignSelf: "flex-start" },
  delayBadgeText: { color: "#B91C1C", fontSize: 11, fontWeight: "700" },
  geotagBadge: { color: "#0D9488", fontSize: 10, fontWeight: "700", marginTop: 2 },
  mandatoryNotice: { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1, borderRadius: 8, padding: 8, marginVertical: 6 },
  mandatoryNoticeText: { color: "#92400E", fontSize: 11, fontWeight: "700" },
  roleCard: { backgroundColor: "#FFFFFF", borderColor: "#DDE9E1", borderWidth: 1, borderRadius: 14, padding: 17, marginBottom: 11 },
  cardTitle: { color: DARK, fontSize: 14, fontWeight: "800" },
  sectionTitle: { color: DARK, fontSize: 16, fontWeight: "800", marginBottom: 8 },
  bodyText: { color: DARK, fontSize: 13, lineHeight: 19, marginTop: 6 },
  muted: { color: MUTED, fontSize: 11, lineHeight: 17, marginTop: 4 },
  fieldGroup: { flex: 1, marginTop: 10 },
  fieldLabel: { color: DARK, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  field: { backgroundColor: "#F8FBF9", borderColor: "#DDE9E1", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: DARK, fontSize: 13 },
  multilineField: { minHeight: 82, textAlignVertical: "top" },
  button: { backgroundColor: GREEN, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignItems: "center", justifyContent: "center", marginTop: 10, minHeight: 42 },
  secondaryButton: { backgroundColor: "#EAF7EE", borderColor: "#C9E7D5", borderWidth: 1 },
  dangerButton: { backgroundColor: "#A83232" },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  buttonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", textAlign: "center" },
  secondaryButtonText: { color: GREEN },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderColor: "#DDE9E1", borderRadius: 18, backgroundColor: "#F8FBF9", paddingHorizontal: 11, paddingVertical: 8, marginTop: 5, maxWidth: "100%" },
  chipSelected: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  chipTextSelected: { color: "#FFFFFF" },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  progressTrack: { height: 9, borderRadius: 9, backgroundColor: "#E5EEE8", overflow: "hidden", marginTop: 14, marginBottom: 7 },
  progressFill: { height: "100%", backgroundColor: GREEN },
  notice: { borderWidth: 1, borderColor: "#C9D9CE", backgroundColor: "#FFFFFF", borderRadius: 10, padding: 12, marginVertical: 8 },
  successNotice: { backgroundColor: "#EAF7EE", borderColor: "#C9E7D5" },
  errorNotice: { backgroundColor: "#FFF1F0", borderColor: "#EBCBC8" },
  noticeText: { color: DARK, fontSize: 12, lineHeight: 18 },
  errorText: { color: "#8A2722" },
  listItem: { backgroundColor: "#F8FBF9", borderWidth: 1, borderColor: "#E2EAE5", borderRadius: 11, padding: 12, marginTop: 9 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderColor: "#E2EAE5" },
  timelineItem: { flexDirection: "row", gap: 11, alignItems: "flex-start", paddingVertical: 11, borderBottomWidth: 1, borderColor: "#E8EEE9" },
  timelineMark: { width: 27, height: 27, borderRadius: 16, textAlign: "center", textAlignVertical: "center", overflow: "hidden", color: MUTED, backgroundColor: "#EFF3F0", fontSize: 12, fontWeight: "800" },
  timelineMarkActive: { color: "#FFFFFF", backgroundColor: GREEN },
  roleHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  loader: { position: "absolute", right: 16, bottom: 12 },
});
