/**
 * Built-in, versioned control library for SaaSassin Trust.
 *
 * Requirement and control descriptions are SaaSassin's own paraphrases written to help
 * teams organise readiness work. They are not the official AICPA Trust Services Criteria
 * or ISO/IEC 27001 text; teams must consult the licensed source documents with their auditor.
 * A library version is immutable once shipped: changes create a new version string.
 */

export type FrameworkId = "soc2" | "iso27001";

export type FrameworkRequirement = {
  id: string;
  ref: string;
  category: string;
  title: string;
};

export type FrameworkControl = {
  id: string;
  title: string;
  description: string;
  category: string;
  requirementIds: string[];
  suggestedEvidence: string;
};

export type Framework = {
  id: FrameworkId;
  name: string;
  version: string;
  summary: string;
  disclaimer: string;
  requirements: FrameworkRequirement[];
  controls: FrameworkControl[];
};

export const CONTROL_LIBRARY_VERSION = "2026.10.0";

const DISCLAIMER =
  "Paraphrased by SaaSassin to organise readiness work. Not the official criteria text, not legal advice, and not an attestation.";

type Row = [ref: string, category: string, requirement: string, controlTitle: string, control: string, evidence: string];

const SOC2_ROWS: Row[] = [
  ["CC1.1", "Control environment", "Leadership demonstrates a commitment to integrity and ethical values.", "Code of conduct", "Publish a code of conduct and have every team member accept it when they join and each year after.", "Signed code of conduct acknowledgements"],
  ["CC1.2", "Control environment", "A governing body oversees the security program independently of day-to-day management.", "Security oversight", "A named board member or oversight group reviews security status, incidents, and risks at least twice a year.", "Oversight meeting notes"],
  ["CC1.3", "Control environment", "Structures, reporting lines, and responsibilities are defined.", "Org chart and security roles", "Maintain an org chart and a written list of who owns security, privacy, and infrastructure decisions.", "Current org chart with role owners"],
  ["CC1.4", "Control environment", "The organisation attracts, develops, and retains competent people.", "Hiring and background checks", "Screen new hires according to local law and record completion before production access is granted.", "Background check completion log"],
  ["CC1.5", "Control environment", "People are held accountable for their security responsibilities.", "Security responsibilities in reviews", "Include security expectations in job descriptions and performance conversations, with a documented disciplinary path.", "Job description and policy excerpt"],
  ["CC2.1", "Communication and information", "Relevant, quality information supports internal control.", "System inventory", "Keep an up-to-date inventory of production systems, data stores, and the data they hold.", "Exported asset inventory"],
  ["CC2.2", "Communication and information", "Control responsibilities and objectives are communicated internally.", "Security awareness training", "Every team member completes security awareness training at onboarding and annually.", "Training completion report"],
  ["CC2.3", "Communication and information", "Relevant matters are communicated with external parties.", "Customer security communication", "Publish a channel for customers to report security issues and describe how commitments and changes are communicated.", "Public security contact page"],
  ["CC3.1", "Risk assessment", "Objectives are specified clearly enough to identify related risks.", "Security objectives", "Write down measurable security objectives that the risk assessment is measured against.", "Approved objectives document"],
  ["CC3.2", "Risk assessment", "Risks to objectives are identified and analysed.", "Annual risk assessment", "Run a risk assessment at least annually, scoring likelihood and impact and assigning owners and treatments.", "Risk register export"],
  ["CC3.3", "Risk assessment", "The potential for fraud is considered when assessing risk.", "Fraud risk review", "Consider fraud and insider misuse scenarios explicitly during the risk assessment.", "Risk register entries tagged fraud"],
  ["CC3.4", "Risk assessment", "Changes that could significantly affect internal control are identified and assessed.", "Change impact review", "Reassess risk when the business, technology, or vendors change materially.", "Risk review triggered by change"],
  ["CC4.1", "Monitoring activities", "Ongoing or separate evaluations confirm controls are present and functioning.", "Control monitoring", "Review control status and evidence freshness on a fixed cadence and record the outcome.", "Readiness review notes"],
  ["CC4.2", "Monitoring activities", "Deficiencies are communicated and corrected in a timely way.", "Deficiency tracking", "Track control gaps as tasks with owners and due dates until they are resolved.", "Gap task list with resolution dates"],
  ["CC5.1", "Control activities", "Control activities are selected to reduce risks to acceptable levels.", "Risk-to-control mapping", "Link each significant risk to the controls that treat it.", "Risk register with linked controls"],
  ["CC5.2", "Control activities", "General controls over technology are selected and developed.", "Technology baseline", "Define baseline configuration standards for cloud accounts, endpoints, and production hosts.", "Baseline configuration standard"],
  ["CC5.3", "Control activities", "Control activities are deployed through policies and procedures.", "Policy management", "Maintain approved, versioned security policies and track employee acknowledgement.", "Approved policy versions and acknowledgements"],
  ["CC6.1", "Logical and physical access", "Logical access security software, infrastructure, and architecture protect information assets.", "Single sign-on and MFA", "Require single sign-on with multi-factor authentication for production and business-critical tools.", "Identity provider MFA enforcement setting"],
  ["CC6.2", "Logical and physical access", "Users are registered and authorised before access is issued.", "Access provisioning", "Grant access only through an approved request that records the approver and the role granted.", "Access request tickets"],
  ["CC6.3", "Logical and physical access", "Access is modified or removed based on roles and least privilege.", "Access reviews and offboarding", "Review user access quarterly and remove access within one business day of departure.", "Quarterly access review and offboarding checklist"],
  ["CC6.4", "Logical and physical access", "Physical access to facilities and protected assets is restricted.", "Physical security", "Rely on providers with documented physical controls and restrict any office equipment rooms to authorised staff.", "Cloud provider assurance report"],
  ["CC6.5", "Logical and physical access", "Assets are disposed of securely.", "Secure disposal", "Wipe or destroy devices and media before disposal and record the method used.", "Device disposal log"],
  ["CC6.6", "Logical and physical access", "Boundaries are protected against threats from outside the system.", "Network protection", "Restrict inbound network access to required ports and use managed firewalls or security groups.", "Firewall or security group configuration"],
  ["CC6.7", "Logical and physical access", "Transmission and movement of information is restricted and protected.", "Encryption in transit", "Encrypt data in transit with current TLS and block plaintext protocols for customer data.", "TLS configuration scan"],
  ["CC6.8", "Logical and physical access", "Unauthorised or malicious software is prevented or detected.", "Endpoint protection", "Run managed endpoint protection and keep operating systems patched on company devices.", "Endpoint management compliance report"],
  ["CC7.1", "System operations", "Configuration changes and newly discovered vulnerabilities are detected.", "Vulnerability management", "Scan infrastructure and dependencies for vulnerabilities and fix them within defined timeframes by severity.", "Vulnerability scan results"],
  ["CC7.2", "System operations", "System components are monitored for anomalies indicating malicious acts or errors.", "Logging and alerting", "Centralise security-relevant logs and alert on suspicious activity.", "Alert rule configuration"],
  ["CC7.3", "System operations", "Security events are evaluated to determine whether they are incidents.", "Event triage", "Triage alerts against written criteria that decide when an event becomes an incident.", "Triage runbook"],
  ["CC7.4", "System operations", "Identified incidents are responded to with a defined program.", "Incident response", "Follow a documented incident response plan with roles, communication steps, and post-incident review.", "Incident response plan and a recent post-mortem"],
  ["CC7.5", "System operations", "The organisation recovers from identified security incidents.", "Backup and recovery", "Back up production data, test restores at least annually, and record recovery results.", "Restore test record"],
  ["CC8.1", "Change management", "Changes to infrastructure, data, software, and procedures are authorised, tested, and approved.", "Change management", "Require peer review and passing tests before production deploys, with emergency changes reviewed afterwards.", "Pull request review settings and deploy history"],
  ["CC9.1", "Risk mitigation", "Risks from potential business disruptions are identified and mitigated.", "Business continuity", "Maintain a continuity plan covering critical services, and exercise it at least annually.", "Continuity plan and exercise notes"],
  ["CC9.2", "Risk mitigation", "Risks associated with vendors and business partners are assessed and managed.", "Vendor risk management", "Inventory vendors that handle customer data, tier them by risk, and review them on a schedule.", "Vendor inventory with review dates"],
];

const ISO_ROWS: Row[] = [
  ["A.5.1", "Organisational", "Information security policies are defined, approved, published, and reviewed.", "Information security policy", "Approve a top-level information security policy and review it at least annually.", "Approved policy version"],
  ["A.5.9", "Organisational", "An inventory of information and associated assets is maintained.", "Asset inventory", "Keep an owned inventory of information assets and the systems that store them.", "Asset inventory export"],
  ["A.5.15", "Organisational", "Rules to control access are established based on business need.", "Access control rules", "Document access rules based on least privilege and need to know.", "Access control policy"],
  ["A.5.19", "Organisational", "Information security risks of supplier relationships are managed.", "Supplier security", "Assess suppliers before onboarding and record security expectations in agreements.", "Supplier assessment records"],
  ["A.5.23", "Organisational", "Security for the use of cloud services is managed.", "Cloud service security", "Define how cloud services are selected, configured, and exited securely.", "Cloud service standard"],
  ["A.5.24", "Organisational", "Incident management is planned and prepared.", "Incident planning", "Define incident roles, procedures, and contact paths before incidents happen.", "Incident response plan"],
  ["A.5.30", "Organisational", "ICT readiness for business continuity is planned and tested.", "ICT continuity", "Plan and test recovery of critical technology services.", "Continuity test results"],
  ["A.6.3", "People", "Personnel receive security awareness, education, and training.", "Awareness training", "Train personnel on security at onboarding and on a recurring basis.", "Training completion report"],
  ["A.8.2", "Technological", "Privileged access rights are restricted and managed.", "Privileged access", "Limit administrative access to named people and review it regularly.", "Privileged access review"],
  ["A.8.5", "Technological", "Secure authentication is implemented.", "Secure authentication", "Enforce strong authentication, including MFA, for systems holding sensitive data.", "MFA enforcement evidence"],
  ["A.8.8", "Technological", "Technical vulnerabilities are identified and addressed.", "Technical vulnerability handling", "Identify, prioritise, and remediate technical vulnerabilities within set timeframes.", "Vulnerability remediation report"],
  ["A.8.13", "Technological", "Backup copies are maintained and tested.", "Information backup", "Take regular backups and verify restores.", "Backup and restore logs"],
  ["A.8.15", "Technological", "Logs recording activities and events are produced, protected, and analysed.", "Logging", "Produce and protect logs of security-relevant events and review them.", "Log retention configuration"],
  ["A.8.24", "Technological", "Rules for effective use of cryptography are defined and implemented.", "Use of cryptography", "Define encryption standards for data at rest and in transit, including key management.", "Encryption standard and configuration"],
  ["A.8.32", "Technological", "Changes to information processing facilities and systems are controlled.", "Change control", "Review, test, and approve changes before they reach production.", "Change records"],
];

function slugRef(ref: string) {
  return ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildFramework(id: FrameworkId, name: string, summary: string, rows: Row[]): Framework {
  return {
    id,
    name,
    version: CONTROL_LIBRARY_VERSION,
    summary,
    disclaimer: DISCLAIMER,
    requirements: rows.map(([ref, category, requirement]) => ({
      id: `${id}.${slugRef(ref)}`,
      ref,
      category,
      title: requirement,
    })),
    controls: rows.map(([ref, category, , controlTitle, control, evidence]) => ({
      id: `${id}.ctl.${slugRef(ref)}`,
      title: controlTitle,
      description: control,
      category,
      requirementIds: [`${id}.${slugRef(ref)}`],
      suggestedEvidence: evidence,
    })),
  };
}

export const FRAMEWORKS: Framework[] = [
  buildFramework(
    "soc2",
    "SOC 2 common criteria (CC1–CC9)",
    "Readiness tracking for the Security category common criteria, organised by criteria series.",
    SOC2_ROWS,
  ),
  buildFramework(
    "iso27001",
    "ISO/IEC 27001:2022 Annex A (subset)",
    "Readiness tracking for a starter subset of Annex A themes: organisational, people, and technological.",
    ISO_ROWS,
  ),
];

export function getFramework(id: string) {
  return FRAMEWORKS.find((framework) => framework.id === id) ?? null;
}

export function getControl(controlId: string) {
  for (const framework of FRAMEWORKS) {
    const control = framework.controls.find((entry) => entry.id === controlId);
    if (control) return { framework, control };
  }
  return null;
}
