/**
 * Shared helpers: SVG → iOS Images.xcassets + Android vector drawable.
 * Used by `with-native-tab-icons.js` (prebuild) and local sync script.
 *
 * iOS: black-filled template images → tinted by NativeTabs `iconColor`.
 * Android: black vector paths → tinted by Material `iconColor`.
 *
 * @typedef {{ assetName: string, svgPath: string }} TabIconSource
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} svg
 * @returns {{ viewportWidth: number, viewportHeight: number, paths: { d: string, fill: string }[] }}
 */
function parseSvgForVectorDrawable(svg) {
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  let viewportWidth = 24;
  let viewportHeight = 24;
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      viewportWidth = parts[2];
      viewportHeight = parts[3];
    }
  } else {
    const w = svg.match(/\bwidth=["'](\d+(?:\.\d+)?)["']/i);
    const h = svg.match(/\bheight=["'](\d+(?:\.\d+)?)["']/i);
    if (w) viewportWidth = Number(w[1]);
    if (h) viewportHeight = Number(h[1]);
  }

  /** @type {{ d: string, fill: string }[]} */
  const paths = [];
  const pathRe = /<path\b([^>]*)\/?>/gi;
  let match;
  while ((match = pathRe.exec(svg)) !== null) {
    const attrs = match[1];
    const dMatch = attrs.match(/\bd=["']([^"']+)["']/i);
    if (!dMatch) continue;
    const fillMatch = attrs.match(/\bfill=["']([^"']+)["']/i);
    const rawFill = fillMatch ? fillMatch[1] : 'black';
    if (rawFill.toLowerCase() === 'none') continue;
    paths.push({ d: dMatch[1], fill: fillToAndroidColor(rawFill) });
  }

  if (paths.length === 0) {
    throw new Error('No <path> elements found in SVG');
  }

  return { viewportWidth, viewportHeight, paths };
}

/**
 * @param {string} fill
 * @returns {string} Android #AARRGGBB
 */
function fillToAndroidColor(fill) {
  const v = fill.trim().toLowerCase();
  if (v === 'black' || v === '#000' || v === '#000000') {
    return '#FF000000';
  }
  if (v === 'white' || v === '#fff' || v === '#ffffff') {
    return '#FFFFFFFF';
  }
  if (/^#[0-9a-f]{6}$/i.test(fill)) {
    return `#FF${fill.slice(1).toUpperCase()}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(fill)) {
    return `#${fill.slice(1).toUpperCase()}`;
  }
  return '#FF000000';
}

/**
 * @param {string} svg
 * @returns {string}
 */
function svgToAndroidVectorXml(svg) {
  const { viewportWidth, viewportHeight, paths } = parseSvgForVectorDrawable(svg);
  const pathXml = paths
    .map(
      (p) =>
        `    <path\n        android:fillColor="${p.fill}"\n        android:pathData="${p.d}" />`,
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n` +
    `    android:width="24dp"\n` +
    `    android:height="24dp"\n` +
    `    android:viewportWidth="${viewportWidth}"\n` +
    `    android:viewportHeight="${viewportHeight}">\n` +
    `${pathXml}\n` +
    `</vector>\n`
  );
}

/**
 * Template xcasset SVGs need an explicit fill or iOS may render a blank icon.
 * @param {string} svg
 */
function ensureSvgPathFills(svg) {
  return svg.replace(/<path\b([^>]*?)(\/?)>/gi, (full, attrs, selfClose) => {
    if (/\bfill\s*=/i.test(attrs)) {
      return full;
    }
    return `<path${attrs} fill="black"${selfClose}>`;
  });
}

/**
 * @param {string} assetName
 * @param {string} svgFileName
 */
function iosImagesetContentsJson(assetName, svgFileName) {
  return (
    JSON.stringify(
      {
        images: [
          {
            filename: svgFileName,
            idiom: 'universal',
          },
        ],
        info: {
          author: 'xcode',
          version: 1,
        },
        properties: {
          'preserves-vector-representation': true,
          'template-rendering-intent': 'template',
        },
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * @param {string} projectRoot
 * @param {string} iosProjectRoot - e.g. ios/
 * @param {TabIconSource[]} sources
 */
function writeIosTabIcons(projectRoot, iosProjectRoot, sources) {
  const appDir = fs
    .readdirSync(iosProjectRoot)
    .find((d) => {
      const full = path.join(iosProjectRoot, d);
      return (
        fs.statSync(full).isDirectory() &&
        d !== 'Pods' &&
        !d.endsWith('.xcodeproj') &&
        !d.endsWith('.xcworkspace') &&
        fs.existsSync(path.join(full, 'Images.xcassets'))
      );
    });

  if (!appDir) {
    throw new Error('[native-tab-icons] Images.xcassets not found under ios/');
  }

  const xcassetsDir = path.join(iosProjectRoot, appDir, 'Images.xcassets');

  for (const { assetName, svgPath } of sources) {
    const absSvg = path.join(projectRoot, svgPath);
    if (!fs.existsSync(absSvg)) {
      throw new Error(`[native-tab-icons] Missing SVG for ${assetName}: ${absSvg}`);
    }
    const imagesetDir = path.join(xcassetsDir, `${assetName}.imageset`);
    fs.mkdirSync(imagesetDir, { recursive: true });
    const svgFileName = `${assetName}.svg`;
    const svgSource = fs.readFileSync(absSvg, 'utf8');
    fs.writeFileSync(
      path.join(imagesetDir, svgFileName),
      ensureSvgPathFills(svgSource),
      'utf8',
    );
    // Drop stale dark bake variants from the iOS26 workaround.
    const staleDark = path.join(imagesetDir, `${assetName}_dark.svg`);
    if (fs.existsSync(staleDark)) {
      fs.unlinkSync(staleDark);
    }
    fs.writeFileSync(
      path.join(imagesetDir, 'Contents.json'),
      iosImagesetContentsJson(assetName, svgFileName),
      'utf8',
    );
  }

  return { xcassetsDir, count: sources.length };
}

/**
 * @param {string} projectRoot
 * @param {string} androidProjectRoot - e.g. android/
 * @param {TabIconSource[]} sources
 */
function writeAndroidTabIcons(projectRoot, androidProjectRoot, sources) {
  const drawableDir = path.join(androidProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
  fs.mkdirSync(drawableDir, { recursive: true });

  for (const { assetName, svgPath } of sources) {
    if (!/^[a-z][a-z0-9_]*$/.test(assetName)) {
      throw new Error(`[native-tab-icons] Invalid Android drawable name: ${assetName}`);
    }
    const absSvg = path.join(projectRoot, svgPath);
    if (!fs.existsSync(absSvg)) {
      throw new Error(`[native-tab-icons] Missing SVG for ${assetName}: ${absSvg}`);
    }
    const svg = fs.readFileSync(absSvg, 'utf8');
    const xml = svgToAndroidVectorXml(svg);
    fs.writeFileSync(path.join(drawableDir, `${assetName}.xml`), xml, 'utf8');
  }

  return { drawableDir, count: sources.length };
}

/**
 * Default icon map (keep in sync with constants/navigation/tab-spec.ts).
 * @returns {TabIconSource[]}
 */
function defaultTabIconSources() {
  return [
    { assetName: 'tab_home_line', svgPath: 'assets/images/icons/line/home.svg' },
    { assetName: 'tab_home_solid', svgPath: 'assets/images/icons/solid/home.svg' },
    { assetName: 'tab_challenge_line', svgPath: 'assets/images/icons/line/challenge.svg' },
    { assetName: 'tab_challenge_solid', svgPath: 'assets/images/icons/solid/challenge.svg' },
    { assetName: 'tab_setting_line', svgPath: 'assets/images/icons/line/setting.svg' },
    { assetName: 'tab_setting_solid', svgPath: 'assets/images/icons/solid/setting.svg' },
    { assetName: 'tab_add_task_line', svgPath: 'assets/images/icons/line/addTask.svg' },
  ];
}

module.exports = {
  parseSvgForVectorDrawable,
  svgToAndroidVectorXml,
  writeIosTabIcons,
  writeAndroidTabIcons,
  defaultTabIconSources,
};
