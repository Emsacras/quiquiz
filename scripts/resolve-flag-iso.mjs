/**
 * Ajoute iso2 à chaque question de drapeaux-monde.json
 * et vérifie que flagcdn sert bien une image.
 *
 * Usage: node scripts/resolve-flag-iso.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUIZ_PATH = path.join(ROOT, "public", "data", "drapeaux-monde.json");

/** English quiz name → ISO 3166-1 alpha-2 (flagcdn). */
const ISO_BY_NAME = {
  France: "fr",
  Italy: "it",
  Spain: "es",
  "United Kingdom": "gb",
  Germany: "de",
  Poland: "pl",
  Greece: "gr",
  Sweden: "se",
  Norway: "no",
  Finland: "fi",
  Portugal: "pt",
  Ireland: "ie",
  Iceland: "is",
  Netherlands: "nl",
  Belgium: "be",
  Denmark: "dk",
  Austria: "at",
  Switzerland: "ch",
  "Czech Republic": "cz",
  Romania: "ro",
  Bulgaria: "bg",
  Hungary: "hu",
  Ukraine: "ua",
  Croatia: "hr",
  Serbia: "rs",
  Slovakia: "sk",
  Slovenia: "si",
  "Bosnia and Herzegovina": "ba",
  Lithuania: "lt",
  Latvia: "lv",
  Estonia: "ee",
  Belarus: "by",
  Moldova: "md",
  Luxembourg: "lu",
  Andorra: "ad",
  Monaco: "mc",
  "San Marino": "sm",
  Montenegro: "me",
  "North Macedonia": "mk",
  Albania: "al",
  Malta: "mt",
  Cyprus: "cy",
  Liechtenstein: "li",
  Egypt: "eg",
  "South Africa": "za",
  Algeria: "dz",
  Morocco: "ma",
  Nigeria: "ng",
  Ethiopia: "et",
  Libya: "ly",
  Tunisia: "tn",
  Kenya: "ke",
  Madagascar: "mg",
  Sudan: "sd",
  Angola: "ao",
  Mozambique: "mz",
  Tanzania: "tz",
  Uganda: "ug",
  Ghana: "gh",
  "Ivory Coast": "ci",
  Cameroon: "cm",
  Senegal: "sn",
  Mali: "ml",
  Niger: "ne",
  Chad: "td",
  "Central African Republic": "cf",
  "Democratic Republic of the Congo": "cd",
  Gabon: "ga",
  Zambia: "zm",
  Zimbabwe: "zw",
  Benin: "bj",
  Togo: "tg",
  "Burkina Faso": "bf",
  Guinea: "gn",
  "Sierra Leone": "sl",
  Liberia: "lr",
  Gambia: "gm",
  "Guinea-Bissau": "gw",
  "Equatorial Guinea": "gq",
  Djibouti: "dj",
  Eritrea: "er",
  Somalia: "so",
  Burundi: "bi",
  Rwanda: "rw",
  Lesotho: "ls",
  Eswatini: "sz",
  Mauritius: "mu",
  Seychelles: "sc",
  Comoros: "km",
  "Sao Tome and Principe": "st",
  "Cape Verde": "cv",
  Russia: "ru",
  China: "cn",
  India: "in",
  Japan: "jp",
  "Saudi Arabia": "sa",
  Turkey: "tr",
  Iran: "ir",
  Indonesia: "id",
  Pakistan: "pk",
  Kazakhstan: "kz",
  Vietnam: "vn",
  Thailand: "th",
  Myanmar: "mm",
  "South Korea": "kr",
  "North Korea": "kp",
  Malaysia: "my",
  Philippines: "ph",
  Uzbekistan: "uz",
  Afghanistan: "af",
  Iraq: "iq",
  Syria: "sy",
  Israel: "il",
  Jordan: "jo",
  Lebanon: "lb",
  Yemen: "ye",
  Oman: "om",
  "United Arab Emirates": "ae",
  Bangladesh: "bd",
  "Sri Lanka": "lk",
  Nepal: "np",
  Bhutan: "bt",
  Cambodia: "kh",
  Laos: "la",
  Mongolia: "mn",
  Taiwan: "tw",
  Singapore: "sg",
  Brunei: "bn",
  "East Timor": "tl",
  Armenia: "am",
  Georgia: "ge",
  Azerbaijan: "az",
  Kyrgyzstan: "kg",
  Tajikistan: "tj",
  Turkmenistan: "tm",
  Qatar: "qa",
  Bahrain: "bh",
  Kuwait: "kw",
  Palestine: "ps",
  "United States": "us",
  Canada: "ca",
  Brazil: "br",
  Mexico: "mx",
  Argentina: "ar",
  Colombia: "co",
  Peru: "pe",
  Chile: "cl",
  Venezuela: "ve",
  Cuba: "cu",
  Ecuador: "ec",
  Bolivia: "bo",
  Paraguay: "py",
  Uruguay: "uy",
  Guyana: "gy",
  Suriname: "sr",
  "French Guiana": "gf",
  Panama: "pa",
  "Costa Rica": "cr",
  Nicaragua: "ni",
  Honduras: "hn",
  Guatemala: "gt",
  "Dominican Republic": "do",
  Haiti: "ht",
  Jamaica: "jm",
  Belize: "bz",
  "El Salvador": "sv",
  "Trinidad and Tobago": "tt",
  Barbados: "bb",
  Bahamas: "bs",
  Grenada: "gd",
  "Saint Vincent and the Grenadines": "vc",
  "Saint Lucia": "lc",
  Dominica: "dm",
  "Antigua and Barbuda": "ag",
  "Saint Kitts and Nevis": "kn",
  "Puerto Rico": "pr",
  Greenland: "gl",
  Australia: "au",
  "New Zealand": "nz",
  "Papua New Guinea": "pg",
  Fiji: "fj",
  "New Caledonia": "nc",
  Vanuatu: "vu",
  Samoa: "ws",
  Tonga: "to",
  "Solomon Islands": "sb",
  "Federated States of Micronesia": "fm",
  Palau: "pw",
  "Marshall Islands": "mh",
  Kiribati: "ki",
  Tuvalu: "tv",
  Nauru: "nr",
  "French Polynesia": "pf",
  Guam: "gu",
  "Cook Islands": "ck",
  "American Samoa": "as",
  "Wallis and Futuna": "wf",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const quiz = JSON.parse(readFileSync(QUIZ_PATH, "utf8"));
let ok = 0;
let missing = [];
const toCheck = [];

for (const group of quiz.groupes || []) {
  for (const question of group.questions || []) {
    const name = String(question.nom_scientifique || "").trim();
    const iso2 = ISO_BY_NAME[name];
    if (!iso2) {
      missing.push(name);
      delete question.iso2;
      continue;
    }
    question.iso2 = iso2;
    // Commons n’est plus la source primaire.
    delete question.commonsFile;
    ok += 1;
    toCheck.push(iso2);
  }
}

if (missing.length) {
  console.error("Missing ISO for:", missing.join(", "));
  process.exit(1);
}

const unique = [...new Set(toCheck)];
let broken = [];
for (let i = 0; i < unique.length; i += 20) {
  const batch = unique.slice(i, i + 20);
  await Promise.all(
    batch.map(async (iso) => {
      try {
        const res = await fetch(`https://flagcdn.com/w320/${iso}.png`, { method: "HEAD" });
        if (!res.ok) broken.push(`${iso}:${res.status}`);
      } catch (error) {
        broken.push(`${iso}:err`);
      }
    }),
  );
  await sleep(100);
}

writeFileSync(QUIZ_PATH, `${JSON.stringify(quiz, null, 2)}\n`, "utf8");
console.log(`iso2 set on ${ok} countries`);
if (broken.length) {
  console.warn("flagcdn HEAD issues:", broken.join(", "));
} else {
  console.log("All flagcdn HEAD checks OK");
}
