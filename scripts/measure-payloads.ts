/**
 * Reports the before/after numbers the agent-efficiency work is accountable
 * for, from recorded fixtures so it is reproducible in CI and needs no token
 * (and never puts real user content in logs).
 *
 * Run: npx ts-node scripts/measure-payloads.ts
 *
 * Three numbers, and they do NOT all move the same way:
 *  1. response bytes with and without projection (should fall)
 *  2. total tools/list description bytes (rises — paid every session)
 *  3. per-tool description sizes against the budget
 *
 * Reporting only (1) would let us claim a win while making every session more
 * expensive. See `.specs/features/agent-efficiency-improvements/design.md` D6.
 */
import { renderToolDoc, TOOL_DOCS } from '../src/docs';
import { projectResponse } from '../src/utils/project-response';

const bytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

const pct = (before: number, after: number): string =>
  `${(((before - after) / before) * 100).toFixed(1)}% smaller`;

/** Shaped from cv-api's WhoAmIResponse / UserDto, with plausible cardinality. */
const whoamiFixture = {
  success: true,
  user: {
    user_guid: 'usr_00000000000000000000000000',
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    first_name: 'Alice',
    last_name: 'Anderson',
    image_url: 'https://cdn.example.com/avatars/alice.png',
    created_by: null,
    role: 'member',
    created_ts: 1694313500,
    last_updated_ts: 1725849500,
    last_seen_ts: 1725849500,
    timezone_offset_minutes: -420,
    is_verified: 'true',
    is_allowed_through_gate: true,
    phone_txt: '+15555550123',
    email_txt: 'alice@example.com',
    workspace_guids: Array.from(
      { length: 62 },
      (_, i) => `wsp_${String(i).padStart(24, '0')}`,
    ),
    identities: Array.from({ length: 6 }, (_, i) => ({
      provider: ['google', 'apple', 'slack', 'microsoft', 'email', 'phone'][i],
      subject: `sub_${String(i).padStart(20, '0')}`,
      verified: true,
      created_at: '2026-01-01T00:00:00.000Z',
    })),
    settings: Object.fromEntries(
      Array.from({ length: 41 }, (_, i) => [`setting_key_${i}`, '']),
    ),
    entries: Array.from({ length: 20 }, (_, i) => ({
      id: `ent_${String(i).padStart(20, '0')}`,
      kind: 'contact',
      value: `contact-${i}@example.com`,
      created_at: '2026-01-01T00:00:00.000Z',
    })),
    last_seen_on: '2026-09-09T12:00:00.000Z',
    plan_type: 'pro',
    notification_settings: {
      push_enabled: true,
      email_enabled: true,
      sms_enabled: false,
      digest_frequency: 'daily',
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      mention_alerts: true,
    },
    environments: Array.from({ length: 3 }, (_, i) => ({
      name: `env-${i}`,
      version: '2.9.0',
      platform: 'ios',
    })),
    languages: ['english', 'spanish'],
    voice_gender: 'F',
    voice_id: 'voice_000000000000',
    has_fcm_token: true,
    tts_mode: 'auto',
    translation_mode: 'off',
    preserve_senders_voice: true,
    lifecycle_events: Array.from({ length: 16 }, (_, i) => ({
      name: `lifecycle_event_${i}`,
      count: i,
      last_at: '2026-08-01T00:00:00.000Z',
    })),
    user_type: 'user',
  },
  settings: {
    sharefeedback_workspace: 'wsp_000000000000000000000001',
    gate_code: null,
    is_gated: false,
    member_count: 41,
    admin_count: 12,
    owner_count: 9,
  },
};

/** Shaped from listMessagesResponse: one full page of 20 messages. */
const listMessagesFixture = {
  page: 1,
  size: 20,
  sort_direction: 'DESC',
  total: 1487,
  results_count: 20,
  has_next_page: true,
  filters: { workspace_id: 'wsp_000000000000000000000001' },
  results: Array.from({ length: 20 }, (_, i) => ({
    id: `msg_${String(i).padStart(24, '0')}`,
    name: `Message ${i}`,
    link: `https://app.carbonvoice.app/m/msg_${String(i).padStart(24, '0')}`,
    creator_id: 'usr_00000000000000000000000000',
    conversation_id: 'cnv_00000000000000000000000000',
    workspace_id: 'wsp_000000000000000000000001',
    created_at: '2026-09-08T10:00:00.000Z',
    last_updated_at: '2026-09-08T10:05:00.000Z',
    duration_ms: 48000,
    audio_url: `https://media.example.com/audio/${i}.mp3?X-Amz-Signature=${'a'.repeat(64)}`,
    audio_stream_url: `https://media.example.com/stream/${i}.m3u8?X-Amz-Signature=${'b'.repeat(64)}`,
    waveform_url: `https://media.example.com/wave/${i}.png?X-Amz-Signature=${'c'.repeat(64)}`,
    transcript:
      'Just circling back on the pricing deck. I think we should lead with the ' +
      'enterprise tier and keep the comparison table on slide four.',
    ai_summary: 'Suggests leading the deck with the enterprise tier.',
    reply_count: 2,
    language: 'english',
    status: 'active',
    type: 'channel',
    attachments: [],
  })),
};

const cases: Array<{
  tool: string;
  fixture: unknown;
  fields: string[];
}> = [
  {
    tool: 'get_current_user',
    fixture: whoamiFixture,
    fields: TOOL_DOCS.get_current_user.recommendedFields ?? [],
  },
  {
    tool: 'list_messages',
    fixture: listMessagesFixture,
    fields: TOOL_DOCS.list_messages.recommendedFields ?? [],
  },
];

console.log('=== 1. Response bytes (recommended projection) ===\n');
for (const { tool, fixture, fields } of cases) {
  const before = bytes(fixture);
  const after = bytes(projectResponse(fixture, fields));
  console.log(`${tool}`);
  console.log(`  fields:   ${JSON.stringify(fields)}`);
  console.log(`  full:     ${before.toLocaleString()} bytes`);
  console.log(
    `  narrowed: ${after.toLocaleString()} bytes  (${pct(before, after)})`,
  );
  const identity = projectResponse(fixture);
  console.log(
    `  omitted:  ${bytes(identity).toLocaleString()} bytes  (identity: ${identity === fixture ? 'same reference' : 'COPY — REGRESSION'})\n`,
  );
}

console.log('=== 2. tools/list description payload ===\n');
const lengths = Object.entries(TOOL_DOCS)
  .map(([name, doc]) => [name, renderToolDoc(doc).length] as [string, number])
  .sort((a, b) => b[1] - a[1]);
const total = lengths.reduce((sum, [, len]) => sum + len, 0);
console.log(`  tools documented: ${lengths.length}`);
console.log(`  total:            ${total.toLocaleString()} chars`);
console.log(`  mean:             ${Math.round(total / lengths.length)} chars`);
console.log(`  max:              ${lengths[0][1]} chars (${lengths[0][0]})`);
console.log('  NOTE: paid on every request, before any tool is called.\n');

console.log('=== 3. Per-tool budget (cap 1200) ===\n');
const over = lengths.filter(([, len]) => len > 1200);
if (over.length === 0) {
  console.log('  all tools within budget');
} else {
  over.forEach(([name, len]) => console.log(`  OVER: ${name} ${len}`));
  process.exitCode = 1;
}
