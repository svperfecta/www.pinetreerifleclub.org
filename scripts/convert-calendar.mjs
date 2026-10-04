/** Conservative conversion: retain uncertain time text for human review. */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
const pages = JSON.parse(await fs.readFile('src/content/recovered.json', 'utf8'));
const source = pages.find(entry => entry.data.path === 'calendar.html');
const $ = cheerio.load(source.data.body);
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const events = [], review = [];
const dateValue = date => date.replaceAll('-', '');
const nextDay = date => new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
const escape = value => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
function clock(hour, minute, period) { return (Number(hour) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(minute || 0); }
function parseTime(text) {
  const range = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(text);
  if (range) {
    const start = clock(range[1], range[2], range[3] || range[6]);
    const end = clock(range[4], range[5], range[6]);
    if (end <= start) return { issue: 'Start meridiem is unclear or range crosses midnight; time left unspecified' };
    return { start, end };
  }
  const single = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(text);
  if (single) return { start: clock(single[1], single[2], single[3]) };
  return { issue: /\d/.test(text) ? 'No unambiguous AM/PM time' : 'No time supplied' };
}
$('.title').each((_, title) => {
  const match = /^(\w+) (\d{4})$/.exec($(title).text().trim());
  if (!match || !months.includes(match[1])) return;
  const table = $(title).nextAll('table').first();
  table.find('td').each((_, cell) => {
    const fragment = cheerio.load($(cell).html() || '', {}, false);
    fragment('s,strike,del').each((_, node) => fragment(node).replaceWith('[CANCELLED] ' + fragment(node).text()));
    fragment('br,hr').replaceWith('\n');
    const lines = fragment.text().replaceAll('\u00a0', ' ').split('\n').map(line => line.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!lines.length) return;
    const day = /^(\d{1,2})(?:\s|$)/.exec(lines[0]);
    if (!day) return;
    const date = `${match[2]}-${String(months.indexOf(match[1]) + 1).padStart(2, '0')}-${day[1].padStart(2, '0')}`;
    if (new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date: ' + date);
    lines[0] = lines[0].slice(day[0].length).trim();
    for (const original of lines.filter(Boolean)) {
      // The source sometimes places two explicitly named activities on one line.
      const parts = original.split(/(?=Trap\s+(?:Open\s+)?\d)/i).map(value => value.trim()).filter(Boolean);
      for (const raw of parts) {
        if (/^\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(AM|PM)$/i.test(raw)) { review.push({ date, text: raw, issue: 'Time without an event title; not exported' }); continue; }
        const cancelled = raw.startsWith('[CANCELLED]') || /^NO CLUB DINNER/i.test(raw);
        const summary = raw.replace(/^\[CANCELLED\]\s*/, '').replace(/<$/, '').trim();
        const time = parseTime(summary);
        if (time.issue) review.push({ date, text: summary, issue: time.issue });
        const category = /class|course|NRA |HUNTER ED|Reloading/i.test(summary) ? 'Classes' : /BOD|mtg|meeting/i.test(summary) ? 'Meetings' : /RFBRL|RFMRL|ENYRL|league/i.test(summary) ? 'League' : /challenge|match|IBS|CFL|CF |RF /i.test(summary) ? 'Matches' : 'Club';
        events.push({ uid: createHash('sha256').update(date + '\n' + summary).digest('hex').slice(0, 32) + '@pine-tree-club.local', date, summary, category, cancelled, ...time });
      }
    }
  });
});
const formatTime = minutes => String(Math.floor(minutes / 60)).padStart(2, '0') + String(minutes % 60).padStart(2, '0') + '00';
const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pine Tree Rifle Club//Recovered Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Pine Tree Rifle Club — recovered schedule','X-WR-TIMEZONE:America/New_York',
  'BEGIN:VTIMEZONE','TZID:America/New_York','BEGIN:DAYLIGHT','DTSTART:20070311T020000','TZOFFSETFROM:-0500','TZOFFSETTO:-0400','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU','END:DAYLIGHT','BEGIN:STANDARD','DTSTART:20071104T020000','TZOFFSETFROM:-0400','TZOFFSETTO:-0500','RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU','END:STANDARD','END:VTIMEZONE'];
for (const event of events) {
  lines.push('BEGIN:VEVENT','UID:' + event.uid,'DTSTAMP:20260625T075302Z');
  if (event.start !== undefined) {
    lines.push(`DTSTART;TZID=America/New_York:${dateValue(event.date)}T${formatTime(event.start)}`);
    if (event.end !== undefined) lines.push(`DTEND;TZID=America/New_York:${dateValue(event.date)}T${formatTime(event.end)}`);
  } else lines.push('DTSTART;VALUE=DATE:' + dateValue(event.date), 'DTEND;VALUE=DATE:' + dateValue(nextDay(event.date)), 'TRANSP:TRANSPARENT');
  lines.push('SUMMARY:' + escape(event.summary), 'CATEGORIES:' + event.category,
    'DESCRIPTION:' + escape(`Recovered calendar entry: ${event.summary}\nSource snapshot: June 25, 2026. Confirm current details with the club.${event.issue ? '\nTime is unspecified: ' + event.issue + '. This date entry does not imply an all-day activity.' : ''}\nWhenever there is a function in the Main Hall, the indoor range is closed for safety.`));
  if (event.cancelled) lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT');
}
lines.push('END:VCALENDAR');
// RFC 5545 folding uses octets; never split a UTF-8 character.
function fold(line) {
  const chunks = []; let current = '';
  for (const char of line) { if (Buffer.byteLength(current + char) > 75) { chunks.push(current); current = ' '; } current += char; }
  chunks.push(current); return chunks.join('\r\n');
}
await fs.mkdir('src/assets/calendars', { recursive: true });
await fs.writeFile('src/assets/calendars/club-calendar.ics', lines.map(fold).join('\r\n') + '\r\n');
await fs.writeFile('src/data/calendar.json', JSON.stringify(events, null, 2) + '\n');
await fs.writeFile('docs/calendar-review.json', JSON.stringify({ source: 'calendar.html, June 25 2026 snapshot', eventCount: events.length, review }, null, 2) + '\n');
console.log(`Converted ${events.length} entries; ${review.length} entries need time/title review`);
