import { describe, expect, it } from "vitest";

import { htmlToText, mapKajabiExport, parseCsv } from "../src/lib/creator/import";

const csv = [
  "Product Title,Category Title,Post Title,Post Body,Video URL,Drip Days,Position,Author",
  'Pottery 101,Getting started,Welcome,"<p>Hello <strong>potter</strong></p><p>Line two</p>",https://youtu.be/abc123xyz,,2,Ann',
  'Pottery 101,Getting started,Tools,"Clay, wheel, ""patience""",http://insecure.example.com/v,3,1,Ann',
  "Pottery 101,Glazing,,,,,,Ann",
  "Pottery 101,Glazing,Glaze basics,Text,,abc,,Ann",
  ",Orphan,Lost lesson,,,,,Ann",
  "Wheel Mastery,,Centering,Body,,,,Ann",
].join("\n");

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes and commas", () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('a\n"line1\nline2"')[1][0]).toBe("line1\nline2");
  });
});

describe("Kajabi mapper", () => {
  const { courses, report } = mapKajabiExport(csv);

  it("maps products, categories and posts to courses, modules and lessons", () => {
    expect(report.format).toBe("csv");
    expect(courses.map((course) => course.title)).toEqual(["Pottery 101", "Wheel Mastery"]);
    expect(courses[0].modules.map((courseModule) => courseModule.title)).toEqual(["Getting started", "Glazing"]);
    expect(report).toMatchObject({ courses: 2, modules: 3, lessons: 4 });
    expect(report.columnMapping["Product Title"]).toBe("course");
  });

  it("orders lessons by position", () => {
    expect(courses[0].modules[0].lessons.map((lesson) => lesson.title)).toEqual(["Tools", "Welcome"]);
  });

  it("drops insecure video links, strips HTML and reports both", () => {
    const [tools, welcome] = courses[0].modules[0].lessons;
    expect(tools.videoUrl).toBe("");
    expect(tools.dripDays).toBe(3);
    expect(welcome.videoUrl).toBe("https://youtu.be/abc123xyz");
    expect(welcome.body).toContain("Hello potter");
    expect(report.warnings.join(" ")).toMatch(/not an https URL/);
    expect(report.warnings.join(" ")).toMatch(/HTML formatting/);
    expect(report.warnings.join(" ")).toMatch(/Ignored columns: Author/);
  });

  it("reports bad drip values and rows without a course", () => {
    expect(report.warnings.join(" ")).toMatch(/drip value “abc”/);
    expect(report.errors.join(" ")).toMatch(/Row 6: missing course/);
  });

  it("puts lessons without a category into a default module", () => {
    expect(courses[1].modules[0].title).toBe("Lessons");
  });

  it("accepts the JSON shape", () => {
    const json = JSON.stringify({ products: [{ title: "JSON course", categories: [{ title: "M1", posts: [{ title: "L1", body: "b", video_url: "https://vimeo.com/1", drip_days: 2 }] }] }] });
    const result = mapKajabiExport(json);
    expect(result.report.format).toBe("json");
    expect(result.courses[0].modules[0].lessons[0]).toMatchObject({ title: "L1", videoUrl: "https://vimeo.com/1", dripDays: 2 });
  });

  it("errors clearly when no course column exists", () => {
    expect(mapKajabiExport("Name,Email\nA,b@c.d").report.errors[0]).toMatch(/No course column/);
    expect(mapKajabiExport("{nope").report.errors[0]).toMatch(/could not be parsed/);
  });

  it("converts HTML lists to markdown bullets", () => {
    expect(htmlToText("<ul><li>One</li><li>Two &amp; three</li></ul>").text).toBe("- One\n\n- Two & three");
  });
});
