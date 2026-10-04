/** Normalize imported fragments to HTML5 and move presentation into a shared stylesheet. */
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const styles = new Map();
const specialRules = new Map();
const cssFile = 'src/assets/styles/legacy.css';
const blocks = 'div,p,hr,table,ul,ol,li,h1,h2,h3,h4,h5,h6,blockquote,section,article,header,footer,nav,main,dl,dt,dd,pre,form';
const slug = value => value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
const px = value => /^\d+(?:\.\d+)?$/.test(value) ? value + 'px' : value;
const safeColor = value => /^#?ff0000$|^red$/i.test(value) ? '#b00000' : /^#ff3300$/i.test(value) ? '#9e2200' : /^#33cc00$/i.test(value) ? '#267500' : value;
function addClass($, node, declarations) {
  if (!declarations.trim()) return;
  const name = 'legacy-' + createHash('sha256').update(declarations).digest('hex').slice(0, 10);
  styles.set(name, declarations);
  $(node).addClass(name);
}
function normalize(content) {
  // The original calendar omitted closing tags for its month bookmarks.
  content = content.replace(/<div class="title"><a name="([^"]+)">([^<]*)<\/div>/gi, (_, name, text) => `<div class="title" id="${slug(name)}">${text}</div>`);
  content = content.replace(/href="#([^"\n]+)"/g, (_, fragment) => `href="#${slug(decodeURIComponent(fragment))}"`);
  let $ = cheerio.load(content, { decodeEntities: false }, false);
  $('*').each((_, node) => {
    let tag = node.name;
    const element = $(node);
    const declarations = [];
    const attrs = { ...node.attribs };
    if (!/^[a-z][a-z0-9:-]*$/.test(node.name)) node.name = node.name.startsWith('br') ? 'br' : 'span';
    for (const name of Object.keys(node.attribs)) if (!/^[a-z_][a-z0-9_.:-]*$/i.test(name)) element.removeAttr(name);
    const apply = (name, property, transform = value => value) => {
      if (attrs[name] !== undefined) { declarations.push(`${property}: ${transform(attrs[name])}`); element.removeAttr(name); }
    };
    if (tag === 'font') {
      const size = attrs.size;
      if (size) {
        const number = Math.min(7, Math.max(1, /^[+-]/.test(size) ? 3 + Number(size) : Number(size)));
        declarations.push(`font-size: ${['', '10px', '13px', '16px', '18px', '24px', '32px', '48px'][number] || '16px'}`);
      }
      apply('color', 'color', safeColor);
      apply('face', 'font-family');
      element.removeAttr('size');
      node.name = element.find(blocks).length ? 'div' : 'span';
    } else if (tag === 'center') {
      node.name = element.parents('h1,h2,h3,h4,h5,h6,p,span,b,strong,i,em,u').length ? 'span' : 'div';
      declarations.push('display: block', 'text-align: center');
    } else if (tag === 'big') { node.name = 'span'; declarations.push('font-size: 1.2em'); }
    else if (tag === 'nobr') { node.name = 'span'; declarations.push('white-space: nowrap'); }
    else if (tag === 'strike') node.name = 's';
    else if (tag === 'tt') node.name = 'code';
    else if (tag === 'acronym') node.name = 'abbr';
    else if (tag === 'dir' || tag === 'lo') node.name = 'ul';
    else if (tag.includes(':')) node.name = 'span';
    else if (tag === 'xml') { element.remove(); return; }
    if (['b', 'strong', 'i', 'em', 'u', 'span', 'small'].includes(node.name) && element.find(blocks).length) {
      if (['b', 'strong'].includes(node.name)) declarations.push('font-weight: bold');
      if (['i', 'em'].includes(node.name)) declarations.push('font-style: italic');
      if (node.name === 'u') declarations.push('text-decoration: underline');
      if (node.name === 'small') declarations.push('font-size: .83em');
      node.name = 'div';
    }
    if (/^h[1-6]$/.test(node.name) && element.find(blocks).length) {
      const sizes = { h1: '2em', h2: '1.5em', h3: '1.17em', h4: '1em', h5: '.83em', h6: '.67em' };
      declarations.push(`font-size: ${sizes[node.name]}`, 'font-weight: bold', 'margin-block: .83em');
      node.name = 'div';
    }
    if (attrs.align !== undefined) {
      element.removeAttr('align');
      if (tag === 'table') declarations.push(attrs.align === 'center' ? 'margin-left: auto; margin-right: auto' : `float: ${attrs.align}`);
      else if (tag === 'img') declarations.push(['left', 'right'].includes(attrs.align) ? `float: ${attrs.align}` : `vertical-align: ${attrs.align}`);
      else declarations.push(`text-align: ${attrs.align}`);
    }
    apply('valign', 'vertical-align');
    apply('bgcolor', 'background-color');
    apply('background', 'background-image', value => `url("${value}")`);
    if (!['img', 'input', 'canvas', 'video', 'iframe', 'embed', 'object'].includes(tag)) {
      apply('width', 'width', px); apply('height', 'height', px);
    }
    if (tag === 'img') {
      for (const dimension of ['width', 'height']) {
        if (attrs[dimension] !== undefined && !/^\d+$/.test(attrs[dimension])) apply(dimension, dimension, px);
      }
      apply('hspace', 'margin-left', px);
      if (attrs.hspace !== undefined) declarations.push(`margin-right: ${px(attrs.hspace)}`);
      apply('vspace', 'margin-top', px);
      if (attrs.vspace !== undefined) declarations.push(`margin-bottom: ${px(attrs.vspace)}`);
      apply('border', 'border-width', px);
    }
    if (tag === 'table') {
      apply('cellspacing', 'border-spacing', px);
      if (attrs.cellpadding !== undefined) {
        const value = px(attrs.cellpadding);
        const name = 'legacy-padding-' + createHash('sha256').update(value).digest('hex').slice(0, 8);
        element.addClass(name);
        specialRules.set(name, `.${name} > tbody > tr > td, .${name} > tbody > tr > th, .${name} > thead > tr > th, .${name} > tfoot > tr > td { padding: ${value}; }`);
        element.removeAttr('cellpadding');
      }
      if (attrs.border !== undefined) {
        const value = px(attrs.border);
        declarations.push(`border: ${value} outset #808080`);
        if (Number(attrs.border) > 0) {
          const name = 'legacy-border-' + attrs.border;
          element.addClass(name);
          specialRules.set(name, `.${name} > tbody > tr > td, .${name} > tbody > tr > th { border: 1px inset #808080; }`);
        }
        element.removeAttr('border');
      }
      if (attrs.summary) element.attr('aria-label', attrs.summary);
      element.removeAttr('summary').removeAttr('frame').removeAttr('rules');
      apply('bordercolor', 'border-color');
    }
    if (tag === 'th' && !attrs.scope) element.attr('scope', 'col');
    if (attrs.nowrap !== undefined) { declarations.push('white-space: nowrap'); element.removeAttr('nowrap'); }
    if (tag === 'a') {
      element.removeAttr('alt').removeAttr('june');
      if (attrs.name) { element.attr('id', slug(attrs.name)); element.removeAttr('name'); }
    }
    if (attrs.id) element.attr('id', slug(attrs.id));
    for (const name of Object.keys(node.attribs)) if (name.includes(':')) element.removeAttr(name);
    if (tag === 'hr') {
      apply('size', 'height', px); apply('color', 'border-color', safeColor);
      if (attrs.noshade !== undefined) { declarations.push('border-style: solid'); element.removeAttr('noshade'); }
    }
    if (tag === 'br') apply('clear', 'clear');
    if (tag === 'input' && !attrs.type) element.attr('type', 'text');
    if (tag === 'input' && ['submit', 'reset'].includes(attrs.type)) {
      node.name = 'button'; element.text(attrs.value || attrs.type); element.removeAttr('value');
    }
    if (tag === 'form' && attrs.method) element.attr('method', attrs.method.toLowerCase());
    if (attrs.style !== undefined) { declarations.push(attrs.style.trim().replace(/;+$/, '')); element.removeAttr('style'); }
    if (declarations.length) addClass($, node, declarations.filter(Boolean).join('; ') + ';');
  });
  // Let the HTML5 parser close paragraphs and repair structures after tag changes.
  $ = cheerio.load($.html(), {}, false);
  $('ul,ol').each((_, node) => {
    let group = [];
    const flush = () => {
      if (!group.some(child => child.type === 'tag' || child.type === 'text' && child.data.trim())) { group = []; return; }
      const wrapper = $('<li class="legacy-unmarked"></li>');
      $(group[0]).before(wrapper);
      for (const child of group) wrapper.append(child);
      group = [];
    };
    for (const child of [...node.children]) {
      if (child.type === 'tag' && child.name === 'li') flush();
      else group.push(child);
    }
    flush();
  });
  $('li').each((_, node) => {
    if (!['ul', 'ol', 'menu'].includes(node.parent?.name)) $(node).wrap('<ul class="legacy-orphan-list"></ul>');
  });
  const seen = new Set();
  $('[id]').each((_, node) => { const id = $(node).attr('id'); if (seen.has(id)) $(node).removeAttr('id'); else seen.add(id); });
  $('h1,h2,h3,h4,h5,h6').each((_, node) => { if (!$(node).text().trim() && !$(node).find('img').length) node.name = 'div'; });
  return $.html().split('\n').map(line => line.trimEnd()).join('\n');
}
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.name.endsWith('.njk')) {
      const source = await readFile(file, 'utf8');
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
      if (!match) continue;
      const data = JSON.parse(match[1]);
      if (data.legacyBodyAttributes) {
        const $ = cheerio.load(`<div ${data.legacyBodyAttributes}></div>`, {}, false);
        const element = $('div');
        const rules = [];
        for (const [attribute, property] of Object.entries({ bgcolor: 'background-color', text: 'color', background: 'background-image' })) {
          const value = element.attr(attribute);
          if (value) rules.push(`${property}: ${attribute === 'background' ? `url("${value}")` : safeColor(value)}`);
        }
        if (element.attr('style')) rules.push(element.attr('style'));
        if (rules.length) { addClass($, element[0], rules.join('; ') + ';'); data.legacyBodyClass = element.attr('class'); }
        data.legacyBodyAttributes = '';
      }
      const normalized = normalize(match[2]);
      data.hasHeading = /<h1\b/i.test(normalized);
      await writeFile(file, '---\n' + JSON.stringify(data, null, 2) + '\n---\n' + normalized + '\n');
    }
  }
}
await visit('recovery/templates/pages');
for (const file of ['recovery/templates/_includes/home-header.njk', 'recovery/templates/_includes/club-navigation.njk']) await writeFile(file, normalize(await readFile(file, 'utf8')) + '\n');
const css = ['/* Generated compatibility styles for recovered markup. Replace with design-system components as they are modernized. */'];
for (const [name, declarations] of [...styles].sort()) css.push(`.${name} { ${declarations} }`);
css.push(...specialRules.values());
await writeFile(cssFile, css.join('\n') + '\n');
console.log(`Normalized imported content; ${styles.size} shared presentation styles`);
