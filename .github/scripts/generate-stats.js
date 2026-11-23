/**
 * Generate GitHub profile stats SVGs using the GitHub REST API.
 * Runs inside GitHub Actions where GITHUB_TOKEN is available.
 * Writes profile/stats.svg and profile/top-langs.svg into the repo.
 */

const fs = require('fs');
const path = require('path');

const USERNAME = 'MrThantdgaf';
const TOKEN = process.env.GITHUB_TOKEN;
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'profile');

if (!TOKEN) {
  console.error('ERROR: GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  Authorization: `token ${TOKEN}`,
  'User-Agent': 'MrThantdgaf/stats-generator',
  Accept: 'application/vnd.github+json',
};

async function request(endpoint) {
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (res.status === 403) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API forbidden/rate-limited (403): ${text}`);
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${endpoint} returned ${res.status}`);
  }
  return res.json();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#2b7489',
  Python: '#3572A5',
  Java: '#b07219',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Go: '#00ADD8',
  Rust: '#dea584',
  Dart: '#00B4AB',
  Kotlin: '#A97BFF',
  Swift: '#FFAC45',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Lua: '#000080',
};

function langColor(name) {
  return LANG_COLORS[name] || '#8b949e';
}

async function getUser() {
  return request(`/users/${USERNAME}`);
}

async function getRepos() {
  const repos = [];
  let page = 1;
  while (page <= 5) {
    const data = await request(
      `/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner&sort=updated`
    );
    if (!Array.isArray(data) || data.length === 0) break;
    repos.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return repos;
}

async function getLanguages(repos) {
  const langBytes = {};
  for (const repo of repos) {
    try {
      const languages = await request(
        repo.languages_url.replace('https://api.github.com', '')
      );
      for (const [lang, bytes] of Object.entries(languages || {})) {
        langBytes[lang] = (langBytes[lang] || 0) + bytes;
      }
    } catch (err) {
      console.warn(`Failed to fetch languages for ${repo.name}: ${err.message}`);
    }
  }
  return Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function generateStatsSVG(data) {
  const {
    name,
    login,
    public_repos,
    followers,
    following,
    total_stars,
    total_forks,
    created_at,
  } = data;
  const years = Math.max(
    1,
    Math.floor(
      (Date.now() - new Date(created_at).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
    )
  );

  const rows = [
    { label: 'Public Repos', value: public_repos, color: '#58a6ff' },
    { label: 'Total Stars', value: total_stars, color: '#f5b53e' },
    { label: 'Total Forks', value: total_forks, color: '#8b949e' },
    { label: 'Followers', value: followers, color: '#3fb950' },
    { label: 'Following', value: following, color: '#d2a8ff' },
    { label: 'Years Active', value: years, color: '#ff7b72' },
  ];

  let y = 54;
  const items = rows
    .map((r, i) => {
      const col = i < 3 ? 0 : 1;
      const row = i % 3;
      const x = col === 0 ? 24 : 220;
      const yy = y + row * 32;
      return `<g transform="translate(${x},${yy - 22})">
        <rect x="0" y="0" width="160" height="24" fill="#161b22" rx="4"/>
        <text x="8" y="16" fill="#8b949e" font-family="system-ui,sans-serif" font-size="11">${escapeXml(r.label)}</text>
        <text x="152" y="16" text-anchor="end" fill="${r.color}" font-family="system-ui,sans-serif" font-size="13" font-weight="700">${r.value}</text>
      </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="170" viewBox="0 0 400 170">
    <rect width="400" height="170" fill="#0d1117" rx="10"/>
    <text x="24" y="38" fill="#c9d1d9" font-family="system-ui,sans-serif" font-size="17" font-weight="700">${escapeXml(name || login)}'s GitHub Stats</text>
    <text x="24" y="56" fill="#8b949e" font-family="system-ui,sans-serif" font-size="12">@${escapeXml(login)}</text>
    ${items}
  </svg>`;
}

function generateLanguagesSVG(languages) {
  const total = languages.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
  const maxBarWidth = 290;
  let y = 40;
  const bars = languages
    .map(([lang, bytes]) => {
      const pct = ((bytes / total) * 100).toFixed(1);
      const width = Math.max(25, (bytes / total) * maxBarWidth);
      const yy = y;
      y += 34;
      const color = langColor(lang);
      return `<g transform="translate(24,${yy - 12})">
        <text x="0" y="16" fill="#c9d1d9" font-family="system-ui,sans-serif" font-size="12">${escapeXml(lang)}</text>
        <text x="144" y="16" text-anchor="end" fill="#8b949e" font-family="system-ui,sans-serif" font-size="11">${pct}%</text>
        <rect x="152" y="4" width="${width}" height="18" fill="${color}" rx="4"/>
      </g>`;
    })
    .join('');

  const height = 32 + languages.length * 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="470" height="${height}" viewBox="0 0 470 ${height}">
    <rect width="470" height="${height}" fill="#0d1117" rx="8"/>
    <text x="24" y="28" fill="#c9d1d9" font-family="system-ui,sans-serif" font-size="16" font-weight="700">Most Used Languages</text>
    ${bars}
  </svg>`;
}

(async () => {
  try {
    const user = await getUser();
    const repos = await getRepos();
    const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
    const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
    const languages = await getLanguages(repos);

    fs.mkdirSync(OUT_DIR, { recursive: true });

    fs.writeFileSync(
      path.join(OUT_DIR, 'stats.svg'),
      generateStatsSVG({
        name: user.name,
        login: user.login,
        public_repos: user.public_repos,
        followers: user.followers,
        following: user.following,
        total_stars: totalStars,
        total_forks: totalForks,
        created_at: user.created_at,
      })
    );

    fs.writeFileSync(
      path.join(OUT_DIR, 'top-langs.svg'),
      generateLanguagesSVG(languages)
    );

    console.log('Generated profile/stats.svg and profile/top-langs.svg');
  } catch (err) {
    console.error('ERROR generating stats:', err.message);
    process.exit(1);
  }
})();
