import { createHash } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import { isAuthenticated, json, sameOriginWrite } from "../lib/session.mts";

declare const Netlify: any;

const CONTACTS = [
  ["PCEX Automotive","David Lucas","Sales Director","Spain","","+34 630 101 072","david.lucas@pcex.es","www.pcexautomotive.com",""],
  ["AUTOBETA / GMB IRIS","Ievgenii Kviatkovskij","CEO","Lithuania","Vilnius","+370 682 13222","info@autobeta.lt","www.autobeta.lt","Original Car Parts | B2B Wholesale"],
  ["AP&P Export & Consulting GmbH","Claas Krause","Managing Director","Austria","Salzburg","+43 (0) 662 67 00 04; +43 (0) 664 8 11 74 94","claas.krause@app.co.at","www.app.co.at","Export & Consulting"],
  ["AP&P Export & Consulting GmbH","Sarah Lehner","","Austria","Salzburg","+43 (0) 662 67 00 04; +43 (0) 664 8 11 74 73","sarah.lehner@app.co.at","www.app.co.at","Export & Consulting"],
  ["Autocar International B.V.","Romanov Bakker","Logistics","Netherlands","Moerdijk","+31 (0) 88 6411444","transport@autocar.nl","www.autocar.nl",""],
  ["The Parts Company","Roxanne Bas","Parts Sales","Netherlands","Moerdijk","+31 (0)88 6441154","sales@thepartscompany.com","www.thepartscompany.com","Graanweg 10, 4782 PP Moerdijk; Harbour no. 220"],
  ["BMW Group","Jens Meyer","Business Development — Value Report Parts","Germany","München","+49 99 3824 68789; +49 151 60167878","Jens.MA.Meyer@bmw.de","",""],
  ["CORALS GmbH","Nesrin Erdem","Business Development Manager","Germany","München","+49 176 34992422","nesrin.erdem@corals-auto.de","corals-auto.de","Lena-Christ-Str. 2, 82031 München; general e-mail: info@corals-auto.de"],
  ["F.O.R.C.E. GmbH","Alexander Kulnik","CEO","Germany","Wedemark","+49 172 4131566","sales@forcegmbh.de","forcegmbh24.com","Genuine spare parts"],
  ["F.O.R.C.E. GmbH","Dustin Meyer","Business Development Manager","Germany","Wedemark","+49 151 54889734","dustin.meyer@forcegmbh.de","forcegmbh24.com","Genuine spare parts"],
  ["SEG Automotive Germany GmbH","Enes Mesic","Key Account Manager Aftermarket","Germany","Stuttgart","+49 152 52357431","enes.mesic@seg-automotive.com","www.seg-automotive.com","Aftermarket"],
  ["STAR SERVICE S.A.","Gabriel Lungu","Director General","Romania","Iași","0743 846 217","gabriel.lungu@starservice.ro","www.starservice.ro",""],
  ["PARTNERS","Stéphanie Bach","Spare parts and accessories Manager","France","Antony","+33 (0)1 47 11 07 14","stephanie.bach@partners-supply.com","www.partners-supply.com",""],
  ["PARTNERS","V. Kozlov","","France","Antony","+33 (0)1 57 19 07 14","v.kozlov@partners-supply.com","www.partners-supply.com","Purchasing office; automotive and heavy-truck spare parts; export"],
  ["AXIO PARTS S.R.L.","Wilson Brucognoni","Business Development","Italy","Rivoli (TO)","+39 346 1289760","sales@axioparts.com","www.axioparts.com",""],
  ["FREY AUTO PARTS","Ricky Shu","Business Director, Middle East","China","Guangzhou","+86 177 7517 2928; +86 20 8389 3802","parts10@cfrey.com","www.freyautoparts.com",""],
  ["HOTBRAY / Eurospare / Armstrong","Jemma Lee","Sales Executive","United Kingdom","","+44 208 54 57 783","jemmal@hotbray.net","www.hotbray.co.uk",""],
  ["HOTBRAY / Eurospare / Armstrong","Dwain Froude","Aftermarket Purchasing Manager","United Kingdom","","+44 7345 454493","dwainf@hotbray.net","www.hotbray.co.uk",""],
  ["ULO Original / odelo Group","","","Turkey / Bulgaria","Nilüfer, Bursa / Kuklen, Plovdiv","","","","Postal: odelo Otomotiv Aydınlatma A.Ş., Minareliçavuş Bursa OSB Mah., Sarı Cad. No:33, 16220 Nilüfer Bursa, Turkey. Invoice/Operational: odelo Bulgaria EOOD, Industrial Zone Kapsida, 11 Bavaria Str., 4101 Kuklen, Bulgaria."]
];

const contactKey = (r: string[]) => `contact:${r[0]}|${r[1]}`;
const CONTACT_KEYS = new Set(CONTACTS.map(contactKey));
const FIELDS = new Set(["comment", "mailtext", "sent", "inactive"]);

type FieldRecord = { contactKey: string; field: string; value: unknown; updatedAt: string };

function store() {
  const context = Netlify.context?.deploy?.context;
  return context === "production"
    ? getStore("automechanika-contacts-shared", { consistency: "strong" })
    : getDeployStore("automechanika-contacts-shared");
}

function blobKey(key: string, field: string) {
  const hash = createHash("sha256").update(key, "utf8").digest("hex");
  return `fields/${hash}/${field}`;
}

function normalize(field: string, value: unknown): string | boolean | null {
  if (field === "sent" || field === "inactive") return typeof value === "boolean" ? value : null;
  if (typeof value !== "string") return null;
  const max = field === "mailtext" ? 100000 : 20000;
  return value.length <= max ? value : null;
}

async function readAll() {
  const s = store();
  const listed = await s.list({ prefix: "fields/" });
  const records = await Promise.all(listed.blobs.map(async ({ key }) => {
    try { return await s.get(key, { type: "json" }) as FieldRecord | null; } catch { return null; }
  }));
  const state: Record<string, Record<string, unknown>> = {};
  for (const rec of records) {
    if (!rec || !CONTACT_KEYS.has(rec.contactKey) || !FIELDS.has(rec.field)) continue;
    (state[rec.contactKey] ||= {})[rec.field] = rec.value;
  }
  return state;
}

export default async (req: Request) => {
  if (!isAuthenticated(req)) return json({ error: "Unauthorized" }, 401);

  if (req.method === "GET") {
    try { return json({ contacts: CONTACTS, state: await readAll(), serverTime: new Date().toISOString() }); }
    catch { return json({ error: "Storage unavailable" }, 503); }
  }

  if (req.method === "PUT") {
    if (!sameOriginWrite(req)) return json({ error: "Forbidden" }, 403);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
    const key = typeof body?.contactKey === "string" ? body.contactKey : "";
    const field = typeof body?.field === "string" ? body.field : "";
    if (!CONTACT_KEYS.has(key) || !FIELDS.has(field)) return json({ error: "Unknown field" }, 400);
    const value = normalize(field, body?.value);
    if (value === null) return json({ error: "Invalid value" }, 400);
    const record: FieldRecord = { contactKey: key, field, value, updatedAt: new Date().toISOString() };
    try {
      await store().setJSON(blobKey(key, field), record);
      return json({ ok: true, record });
    } catch {
      return json({ error: "Storage unavailable" }, 503);
    }
  }

  return json({ error: "Method not allowed" }, 405, { allow: "GET, PUT" });
};

export const config = { path: "/api/state" };
