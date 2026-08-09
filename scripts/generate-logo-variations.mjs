import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "public", "brand", "variations");
const manifestPath = path.join(root, "src", "data", "logo-variations.json");

const palette = {
  ink: "#11110F",
  paper: "#F4F1E8",
  paperStrong: "#FFFDF7",
  lime: "#D7FF4F",
  blue: "#4B66FF",
  coral: "#FF7458",
};

const families = [
  {
    slug: "forked-signal",
    name: "Forked signal",
    thesis: "Open-source branches, contributors, and the S hidden inside a build graph.",
    titles: [
      "Forked S",
      "Circuit S",
      "Open Merge",
      "Branch Cut",
      "Signal Spine",
      "Ribbon Fork",
      "Node Shift",
      "Twin Branch",
      "Contributor Orbit",
      "Open Network",
    ],
  },
  {
    slug: "broken-loop",
    name: "Broken loop",
    thesis: "A recurring subscription cycle interrupted by a clean open-source exit.",
    titles: [
      "Cancel Ring",
      "Exit Orbit",
      "Broken Chain",
      "Recurring Cut",
      "Open Renewal",
      "Split Cycle",
      "Release Valve",
      "Escape Arc",
      "Unbound Coin",
      "Cycle Breaker",
    ],
  },
  {
    slug: "open-target",
    name: "Open target",
    thesis: "Precision without aggression: a target that becomes a door, portal, or exit path.",
    titles: [
      "Open Crosshair",
      "Doorway",
      "Portal Arrow",
      "Gap Target",
      "Aim Brackets",
      "Escape Hatch",
      "Open Scope",
      "Keyway",
      "Maze Exit",
      "Target Slice",
    ],
  },
  {
    slug: "code-mark",
    name: "Code mark",
    thesis: "Developer-native brackets, cursors, and commands reduced to a compact monogram.",
    titles: [
      "Angle S",
      "Bracket Point",
      "Terminal Strike",
      "Split Command",
      "Curly Bolt",
      "Crop S",
      "Double Chevron",
      "Code Window",
      "Open Prompt",
      "Angle Blade",
    ],
  },
  {
    slug: "open-modules",
    name: "Open modules",
    thesis: "Composable products, missing paywalls, and community-owned infrastructure blocks.",
    titles: [
      "Missing Tile",
      "Open Stack",
      "Grid Escape",
      "Unlocked Block",
      "Open Cube",
      "Module Bridge",
      "Migration Bars",
      "Shared System",
      "Community Grid",
      "Builder Steps",
    ],
  },
];

const esc = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function frame({ id, title, description, background = palette.paper, content }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="${id}-title ${id}-desc">
  <title id="${id}-title">${esc(title)}</title>
  <desc id="${id}-desc">${esc(description)}</desc>
  <rect width="256" height="256" rx="32" fill="${background}"/>
  ${content}
</svg>
`;
}

const forkedSignal = [
  `<path d="M188 57H112c-31 0-46 14-46 35s16 32 47 36 47 15 47 36-16 35-46 35H68" fill="none" stroke="${palette.ink}" stroke-width="18" stroke-linecap="square"/><path d="m170 39 18 18-18 18M86 181l-18 18 18 18" fill="none" stroke="${palette.blue}" stroke-width="10" stroke-linecap="square"/><circle cx="113" cy="128" r="12" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<path d="M190 58h-61v35H91v35h38v35H67v35h61" fill="none" stroke="${palette.ink}" stroke-width="16" stroke-linejoin="miter"/><circle cx="190" cy="58" r="13" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/><circle cx="67" cy="198" r="13" fill="${palette.blue}" stroke="${palette.ink}" stroke-width="6"/><path d="M129 93h46v35" fill="none" stroke="${palette.coral}" stroke-width="10"/>`,
  `<path d="M65 62h55c34 0 51 17 51 42v48c0 25-17 42-51 42H65" fill="none" stroke="${palette.ink}" stroke-width="17"/><path d="M118 104h68m-20-20 20 20-20 20" fill="none" stroke="${palette.blue}" stroke-width="11"/><circle cx="65" cy="62" r="12" fill="${palette.lime}"/><circle cx="65" cy="194" r="12" fill="${palette.coral}"/>`,
  `<path d="M61 64h67v49c0 13 10 23 23 23h44M61 192h67v-24" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="m176 118 19 18-19 18" fill="none" stroke="${palette.blue}" stroke-width="10"/><circle cx="128" cy="64" r="13" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/><circle cx="128" cy="192" r="13" fill="${palette.coral}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<path d="M128 42v172M128 82 75 56M128 115l56-28M128 157l-54 30M128 187l54 27" fill="none" stroke="${palette.ink}" stroke-width="13" stroke-linecap="square"/><circle cx="128" cy="115" r="18" fill="${palette.blue}"/><circle cx="75" cy="56" r="11" fill="${palette.lime}"/><circle cx="182" cy="214" r="11" fill="${palette.coral}"/>`,
  `<path d="M185 58c-58-9-96 6-96 39 0 48 82 24 82 69 0 27-33 37-100 30" fill="none" stroke="${palette.blue}" stroke-width="24" stroke-linecap="round"/><path d="M185 58c-25 14-34 34-34 59" fill="none" stroke="${palette.ink}" stroke-width="9"/><path d="M71 196c27-14 38-34 38-59" fill="none" stroke="${palette.ink}" stroke-width="9"/><circle cx="185" cy="58" r="11" fill="${palette.lime}"/><circle cx="71" cy="196" r="11" fill="${palette.coral}"/>`,
  `<path d="M186 61h-59c-34 0-54 13-54 34 0 46 111 15 111 67 0 22-22 33-58 33H68" fill="none" stroke="${palette.ink}" stroke-width="14"/><path d="M126 61v38m0 0 32 20m-32-20-29 20M126 195v-37m0 0 29-19m-29 19-31-19" fill="none" stroke="${palette.blue}" stroke-width="9"/><circle cx="126" cy="99" r="10" fill="${palette.lime}"/><circle cx="126" cy="158" r="10" fill="${palette.coral}"/>`,
  `<path d="M61 68h76c24 0 39 11 39 29s-15 28-39 28h-18c-24 0-39 11-39 29s15 30 39 30h76" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="M119 68v-27m0 144v30" fill="none" stroke="${palette.blue}" stroke-width="11"/><circle cx="61" cy="68" r="12" fill="${palette.lime}"/><circle cx="195" cy="184" r="12" fill="${palette.coral}"/>`,
  `<circle cx="128" cy="128" r="73" fill="none" stroke="${palette.ink}" stroke-width="14" stroke-dasharray="255 204" stroke-linecap="square"/><path d="M177 72c-26 0-44 11-44 30 0 38 56 18 56 54 0 19-18 29-46 29H80" fill="none" stroke="${palette.blue}" stroke-width="13"/><circle cx="177" cy="72" r="11" fill="${palette.lime}"/><circle cx="80" cy="185" r="11" fill="${palette.coral}"/>`,
  `<path d="M57 74h51l20 30 20-30h51M57 182h51l20-30 20 30h51" fill="none" stroke="${palette.ink}" stroke-width="17"/><path d="M128 104v48" fill="none" stroke="${palette.blue}" stroke-width="13"/><circle cx="57" cy="74" r="11" fill="${palette.lime}"/><circle cx="199" cy="182" r="11" fill="${palette.coral}"/><rect x="113" y="113" width="30" height="30" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
];

const brokenLoop = [
  `<path d="M177 74a70 70 0 1 0 0 108" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="m170 162 7 20-21 4" fill="none" stroke="${palette.ink}" stroke-width="12"/><path d="M173 43 83 213" stroke="${palette.blue}" stroke-width="17"/><rect x="119" y="106" width="18" height="44" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<path d="M127 46a82 82 0 1 0 75 49" fill="none" stroke="${palette.ink}" stroke-width="17"/><path d="M152 70h57v57" fill="none" stroke="${palette.blue}" stroke-width="16"/><path d="m209 70-76 76" stroke="${palette.blue}" stroke-width="16"/><circle cx="127" cy="46" r="11" fill="${palette.lime}"/>`,
  `<path d="M111 88 89 66a37 37 0 0 0-52 52l26 26a37 37 0 0 0 52 0l15-15M145 168l22 22a37 37 0 0 0 52-52l-26-26a37 37 0 0 0-52 0l-15 15" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="m89 166 77-77" stroke="${palette.blue}" stroke-width="17"/><circle cx="128" cy="128" r="12" fill="${palette.lime}"/>`,
  `<path d="M65 103a67 67 0 0 1 116-25m10-17-10 17-20-5M191 153a67 67 0 0 1-116 25m-10 17 10-17 20 5" fill="none" stroke="${palette.ink}" stroke-width="15"/><rect x="114" y="103" width="28" height="50" fill="${palette.coral}"/><path d="M128 92v72" stroke="${palette.blue}" stroke-width="9"/>`,
  `<path d="M128 49a79 79 0 0 1 71 45M199 162a79 79 0 0 1-71 45M128 207a79 79 0 0 1-71-45M57 94a79 79 0 0 1 71-45" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="M168 90h43V47" fill="none" stroke="${palette.blue}" stroke-width="14"/><circle cx="57" cy="128" r="12" fill="${palette.lime}"/>`,
  `<path d="M128 43a85 85 0 0 1 0 170 85 85 0 0 1 0-170Z" fill="${palette.ink}"/><path d="M128 75a53 53 0 0 1 0 106 53 53 0 0 1 0-106Z" fill="${palette.paper}"/><path d="m81 176 94-96" stroke="${palette.blue}" stroke-width="27"/><path d="m94 187 93-95" stroke="${palette.lime}" stroke-width="10"/>`,
  `<path d="M55 128h44a29 29 0 0 1 29 29v44M201 128h-44a29 29 0 0 1-29-29V55" fill="none" stroke="${palette.ink}" stroke-width="17"/><path d="m183 108 18 20-18 20M73 148l-18-20 18-20" fill="none" stroke="${palette.blue}" stroke-width="11"/><circle cx="128" cy="128" r="14" fill="${palette.lime}"/>`,
  `<path d="M181 81a75 75 0 0 0-106-7 75 75 0 0 0-7 106" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="M75 180a75 75 0 0 0 106-7" fill="none" stroke="${palette.blue}" stroke-width="18"/><path d="m52 157 16 23 25-13M204 196l-23-23-20 22" fill="none" stroke="${palette.ink}" stroke-width="10"/><circle cx="181" cy="81" r="11" fill="${palette.lime}"/>`,
  `<circle cx="128" cy="128" r="80" fill="${palette.ink}"/><circle cx="128" cy="128" r="48" fill="${palette.paper}"/><rect x="115" y="29" width="26" height="198" fill="${palette.paper}" transform="rotate(37 128 128)"/><path d="M80 183 183 80" stroke="${palette.blue}" stroke-width="14"/><circle cx="128" cy="128" r="14" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<path d="M67 86a70 70 0 0 1 116 0M189 168a70 70 0 0 1-116 0" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="M69 86 49 57m20 29 31-15M187 168l20 29m-20-29-31 15" fill="none" stroke="${palette.blue}" stroke-width="12"/><path d="M88 128h80" stroke="${palette.coral}" stroke-width="16"/><rect x="116" y="112" width="24" height="32" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
];

const openTarget = [
  `<path d="M128 45v46m0 74v46M45 128h46m74 0h46" stroke="${palette.ink}" stroke-width="16"/><circle cx="128" cy="128" r="59" fill="none" stroke="${palette.ink}" stroke-width="15" stroke-dasharray="282 89"/><circle cx="128" cy="128" r="19" fill="${palette.blue}"/><circle cx="128" cy="128" r="7" fill="${palette.lime}"/>`,
  `<path d="M69 207V49h118v158" fill="none" stroke="${palette.ink}" stroke-width="17"/><path d="M105 207V89h82" fill="none" stroke="${palette.blue}" stroke-width="16"/><path d="m159 67 28 22-28 22" fill="none" stroke="${palette.blue}" stroke-width="13"/><rect x="55" y="193" width="68" height="20" fill="${palette.lime}"/>`,
  `<rect x="49" y="49" width="158" height="158" fill="none" stroke="${palette.ink}" stroke-width="17"/><path d="M90 166 166 90m-45 0h45v45" fill="none" stroke="${palette.blue}" stroke-width="17"/><circle cx="90" cy="166" r="14" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<circle cx="128" cy="128" r="78" fill="none" stroke="${palette.ink}" stroke-width="18" stroke-dasharray="360 130" transform="rotate(-34 128 128)"/><circle cx="128" cy="128" r="42" fill="none" stroke="${palette.blue}" stroke-width="15" stroke-dasharray="148 116" transform="rotate(34 128 128)"/><circle cx="128" cy="128" r="13" fill="${palette.lime}"/>`,
  `<path d="M95 50H50v45M161 50h45v45M95 206H50v-45M161 206h45v-45" fill="none" stroke="${palette.ink}" stroke-width="17"/><path d="M70 128h116" stroke="${palette.blue}" stroke-width="15"/><path d="m158 103 28 25-28 25" fill="none" stroke="${palette.blue}" stroke-width="12"/><circle cx="128" cy="128" r="13" fill="${palette.lime}"/>`,
  `<rect x="52" y="52" width="152" height="152" rx="76" fill="${palette.ink}"/><rect x="89" y="89" width="78" height="115" fill="${palette.paper}"/><path d="M128 89v115" stroke="${palette.blue}" stroke-width="13"/><path d="m105 174 23 30 23-30" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<path d="M66 167V89l62-36 62 36v78l-62 36-62-36Z" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="M128 53v150M66 89l62 39 62-39" fill="none" stroke="${palette.blue}" stroke-width="12"/><path d="M128 128h62" stroke="${palette.lime}" stroke-width="18"/>`,
  `<path d="M82 204V87a46 46 0 0 1 92 0v117" fill="none" stroke="${palette.ink}" stroke-width="18"/><circle cx="128" cy="114" r="23" fill="${palette.blue}"/><path d="m128 137-24 51h48l-24-51Z" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/><path d="M174 87h34" stroke="${palette.coral}" stroke-width="14"/>`,
  `<path d="M52 52h152v152H52zM87 87h82v82H87z" fill="none" stroke="${palette.ink}" stroke-width="15"/><path d="M128 87v41h41" fill="none" stroke="${palette.blue}" stroke-width="15"/><path d="m145 107 24 21-24 21" fill="none" stroke="${palette.blue}" stroke-width="11"/><rect x="48" y="165" width="43" height="43" fill="${palette.lime}"/>`,
  `<path d="M128 45a83 83 0 1 0 83 83" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="M128 82a46 46 0 1 0 46 46" fill="none" stroke="${palette.blue}" stroke-width="16"/><path d="M128 45h83v83" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="8"/><path d="M128 128 211 45" stroke="${palette.ink}" stroke-width="13"/>`,
];

const codeMark = [
  `<path d="m101 61-52 67 52 67M155 61l52 67-52 67" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="M160 92h-46c-19 0-29 8-29 20 0 27 84 9 84 40 0 13-13 20-34 20H93" fill="none" stroke="${palette.blue}" stroke-width="13"/><circle cx="128" cy="128" r="9" fill="${palette.lime}"/>`,
  `<path d="M99 51H51v154h48M157 51h48v154h-48" fill="none" stroke="${palette.ink}" stroke-width="18"/><circle cx="128" cy="128" r="28" fill="${palette.blue}"/><circle cx="128" cy="128" r="10" fill="${palette.lime}"/>`,
  `<rect x="48" y="48" width="160" height="160" fill="${palette.ink}"/><path d="m77 94 36 34-36 34" fill="none" stroke="${palette.lime}" stroke-width="15"/><path d="M124 163h57" stroke="${palette.blue}" stroke-width="15"/><rect x="48" y="48" width="160" height="27" fill="${palette.coral}"/>`,
  `<path d="m77 61 51 67-51 67M179 61l-51 67 51 67" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="M174 47 82 209" stroke="${palette.blue}" stroke-width="17"/><rect x="114" y="112" width="28" height="32" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<path d="M104 49C72 49 72 72 72 91v18c0 12-8 19-24 19 16 0 24 7 24 19v18c0 19 0 42 32 42M152 49c32 0 32 23 32 42v18c0 12 8 19 24 19-16 0-24 7-24 19v18c0 19 0 42-32 42" fill="none" stroke="${palette.ink}" stroke-width="15"/><path d="m135 75-35 62h32l-12 47 40-70h-34l9-39Z" fill="${palette.lime}" stroke="${palette.blue}" stroke-width="7"/>`,
  `<path d="M92 48H48v44M164 48h44v44M92 208H48v-44M164 208h44v-44" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="M168 84h-45c-24 0-37 10-37 26 0 34 84 13 84 47 0 17-15 25-40 25H86" fill="none" stroke="${palette.blue}" stroke-width="14"/><circle cx="168" cy="84" r="10" fill="${palette.lime}"/>`,
  `<path d="m47 128 58-67v45h46V61l58 67-58 67v-45h-46v45l-58-67Z" fill="${palette.ink}"/><rect x="105" y="106" width="46" height="44" fill="${palette.lime}"/><path d="M121 106v44" stroke="${palette.blue}" stroke-width="9"/>`,
  `<rect x="45" y="52" width="166" height="152" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="M45 83h166" stroke="${palette.ink}" stroke-width="16"/><circle cx="67" cy="68" r="6" fill="${palette.coral}"/><circle cx="87" cy="68" r="6" fill="${palette.lime}"/><path d="m82 118 28 24-28 24M122 166h51" fill="none" stroke="${palette.blue}" stroke-width="13"/>`,
  `<path d="M55 62h63v35H88v31h30v35H88v31H55M201 62h-63v35h30v31h-30v35h30v31h33" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="M118 128h20" stroke="${palette.lime}" stroke-width="22"/><circle cx="128" cy="128" r="9" fill="${palette.blue}"/>`,
  `<path d="m96 45-49 83 49 83h38l-49-83 49-83H96ZM160 45h49l-49 83 49 83h-49l-49-83 49-83Z" fill="${palette.ink}"/><path d="m128 79 25 49-25 49-25-49 25-49Z" fill="${palette.blue}"/><circle cx="128" cy="128" r="10" fill="${palette.lime}"/>`,
];

const openModules = [
  `<rect x="47" y="47" width="70" height="70" fill="${palette.ink}"/><rect x="139" y="47" width="70" height="70" fill="${palette.blue}"/><rect x="47" y="139" width="70" height="70" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="7"/><path d="M139 139h70v70h-70z" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="m161 174 16 16 32-35" fill="none" stroke="${palette.coral}" stroke-width="12"/>`,
  `<path d="m128 42 85 43-85 43-85-43 85-43Z" fill="${palette.ink}"/><path d="m128 93 85 43-85 43-85-43 85-43Z" fill="${palette.blue}"/><path d="m128 144 85 43-85 43-85-43 85-43Z" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="7"/><path d="M128 179v51" stroke="${palette.ink}" stroke-width="10"/>`,
  `<path d="M49 49h52v52H49zM128 49h79v52h-79zM49 128h79v79H49z" fill="${palette.ink}"/><path d="M155 128h52v79h-52" fill="none" stroke="${palette.blue}" stroke-width="16"/><path d="m175 158 32 10-32 12" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/>`,
  `<rect x="52" y="78" width="152" height="128" fill="${palette.ink}"/><path d="M93 78V58a35 35 0 0 1 67-14" fill="none" stroke="${palette.blue}" stroke-width="17"/><rect x="89" y="112" width="78" height="61" fill="${palette.lime}"/><path d="M128 112v61" stroke="${palette.ink}" stroke-width="11"/>`,
  `<path d="m128 40 82 43v90l-82 43-82-43V83l82-43Z" fill="none" stroke="${palette.ink}" stroke-width="16"/><path d="m46 83 82 44 82-44M128 127v89" fill="none" stroke="${palette.blue}" stroke-width="14"/><path d="M128 127 210 83v90" fill="none" stroke="${palette.lime}" stroke-width="16"/>`,
  `<rect x="42" y="82" width="76" height="92" fill="${palette.ink}"/><rect x="138" y="82" width="76" height="92" fill="${palette.blue}"/><path d="M118 111h20v34h-20" fill="${palette.lime}"/><circle cx="80" cy="128" r="15" fill="${palette.lime}"/><circle cx="176" cy="128" r="15" fill="${palette.paper}"/><path d="M80 58v24m96 92v24" stroke="${palette.ink}" stroke-width="14"/>`,
  `<path d="M50 193h156M50 151h123M50 109h91M50 67h58" stroke="${palette.ink}" stroke-width="17"/><path d="m177 130 29 21-29 21" fill="none" stroke="${palette.blue}" stroke-width="13"/><rect x="92" y="52" width="31" height="30" fill="${palette.lime}"/><rect x="125" y="94" width="31" height="30" fill="${palette.coral}"/>`,
  `<path d="m128 40 77 44v88l-77 44-77-44V84l77-44Z" fill="${palette.ink}"/><path d="M128 40v176M51 84l77 44 77-44M51 172l77-44 77 44" fill="none" stroke="${palette.paper}" stroke-width="10"/><path d="M128 128 205 84v88l-77 44v-88Z" fill="${palette.blue}"/><circle cx="128" cy="128" r="12" fill="${palette.lime}"/>`,
  `<rect x="47" y="47" width="162" height="162" fill="none" stroke="${palette.ink}" stroke-width="14"/><path d="M101 47v162M155 47v162M47 101h162M47 155h162" stroke="${palette.ink}" stroke-width="10"/><circle cx="101" cy="101" r="27" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="7"/><circle cx="155" cy="155" r="27" fill="${palette.blue}"/><path d="M101 101h54v54" fill="none" stroke="${palette.coral}" stroke-width="11"/>`,
  `<path d="M47 209h54v-42h54v-42h54V47" fill="none" stroke="${palette.ink}" stroke-width="18"/><path d="M47 167h54v-42h54V83h54" fill="none" stroke="${palette.blue}" stroke-width="15"/><path d="m184 60 25-13-2 28" fill="${palette.lime}" stroke="${palette.ink}" stroke-width="6"/><circle cx="101" cy="167" r="10" fill="${palette.coral}"/>`,
];

const renderers = [forkedSignal, brokenLoop, openTarget, codeMark, openModules];
const variations = [];

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(manifestPath), { recursive: true });

for (let familyIndex = 0; familyIndex < families.length; familyIndex += 1) {
  const family = families[familyIndex];
  for (let variationIndex = 0; variationIndex < 10; variationIndex += 1) {
    const number = familyIndex * 10 + variationIndex + 1;
    const id = `SA-${String(number).padStart(2, "0")}`;
    const filename = `saasassin-${String(number).padStart(2, "0")}.svg`;
    const title = family.titles[variationIndex];
    const description = `${family.thesis} Direction ${variationIndex + 1}: ${title}.`;
    variations.push({
      id,
      number,
      family: family.name,
      familySlug: family.slug,
      title,
      thesis: family.thesis,
      description,
      src: `/brand/variations/${filename}`,
      filename,
    });
  }
}

await Promise.all(
  variations.map(async (variation, index) => {
    const familyIndex = Math.floor(index / 10);
    const variationIndex = index % 10;
    const background = variationIndex % 5 === 4 ? palette.paperStrong : palette.paper;
    const svg = frame({
      id: variation.id.toLowerCase(),
      title: `SaaSassin ${variation.id} — ${variation.title}`,
      description: variation.description,
      background,
      content: renderers[familyIndex][variationIndex],
    });
    await writeFile(path.join(outputDirectory, variation.filename), svg, "utf8");
  }),
);
await writeFile(manifestPath, `${JSON.stringify(variations, null, 2)}\n`, "utf8");

console.log(`Generated ${variations.length} SVG logo directions in ${outputDirectory}`);
