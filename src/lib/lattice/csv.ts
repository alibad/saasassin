import "server-only";

import { parse } from "csv-parse/sync";

export type EmployeeCsvRow = {
  line: number;
  name: string;
  email: string;
  title: string;
  team: string;
  managerEmail: string;
  roleId: "employee" | "manager";
};

export type EmployeeCsvPreview = {
  rows: EmployeeCsvRow[];
  errors: string[];
  warnings: string[];
};

function field(record: Record<string, string>, ...names: string[]) {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function parseEmployeeCsv(csv: string): EmployeeCsvPreview {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!csv.trim()) {
    return { rows: [], errors: ["Choose a non-empty CSV file."], warnings };
  }

  let records: Record<string, string>[];
  try {
    records = parse(csv, {
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    });
  } catch (error) {
    return {
      rows: [],
      errors: [error instanceof Error ? error.message : "The CSV could not be parsed."],
      warnings,
    };
  }

  if (records.length > 250) {
    errors.push("This workspace accepts at most 250 employees per import.");
  }

  const seenEmails = new Set<string>();
  const rows = records.slice(0, 250).flatMap((record, index) => {
    const line = index + 2;
    const name = field(record, "name", "full_name", "employee_name");
    const email = field(record, "email", "work_email").toLowerCase();
    const title = field(record, "title", "job_title");
    const team = field(record, "team", "department");
    const managerEmail = field(record, "manager_email", "manager").toLowerCase();
    const requestedRole = field(record, "role").toLowerCase();

    if (!name) {
      errors.push(`Line ${line}: name is required.`);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.push(`Line ${line}: a valid email is required.`);
    }
    if (email && seenEmails.has(email)) {
      errors.push(`Line ${line}: ${email} appears more than once.`);
    }
    seenEmails.add(email);

    let roleId: "employee" | "manager" = "employee";
    if (requestedRole === "manager") {
      roleId = "manager";
    } else if (requestedRole && requestedRole !== "employee") {
      warnings.push(
        `Line ${line}: role “${requestedRole}” was reduced to Employee; privileged roles cannot be granted by CSV.`,
      );
    }

    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      return [];
    }

    return [{ line, name, email, title, team, managerEmail, roleId }];
  });

  const importedEmails = new Set(rows.map((row) => row.email));
  for (const row of rows) {
    if (row.managerEmail && !importedEmails.has(row.managerEmail)) {
      warnings.push(
        `Line ${row.line}: manager ${row.managerEmail} must already exist in the workspace or their reporting line will remain unassigned.`,
      );
    }
  }

  return { rows, errors, warnings };
}
