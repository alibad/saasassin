import { describe, expect, it } from "vitest";

import { htmlToText } from "../src/lib/mail/html";
import { decodeEncodedWords, parseAddressList, parseEml, splitMailFile, splitMbox } from "../src/lib/mail/mime";

const multipart = [
  "From: =?UTF-8?B?SsO8cmdlbiBNw7xsbGVy?= <Jurgen@Example.DE>",
  "To: Ana <ana@example.com>, \"Lee, Sam\" <sam@example.com>",
  "Cc: ops@example.com",
  "Subject: =?UTF-8?Q?Caf=C3=A9_plans?= =?UTF-8?Q?_for_Friday?=",
  "Date: Tue, 20 Oct 2026 09:30:00 +0200",
  "Message-ID: <abc123@example.de>",
  "In-Reply-To: <root@example.com>",
  "References: <root@example.com>",
  "  <mid@example.com>",
  "List-Unsubscribe: <mailto:unsub@example.de>",
  "MIME-Version: 1.0",
  "Content-Type: multipart/mixed; boundary=\"outer\"",
  "",
  "--outer",
  "Content-Type: multipart/alternative; boundary=inner",
  "",
  "--inner",
  "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Let's meet at the caf=C3=A9 =",
  "on Friday.",
  "--inner",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>HTML version</p>",
  "--inner--",
  "--outer",
  "Content-Type: text/calendar; method=REQUEST",
  "Content-Transfer-Encoding: base64",
  "",
  "QkVHSU46VkNBTEVOREFSDQpFTkQ6VkNBTEVOREFS",
  "--outer",
  "Content-Type: application/pdf; name=\"agenda.pdf\"",
  "Content-Disposition: attachment; filename=\"agenda.pdf\"",
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0xLjQK",
  "--outer--",
  "",
].join("\r\n");

describe("eml parser", () => {
  it("parses headers, addresses, encoded words, threading ids and multipart bodies", () => {
    const message = parseEml(multipart);
    expect(message.from).toEqual({ name: "Jürgen Müller", email: "jurgen@example.de" });
    expect(message.to).toEqual([
      { name: "Ana", email: "ana@example.com" },
      { name: "Lee, Sam", email: "sam@example.com" },
    ]);
    expect(message.cc).toEqual([{ name: "", email: "ops@example.com" }]);
    expect(message.subject).toBe("Café plans for Friday");
    expect(message.date).toBe("2026-10-20T07:30:00.000Z");
    expect(message.messageId).toBe("abc123@example.de");
    expect(message.inReplyTo).toBe("root@example.com");
    expect(message.references).toEqual(["root@example.com", "mid@example.com"]);
    expect(message.text).toBe("Let's meet at the café on Friday.");
    expect(message.bodySource).toBe("text");
    expect(message.hasCalendarInvite).toBe(true);
    expect(message.listUnsubscribe).toBe("<mailto:unsub@example.de>");
    expect(message.attachments.map((attachment) => attachment.filename)).toContain("agenda.pdf");
  });

  it("decodes base64 bodies with a legacy charset", () => {
    const raw = [
      "From: shop@example.com",
      "Subject: =?ISO-8859-1?Q?R=E9sum=E9?=",
      "Content-Type: text/plain; charset=ISO-8859-1",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x21]).toString("base64"),
    ].join("\n");
    const message = parseEml(raw);
    expect(message.subject).toBe("Résumé");
    expect(message.text).toBe("café!");
  });

  it("falls back to html converted to text, never raw html", () => {
    const raw = [
      "From: News <news@letters.example>",
      "Subject: Weekly",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<html><head><style>p{color:red}</style><script>alert(1)</script></head>",
      "<body><h1>Hello&nbsp;there</h1><p>Read <a href=\"https://example.com/x\">the post</a>.</p>",
      "<img src=\"https://tracker.example/pixel.gif\" width=1><p onclick=\"evil()\">Bye &amp; thanks</p></body></html>",
    ].join("\n");
    const message = parseEml(raw);
    expect(message.bodySource).toBe("html");
    expect(message.text).not.toMatch(/<|alert|color:red|tracker/);
    expect(message.text).toContain("Hello there");
    expect(message.text).toContain("the post [https://example.com/x]");
    expect(message.text).toContain("Bye & thanks");
  });

  it("generates a stable id when Message-ID is missing", () => {
    const raw = "From: a@example.com\nSubject: hi\nDate: Mon, 19 Oct 2026 10:00:00 +0000\n\nbody";
    expect(parseEml(raw).messageId).toBe(parseEml(raw).messageId);
    expect(parseEml(raw).messageId).toMatch(/^generated-[0-9a-f]{16}@saasassin\.mail$/);
  });

  it("decodes adjacent encoded words without the separating whitespace", () => {
    expect(decodeEncodedWords("=?UTF-8?Q?a?= =?UTF-8?Q?b?= c")).toBe("ab c");
    expect(decodeEncodedWords("=?utf-8?b?8J+Ri29r?=")).toBe("👋ok");
  });

  it("reads RFC 2231 filenames and html-only multipart/related bodies", () => {
    const raw = [
      "From: a@example.com",
      "Subject: Report",
      "Content-Type: multipart/mixed; boundary=b1",
      "",
      "--b1",
      "Content-Type: multipart/related; boundary=b2",
      "",
      "--b2",
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<div>Total: 5=E2=82=AC</div><img src=3D\"cid:logo\" alt=3D\"Logo\">",
      "--b2--",
      "--b1",
      "Content-Type: application/octet-stream",
      "Content-Disposition: attachment; filename*=utf-8''r%C3%A9sum%C3%A9.pdf",
      "",
      "xx",
      "--b1--",
    ].join("\n");
    const message = parseEml(raw);
    expect(message.text).toBe("Total: 5€\n\n[Logo]");
    expect(message.attachments[0]?.filename).toBe("résumé.pdf");
  });

  it("parses address lists with quoted commas and groups", () => {
    expect(parseAddressList("Team: a@x.com, \"B, C\" <b@x.com>;")).toEqual([
      { name: "", email: "a@x.com" },
      { name: "B, C", email: "b@x.com" },
    ]);
  });
});

describe("mbox", () => {
  const mbox = [
    "From alice@example.com Mon Oct 19 10:00:00 2026",
    "From: alice@example.com",
    "Subject: One",
    "Message-ID: <one@example.com>",
    "",
    "First body",
    ">From the archive, escaped line",
    "",
    "From bob@example.com Mon Oct 19 11:00:00 2026",
    "From: bob@example.com",
    "Subject: Re: One",
    "Message-ID: <two@example.com>",
    "In-Reply-To: <one@example.com>",
    "",
    "Second body",
    "",
  ].join("\n");

  it("splits messages and reverses >From escaping", () => {
    const messages = splitMbox(mbox);
    expect(messages).toHaveLength(2);
    const first = parseEml(messages[0]);
    expect(first.text).toBe("First body\nFrom the archive, escaped line");
    expect(parseEml(messages[1]).inReplyTo).toBe("one@example.com");
  });

  it("detects mbox content regardless of extension and keeps .eml whole", () => {
    expect(splitMailFile("export.txt", mbox)).toHaveLength(2);
    expect(splitMailFile("one.eml", "From: a@b.com\n\nhello")).toHaveLength(1);
  });
});

describe("html to text", () => {
  it("drops scripts, styles, comments and javascript links", () => {
    const text = htmlToText("<!-- x --><script>bad()</script><style>.a{}</style><a href=\"javascript:bad()\">Click</a><div>Line</div>");
    expect(text).toBe("Click\nLine");
  });

  it("decodes numeric entities and lists", () => {
    expect(htmlToText("<ul><li>One &#8211; two</li><li>&#x2764;</li></ul>")).toBe("• One – two\n• ❤");
  });

  it("never lets markup survive, even malformed", () => {
    expect(htmlToText("ok <img src=x onerror=alert(1) <b>bold</b> <svg><script>x</script></svg>")).not.toMatch(/[<>]/);
  });
});
