/** Starter policy templates written by SaaSassin. Teams must adapt them; they are not legal advice. */

export type PolicyTemplate = { id: string; title: string; summary: string; body: string };

const header = (title: string) =>
  `# ${title}\n\nOwner: {{owner}}\nApplies to: all employees, contractors, and systems that store or process company or customer data.\n\nThis is a starter template. Adapt it to how your organisation actually operates before approving it.\n`;

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "information-security",
    title: "Information security policy",
    summary: "Top-level commitments, roles, and how the program is reviewed.",
    body: `${header("Information security policy")}
## Purpose
Set out how we protect the confidentiality, integrity, and availability of the information we hold.

## Commitments
- Leadership names an accountable security owner and reviews program status at least twice a year.
- We keep an inventory of systems and data, assess risk at least annually, and track gaps to closure.
- Supporting policies (access control, incident response, vendor management, change management) are approved and acknowledged by everyone in scope.

## Review
This policy is reviewed at least annually and whenever the business changes materially.`,
  },
  {
    id: "access-control",
    title: "Access control policy",
    summary: "Least privilege, MFA, provisioning, access reviews, and offboarding.",
    body: `${header("Access control policy")}
## Principles
- Access follows least privilege and need to know.
- Single sign-on with multi-factor authentication is required for production and business-critical tools.

## Provisioning
Access is granted through a recorded request that names the approver and the role.

## Reviews and removal
- Managers review access to critical systems every quarter.
- Access is removed within one business day of a person leaving or changing role.
- Shared and service accounts have a named owner.`,
  },
  {
    id: "incident-response",
    title: "Incident response policy",
    summary: "Severity levels, roles, communication, and post-incident review.",
    body: `${header("Incident response policy")}
## Reporting
Anyone who suspects a security incident reports it immediately through the agreed channel.

## Roles
An incident lead coordinates response, a communications owner handles internal and customer updates, and subject experts contain and recover.

## Process
1. Triage and assign a severity.
2. Contain, eradicate, and recover.
3. Notify affected customers and authorities where required, within contractual and legal timeframes.
4. Hold a blameless review within ten business days and track follow-up actions.`,
  },
  {
    id: "vendor-management",
    title: "Vendor management policy",
    summary: "Inventory, risk tiers, due diligence, and review cadence for vendors.",
    body: `${header("Vendor management policy")}
## Inventory
We keep an inventory of vendors that store, process, or can access company or customer data.

## Risk tiers
Vendors are tiered by the sensitivity of data they access and how critical they are to service delivery.

## Due diligence and review
- High and critical vendors are reviewed before onboarding and at least annually.
- Contracts include security and confidentiality obligations appropriate to the tier.
- Vendors are offboarded with data return or deletion confirmed.`,
  },
  {
    id: "change-management",
    title: "Change management policy",
    summary: "Peer review, testing, approvals, and emergency changes.",
    body: `${header("Change management policy")}
## Standard changes
Production changes are peer reviewed, pass automated tests, and are deployed through the approved pipeline.

## Emergency changes
Emergency changes may be deployed with one approver and are reviewed within two business days.

## Records
Change history is retained so any production change can be traced to its review and approval.`,
  },
  {
    id: "business-continuity",
    title: "Business continuity and backup policy",
    summary: "Critical services, recovery objectives, backups, and testing.",
    body: `${header("Business continuity and backup policy")}
## Critical services
We list critical services with target recovery time and recovery point objectives.

## Backups
Production data is backed up automatically, encrypted, and stored separately from the primary environment.

## Testing
Restores are tested at least annually and the continuity plan is exercised at least annually, with results recorded.`,
  },
  {
    id: "acceptable-use",
    title: "Acceptable use policy",
    summary: "Expectations for devices, accounts, and data handling by staff.",
    body: `${header("Acceptable use policy")}
## Devices
Company devices use disk encryption, screen lock, supported operating systems, and managed endpoint protection.

## Accounts
Credentials are never shared. Password managers and MFA are used for all work accounts.

## Data handling
Customer data is only used for the purpose it was provided and is never copied to personal accounts or unapproved tools.`,
  },
  {
    id: "data-retention",
    title: "Data retention and disposal policy",
    summary: "How long data is kept and how it is securely deleted.",
    body: `${header("Data retention and disposal policy")}
## Retention
Each category of data has a documented retention period based on contractual, legal, and business need.

## Disposal
Data past its retention period is deleted. Devices and media are wiped or destroyed before disposal and the method is recorded.

## Customer requests
Customer deletion requests are completed within contractual timeframes and confirmed in writing.`,
  },
];

export function getPolicyTemplate(id: string) {
  return POLICY_TEMPLATES.find((template) => template.id === id) ?? null;
}
