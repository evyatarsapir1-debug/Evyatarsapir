// Small inline SVG illustrations for lessons and the dictionary (no image files needed, readable in light & dark).
const W = (body, vb = '0 0 160 100') => `<svg viewBox="${vb}" class="illu" aria-hidden="true">${body}</svg>`;
const GOLD = '#d9b46a', SKIN = '#e2b08c', HAIR = '#4a3324', DARK = '#1c1c20', STEEL = '#c9ccd1';

const head = (cx = 80, cy = 55, r = 32) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${SKIN}"/>`;

export const ILLU = {
  clipper: W(`<rect x="30" y="40" width="90" height="26" rx="13" fill="${DARK}"/><rect x="112" y="36" width="20" height="34" rx="4" fill="${STEEL}"/>
    ${Array.from({ length: 8 }, (_, i) => `<rect x="${132}" y="${38 + i * 4}" width="6" height="2" fill="${STEEL}"/>`).join('')}
    <rect x="55" y="36" width="10" height="6" rx="2" fill="${GOLD}"/><path d="M30 53 Q10 60 8 90" stroke="${DARK}" stroke-width="3" fill="none"/>`),
  trimmer: W(`<rect x="30" y="44" width="92" height="18" rx="9" fill="${GOLD}"/><rect x="120" y="40" width="12" height="26" rx="3" fill="${STEEL}"/>
    ${Array.from({ length: 10 }, (_, i) => `<rect x="132" y="${41 + i * 2.4}" width="5" height="1.2" fill="${STEEL}"/>`).join('')}`),
  scissors: W(`<path d="M40 40 L140 52 L40 48 Z" fill="${STEEL}"/><path d="M40 62 L140 50 L40 54 Z" fill="${STEEL}"/>
    <circle cx="30" cy="38" r="10" fill="none" stroke="${DARK}" stroke-width="4"/><circle cx="30" cy="64" r="10" fill="none" stroke="${DARK}" stroke-width="4"/><circle cx="62" cy="51" r="3" fill="${GOLD}"/>`),
  thinning: W(`<path d="M40 40 L140 52 L40 48 Z" fill="${STEEL}"/><path d="M40 62 L140 50 L40 54 Z" fill="${STEEL}"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${60 + i * 6.5}" y="${54 - i * 0.4}" width="2.5" height="5" fill="${STEEL}"/>`).join('')}
    <circle cx="30" cy="38" r="10" fill="none" stroke="${DARK}" stroke-width="4"/><circle cx="30" cy="64" r="10" fill="none" stroke="${DARK}" stroke-width="4"/>`),
  comb: W(`<rect x="20" y="36" width="120" height="10" rx="3" fill="${DARK}"/>${Array.from({ length: 28 }, (_, i) => `<rect x="${22 + i * 4.2}" y="46" width="2" height="${i < 14 ? 22 : 16}" fill="${DARK}"/>`).join('')}`),
  duster: W(`<rect x="70" y="10" width="14" height="50" rx="6" fill="#7a4a2a"/><rect x="66" y="58" width="22" height="8" fill="${GOLD}"/><ellipse cx="77" cy="78" rx="26" ry="16" fill="#efe6d6"/>`),
  guards: W(Array.from({ length: 8 }, (_, i) => {
    const h = [3, 6, 10, 14, 18, 24, 30, 38][i], c = ['#9b59b6', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#34495e'][i];
    return `<rect x="${10 + i * 18}" y="${80 - h * 1.6}" width="14" height="${h * 1.6}" rx="2" fill="${c}"/><text x="${17 + i * 18}" y="95" font-size="9" text-anchor="middle" fill="currentColor">${['½', '1', '1½', '2', '3', '4', '6', '8'][i]}</text>`;
  }).join('')),
  lever: W(`<rect x="30" y="40" width="90" height="26" rx="13" fill="${DARK}"/><rect x="112" y="36" width="20" height="34" rx="4" fill="${STEEL}"/>
    <rect x="96" y="20" width="6" height="22" rx="2" fill="${GOLD}" transform="rotate(-35 99 40)"/><text x="80" y="92" font-size="10" text-anchor="middle" fill="currentColor">פתוחה = +1.5 מ״מ</text>`),
  zones: W(`${head(80, 52, 40)}
    <path d="M44 40 Q80 0 116 40" stroke="${GOLD}" stroke-width="8" fill="none"/><text x="80" y="20" font-size="9" text-anchor="middle" fill="currentColor">חלק עליון / כתר</text>
    <rect x="38" y="44" width="10" height="26" fill="#3498db"/><text x="30" y="60" font-size="8" text-anchor="end" fill="currentColor">צד</text>
    <rect x="112" y="44" width="10" height="26" fill="#3498db"/>
    <path d="M60 88 Q80 96 100 88" stroke="#e74c3c" stroke-width="7" fill="none"/><text x="80" y="99" font-size="8" text-anchor="middle" fill="currentColor">עורף</text>`, '0 0 160 100'),
  fade: W(`${head(80, 50, 38)}<defs><linearGradient id="fg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${SKIN}"/><stop offset="0.5" stop-color="#8a6a54"/><stop offset="1" stop-color="${HAIR}"/></linearGradient></defs>
    <path d="M42 50 A38 38 0 0 1 118 50 L118 70 A38 38 0 0 1 42 70 Z" fill="url(#fg)" opacity="0.9"/><path d="M42 30 Q80 0 118 30 L118 40 Q80 20 42 40 Z" fill="${HAIR}"/>
    <text x="132" y="80" font-size="8" fill="currentColor">עור</text><text x="132" y="45" font-size="8" fill="currentColor">שיער</text>`),
  hygiene: W(`<rect x="60" y="30" width="34" height="56" rx="8" fill="#2f7fd8"/><rect x="68" y="18" width="18" height="14" fill="${DARK}"/><path d="M86 22 L110 16" stroke="${DARK}" stroke-width="4"/>
    ${Array.from({ length: 6 }, (_, i) => `<circle cx="${116 + (i % 3) * 7}" cy="${10 + Math.floor(i / 3) * 8}" r="2" fill="#7fc4ff"/>`).join('')}<text x="77" y="62" font-size="10" text-anchor="middle" fill="#fff">✚</text>`),
  hairTypes: W(`<path d="M20 15 L20 85 M30 15 L30 85" stroke="${HAIR}" stroke-width="3"/><text x="25" y="97" font-size="8" text-anchor="middle" fill="currentColor">חלק</text>
    <path d="M65 15 q8 12 0 24 q-8 12 0 24 q8 12 0 22" stroke="${HAIR}" stroke-width="3" fill="none"/><text x="65" y="97" font-size="8" text-anchor="middle" fill="currentColor">גלי</text>
    <path d="M105 15 ${Array.from({ length: 7 }, () => 'q7 5 0 10 q-7 5 0 0').join(' ')}" stroke="${HAIR}" stroke-width="3" fill="none"/>
    <path d="M100 20 c10 0 10 10 0 10 c-10 0 -10 10 0 10 c10 0 10 10 0 10 c-10 0 -10 10 0 10 c10 0 10 10 0 10" stroke="${HAIR}" stroke-width="3" fill="none"/><text x="102" y="97" font-size="8" text-anchor="middle" fill="currentColor">מתולתל</text>
    <path d="M140 15 L140 85" stroke="${HAIR}" stroke-width="6"/><text x="140" y="97" font-size="8" text-anchor="middle" fill="currentColor">עבה</text>`),
  growth: W(`${head(80, 55, 36)}${Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2; return `<path d="M${86 + Math.cos(a) * 6} ${36 + Math.sin(a) * 6} l${Math.cos(a + 0.6) * 14} ${Math.sin(a + 0.6) * 14}" stroke="${HAIR}" stroke-width="2.5" marker-end="url(#ah)"/>`; }).join('')}
    <defs><marker id="ah" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="${HAIR}"/></marker></defs><text x="80" y="98" font-size="8" text-anchor="middle" fill="currentColor">כיוון צמיחה וסחרור בכתר</text>`),
  scissorOverComb: W(`<rect x="10" y="60" width="140" height="8" fill="${DARK}"/>${Array.from({ length: 30 }, (_, i) => `<rect x="${12 + i * 4.6}" y="68" width="2" height="12" fill="${DARK}"/>`).join('')}
    ${Array.from({ length: 24 }, (_, i) => `<path d="M${16 + i * 5.6} 98 L${16 + i * 5.6} ${44 + (i % 3) * 3}" stroke="${HAIR}" stroke-width="2"/>`).join('')}
    <path d="M20 50 L150 54" stroke="${STEEL}" stroke-width="5"/><text x="80" y="30" font-size="9" text-anchor="middle" fill="currentColor">גוזרים את מה שמעל המסרק</text>`),
  outline: W(`${head(80, 50, 36)}<path d="M50 74 Q80 84 110 74" stroke="${GOLD}" stroke-width="3" stroke-dasharray="4 3" fill="none"/>
    <path d="M110 40 q14 4 8 26" stroke="${GOLD}" stroke-width="3" stroke-dasharray="4 3" fill="none"/><text x="80" y="97" font-size="8" text-anchor="middle" fill="currentColor">קו עורף, אוזן ופאה</text>`),
  symmetry: W(`${head(80, 52, 36)}<line x1="80" y1="8" x2="80" y2="96" stroke="${GOLD}" stroke-width="2" stroke-dasharray="4 3"/>
    <path d="M46 52 l-8 0 M114 52 l8 0" stroke="currentColor" stroke-width="2"/><text x="30" y="56" font-size="9" text-anchor="end" fill="currentColor">=</text><text x="130" y="56" font-size="9" fill="currentColor">=</text>`),
  blend: W(`${['#f2d9e6', '#e61f1a', '#ff800d', '#f2d91a', '#26cc40', '#0dbfd9', '#1a59f2'].map((c, i) => `<rect x="20" y="${10 + i * 12}" width="120" height="12" fill="${c}"/>`).join('')}
    <path d="M150 12 L150 90" stroke="currentColor" stroke-width="2" marker-end="url(#ah2)"/><defs><marker id="ah2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="currentColor"/></marker></defs>`),
  consult: W(`${head(50, 55, 26)}<rect x="84" y="14" width="68" height="40" rx="10" fill="${GOLD}"/><path d="M90 52 L80 64 L100 52 Z" fill="${GOLD}"/>
    <text x="118" y="38" font-size="10" text-anchor="middle" fill="#1b1408">מה תרצה?</text>`),
  safety: W(`<path d="M80 10 L140 32 L132 70 Q80 98 28 70 L20 32 Z" fill="#2f7fd8"/><text x="80" y="62" font-size="30" text-anchor="middle" fill="#fff">✓</text>`),
  ear: W(`${head(70, 50, 36)}<ellipse cx="104" cy="54" rx="8" ry="13" fill="#d39a78"/><path d="M96 34 Q112 30 114 50" stroke="${GOLD}" stroke-width="3" stroke-dasharray="3 3" fill="none"/>`),
  money: W(`<circle cx="60" cy="50" r="28" fill="${GOLD}"/><text x="60" y="58" font-size="24" text-anchor="middle" fill="#1b1408">₪</text><circle cx="104" cy="56" r="22" fill="#c9a45c"/>`),
};

export function illu(key) { return ILLU[key] || ''; }
